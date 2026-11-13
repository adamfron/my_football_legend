// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createPr214Scene } from '../../../scripts/pr214Scenarios';
import { createSingleMatchSession, singleMatchSetupSchema } from '../singleMatch';
import { createTacticalMatch, stepTacticalMatch } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import {
  effectiveHolisticRecipe,
  withHolisticDevelopment,
  observeHolisticActivation,
} from './holisticDevelopment';
import { ownsOrdinaryLowBallInterval } from './ordinaryContactInterval';
import { resolveIntegrationProfile, withIntegrationProfile } from './integrationProfile';
import { fixtureIdentity } from './roleExperiment';
import {
  createPr215ReceptionBlocker,
  createPr215PassiveSupportScene,
} from '../../../scripts/pr215Scenarios';
import { advancePendingStrikeInterval } from './pendingStrikeInterval';
import { captureReplaySnapshot, replaySnapshotSchema } from './matchReplay';
import { applyRestartScenario } from './restartScenarios';

const world = createCanonicalWorldDatabase();
const setup = {
  homeClubId: world.clubs[0]!.id,
  awayClubId: world.clubs[1]!.id,
  seed: 'pr215-selector',
  control: { mode: 'spectator' as const },
};
const reload = (s: TacticalMatchState) =>
  tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))) as unknown as TacticalMatchState;
const looseScene = () => {
  const s = withHolisticDevelopment(createPr214Scene('line-three').initial);
  delete s.pendingStrike;
  delete s.defensiveChallenge;
  s.ball = {
    x: 30.74,
    y: 32.8,
    height: 0.11,
    velocity: { x: 0.5, y: 0, z: 0 },
    looseSince: s.time,
  };
  s.actionCooldown = 1;
  s.playerAgencyEnabled = false;
  return s;
};

