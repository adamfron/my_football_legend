import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  resolveCanonicalShot,
  resolveMatchAction,
  stepTacticalMatch,
} from '.';
import { deriveShotExecutionErrorProfile } from './shotResolver';

const world = createCanonicalWorldDatabase();
const makeState = (seed: string) => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
  const shooter = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
  )!;
  shooter.position = { x: 91, y: 34 };
  state.ball = { ...shooter.position, ownerId: shooter.id };
  state.currentPressure = 0;
  return { state, shooter };
};

describe('canonical shot resolver v2', () => {
  it('is seed deterministic while different seeds alter execution error', () => {
    const first = makeState('shot-same');
    const action = {
      type: 'shot' as const,
      actorId: first.shooter.id,
      target: { x: 105, y: 34 },
      goalTarget: { horizontal: 0.45, vertical: 0.3 },
      intent: 'placed' as const,
    };
    expect(resolveCanonicalShot(first.state, action)).toEqual(
      resolveCanonicalShot(first.state, action),
    );
    const other = makeState('shot-other');
    expect(
      resolveCanonicalShot(other.state, { ...action, actorId: other.shooter.id }).error,
    ).not.toEqual(resolveCanonicalShot(first.state, action).error);
  });

  it('classifies goal-plane geometry, including wide, over and frame contacts', () => {
    const { state, shooter } = makeState('geometry');
    shooter.profile.attributes.finishing = 100;
    shooter.profile.attributes.technique = 100;
    shooter.profile.attributes.composure = 100;
    const shot = (horizontal: number, vertical: number) =>
      resolveCanonicalShot(state, {
        type: 'shot',
        actorId: shooter.id,
        target: { x: 105, y: 34 },
        goalTarget: { horizontal, vertical },
        intent: 'placed',
      });
    expect(shot(2.5, 0.3).classification).toBe('wide');
    expect(shot(0, 2.5).classification).toBe('over');
    expect(['post', 'wide', 'on_target']).toContain(shot(1, 0.3).classification);
  });

  it('does not pre-resolve defenders before the physical flight', () => {
    const blocked = makeState('block-search');
    const defender = blocked.state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    defender.position = { x: 97, y: 34 };
    Object.assign(defender.profile.attributes, {
      positioning: 100,
      gameReading: 100,
      agility: 100,
      aggression: 100,
    });
    const distant = structuredClone(blocked.state);
    distant.players.find((player) => player.id === defender.id)!.position = { x: 97, y: 50 };
    const action = {
      type: 'shot' as const,
      actorId: blocked.shooter.id,
      target: { x: 105, y: 34 },
      goalTarget: { horizontal: 0, vertical: 0.25 },
      intent: 'placed' as const,
    };
    const distantResult = resolveCanonicalShot(distant, action);
    expect(distantResult.blockerId).toBeUndefined();
    const seeds = Array.from({ length: 30 }, (_, index) => {
      const sample = structuredClone(blocked.state);
      sample.seed = `block-${index}`;
      return resolveCanonicalShot(sample, action);
    });
    // Execution only creates launch intent. Defender contacts belong to segment CCD.
    expect(
      seeds.every((result) => result.blockerId === undefined && result.outcome === undefined),
    ).toBe(true);
  });

  it('routes a header shot through the same flight and keeps continuations finite', () => {
    const { state, shooter } = makeState('header-pipeline');
    state.ball.height = 1.8;
    const launched = resolveMatchAction(state, {
      type: 'header',
      actorId: shooter.id,
      target: { x: 105, y: 34 },
      intent: 'header_shot',
    });
    expect(launched.ball.travelKind).toBe('header');
    expect(launched.ball.releaseHeight).toBe(1.8);
    expect(launched.ball.shot?.ballHeightAtContact).toBe(1.8);
    let current = launched;
    let resolvedHeader = false;
    for (let index = 0; index < 100; index += 1) {
      current = stepTacticalMatch(current, 0.1);
      resolvedHeader ||= current.lastShot?.shooterId === shooter.id;
    }
    expect(resolvedHeader).toBe(true);
    expect(Number.isFinite(current.ball.x) && Number.isFinite(current.ball.y)).toBe(true);
    expect(
      current.ball.ownerId ||
        current.ball.looseSince !== undefined ||
        current.ball.travelKind ||
        current.restart,
    ).toBeTruthy();
  });
});

