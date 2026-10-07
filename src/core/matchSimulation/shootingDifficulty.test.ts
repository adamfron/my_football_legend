import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { deriveShotExecutionErrorProfile, resolveCanonicalShot } from './shotResolver';
import { resolveMatchAction } from './matchActions';
import {
  deriveShootingDifficulty,
  shootingDifficultyContextSchema,
  type ShootingDifficultyContext,
} from './shootingDifficulty';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import { findFirstBallContact } from './ballFlight';
import { projectFutureBallTrajectory } from './ballPhysics';
import { goalIntentToPitch } from './goalCoordinates';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr157-shooting-regression',
      control: { mode: 'spectator' },
    }),
  );
  for (const player of state.players) {
    player.position = { x: 20, y: 65 };
    player.target = { ...player.position };
    player.velocity = { x: 0, y: 0 };
    for (const key of Object.keys(
      player.profile.attributes,
    ) as (keyof typeof player.profile.attributes)[])
      player.profile.attributes[key] = 60;
  }
  const shooter = state.players.find(
    (p) => p.team === 'home' && p.profile.primaryPosition === 'striker',
  )!;
  const keeper = state.players.find(
    (p) => p.team === 'away' && p.profile.primaryPosition === 'goalkeeper',
  )!;
  shooter.position = { x: 85, y: 34 };
  shooter.facingAngle = Math.PI / 2;
  keeper.position = { x: 103, y: 46 };
  keeper.facingAngle = -Math.PI / 2;
  state.ball = { ...shooter.position, height: 0.11, ownerId: shooter.id };
  state.scenario = 'open_play';
  state.time = 30;
  state.currentPressure = 0;
  state.playerAgencyEnabled = false;
  delete state.restart;
  const action = {
    type: 'shot' as const,
    actorId: shooter.id,
    intent: 'placed' as const,
    target: { x: 105, y: 34 },
    goalTarget: { horizontal: 0.55, vertical: 0.3 },
  };
  return { state, shooter, keeper, action };
};
const context = (overrides: Partial<ShootingDifficultyContext> = {}) =>
  shootingDifficultyContextSchema.parse({
    distance: 20,
    angle: 1,
    pressure: 0,
    orientation: 0,
    weakFoot: 0,
    incomingSpeed: 0,
    ballHeight: 0.11,
    contact: 'settled',
    intent: 'placed',
    targetWindow: 0,
    blockers: 0,
    ...overrides,
  });

