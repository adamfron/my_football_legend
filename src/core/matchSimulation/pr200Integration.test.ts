import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import {
  integrationProfileIdSchema,
  resolveIntegrationProfile,
  withIntegrationProfile,
  validateIntegrationFeatures,
} from './integrationProfile';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import {
  advanceLiveBallFlight,
  boundedKeeperCommand,
  observedMotorBall,
  observedFlight,
  boundedMovementTarget,
} from './liveBallFlight';
import { observeBallMotorState, observeReceptionBall } from './ballOrientedMovement';
import { observeBoundedScene } from './boundedPerception';
import { DEFAULT_DECISION_POLICY } from './decisionPolicyConfig';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';
import { advanceActivePerception } from './activePerception';
import { resolveGoalkeeperContact } from './goalkeeperIntervention';

const frozen = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr198/releases-v1.json.gz')).toString(),
).result.rows[0].state as TacticalMatchState;
const scene = () => {
  const s = withIntegrationProfile(structuredClone(frozen), 'realism-candidate-v0');
  s.players = [s.players[0]!];
  const p = s.players[0]!;
  p.position = { x: 50, y: 34 };
  p.facingAngle = -Math.PI / 2;
  s.ball = { ...s.ball, x: 40, y: 34, height: 0.11 };
  delete s.ball.ownerId;
  return s;
};
describe('PR200 executable integration contracts', () => {
  it('preserves B and leaves old optional state absent', () => {
    expect(DEFAULT_DECISION_POLICY).toBe('state-value-v1');
    expect(frozen.experimentalBoundedBallFlightBelief).toBeUndefined();
    expect(tacticalMatchStateSchema.parse(frozen).integrationProfile).toBeUndefined();
    const baseline = resolveIntegrationProfile('canonical-pr199');
    expect(Object.values(baseline.features).every((v) => v === false)).toBe(true);
  });
  it('resolves every profile deterministically and reports policy-specific inactive consumers', () => {
    const profiles = integrationProfileIdSchema.options.map((id) => resolveIntegrationProfile(id));
    expect(new Set(profiles.map((p) => p.fingerprint)).size).toBe(profiles.length);
    const historicalProfiles = profiles.filter((p) => !p.id.endsWith('-v1'));
    expect(new Set(historicalProfiles.map((p) => JSON.stringify(p.features))).size).toBe(
      historicalProfiles.length,
    );
    for (const p of profiles) expect(resolveIntegrationProfile(p.id)).toEqual(p);
    expect(resolveIntegrationProfile('realism-candidate-v0').inactive).toContain(
      'experimentalObservedLoftedPasses',
    );
    expect(
      resolveIntegrationProfile('realism-candidate-v0', 'opportunity-driven-v1').inactive,
    ).toContain('experimentalHeightAwarePassing');
  });
  it('rejects missing dependencies, controller conflict and unknown modules', () => {
    const f = resolveIntegrationProfile('realism-candidate-v0').features;
    expect(() =>
      validateIntegrationFeatures({ ...f, experimentalReceiverAnticipation: false }),
    ).toThrow();
    expect(() =>
      validateIntegrationFeatures({ ...f, experimentalReceiverSynchronisation: true }),
    ).toThrow();
    expect(() =>
      validateIntegrationFeatures({ ...f, experimentalBodyContacts: true } as never),
    ).toThrow();
    expect(() => validateIntegrationFeatures({ ...f, unknownModule: true } as never)).toThrow();
  });
  it('rejects invalid saved selections rather than silently repairing their fingerprint', () => {
    const s = withIntegrationProfile(structuredClone(frozen), 'realism-candidate-v0');
    expect(tacticalMatchStateSchema.safeParse(s).success).toBe(true);
    s.experimentalDefensiveReception = false;
    expect(tacticalMatchStateSchema.safeParse(s).success).toBe(false);
    s.experimentalDefensiveReception = true;
    s.decisionPolicy = 'contextual-judgment-v1';
    expect(tacticalMatchStateSchema.safeParse(s).success).toBe(false);
  });
  it('clears incompatible memory atomically and does not leak a toggle to another match', () => {
    let s = advanceLiveBallFlight(scene());
    expect(s.liveBallFlightRuntime).toBeDefined();
    s = withIntegrationProfile(s, 'canonical-pr199');
    expect(s.liveBallFlightRuntime).toBeUndefined();
    expect(s.experimentalBoundedBallFlightBelief).toBe(false);
    expect(frozen.experimentalBoundedBallFlightBelief).toBeUndefined();
  });
  it('makes auxiliary experiment switches explicit while retaining fixture briefing data', () => {
    const input = structuredClone(frozen);
    input.decisionAblation = 'movement';
    const s = withIntegrationProfile(input, 'realism-candidate-v0');
    expect(s.decisionAblation).toBe('none');
    expect(s.boundedExperiment!.knowledge).toEqual(input.boundedExperiment!.knowledge);
    s.boundedExperiment!.patterns = false;
    expect(tacticalMatchStateSchema.safeParse(s).success).toBe(false);
  });
  it('preserves the historical legacy policy when an old save has no policy field', () => {
    const input = structuredClone(frozen);
    delete input.decisionPolicy;
    expect(withIntegrationProfile(input, 'realism-candidate-v0').decisionPolicy).toBe(
      'legacy-pr176',
    );
  });
  it('one visible position supplies neither canonical velocity nor hidden spin', () => {
    const a = scene(),
      b = structuredClone(a);
    b.ball.velocity = { x: 123, y: -99, z: 4 };
    b.ball.spin = { x: 10, y: 20, z: 30 };
    const x = advanceLiveBallFlight(a),
      y = advanceLiveBallFlight(b);
    expect(x.liveBallFlightRuntime).toEqual(y.liveBallFlightRuntime);
    expect(x.liveBallFlightRuntime!.sensors[x.players[0]!.id]!.belief!.velocity).toBeNull();
    expect(observedMotorBall(x, x.players[0]!).ball).toBeNull();
  });
  it('rejects an invalid raw runtime toggle before an engineering fallback can execute', () => {
    const s = scene();
    s.experimentalReceiverAnticipation = false;
    expect(() => advanceLiveBallFlight(s)).toThrow(/requires anticipation/);
  });
  it('infers motion from a genuine optical interval with a separate motion clock', () => {
    let s = advanceLiveBallFlight(scene());
    for (let tick = 1; tick <= 8; tick++)
      s = advanceLiveBallFlight({
        ...s,
        time: frozen.time + tick * 0.025,
        ball: { ...s.ball, x: 40 - tick * 0.1 },
      });
    const belief = s.liveBallFlightRuntime!.sensors[s.players[0]!.id]!.belief!;
    expect(belief.velocitySource).toBe('optical_interval');
    expect(belief.motionEvidenceAt).toBe(belief.lastObservation!.at);
    expect(belief.velocity!.x).toBeLessThan(-2);
    expect(observeBallMotorState(s, s.players[0]!).ball!.spin).toEqual({ x: 0, y: 0, z: 0 });
    expect(observeReceptionBall(s, s.players[0]!)).toEqual(observeBallMotorState(s, s.players[0]!));
  });
  it('keeps hidden deflections stale, grows uncertainty and expires bounded memory', () => {
    let s = advanceLiveBallFlight(scene());
    const id = s.players[0]!.id,
      at = s.time;
    const initial = s.liveBallFlightRuntime!.sensors[id]!.belief;
    s = advanceLiveBallFlight({
      ...s,
      time: at + 0.3,
      ball: { ...s.ball, x: 60, velocity: { x: -30, y: 12, z: 2 } },
    });
    expect(s.liveBallFlightRuntime!.sensors[id]!.belief).toEqual(initial);
    expect(observedFlight(s, s.players[0]!)!.uncertainty).toBeGreaterThan(initial!.positionError);
    expect(observeBoundedScene(s, s.players[0]!).ball!.observedAt).toBe(at);
    s = advanceLiveBallFlight({ ...s, time: at + 4.1 });
    expect(observedFlight(s, s.players[0]!)).toBeUndefined();
  });
  it('does not reacquire twice when a consumer repeats within the same tick', () => {
    const s = advanceLiveBallFlight(scene());
    expect(advanceLiveBallFlight(s)).toBe(s);
    observeBoundedScene(s, s.players[0]!);
    observeReceptionBall(s, s.players[0]!);
    expect(s.liveBallFlightRuntime!.sensors[s.players[0]!.id]!.belief!.observations).toBe(1);
  });
  it('does not relabel a remembered ball as a fresh active-perception sighting', () => {
    let s = scene();
    s.experimentalActivePerception = true;
    s = advanceActivePerception(advanceLiveBallFlight(s));
    const id = s.players[0]!.id,
      seen = s.activePerceptionRuntime!.memory[id]!.ballSeenAt;
    s = { ...s, time: s.time + 0.4, ball: { ...s.ball, x: 65 } };
    s = advanceActivePerception(advanceLiveBallFlight(s));
    expect(s.activePerceptionRuntime!.memory[id]!.ballSeenAt).toBe(seen);
    expect(observeBoundedScene(s, s.players[0]!, true).ball).toBeNull();
  });
  it('keeper commands ignore hidden velocity, spin, destination and release metadata', () => {
    const a = advanceLiveBallFlight(scene()),
      b = structuredClone(a);
    b.ball = {
      ...b.ball,
      x: 99,
      y: 2,
      velocity: { x: -80, y: 99, z: 12 },
      spin: { x: 20, y: 20, z: 20 },
      target: { x: 1, y: 30 },
    };
    expect(boundedKeeperCommand(a, a.players[0]!)).toEqual(boundedKeeperCommand(b, b.players[0]!));
    expect(
      distanceMoved(boundedKeeperCommand(a, a.players[0]!).target, a.players[0]!.position),
    ).toBeGreaterThan(1);
  });
  it('keeps one motor authority and respects a known unexpired commitment', () => {
    const s = scene(),
      actor = s.players[0]!;
    s.defensiveChallenge = {
      id: 'known',
      actorId: actor.id,
      opponentId: 'observed',
      technique: 'standing',
      source: 'autonomous_npc',
      startedAt: s.time,
      expiresAt: s.time + 1,
      target: { x: 55, y: 30 },
    };
    expect(boundedMovementTarget(s, actor, { x: 42, y: 34 }, undefined)).toEqual({ x: 55, y: 30 });
    s.time += 2;
    expect(boundedMovementTarget(s, actor, { x: 42, y: 34 }, undefined)).toEqual({ x: 42, y: 34 });
  });
  it('round-trips experimental saved state and deterministically continues the actual executor', () => {
    const s = withIntegrationProfile(structuredClone(frozen), 'realism-candidate-v0');
    const restored = tacticalMatchStateSchema.parse(
      JSON.parse(JSON.stringify(s)),
    ) as unknown as TacticalMatchState;
    let a = structuredClone(restored),
      b = structuredClone(restored);
    for (let i = 0; i < 12; i++) {
      a = step(a, 0.025);
      b = step(b, 0.025);
    }
    expect(a).toEqual(b);
    expect(a.time).toBeGreaterThan(s.time);
    expect(a.liveBallFlightRuntime).toBeDefined();
  });
  it('isolates real keeper movement after tactical, role and aerial consumers run', () => {
    const a = withIntegrationProfile(structuredClone(frozen), 'realism-candidate-v0');
    a.ball = { ...a.ball, x: 52, y: 4, height: 2.5, velocity: { x: 1, y: 0, z: 0 } };
    const b = structuredClone(a);
    b.ball.x = 62;
    b.ball.y = 64;
    b.ball.velocity = { x: -8, y: 9, z: 2 };
    b.ball.spin = { x: 40, y: 50, z: 60 };
    const aa = step(a, 0.025),
      bb = step(b, 0.025);
    for (const p of aa.players.filter((p) => p.slot.position === 'goalkeeper')) {
      const other = bb.players.find((q) => q.id === p.id)!;
      expect({
        position: p.position,
        velocity: p.velocity,
        facing: p.facingAngle,
        target: p.target,
      }).toEqual({
        position: other.position,
        velocity: other.velocity,
        facing: other.facingAngle,
        target: other.target,
      });
    }
  });
  it('withholds active catch/parry permission from an engineering projection without timely evidence', () => {
    const s = scene(),
      keeper = s.players[0]!;
    expect(
      resolveGoalkeeperContact(
        s,
        {
          keeper,
          reactionDelay: 0,
          reactionRemaining: 0,
          ballTotalFlightTime: 1,
          ballRemainingFlightTime: 0,
          timeAvailable: 0,
          contactPoint: { ...keeper.position, z: 1 },
          requiredDisplacement: 0,
          availableReach: 2,
          reachable: true,
        },
        8,
      ),
    ).toBe('failed_save');
  });
});
const distanceMoved = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
