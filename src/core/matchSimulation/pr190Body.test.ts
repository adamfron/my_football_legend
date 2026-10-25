import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { restorePathologicalState } from './pathologicalReplay';
import {
  deriveLowerBodyGeometry,
  lowerBodyGeometrySchema,
  neutralLowerBodyPose,
  advanceLowerBodyPose,
  compliantBodySeparation,
  constrainCompliantBodyStep,
} from './lowerBodyGeometry';
import { executeFootContact, playerFootGeometry } from './footContact';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';
import { distance } from './matchSpace';
const fixture = () =>
  restorePathologicalState(
    JSON.parse(gunzipSync(readFileSync('docs/performance/pr189/baseline-20s.json.gz')).toString()),
  );
const length = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
describe('PR190 explicitly staged articulated contact foundation', () => {
  it('keeps hips, knees and ankles connected at bounded postures and actual body proportions', () => {
    const s = fixture(),
      p = s.players[0]!;
    for (const height of [140, 180, 220])
      for (const stanceWidth of [0.2, 0.65])
        for (const crouch of [0, 0.65])
          for (const footLead of [-0.12, 0.35]) {
            p.profile.heightCm = height;
            p.lowerBodyPose = { ...neutralLowerBodyPose(), stanceWidth, crouch, footLead };
            const g = deriveLowerBodyGeometry(p);
            expect(lowerBodyGeometrySchema.safeParse(g).success).toBe(true);
            for (const leg of [g.left, g.right]) {
              expect(length(leg.hip, leg.knee)).toBeCloseTo(leg.thighLength, 10);
              expect(length(leg.knee, leg.ankle)).toBeCloseTo(leg.shinLength, 10);
              expect(leg.kneeFlexion).toBeGreaterThan(0);
            }
            expect(g.capsules[0]!.to).toEqual(g.capsules[2]!.from);
            expect(g.capsules[1]!.to).toEqual(g.capsules[3]!.from);
          }
  });
  it('changes actual foot contact reach with stance, without expanding its contact envelope', () => {
    const s = fixture(),
      p = s.players.find((p) => p.id === s.ball.ownerId)!;
    p.position = { x: 50, y: 30 };
    p.velocity = { x: 0, y: 0 };
    p.facingAngle = 0;
    p.lowerBodyPose = neutralLowerBodyPose();
    s.ball = { x: 48.9, y: 30.2, height: 0.11, velocity: { x: 0, y: 0, z: 0 } };
    const request = {
      intended: 'inside' as const,
      desiredVelocity: { x: 0, y: 3, z: 0 },
      balance: 1,
      preparationSeconds: 0.4,
      contactSeconds: 0.06,
      pressure: 0,
    };
    expect(executeFootContact(s, p, request).available).toBe(false);
    p.lowerBodyPose.stanceWidth = 0.65;
    expect(executeFootContact(s, p, request).available).toBe(true);
    expect(playerFootGeometry(p).footReach).toBe(0.82);
  });
  it('bounds stance and foot changes over a real physical timestep', () => {
    const p = fixture().players[0]!;
    p.lowerBodyPose = { ...neutralLowerBodyPose(), stanceWidth: 0.65 };
    const before = playerFootGeometry(p).leftFoot;
    p.lowerBodyPose = advanceLowerBodyPose(p, 0.025);
    expect(distance(before, playerFootGeometry(p).leftFoot)).toBeLessThanOrEqual(
      (0.35 * 0.025) / 2 + 1e-10,
    );
  });
  it('uses orientation and bounded momentum compliance while preserving a solid core', () => {
    const s = fixture(),
      a = s.players[0]!,
      b = s.players[1]!;
    a.lowerBodyPose = neutralLowerBodyPose();
    b.lowerBodyPose = neutralLowerBodyPose();
    a.profile.weightKg = b.profile.weightKg = 75;
    a.facingAngle = b.facingAngle = 0;
    const broad = compliantBodySeparation(a, b, { x: 1, y: 0 });
    a.facingAngle = b.facingAngle = Math.PI / 2;
    const side = compliantBodySeparation(a, b, { x: 1, y: 0 });
    expect(side).toBeLessThan(broad);
    a.velocity = { x: -30, y: 0 };
    b.velocity = { x: 30, y: 0 };
    const compressed = compliantBodySeparation(a, b, { x: 1, y: 0 });
    expect(side - compressed).toBeLessThanOrEqual(0.04000001);
    expect(compressed).toBeGreaterThanOrEqual(0.68);
    a.position = { x: 50, y: 30 };
    b.position = { x: 51, y: 30 };
    const constrained = constrainCompliantBodyStep(a, { x: 50.3, y: 30 }, b, 0.025);
    expect(distance(constrained, b.position)).toBeGreaterThanOrEqual(
      compliantBodySeparation(a, b, { x: -1, y: 0 }) - 1e-8,
    );
  });
  it('releases the PR189 captured restart through canonical movement with experimental poses', () => {
    let s = restorePathologicalState(
      JSON.parse(
        gunzipSync(
          readFileSync(
            'docs/performance/pr189/sw-contextual-judgment-v1-cutoff-diagnosis-cutoff.json.gz',
          ),
        ).toString(),
      ),
    );
    for (const p of s.players) p.lowerBodyPose = neutralLowerBodyPose();
    const start = s.time,
      award = s.restart!.awardId;
    let released = false,
      maximumStep = 0;
    for (let i = 0; i < 200; i++) {
      const before = s;
      s = step(s, 0.025);
      for (const p of s.players)
        maximumStep = Math.max(
          maximumStep,
          distance(p.position, before.players.find((x) => x.id === p.id)!.position),
        );
      if (
        s.stoppageLedger?.intervals.some((x) => x.awardId === award && x.executedAt !== undefined)
      ) {
        released = true;
        break;
      }
    }
    expect(released).toBe(true);
    expect(s.time - start).toBeLessThan(5);
    expect(maximumStep).toBeLessThan(0.35);
  });
});
