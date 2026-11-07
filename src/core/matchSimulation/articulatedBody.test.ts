// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPr214Scene } from '../../../scripts/pr214Scenarios';
import {
  initializeArticulatedPlayer,
  advanceArticulatedStance,
  withArticulatedBody,
} from './articulatedGait';
import { deriveLowerBodyGeometry } from './lowerBodyGeometry';
import { integrateCanonicalMovement } from './canonicalMovement';
import { canonicalStrikeFoot, findStrikeIntervalContact } from './pendingStrike';
import { projectArticulatedBody } from './articulatedBody';
import { stepTacticalMatch } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { withIntegrationProfile } from './integrationProfile';

const fixture = () => createPr214Scene('pair-reference').initial;
const actor = () => {
  const p = fixture().players[0]!;
  return initializeArticulatedPlayer({
    ...p,
    position: { x: 40, y: 30 },
    facingAngle: 0,
    velocity: { x: 0, y: 0 },
  });
};

describe('authoritative development body', () => {
  it('identifies the actual challenge and recovering leg even when the neutral pose names the other foot', () => {
    const state = withArticulatedBody(createPr214Scene('body-pass-third').initial);
    const attempt = state.defensiveChallenge!.physicalAttempt!;
    const player = state.players.find((p) => p.id === state.defensiveChallenge!.actorId)!;
    player.lowerBodyPose = {
      ...player.lowerBodyPose!,
      activeLeg: attempt.plan.foot === 'left' ? 'right' : 'left',
    };
    expect(projectArticulatedBody(state, player)!.activeLeg).toBe(attempt.plan.foot);
    delete state.defensiveChallenge;
    state.recoveringFeet = [
      {
        actorId: player.id,
        foot: attempt.plan.foot,
        beganAt: state.time,
        seconds: 0.1,
        facingAngle: player.facingAngle,
        displacement: { x: 0, y: 0, z: 0 },
      },
    ];
    expect(projectArticulatedBody(state, player)!.activeLeg).toBe(attempt.plan.foot);
  });
  it('rejects a singular horizontal knee plane instead of producing nonfinite joints', () => {
    const p = actor(),
      height = p.profile.heightCm / 100;
    expect(() =>
      deriveLowerBodyGeometry(p, {
        left: {
          x: p.position.x - height * 0.055,
          y: p.position.y + height * 0.491 * 0.999,
          z: 0.04,
        },
      }),
    ).toThrow('Degenerate articulated knee plane');
  });
  it('keeps idle feet still and supplies no extra ground actuator in the air', () => {
    const p = actor(),
      next = advanceArticulatedStance(p, p, 0.025);
    expect(next.left).toEqual(p.articulatedStance!.left);
    expect(next.right).toEqual(p.articulatedStance!.right);
    expect(next.elapsed).toBe(0);
    const airborne = {
      ...p,
      verticalJump: {
        phase: 'airborne' as const,
        elapsed: 1,
        height: 0.3,
        velocity: 1,
        takeoffVelocity: 3,
        preparationSeconds: 0.2,
        recoverySeconds: 0.2,
        takeoffAt: 0.2,
        landingAt: null,
        impulseNewtonSeconds: 200,
        maximumHeight: 0.3,
      },
    };
    const motor = integrateCanonicalMovement(airborne, {
      target: { x: 60, y: 30 },
      targetSpeed: 9,
      desiredFacingAngle: Math.PI / 2,
      dt: 0.025,
      balance: 1,
      structural: false,
      receivingMomentum: false,
    });
    expect(motor.velocity).toEqual(airborne.velocity);
    expect(motor.facingAngle).toBe(airborne.facingAngle);
  });
  it('holds the support boot in world coordinates while root and pelvis move', () => {
    const p = actor(),
      q = { ...p, position: { x: 40, y: 30.05 } };
    q.articulatedStance = advanceArticulatedStance(p, q, 0.025);
    const side = p.articulatedStance!.support!;
    expect(deriveLowerBodyGeometry(q)[side].foot).toEqual(deriveLowerBodyGeometry(p)[side].foot);
    expect(deriveLowerBodyGeometry(q).pelvis.y).toBeCloseTo(30.05);
    const foot = canonicalStrikeFoot(undefined, p, q, side, 0, 0.025, 0.0125);
    expect(foot.position).toEqual(p.articulatedStance![side]);
    expect(foot.velocity).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('uses finite height-scaled bones and rejects impossible ankle reach', () => {
    const p = actor();
    const lengths = [165, 195].map((heightCm) => {
      const q = initializeArticulatedPlayer({
        ...p,
        articulatedStance: undefined,
        profile: { ...p.profile, heightCm },
      });
      const g = deriveLowerBodyGeometry(q);
      for (const leg of [g.left, g.right]) {
        expect(
          Math.hypot(leg.hip.x - leg.knee.x, leg.hip.y - leg.knee.y, leg.hip.z - leg.knee.z),
        ).toBeCloseTo(leg.thighLength, 11);
        expect(
          Math.hypot(leg.ankle.x - leg.knee.x, leg.ankle.y - leg.knee.y, leg.ankle.z - leg.knee.z),
        ).toBeCloseTo(leg.shinLength, 11);
      }
      return g.left.thighLength + g.left.shinLength;
    });
    expect(lengths[1]).toBeGreaterThan(lengths[0]!);
    expect(() => deriveLowerBodyGeometry(p, { left: { x: 50, y: 30 } })).toThrow('Unreachable');
  });

  it('reduces achievable acceleration on reduced grip without deleting an incoming velocity', () => {
    const p = actor();
    const command = {
      target: { x: 40, y: 60 },
      targetSpeed: 9,
      desiredFacingAngle: 0,
      dt: 0.025,
      balance: 1,
      structural: false,
      receivingMomentum: false,
    };
    const firm = integrateCanonicalMovement(p, command);
    const reduced = integrateCanonicalMovement(
      { ...p, articulatedStance: { ...p.articulatedStance!, surface: 'reduced-grip-dev-v1' } },
      command,
    );
    expect(reduced.velocity.y).toBeLessThan(firm.velocity.y);
    expect(reduced.articulatedMotor!.availableForce).toBeCloseTo(p.profile.weightKg * 9.81 * 0.25);
    const impact = { ...p, velocity: { x: 6, y: 0 } };
    expect(integrateCanonicalMovement(impact, command).velocity.x).toBeGreaterThan(5.7);
  });

  it('projects the same prepared contact surface and preserves genuine unreachable failure', () => {
    const state = withArticulatedBody(fixture());
    const p = state.players.find((p) => p.id === state.pendingStrike!.actorId)!;
    const g = projectArticulatedBody(state, p)!;
    const foot = state.pendingStrike!.plan.foot;
    const actual = canonicalStrikeFoot(state.pendingStrike, p, p, foot, state.time, 0.025, 0);
    expect(g.geometry[foot].foot).toEqual(actual.position);
    const invalid = {
      ...p,
      articulatedStance: { ...p.articulatedStance!, left: { x: 100, y: 60, z: 0.04 } },
    };
    const searched = findStrikeIntervalContact(state, 0.025, (t) =>
      canonicalStrikeFoot(undefined, invalid, invalid, 'left', state.time, 0.025, t),
    );
    expect(searched.reason).toBe('unreachable_articulated_foot');
    expect(searched.outcome).toBe('unresolved');
  });

  it('requires explicit edition, clears it for historical profiles and validates finite saves', () => {
    const state = withArticulatedBody(fixture());
    const saved = JSON.parse(JSON.stringify(state));
    expect(tacticalMatchStateSchema.safeParse(saved).success).toBe(true);
    delete saved.experimentalArticulatedBody;
    expect(tacticalMatchStateSchema.safeParse(saved).success).toBe(false);
    const historical = withIntegrationProfile(state, 'realism-candidate-v1');
    expect(historical.experimentalArticulatedBody).toBeUndefined();
    expect(historical.players.every((p) => !p.articulatedStance)).toBe(true);
    state.players[0]!.articulatedStance!.left.x = Infinity;
    expect(tacticalMatchStateSchema.safeParse(state).success).toBe(false);
  });

  it('replays native schema reloads deterministically, including explicit safety halts', () => {
    let a = withArticulatedBody(fixture());
    let b = tacticalMatchStateSchema.parse(
      JSON.parse(JSON.stringify(a)),
    ) as unknown as TacticalMatchState;
    for (let i = 0; i < 16; i++) {
      a = stepTacticalMatch(a, 0.025);
      b = stepTacticalMatch(b, 0.025);
      expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
    }
  });
});