describe('PR215 session selection and bounded ordinary contact authority', () => {
  it('defaults old setups to the identical ordinary state and rejects unknown presets', () => {
    const session = createSingleMatchSession(world, setup);
    expect(session.setup.physicalPreset).toBeUndefined();
    const s = createTacticalMatch(session);
    expect(s.experimentalPlayerBodyImpulse).toBeUndefined();
    expect(s.executionWitnesses).toBeUndefined();
    expect(
      singleMatchSetupSchema.safeParse({ ...setup, physicalPreset: 'all-flags' }).success,
    ).toBe(false);
  });
  for (const policy of ['state-value-v1', 'opportunity-driven-v1'] as const)
    for (const controlled of [false, true])
      it(`initializes the actual recipe before kickoff: ${policy}, human=${controlled}`, () => {
        const base = createSingleMatchSession(world, setup);
        const session = createSingleMatchSession(world, {
          ...setup,
          physicalPreset: 'holistic-physical-dev-v1',
          decisionPolicy: policy,
          control: controlled
            ? {
                mode: 'player',
                clubId: setup.homeClubId,
                footballerId: base.home.players[1]!.footballerId,
                forceIntoXI: true,
              }
            : setup.control,
        });
        const s = createTacticalMatch(session);
        expect(effectiveHolisticRecipe(s)?.id).toBe('holistic-physical-dev-v1');
        expect(s.decisionPolicy).toBe(policy);
        expect(s.time).toBe(0);
        expect(s.scenario).toBe('kick_off');
        expect(s.players).toHaveLength(22);
        expect(tacticalMatchStateSchema.safeParse(s).success).toBe(true);
        expect(createTacticalMatch(structuredClone(session))).toEqual(s);
        expect(effectiveHolisticRecipe(reload(s))).toEqual(effectiveHolisticRecipe(s));
      });
  it('keeps physics in fixture/replay identity while policy remains an independent dimension', () => {
    const a = createSingleMatchSession(world, setup);
    const b = createSingleMatchSession(world, {
      ...setup,
      physicalPreset: 'holistic-physical-dev-v1',
    });
    expect(a.home).toEqual(b.home);
    expect(a.away).toEqual(b.away);
    expect(fixtureIdentity(a)).not.toBe(fixtureIdentity(b));
    expect(fixtureIdentity(b)).toBe(
      fixtureIdentity({ ...b, setup: { ...b.setup, decisionPolicy: 'opportunity-driven-v1' } }),
    );
    const ordinaryBefore = createTacticalMatch(a);
    createTacticalMatch(b);
    expect(createTacticalMatch(a)).toEqual(ordinaryBefore);
    expect(resolveIntegrationProfile('realism-candidate-v1', 'state-value-v1').fingerprint).toBe(
      'ip0-2d2162c9',
    );
  });
  it.each(['spectator', 'player'] as const)('starts and replays stance v2 as %s', (mode) => {
    const ordinary = createSingleMatchSession(world, setup);
    const session = createSingleMatchSession(world, {
      ...setup,
      control:
        mode === 'spectator'
          ? setup.control
          : {
              mode,
              clubId: setup.homeClubId,
              footballerId: ordinary.home.players[1]!.footballerId,
              forceIntoXI: true,
            },
      physicalPreset: 'holistic-stance-foot-dev-v2',
      decisionPolicy: 'opportunity-driven-v1',
    });
    const state = createTacticalMatch(session);
    expect(state.seed).toBe(setup.seed);
    expect(state.decisionPolicy).toBe('opportunity-driven-v1');
    expect(state.experimentalArticulatedBody).toBe('stance-foot-dev-v2');
    expect(state.players.every((player) => player.articulatedStance)).toBe(true);
    expect(effectiveHolisticRecipe(reload(state))?.id).toBe('holistic-stance-foot-dev-v2');
    expect(createTacticalMatch(structuredClone(session))).toEqual(state);
    expect(fixtureIdentity(session)).not.toBe(fixtureIdentity(ordinary));
    const replay = replaySnapshotSchema.parse(
      captureReplaySnapshot(stepTacticalMatch(state, 0.025), 0),
    );
    expect(replay.continuity).toContain('stance-foot-dev-v2');
    expect(replay.articulatedBody).toBe('stance-foot-dev-v2');
    expect(replay.players.every((player) => player.articulatedBody)).toBe(true);
    const corner = applyRestartScenario(state, 'corner');
    expect(captureReplaySnapshot(corner, 1).players.every((player) => player.articulatedBody)).toBe(
      true,
    );
    expect(
      tacticalMatchStateSchema.safeParse({
        ...state,
        experimentalArticulatedBody: 'stance-foot-dev-v1',
      }).success,
    ).toBe(false);
  });
  it('derives the HUD identity from the actual recipe and clears observations with historical profiles', () => {
    const s = looseScene();
    expect(effectiveHolisticRecipe(s)).toBeDefined();
    const changed = structuredClone(s);
    delete changed.experimentalKickExecution;
    expect(effectiveHolisticRecipe(changed)).toBeUndefined();
    const historical = withIntegrationProfile(s, 'realism-candidate-v1', 'state-value-v1');
    expect(historical.executionWitnesses).toBeUndefined();
    expect(historical.experimentalPlayerBodyImpulse).toBeUndefined();
  });
  it('executes real ordinary-phase collisions without a dummy pending pass or challenge', () => {
    const s = looseScene();
    expect(ownsOrdinaryLowBallInterval(s, 0.025)).toBe(true);
    const out = stepTacticalMatch(s, 0.025);
    expect(out.pendingStrike).toBeUndefined();
    expect(out.executionWitnesses?.['ordinary-loose-ball']?.invoked).toBe(1);
    expect(out.playerBodyContacts?.some((c) => c.kind === 'impact' && c.normalImpulse > 0)).toBe(
      true,
    );
    expect(out.ball.ownerId).toBeUndefined();
    expect(out.time).toBeCloseTo(s.time + 0.025, 12);
    expect(tacticalMatchStateSchema.safeParse(out).success).toBe(true);
    expect(
      observeHolisticActivation(s, out).find((o) => o.mechanism === 'ordinary-loose-ball')?.invoked,
    ).toBe(true);
  });
  it('replays an ordinary-phase checkpoint natively and telemetry does not change physics', () => {
    const s = looseScene();
    const a = stepTacticalMatch(s, 0.025);
    expect(stepTacticalMatch(reload(a), 0.025)).toEqual(stepTacticalMatch(a, 0.025));
    const silent = structuredClone(s);
    delete silent.executionWitnesses;
    const observed = stepTacticalMatch(s, 0.025);
    delete observed.executionWitnesses;
    expect(observed).toEqual(stepTacticalMatch(silent, 0.025));
  });
  it('keeps the pre-movement interval owner when a keeper moves into the next-step safety margin', () => {
    const s = looseScene();
    const keeper = s.players.find(
      (p) => p.team === 'home' && (p.goalkeeperRole || p.slot.position === 'goalkeeper'),
    )!;
    keeper.position = { x: s.ball.x + 3.1, y: s.ball.y };
    keeper.velocity = { x: -2, y: 0 };
    expect(ownsOrdinaryLowBallInterval(s, 0.025)).toBe(true);
    const out = stepTacticalMatch(s, 0.025);
    expect(out.executionWitnesses?.['ordinary-loose-ball']?.invoked).toBe(1);
    expect(out.executionWitnesses?.['fallback-keeper-aerial']).toBeUndefined();
    expect(out.playerBodyContacts?.some((c) => c.kind === 'impact')).toBe(true);
  });
  it('migrates low carries/deliveries while preserving keeper and high-ball authority', () => {
    const s = looseScene();
    for (const ball of [
      { ...s.ball, ownerId: s.players[1]!.id },
      { ...s.ball, travelKind: 'pass' as const },
      { ...s.ball, airborne: true },
    ])
      expect(ownsOrdinaryLowBallInterval({ ...s, ball }, 0.025)).toBe(true);
    expect(ownsOrdinaryLowBallInterval({ ...s, ball: { ...s.ball, height: 1 } }, 0.025)).toBe(
      false,
    );
    const keeper = s.players.find((p) => p.goalkeeperRole || p.slot.position === 'goalkeeper')!;
    keeper.position = { x: s.ball.x, y: s.ball.y + 2 };
    expect(ownsOrdinaryLowBallInterval(s, 0.025)).toBe(true);
    s.ball.velocity = { x: 1, y: 0, z: 0 };
    expect(ownsOrdinaryLowBallInterval(s, 0.025)).toBe(true);
    s.ball.height = 0.4;
    expect(ownsOrdinaryLowBallInterval(s, 0.025)).toBe(false);
  });
  it('bounds observation keys and rejects malformed saved counters', () => {
    const s = looseScene();
    expect(
      tacticalMatchStateSchema.safeParse({
        ...s,
        executionWitnesses: {
          'ordinary-loose-ball': { invoked: -1, executed: 0, at: s.time, source: 'bad' },
        },
      }).success,
    ).toBe(false);
    expect(
      tacticalMatchStateSchema.safeParse({ ...s, executionWitnesses: { unknown: {} } }).success,
    ).toBe(false);
  });
  it('retains passive-body support after that actor is excluded from further foot service', () => {
    const f = createPr215PassiveSupportScene();
    let s = f.initial;
    // Cluster mode now has separate boot and torso geometry. Exercise the torso
    // at torso height; the historical ground-level aggregate fixture stays sealed.
    const actor = s.players.find((p) => p.id === f.actorId)!;
    s.ball = {
      ...s.ball,
      x: 30,
      height: (actor.profile.heightCm / 100) * 0.77 + 0.45,
      velocity: { x: 0, y: 0, z: -0.01 },
      airborne: true,
    };
    for (let i = 0; i < 4; i++) {
      s = advancePendingStrikeInterval(s, { ...s, time: s.time + 0.025 }, 0.025, {
        ordinary: true,
        boundary: (q) => q,
        control: (q) => q,
        body: (q) => q,
      });
      expect(s.ball.continuousBodyContacts).toContain(f.actorId);
    }
    expect(s.executionWitnesses?.['ball-body-contact']?.executed).toBe(1);
    expect(s.ball.ownerId).toBeUndefined();
  });
  it('finishes a genuine reception remainder without a second impulse', () => {
    let s = createPr215ReceptionBlocker();
    for (let i = 0; i < 8 && !s.executionWitnesses?.unresolved; i++)
      s = stepTacticalMatch(s, 0.025);
    expect(s.executionWitnesses?.unresolved).toBeUndefined();
    expect(s.time).toBeCloseTo(10.2, 12);
    expect(s.ball.ownerId).toBe(s.lastGroundContact?.actorId);
    expect(s.lastGroundContact?.surfaceContact?.available).toBe(true);
    expect(s.lastGroundContact?.retained).toBe(true);
    expect(s.executionWitnesses?.['controlled-reception']?.executed).toBe(1);
    expect(s.executionWitnesses?.['fallback-carry']).toBeUndefined();
    let replay = reload(s);
    for (let i = 0; i < 8; i++) {
      s = stepTacticalMatch(s, 0.025);
      replay = stepTacticalMatch(replay, 0.025);
      expect(JSON.parse(JSON.stringify(replay))).toEqual(JSON.parse(JSON.stringify(s)));
    }
  });
});
