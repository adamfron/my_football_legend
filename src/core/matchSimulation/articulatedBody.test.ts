// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
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
import { stepArticulatedGaitPrototype } from '../../../scripts/pr216GaitPrototype';
import { beginVerticalJump } from './bodyMechanics';
import {
  moveSubstitutionBody,
  projectMatchVisiblePlayers,
  substitutionEntryBodies,
} from './substitutions';

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
  it('limits the exact late-match unreachable command to a physical miss without repairing invalid native feet', () => {
    const run = JSON.parse(
      gunzipSync(
        readFileSync('docs/performance/pr218/full-stance-v2-attempt-5.json.gz'),
      ).toString(),
    );
    let state = tacticalMatchStateSchema.parse(
      run.failureWindow.find((s: TacticalMatchState) => s.time > 4426.46),
    ) as unknown as TacticalMatchState;
    const pending = state.pendingStrike!;
    const p = state.players.find((p) => p.id === pending.actorId)!;
    const actual = canonicalStrikeFoot(
      pending,
      p,
      p,
      pending.plan.foot,
      state.time,
      0.025,
      0.012840235924,
    );
    expect(actual.jointLimited).toBe(true);
    expect(actual.reachable).toBe(true);
    let resolved = false;
    for (let i = 0; i < 40; i++) {
      state = stepTacticalMatch(state, 0.025);
      expect(state.safetyHalt).toBeUndefined();
      expect(state.players.every((p) => projectArticulatedBody(state, p))).toBe(true);
      if (state.lastStrikeResolution?.id === pending.id) {
        expect(state.lastStrikeResolution.outcome).toBe('miss');
        resolved = true;
      }
    }
    expect(resolved).toBe(true);
  });
  it('keeps held, departing and entering bodies articulated through the exact substitution inputs', () => {
    const read = (path: string) => JSON.parse(gunzipSync(readFileSync(path)).toString());
    const full = read('docs/performance/pr218/full-stance-v2-attempt-3.json.gz');
    const entry = read('docs/performance/pr217/solver-authority-and-entry-v1.json.gz').cases.find(
      (c: { name: string }) => c.name === 'full-input-solver-final-v3',
    ).initial;
    for (const initial of [
      full.failureWindow.find((s: TacticalMatchState) => s.time > 2674.02),
      entry,
    ]) {
      let state = withArticulatedBody(
        tacticalMatchStateSchema.parse(initial) as unknown as TacticalMatchState,
      );
      let restored = tacticalMatchStateSchema.parse(
        JSON.parse(JSON.stringify(state)),
      ) as unknown as TacticalMatchState;
      for (let i = 0; i < 80; i++) {
        state = stepTacticalMatch(state, 0.025);
        restored = stepTacticalMatch(restored, 0.025);
        expect(state.safetyHalt).toBeUndefined();
        expect(JSON.parse(JSON.stringify(state))).toEqual(JSON.parse(JSON.stringify(restored)));
        const invalid = [
          ...projectMatchVisiblePlayers(state),
          ...substitutionEntryBodies(state),
        ].filter((p) => !projectArticulatedBody(state, p));
        expect(
          invalid.map((p) => ({
            id: p.id,
            position: p.position,
            stance: p.articulatedStance,
            pose: p.lowerBodyPose,
            facing: p.facingAngle,
          })),
          `time ${state.time} tick ${i}`,
        ).toEqual([]);
      }
      const historical = withIntegrationProfile(state, 'realism-candidate-v1');
      expect(
        historical.substitutionState?.pending.every(
          (r) => !r.outgoing.articulatedStance && !r.entryArticulatedStance,
        ),
      ).toBe(true);
      expect(tacticalMatchStateSchema.safeParse(historical).success).toBe(true);
      const orphan = structuredClone(state);
      delete orphan.experimentalArticulatedBody;
      orphan.players = orphan.players.map((p) => {
        const q = { ...p };
        delete q.articulatedStance;
        return q;
      });
      expect(tacticalMatchStateSchema.safeParse(orphan).success).toBe(false);
    }
  });
  it('releases and finitely replants the support leg during the exact moving-kick recovery from full attempt two', () => {
    const run = JSON.parse(
      gunzipSync(
        readFileSync('docs/performance/pr218/full-stance-v2-attempt-2.json.gz'),
      ).toString(),
    );
    let state = tacticalMatchStateSchema.parse(
      run.failureWindow.find((s: TacticalMatchState) => s.time > 315.89),
    ) as unknown as TacticalMatchState;
    const supports = [];
    for (let i = 0; i < 40; i++) {
      state = stepTacticalMatch(state, 0.025);
      expect(state.safetyHalt).toBeUndefined();
      expect(state.players.every((p) => projectArticulatedBody(state, p))).toBe(true);
      supports.push(
        state.players.find((p) => p.id === 'footballer_pro_1_21')!.articulatedStance!.support,
      );
    }
    const released = supports.indexOf(null);
    expect(released).toBeGreaterThanOrEqual(0);
    expect(supports.slice(released + 1).some((s) => s !== null)).toBe(true);
    expect(state.time).toBeGreaterThan(316.075);
  });
  it('replans the unspent support after the exact full-match lateral impact without spending another root motor step', () => {
    const run = JSON.parse(
      gunzipSync(
        readFileSync('docs/performance/pr218/full-stance-v2-attempt-1.json.gz'),
      ).toString(),
    );
    let a = tacticalMatchStateSchema.parse(
      run.failureWindow.find((s: TacticalMatchState) => s.time > 1783.09),
    ) as unknown as TacticalMatchState;
    let b = tacticalMatchStateSchema.parse(
      JSON.parse(JSON.stringify(a)),
    ) as unknown as TacticalMatchState;
    let sawImpact = false;
    for (let i = 0; i < 40; i++) {
      a = stepTacticalMatch(a, 0.025);
      b = stepTacticalMatch(b, 0.025);
      expect(a.safetyHalt).toBeUndefined();
      expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
      expect(a.players.every((p) => projectArticulatedBody(a, p))).toBe(true);
      for (const c of a.playerBodyContacts ?? [])
        if (
          c.kind === 'impact' &&
          c.participants.includes('footballer_pro_9_12') &&
          c.at > 1783.1
        ) {
          sawImpact = true;
          expect(c.locomotionWorkAfter).toBe(0);
          expect(c.momentumAfter.x).toBeCloseTo(c.momentumBefore.x, 9);
          expect(c.momentumAfter.y).toBeCloseTo(c.momentumBefore.y, 9);
          for (let j = 0; j < 2; j++) {
            expect(c.remainderPositions![j]!.x).toBeCloseTo(
              c.positionsAtContact![j]!.x + c.after[j]!.x * c.actualRemainderSeconds!,
              9,
            );
            expect(c.remainderPositions![j]!.y).toBeCloseTo(
              c.positionsAtContact![j]!.y + c.after[j]!.y * c.actualRemainderSeconds!,
              9,
            );
          }
        }
    }
    expect(a.time).toBeGreaterThan(1783.3);
    expect(sawImpact).toBe(true);
  });
  it('lifts both free boots through the existing jump arc and reacquires support after landing', () => {
    let p = actor();
    p.verticalJump = beginVerticalJump(p, { armAssistance: false, approach: false })!;
    let airTicks = 0;
    for (let i = 0; i < 100; i++) {
      const before = p;
      p = stepArticulatedGaitPrototype(p, { x: 40, y: 60 }, 0).player;
      if (p.verticalJump!.height > 0) {
        airTicks++;
        expect(p.articulatedStance!.support).toBeNull();
        for (const foot of ['left', 'right'] as const)
          expect(p.articulatedStance![foot].z).toBeGreaterThanOrEqual(
            p.verticalJump!.height + 0.04 - 1e-10,
          );
        if (before.verticalJump!.height > 0) expect(p.velocity).toEqual(before.velocity);
      }
    }
    expect(airTicks).toBeGreaterThan(0);
    expect(p.verticalJump!.phase).toBe('ready');
    expect(p.articulatedStance!.support).not.toBeNull();
  });
  it('runs sustained sprint with reachable finite swings and planted supports across heights and grip', () => {
    for (const heightCm of [165, 180, 195])
      for (const surface of ['firm-grass-dev-v1', 'reduced-grip-dev-v1'] as const) {
        let p = initializeArticulatedPlayer(
          { ...actor(), articulatedStance: undefined, profile: { ...actor().profile, heightCm } },
          surface,
        );
        let transfers = 0;
        for (let i = 0; i < 400; i++) {
          const before = p;
          try {
            p = stepArticulatedGaitPrototype(
              p,
              { x: p.position.x, y: p.position.y + 40 },
              9,
            ).player;
          } catch (error) {
            throw new Error(
              JSON.stringify({
                heightCm,
                surface,
                i,
                position: p.position,
                velocity: p.velocity,
                stance: p.articulatedStance,
              }),
              { cause: error },
            );
          }
          const a = before.articulatedStance!,
            b = p.articulatedStance!;
          for (const foot of ['left', 'right'] as const)
            expect(
              Math.hypot(b[foot].x - a[foot].x, b[foot].y - a[foot].y, b[foot].z - a[foot].z),
            ).toBeLessThanOrEqual(24 * 0.025 + 1e-10);
          if (a.support === b.support && b.support) expect(b[b.support]).toEqual(a[b.support]);
          else transfers++;
          expect(Number.isFinite(deriveLowerBodyGeometry(p).pelvis.z)).toBe(true);
        }
        expect(Math.hypot(p.velocity.x, p.velocity.y)).toBeCloseTo(9);
        expect(transfers).toBeGreaterThan(20);
        expect(p.articulatedStance!.stepSeconds).toBeLessThan(0.175);
      }
  });
  it('transfers support on the sixth tick of a 150ms step rather than waiting for a seventh tick', () => {
    let p = actor();
    p.articulatedStance!.stepSeconds = 0.15;
    const support = p.articulatedStance!.support;
    for (let i = 0; i < 6; i++) {
      const q = {
        ...p,
        position: { x: p.position.x, y: p.position.y + 0.01 },
        velocity: { x: 0, y: 0.4 },
      };
      q.articulatedStance = advanceArticulatedStance(p, q, 0.025);
      p = q;
    }
    expect(p.articulatedStance!.support).not.toBe(support);
    expect(p.articulatedStance!.elapsed).toBe(0);
  });
  it('uses each actual ankle height when limiting pelvis reach during recovery', () => {
    const p = actor(),
      h = p.profile.heightCm / 100;
    const feet = {
      left: { x: p.position.x - h * 0.055, y: p.position.y + 0.4, z: 0.035 },
      right: { x: p.position.x + h * 0.055, y: p.position.y + 0.2, z: 0.04 },
    };
    const g = deriveLowerBodyGeometry(p, feet);
    for (const foot of ['left', 'right'] as const) {
      const leg = g[foot];
      expect(leg.foot).toEqual(feet[foot]);
      expect(
        Math.hypot(leg.hip.x - leg.knee.x, leg.hip.y - leg.knee.y, leg.hip.z - leg.knee.z),
      ).toBeCloseTo(leg.thighLength, 11);
      expect(
        Math.hypot(leg.ankle.x - leg.knee.x, leg.ankle.y - leg.knee.y, leg.ankle.z - leg.knee.z),
      ).toBeCloseTo(leg.shinLength, 11);
    }
  });
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
    const held = { ...p, facingAngle: 0.7 };
    expect(moveSubstitutionBody(held, held.position, 0.025).facingAngle).toBeCloseTo(0.7, 12);
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
    const unsupported = { ...p, articulatedStance: { ...p.articulatedStance!, support: null } };
    expect(
      integrateCanonicalMovement(unsupported, {
        target: { x: 60, y: 30 },
        targetSpeed: 9,
        desiredFacingAngle: Math.PI / 2,
        dt: 0.025,
        balance: 1,
        structural: false,
        receivingMomentum: false,
      }).velocity,
    ).toEqual(unsupported.velocity);
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
    const oldEdition = structuredClone(saved);
    oldEdition.experimentalArticulatedBody = 'stance-foot-dev-v1';
    expect(tacticalMatchStateSchema.safeParse(oldEdition).success).toBe(false);
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