describe('PR145 contextual execution calibration', () => {
  const prepare = () => {
    const setup = makeState('shot-calibration');
    for (const player of setup.state.players)
      if (player.id !== setup.shooter.id) player.position = { x: 45, y: 8 };
    setup.shooter.facingAngle = Math.PI / 2;
    Object.assign(setup.shooter.profile.attributes, {
      finishing: 65,
      technique: 65,
      composure: 65,
      agility: 65,
      firstTouch: 65,
    });
    return {
      ...setup,
      action: {
        type: 'shot' as const,
        actorId: setup.shooter.id,
        target: { x: 105, y: 34 },
        goalTarget: { horizontal: 0.4, vertical: 0.3 },
        intent: 'placed' as const,
      },
    };
  };
  it('widens the distribution with pressure, awkward orientation and difficult contacts', () => {
    const { state, shooter, action } = prepare();
    const ordinary = deriveShotExecutionErrorProfile(state, action);
    state.currentPressure = 0.9;
    const pressured = deriveShotExecutionErrorProfile(state, action);
    expect(pressured.horizontalSigma).toBeGreaterThan(ordinary.horizontalSigma);
    expect(pressured.verticalSigma).toBeGreaterThan(ordinary.verticalSigma);
    state.currentPressure = 0;
    shooter.facingAngle = -Math.PI / 4;
    expect(deriveShotExecutionErrorProfile(state, action).horizontalSigma).toBeGreaterThan(
      ordinary.horizontalSigma,
    );
    shooter.facingAngle = Math.PI / 2;
    const firstTime = deriveShotExecutionErrorProfile(state, { ...action, contact: 'first_time' });
    const volley = deriveShotExecutionErrorProfile(state, { ...action, contact: 'volley' });
    expect(firstTime.horizontalSigma).toBeGreaterThan(ordinary.horizontalSigma);
    expect(volley.horizontalSigma).toBeGreaterThanOrEqual(firstTime.horizontalSigma);
  });
  it('improves with finishing/composure and worsens with distance, angle and weak-foot contact', () => {
    const { state, shooter, action } = prepare();
    const ordinary = deriveShotExecutionErrorProfile(state, action);
    shooter.profile.attributes.finishing = 95;
    shooter.profile.attributes.composure = 95;
    const skilled = deriveShotExecutionErrorProfile(state, action);
    expect(skilled.horizontalSigma).toBeLessThan(ordinary.horizontalSigma);
    expect(skilled.verticalSigma).toBeLessThan(ordinary.verticalSigma);
    shooter.position = { x: 76, y: 48 };
    state.ball = { ...shooter.position, ownerId: shooter.id };
    expect(deriveShotExecutionErrorProfile(state, action).horizontalSigma).toBeGreaterThan(
      skilled.horizontalSigma,
    );
    shooter.position = { x: 91, y: 34 };
    state.ball = { x: 91, y: 34.4, ownerId: shooter.id };
    shooter.profile.dominantFoot = 'right';
    shooter.profile.weakFootProficiency = 10;
    const weak = deriveShotExecutionErrorProfile(state, action);
    shooter.profile.weakFootProficiency = 95;
    expect(deriveShotExecutionErrorProfile(state, action).horizontalSigma).toBeLessThan(
      weak.horizontalSigma,
    );
  });
  it('lets ordinary seeded attempts miss while close elite finishes remain concentrated', () => {
    const { state, shooter, action } = prepare();
    state.currentPressure = 0.55;
    const ordinary = Array.from({ length: 96 }, (_, index) =>
      resolveCanonicalShot({ ...state, seed: `shot-distribution-${index}` }, action),
    );
    expect(ordinary.filter((shot) => shot.classification !== 'on_target').length).toBeGreaterThan(
      15,
    );
    Object.assign(shooter.profile.attributes, { finishing: 100, technique: 100, composure: 100 });
    shooter.position = { x: 99, y: 34 };
    state.ball = { ...shooter.position, ownerId: shooter.id };
    state.currentPressure = 0;
    const elite = Array.from({ length: 96 }, (_, index) =>
      resolveCanonicalShot(
        { ...state, seed: `shot-distribution-${index}` },
        { ...action, goalTarget: { horizontal: 0, vertical: 0.3 } },
      ),
    );
    expect(elite.filter((shot) => Math.abs(shot.error.horizontal) < 0.35).length).toBeGreaterThan(
      90,
    );
    expect(elite.filter((shot) => shot.classification === 'on_target').length).toBeGreaterThan(85);
  });
});
