import { describe, expect, it } from 'vitest';
import { createPr205Fixture, sightPr205Ball } from './pr205Laboratory';
import { locallyObservedRecovery } from './localReception';
import { projectLocomotion } from './locomotion';
import {
  applyCanonicalBallControl,
  stepTacticalMatchAfterDecisionProbe as step,
} from './matchSimulation';
import { resolveContinuousGroundPassClaim } from './passClaimResolver';
import { tacticalMatchStateSchema } from './matchState';
import { prospectiveMovementSchema } from './situationalAwarenessState';
import { advanceBallAcquisition } from './ballAcquisition';
import { boundedMovementTarget } from './liveBallFlight';
import { awardNaturalRestart } from './restartScenarios';
import { withIntegrationProfile } from './integrationProfile';
import { advanceActivePerception } from './activePerception';

const fixture = (role: 'team' | 'opponent' | 'keeper' = 'team', speed = 6) => {
  const f = createPr205Fixture(role, speed);
  f.state.prospectiveMovement = 'observed-ball-contact-dev-v1';
  return f;
};
const kinds = ['pass', 'cross', undefined] as const;
const physical = (s: ReturnType<typeof fixture>['state']) => ({
  ball: s.ball,
  contact: s.lastGroundContact,
  reception: s.lastReceptionOutcome,
  team: s.possessionTeam,
  change: s.lastPossessionChange,
  loss: s.lastPossessionLoss,
});

