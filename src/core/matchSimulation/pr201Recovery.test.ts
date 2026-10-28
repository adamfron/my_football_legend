import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { boundedMovementTarget, advanceLiveBallFlight, observedMotorBall } from './liveBallFlight';
import { resolveIntegrationProfile, withIntegrationProfile } from './integrationProfile';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';

const release = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr198/releases-v1.json.gz')).toString(),
).result.rows[0].state as TacticalMatchState;
const scene = () => withIntegrationProfile(structuredClone(release), 'realism-candidate-v1');
const receiver = (s: TacticalMatchState) =>
  s.players.find((p) => p.id === s.receptionPreparation!.actorId)!;
describe('PR201 local receiver recovery', () => {
  it('preserves every PR200 saved profile checksum and selection', () => {
    for (const design of ['ww', 'ss', 'sw']) {
      const policy = design === 'ww' ? 'opportunity-driven-v1' : 'state-value-v1';
      const old = JSON.parse(
        gunzipSync(
          readFileSync(
            `docs/performance/pr200/matches/${design}-${policy}-realism-candidate-v0-v3.json.gz`,
          ),
        ).toString(),
      ).result.manifest;
      expect(resolveIntegrationProfile('realism-candidate-v0', policy).fingerprint).toBe(
        old.fingerprint,
      );
      expect(resolveIntegrationProfile('realism-candidate-v0', policy).features).toEqual(
        old.features,
      );
    }
    expect(resolveIntegrationProfile('realism-candidate-v1').implementation).toBe(
      'pr201-receiver-recovery-v1',
    );
    expect(resolveIntegrationProfile('realism-candidate-v1').fingerprint).not.toBe(
      resolveIntegrationProfile('realism-candidate-no-recovery-v1').fingerprint,
    );
  });
  it('brakes locally without a contact forecast and preserves the historical anchor fallback', () => {
    const s = scene(),
      p = receiver(s);
    p.position = { x: 80, y: 10 };
    p.neutralAnchor = { x: 38, y: 40 };
    expect(boundedMovementTarget(s, p, undefined, undefined)).toEqual(p.position);
    delete s.boundedReceiverRecovery;
    expect(boundedMovementTarget(s, p, undefined, undefined)).toEqual(p.neutralAnchor);
  });
  it('keeps a valid observed target, higher commitments and their expiry', () => {
    const s = scene(),
      p = receiver(s),
      target = { x: 75, y: 14 };
    expect(boundedMovementTarget(s, p, target, undefined)).toEqual(target);
    s.defensiveChallenge = {
      id: 'known',
      actorId: p.id,
      opponentId: 'known-opponent',
      technique: 'standing',
      source: 'autonomous_npc',
      startedAt: s.time,
      expiresAt: s.time + 1,
      target,
    };
    expect(boundedMovementTarget(s, p, undefined, undefined)).toEqual(target);
    s.time += 2;
    expect(boundedMovementTarget(s, p, undefined, undefined)).toEqual(p.position);
  });
  it('does not turn one observed position into velocity or a predicted meeting point', () => {
    const s = scene(),
      p = receiver(s);
    s.players = [p];
    p.position = { x: 50, y: 34 };
    p.facingAngle = -Math.PI / 2;
    s.ball = { ...s.ball, x: 40, y: 34, height: 0.11 };
    const a = advanceLiveBallFlight(s),
      b = advanceLiveBallFlight({
        ...structuredClone(s),
        ball: { ...s.ball, velocity: { x: 100, y: 99, z: 10 }, spin: { x: 30, y: 20, z: 10 } },
      });
    expect(a.liveBallFlightRuntime).toEqual(b.liveBallFlightRuntime);
    expect(observedMotorBall(a, p).ball).toBeNull();
    expect(boundedMovementTarget(a, p, undefined, undefined)).toEqual(p.position);
  });
  it('keeps an unseen deflection out of the actual receiver movement command', () => {
    const a = scene(),
      p = receiver(a);
    p.position = { x: 80, y: 34 };
    p.facingAngle = Math.PI / 2;
    p.velocity = { x: 0, y: 0 };
    a.ball = { ...a.ball, x: 20, y: 20, height: 2, velocity: { x: 1, y: 0, z: 0 } };
    const b = structuredClone(a);
    b.ball.x = 30;
    b.ball.y = 50;
    b.ball.velocity = { x: -20, y: 12, z: 3 };
    b.ball.spin = { x: 20, y: 10, z: 30 };
    const aa = step(a, 0.025),
      bb = step(b, 0.025),
      pa = receiver(aa),
      pb = receiver(bb);
    expect({
      position: pa.position,
      velocity: pa.velocity,
      target: pa.target,
      facing: pa.facingAngle,
    }).toEqual({
      position: pb.position,
      velocity: pb.velocity,
      target: pb.target,
      facing: pb.facingAngle,
    });
    expect(aa.liveBallFlightRuntime!.sensors[p.id]!.belief).toBeUndefined();
  });
  it('round-trips and continues deterministically, rejecting undeclared recovery settings', () => {
    const s = scene();
    expect(tacticalMatchStateSchema.safeParse(s).success).toBe(true);
    let a = structuredClone(s),
      b = tacticalMatchStateSchema.parse(
        JSON.parse(JSON.stringify(s)),
      ) as unknown as TacticalMatchState;
    for (let i = 0; i < 20; i++) {
      a = step(a, 0.025);
      b = step(b, 0.025);
    }
    expect(a).toEqual(b);
    const wrong = structuredClone(s);
    delete wrong.boundedReceiverRecovery;
    expect(tacticalMatchStateSchema.safeParse(wrong).success).toBe(false);
    expect(
      withIntegrationProfile(s, 'realism-candidate-v0').boundedReceiverRecovery,
    ).toBeUndefined();
    expect(
      tacticalMatchStateSchema.safeParse({ ...release, boundedReceiverRecovery: 'hold-local-v1' })
        .success,
    ).toBe(false);
  });
});