describe('PR157 continuous shooting ability × difficulty', () => {
  it('crosses the sampled horizontal target at the real goal plane for angled strikes', () => {
    const { state, shooter, action } = fixture();
    shooter.position = { x: 86, y: 48 };
    state.ball = { ...shooter.position, height: 0.11, ownerId: shooter.id };
    const shot = resolveCanonicalShot(state, action);
    let previous = { ...shooter.position, z: 0.11 };
    let crossingY: number | undefined;
    for (const sample of projectFutureBallTrajectory(
      { position: previous, velocity: shot.launchVelocity, airborne: true, bounceCount: 0 },
      6,
      0.025,
    )) {
      const contact = findFirstBallContact({
        previous,
        next: sample.ball.position,
        attackingTeam: shooter.team,
      });
      previous = sample.ball.position;
      if (contact) {
        crossingY = contact.point.y;
        break;
      }
    }
    expect(crossingY).toBeDefined();
    expect(crossingY).toBeCloseTo(goalIntentToPitch(shooter.team, shot.actualTarget).y, 8);
  });
  it('resolves a physical touchline escape before a later goal-plane miss and preserves the shot identity', () => {
    const { state, action } = fixture();
    const launched = resolveMatchAction(state, action, 'autonomous_npc');
    const shot = launched.ball.shot!;
    launched.ball = {
      ...launched.ball,
      x: 90,
      y: 67.8,
      height: 0.11,
      velocity: { x: 8, y: 20, z: 0 },
      airborne: false,
    };
    launched.actionCooldown = 1000;
    const next = stepTacticalMatchAfterDecisionProbe(launched, 0.025);
    expect(next.ball.shot).toBeUndefined();
    expect(next.lastShot).toMatchObject({
      shotId: shot.shotId,
      outcome: 'miss',
      classification: 'wide',
    });
    expect(next.lastBoundaryRestart).toBe('throw_in');
    expect(next.lastBoundaryCrossing?.point.y).toBe(68);
  });
  it.each(['save', 'block'] as const)(
    'preserves an already resolved %s if a recovered flight later leaves the touchline',
    (outcome) => {
      const { state, action } = fixture();
      const launched = resolveMatchAction(state, action, 'autonomous_npc');
      const resolved = { ...launched.ball.shot!, outcome };
      launched.lastShot = resolved;
      launched.lastShotResult = outcome;
      launched.ball = {
        ...launched.ball,
        x: 90,
        y: 67.8,
        height: 0.11,
        velocity: { x: 8, y: 20, z: 0 },
        airborne: false,
      };
      launched.actionCooldown = 1000;
      const next = stepTacticalMatchAfterDecisionProbe(launched, 0.025);
      expect(next.lastBoundaryRestart).toBe('throw_in');
      expect(next.lastShot).toEqual(resolved);
      expect(next.lastShotResult).toBe(outcome);
    },
  );
  it('keeps a missing primary finishing skill consequential with other skills held fixed', () => {
    const { shooter } = fixture();
    shooter.profile.attributes.finishing = 10;
    const poor = deriveShootingDifficulty(shooter, context());
    shooter.profile.attributes.finishing = 100;
    const excellent = deriveShootingDifficulty(shooter, context());
    expect(poor.horizontalSigma).toBeGreaterThan(excellent.horizontalSigma * 3);
    expect(poor.executionQuality).toBeLessThan(excellent.executionQuality);
  });
  it('uses composure specifically for pressure rather than universal placement quality', () => {
    const { shooter } = fixture();
    shooter.profile.attributes.composure = 10;
    const easyPoor = deriveShootingDifficulty(shooter, context());
    const pressuredPoor = deriveShootingDifficulty(shooter, context({ pressure: 0.8 }));
    shooter.profile.attributes.composure = 100;
    const easyExcellent = deriveShootingDifficulty(shooter, context());
    const pressuredExcellent = deriveShootingDifficulty(shooter, context({ pressure: 0.8 }));
    expect(easyExcellent).toEqual(easyPoor);
    expect(pressuredPoor.horizontalSigma - pressuredExcellent.horizontalSigma).toBeGreaterThan(1);
    expect(pressuredExcellent.horizontalSigma).toBeGreaterThan(easyExcellent.horizontalSigma);
  });
  it('makes technique particularly useful for airborne contact and turning, with intrinsic demand independent of skill', () => {
    const { shooter } = fixture();
    const volley = context({
      contact: 'volley',
      incomingSpeed: 22,
      ballHeight: 0.95,
      orientation: 0.6,
    });
    shooter.profile.attributes.technique = 10;
    const poorSettled = deriveShootingDifficulty(shooter, context());
    const poorVolley = deriveShootingDifficulty(shooter, volley);
    shooter.profile.attributes.technique = 100;
    const eliteSettled = deriveShootingDifficulty(shooter, context());
    const eliteVolley = deriveShootingDifficulty(shooter, volley);
    expect(poorVolley.intrinsicDifficulty).toBe(eliteVolley.intrinsicDifficulty);
    expect(poorVolley.horizontalSigma - eliteVolley.horizontalSigma).toBeGreaterThan(
      poorSettled.horizontalSigma - eliteSettled.horizontalSigma,
    );
    expect(eliteVolley.horizontalSigma).toBeGreaterThan(eliteSettled.horizontalSigma);
  });
  it('uses heading as the primary header skill without inheriting finishing', () => {
    const { shooter } = fixture();
    const header = context({
      contact: 'header',
      intent: 'header',
      ballHeight: 1.8,
      incomingSpeed: 16,
    });
    shooter.profile.attributes.finishing = 10;
    const first = deriveShootingDifficulty(shooter, header);
    shooter.profile.attributes.finishing = 100;
    expect(deriveShootingDifficulty(shooter, header)).toEqual(first);
    shooter.profile.attributes.heading = 100;
    expect(deriveShootingDifficulty(shooter, header).horizontalSigma).toBeLessThan(
      first.horizontalSigma,
    );
  });
  it('has continuous range, angle, turn, ball speed/height, weak-foot and blocker demand', () => {
    const { shooter } = fixture();
    const near = deriveShootingDifficulty(shooter, context({ distance: 4 }));
    const far = deriveShootingDifficulty(shooter, context({ distance: 32 }));
    expect(far.horizontalSigma).toBeGreaterThan(near.horizontalSigma * 4);
    const before = deriveShootingDifficulty(shooter, context({ distance: 24.999 }));
    const after = deriveShootingDifficulty(shooter, context({ distance: 25.001 }));
    expect(after.horizontalSigma - before.horizontalSigma).toBeLessThan(0.001);
    for (const harder of [
      context({ angle: 0.3 }),
      context({ orientation: 0.7 }),
      context({ weakFoot: 0.9 }),
      context({ blockers: 1.2 }),
      context({ contact: 'first_time', incomingSpeed: 24 }),
      context({ contact: 'volley', incomingSpeed: 24, ballHeight: 0.95 }),
    ])
      expect(deriveShootingDifficulty(shooter, harder).horizontalSigma).toBeGreaterThan(
        deriveShootingDifficulty(shooter, context()).horizontalSigma,
      );
  });
  it('allows poor point-blank successes and elite difficult misses through the same seeded resolver', () => {
    const { state, shooter, action } = fixture();
    for (const key of ['finishing', 'technique', 'composure', 'agility'] as const)
      shooter.profile.attributes[key] = 10;
    shooter.position.x = 101;
    state.ball = { ...shooter.position, height: 0.11, ownerId: shooter.id };
    const easy = Array.from({ length: 64 }, (_, index) =>
      resolveCanonicalShot(
        { ...state, seed: `pr157-outcomes:${index}` },
        { ...action, goalTarget: { horizontal: 0, vertical: 0.3 } },
      ),
    );
    expect(easy.filter((shot) => shot.classification === 'on_target').length).toBeGreaterThan(40);
    for (const key of ['finishing', 'technique', 'composure', 'agility'] as const)
      shooter.profile.attributes[key] = 100;
    shooter.position.x = 80;
    shooter.facingAngle -= 2.2;
    state.ball = { ...shooter.position, height: 0.11, ownerId: shooter.id };
    state.currentPressure = 0.9;
    const difficult = Array.from({ length: 64 }, (_, index) =>
      resolveCanonicalShot({ ...state, seed: `pr157-outcomes:${index}` }, action),
    );
    expect(difficult.some((shot) => shot.classification !== 'on_target')).toBe(true);
    expect(difficult.some((shot) => shot.classification === 'on_target')).toBe(true);
  });
  it('does not let goalkeeper attributes alter either shot or header trajectories', () => {
    for (const header of [false, true]) {
      const { state, shooter, keeper, action } = fixture();
      shooter.position = { x: 100, y: 34 };
      keeper.position = { x: 103, y: 34 };
      state.ball = { ...shooter.position, height: header ? 1.8 : 0.11, ownerId: shooter.id };
      const attempted = header
        ? {
            type: 'header' as const,
            actorId: shooter.id,
            intent: 'header_shot' as const,
            target: action.target,
          }
        : action;
      keeper.profile.attributes.positioning = 10;
      const poor = resolveMatchAction(state, attempted, 'autonomous_npc');
      keeper.profile.attributes.positioning = 100;
      keeper.profile.attributes.reflexes = 100;
      keeper.profile.attributes.agility = 100;
      const elite = resolveMatchAction(state, attempted, 'autonomous_npc');
      expect(poor.ball.shot).toBeDefined();
      expect(poor.ball.launchVelocity).toEqual(elite.ball.launchVelocity);
      expect(poor.ball.shot?.error).toEqual(elite.ball.shot?.error);
    }
  });
  it('keeps blocker execution demand continuous across the historical reporting lane cutoff', () => {
    const { state, shooter, action } = fixture();
    const defender = state.players.find(
      (p) => p.team !== shooter.team && p.profile.primaryPosition !== 'goalkeeper',
    )!;
    defender.position = { x: 94, y: 35.6499 };
    const before = deriveShotExecutionErrorProfile(state, action);
    defender.position.y = 35.6501;
    const after = deriveShotExecutionErrorProfile(state, action);
    expect(Math.abs(before.horizontalSigma - after.horizontalSigma)).toBeLessThan(0.001);
    expect(evaluateShootingOpportunity(state, shooter).blockingDemand).toBeGreaterThan(0);
  });
});