describe('PR205 observed recovery intention', () => {
  it('removes the frozen hidden-label sprint without suppressing an observed recovery', () => {
    const { state: s, actor: p } = fixture();
    s.ball.x = 54;
    for (const observed of [false, true]) {
      if (observed) sightPr205Ball(s, p.id);
      const recovery = locallyObservedRecovery(s, p);
      expect(Boolean(recovery)).toBe(observed);
      const target = recovery?.movement.movementTarget ?? { x: 54, y: 34 };
      const projections = kinds.map((kind) => {
        const copy = structuredClone(s);
        if (kind) copy.ball.travelKind = kind;
        else delete copy.ball.travelKind;
        expect(locallyObservedRecovery(copy, p)).toEqual(recovery);
        return projectLocomotion(copy, p, target, null, recovery?.movement);
      });
      expect(projections[1]).toEqual(projections[0]);
      expect(projections[2]).toEqual(projections[0]);
      expect(projections[0]!.intensity).toBe(observed ? 'sprint' : 'jog');
    }
  });

  it('keeps canonical motor inputs independent of hidden geometry, velocity and release target', () => {
    const { state: s, actor: p } = fixture();
    s.ball.x = 54;
    sightPr205Ball(s, p.id);
    const results = kinds.map((kind, i) => {
      const copy = structuredClone(s);
      copy.ball.x = 60 + i * 10;
      copy.ball.velocity = { x: -20 + i * 10, y: i * 5, z: 0 };
      copy.ball.target = { x: 90, y: i * 15 };
      copy.ball.intendedReceiverId = copy.players[i]!.id;
      if (kind) copy.ball.travelKind = kind;
      else delete copy.ball.travelKind;
      const next = step(copy, 0.025).players.find((q) => q.id === p.id)!;
      return {
        position: next.position,
        velocity: next.velocity,
        target: next.target,
        intensity: next.locomotionIntensity,
        facing: next.facingAngle,
      };
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(Math.hypot(results[0]!.velocity.x, results[0]!.velocity.y)).toBeLessThan(0.4);
  });

  it('rejects a wrong tactical target, stale/future evidence and an inaccessible high ball', () => {
    const { state: s, actor: p } = fixture();
    sightPr205Ball(s, p.id);
    const recovery = locallyObservedRecovery(s, p)!;
    expect(projectLocomotion(s, p, { x: 46, y: 34 }, null, recovery.movement).reason).not.toBe(
      'loose_ball_race',
    );
    expect(locallyObservedRecovery({ ...s, time: s.time + 0.51 }, p)).toBeUndefined();
    expect(locallyObservedRecovery({ ...s, time: s.time - 0.1 }, p)).toBeUndefined();
    sightPr205Ball(s, p.id, { x: 54, y: 34, z: 30 }, { x: 0, y: 0, z: 20 });
    expect(locallyObservedRecovery(s, p)).toBeUndefined();
  });

  it('recognises observed pressure and yields to existing defensive and human commitments', () => {
    const { state: s, actor: p } = fixture();
    sightPr205Ball(s, p.id);
    const recovery = locallyObservedRecovery(s, p)!;
    const target = { x: 45, y: 30 };
    s.playerMovementIntent = {
      actorId: p.id,
      type: 'hold_shape',
      target,
      startedAt: s.time,
      expiresAt: s.time + 1,
    };
    expect(boundedMovementTarget(s, p, recovery.movement.movementTarget, undefined)).toEqual(
      target,
    );
    expect(projectLocomotion(s, p, target, null, recovery.movement).reason).toBe('contain');
    delete s.playerMovementIntent;
    s.defensiveChallenge = { actorId: p.id, target, expiresAt: s.time + 1 } as NonNullable<
      typeof s.defensiveChallenge
    >;
    expect(boundedMovementTarget(s, p, recovery.movement.movementTarget, undefined)).toEqual(
      target,
    );
    const restart = awardNaturalRestart(s, 'throw_in', {
      restartTeam: p.team,
      restartPoint: { x: 54, y: 0 },
    });
    expect(locallyObservedRecovery(restart, p)).toBeUndefined();
    s.playerMovementIntent = {
      actorId: p.id,
      type: 'hold_shape',
      target,
      startedAt: s.time,
      expiresAt: s.time + 1,
    };
    s.controlledFootballerId = p.id;
    s.playerAgencyEnabled = true;
    const moved = step(s, 0.025).players.find((q) => q.id === p.id)!;
    expect(moved.target).toEqual(target);
    delete s.defensiveChallenge;
    delete s.playerMovementIntent;
    p.facingAngle = Math.PI / 2;
    const opponent = s.players.find((q) => q.team !== p.team && q.slot.position !== 'goalkeeper')!;
    opponent.position = { x: 54, y: 34.2 };
    const observed = advanceActivePerception(s);
    expect(observed.activePerceptionRuntime?.memory[p.id]?.directIds).toContain(opponent.id);
    expect(locallyObservedRecovery(observed, p)).toBeUndefined();
  });
});

describe('PR205 finite physical contact parity', () => {
  it.each(['team', 'opponent'] as const)(
    '%s has identical foot access and impulse for all three labels',
    (role) => {
      for (const speed of [6, 18, 30]) {
        const { state: s, actor } = fixture(role, speed);
        const results = kinds.map((kind) => {
          const copy = structuredClone(s);
          if (kind) copy.ball.travelKind = kind;
          else delete copy.ball.travelKind;
          const access = resolveContinuousGroundPassClaim(
            copy,
            { x: 49.5, y: 34, z: 0.11 },
            { x: 50.2, y: 34, z: 0.11 },
          );
          const direct = applyCanonicalBallControl(copy, actor.id);
          copy.ball.x = 49.9;
          copy.ball.velocity!.y = 0;
          const canonical = step(copy, 0.025);
          return { access, direct: physical(direct), canonical: physical(canonical) };
        });
        expect(results[1]).toEqual(results[0]);
        expect(results[2]).toEqual(results[0]);
        expect(results[0]!.canonical.contact?.executed).toBe(true);
        if (speed >= 18) {
          expect(results[0]!.canonical.ball.ownerId).toBeUndefined();
          expect(results[0]!.canonical.team).toBe(s.possessionTeam);
        } else if (role === 'opponent') {
          expect(results[0]!.canonical.team).toBe(actor.team);
          expect(results[0]!.canonical.loss?.loserId).not.toBe(actor.id);
        }
      }
    },
  );

  it('keeps an airborne opponent checkpoint on its historical aerial executor', () => {
    const f = fixture('opponent', 1);
    Object.assign(f.state.ball, { height: 1.7, airborne: true, velocity: { x: 0.1, y: 0, z: -1 } });
    const historical = structuredClone(f.state);
    historical.prospectiveMovement = 'two-pass-continuity-dev-v1';
    const next = step(f.state, 0.025),
      old = step(historical, 0.025);
    expect(physical(next)).toEqual(physical(old));
    expect(next.lastAerialContact).toEqual(old.lastAerialContact);
    expect(next.lastAerialResult).toEqual(old.lastAerialResult);
    expect(next.lastAerialContact).toBeDefined();
  });

  it('does not secure fast loose acquisition before its native contact impulse', () => {
    const { state: s, actor } = fixture('opponent', 30);
    const nominated = advanceBallAcquisition(s, actor, 2).state;
    nominated.ballAcquisition!.readyAt = s.time;
    const ready = advanceBallAcquisition(nominated, actor, 2);
    expect(ready.securedPlayerId).toBe(actor.id);
    expect(ready.state.ball.ownerId).toBeUndefined();
    const after = applyCanonicalBallControl(ready.state, actor.id);
    expect(after.lastGroundContact?.executed).toBe(true);
    expect(after.ball.ownerId).toBeUndefined();
  });

  it.each(['team', 'opponent'] as const)('rejects high and distant %s contact', (role) => {
    for (const kind of kinds) {
      const f = fixture(role);
      if (kind) f.state.ball.travelKind = kind;
      else delete f.state.ball.travelKind;
      f.state.ball.height = 1.2;
      expect(applyCanonicalBallControl(f.state, f.actor.id)).toEqual(f.state);
      f.state.ball.height = 0.11;
      f.state.ball.x += 5;
      expect(applyCanonicalBallControl(f.state, f.actor.id)).toEqual(f.state);
    }
  });

  it('preserves goalkeeper handling across revisions without claiming keeper label parity', () => {
    for (const speed of [6, 18, 30])
      for (const kind of kinds) {
        const f = fixture('keeper', speed);
        if (kind) f.state.ball.travelKind = kind;
        else delete f.state.ball.travelKind;
        const old = structuredClone(f.state);
        old.prospectiveMovement = 'two-pass-continuity-dev-v1';
        expect(physical(applyCanonicalBallControl(f.state, f.actor.id))).toEqual(
          physical(applyCanonicalBallControl(old, f.actor.id)),
        );
      }
  });

  it('preserves low-ball spin and momentum when an event label expires before real contact', () => {
    const f = fixture();
    f.state.ball.x = 54;
    f.state.ball.velocity = { x: 0.26, y: 0, z: 0 };
    const loose = structuredClone(f.state);
    delete loose.ball.travelKind;
    const pass = step(f.state, 0.025),
      free = step(loose, 0.025);
    expect(pass.ball.velocity).toEqual(free.ball.velocity);
    expect(pass.ball.spin).toEqual(free.ball.spin);
    expect(pass.ball.height).toBe(free.ball.height);
    expect(pass.ball.ownerId).toBeUndefined();
    expect(pass.lastGroundContact).toBeUndefined();
  });

  it.each(['team', 'opponent'] as const)(
    'audits the native high-body %s contact for pass/cross labels',
    (role) => {
      const results = (['pass', 'cross'] as const).map((kind) => {
        const f = fixture(role, 18);
        f.state.experimentalBodyContacts = { version: 'body-v1', readyAt: {}, locks: [] };
        Object.assign(f.state.ball, {
          x: 49.8,
          height: 1.1,
          airborne: true,
          travelKind: kind,
          velocity: { x: 18, y: 0, z: -1 },
        });
        const next = step(f.state, 0.025);
        const { travelKind: _label, ...ball } = next.ball;
        void _label;
        return {
          contact: next.experimentalBodyContacts?.last,
          ball,
          ground: next.lastGroundContact,
          body: next.lastBallContact,
        };
      });
      expect(results[1]).toEqual(results[0]);
      expect(results[0]!.ground?.executed).not.toBe(true);
      expect(results[0]!.contact).toBeDefined();
    },
  );

  it('preserves schema round trips, deterministic continuation and candidate selection', () => {
    const f = fixture();
    const saved = tacticalMatchStateSchema.parse(
      JSON.parse(JSON.stringify(f.state)),
    ) as unknown as typeof f.state;
    expect(saved.prospectiveMovement).toBe('observed-ball-contact-dev-v1');
    expect(step(saved, 0.025)).toEqual(step(structuredClone(saved), 0.025));
    for (const mode of ['two-pass-v1', 'two-pass-continuity-dev-v1'])
      expect(prospectiveMovementSchema.parse(mode)).toBe(mode);
    const candidate = withIntegrationProfile(f.state, 'realism-candidate-v1', 'state-value-v1');
    expect(candidate.prospectiveMovement).toBeUndefined();
  });
});
