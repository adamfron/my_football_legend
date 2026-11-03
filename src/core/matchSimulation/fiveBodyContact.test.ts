// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createPr215LooseScene } from '../../../scripts/pr215Scenarios';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { MULTI_BODY, multiBodyResolutionSchema, resolveMultiBodyContact } from './multiBodyContact';
import { playerBodyClearance } from './playerBodyContact';

const reload = (value: unknown) =>
  tacticalMatchStateSchema.parse(
    JSON.parse(JSON.stringify(value)),
  ) as unknown as TacticalMatchState;
const incident = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr216/five-body-incident-input.json.gz')).toString(),
) as { initial: TacticalMatchState; terminal: TacticalMatchState };
const check = (r: { evidence: ReturnType<typeof resolveMultiBodyContact>['evidence'] }) => {
  const e = r.evidence;
  expect(e.unresolved).toBe(false);
  expect(e.maximumPenetration).toBeLessThanOrEqual(MULTI_BODY.contactTolerance);
  expect(e.residualClosingSpeed).toBeLessThanOrEqual(MULTI_BODY.velocityTolerance);
  expect(e.energyAfter).toBeLessThanOrEqual(e.energyBefore + 1e-7);
  for (const axis of ['x', 'y'] as const)
    expect(e.momentumAfter[axis] - e.momentumBefore[axis]).toBeCloseTo(e.boundaryImpulse[axis], 8);
  for (const j of e.impulses) expect(j.energyAfter).toBeLessThanOrEqual(j.energyBefore + 1e-7);
  expect(multiBodyResolutionSchema.safeParse(e).success).toBe(true);
};
const chain = (masses: number[], angle = 0) => {
  const s = createPr215LooseScene();
  s.players = s.players
    .filter((p) => p.slot.position !== 'goalkeeper')
    .slice(0, masses.length)
    .map((p, i) => ({
      ...p,
      position: { x: 30 + i * 0.68 * Math.cos(angle), y: 32 + i * 0.68 * Math.sin(angle) },
      velocity: { x: (12 - i * 6) * Math.cos(angle), y: (12 - i * 6) * Math.sin(angle) },
      profile: { ...p.profile, weightKg: masses[i]! },
    }));
  return s;
};

describe('PR216 five-body component continuation', () => {
  it('completes the recorded three-body boundary constraint only after its 32-sweep prefix fails', () => {
    const recorded = JSON.parse(
      gunzipSync(
        readFileSync('docs/performance/pr216/release-convergence-input-v1.json.gz'),
      ).toString(),
    ) as { initial: TacticalMatchState; terminal: TacticalMatchState };
    const old = recorded.terminal.multiBodyResolutions!.find((c) => c.unresolved)!;
    expect(old.iterations).toBe(32);
    expect(old.residualClosingSpeed).toBeGreaterThan(MULTI_BODY.velocityTolerance);
    let a = reload(recorded.initial),
      b = reload(recorded.initial),
      completed = false;
    for (let i = 0; i < 400; i++) {
      a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
      b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
      expect(a.executionWitnesses?.unresolved).toBeUndefined();
      for (const evidence of a.multiBodyResolutions ?? [])
        if (evidence.iterations > 32 && evidence.participants.length === 3) {
          completed = true;
          check({ evidence });
          expect(evidence.iterations).toBeLessThanOrEqual(MULTI_BODY.completionIterations);
          expect(evidence.positionCorrection).toBe(0);
          expect(evidence.impulses.slice(0, old.impulses.length)).toEqual(old.impulses);
        }
      if (i % 40 === 0) {
        expect(reload(a)).toEqual(reload(b));
        b = reload(b);
      }
    }
    expect(completed).toBe(true);
    expect(a.decisionIndex).toBeGreaterThan(recorded.initial.decisionIndex);
  });
  it('resolves the exact recorded five-body overflow with passive support and conserved momentum', () => {
    const old = incident.terminal.multiBodyResolutions!.find((c) => c.unresolved)!;
    const r = resolveMultiBodyContact(reload(incident.terminal), old.participants, old.at);
    expect(r.players).toHaveLength(5);
    check(r);
    expect(r.evidence.iterations).toBeLessThanOrEqual(64);
    expect(r.evidence.positionCorrection).toBe(0);
    expect(r.contacts.length).toBeGreaterThan(0);
    const reversed = resolveMultiBodyContact(
      { ...reload(incident.terminal), players: [...incident.terminal.players].reverse() },
      [...old.participants].reverse(),
      old.at,
    );
    expect(reversed).toEqual(r);
  });
  it('passes the old failure in the canonical motor interval, then continues decisions and schema reloads', () => {
    let a = reload(incident.initial),
      b = reload(incident.initial),
      five = false;
    const decisions = a.decisionIndex;
    for (let i = 0; i < 400; i++) {
      a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
      b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
      expect(a.executionWitnesses?.unresolved).toBeUndefined();
      for (const c of a.multiBodyResolutions ?? [])
        if (c.participants.length === 5) {
          five = true;
          expect(c.unresolved).toBe(false);
        }
      if (i % 40 === 0) {
        expect(reload(a)).toEqual(reload(b));
        b = reload(b);
      }
    }
    expect(five).toBe(true);
    expect(a.decisionIndex).toBeGreaterThan(decisions);
  });
  for (const [name, masses, angle] of [
    ['alternating-heavy', [110, 55, 110, 55, 110], 0],
    ['alternating-light', [55, 110, 55, 110, 55], 0],
    ['oblique', [110, 55, 110, 55, 110], 0.73],
  ] as const)
    it(`converges five opposing bodies with ${name} masses`, () => {
      const s = chain([...masses], angle),
        r = resolveMultiBodyContact(
          s,
          s.players.map((p) => p.id),
          s.time,
        );
      check(r);
      expect(r.players).toHaveLength(5);
      if (name === 'alternating-heavy') {
        expect(r.evidence.iterations).toBeGreaterThan(32);
        expect(r.contacts.length).toBeGreaterThan(192);
      }
      expect(r.evidence.iterations).toBeLessThanOrEqual(MULTI_BODY.fiveBodyIterations);
      expect(r.contacts.length).toBeLessThanOrEqual(640);
      for (const p of r.players)
        expect(p.position).toEqual(s.players.find((q) => q.id === p.id)!.position);
    });
  it('solves a five-body cross without returning restitution to persistent pairs', () => {
    const s = chain([80, 55, 110, 65, 100]);
    const poses = [
      [0, 0, 0, 0],
      [-0.68, 0, 8, 0],
      [0.68, 0, -8, 0],
      [0, -0.68, 0, 8],
      [0, 0.68, 0, -8],
    ];
    s.players = s.players.map((p, i) => ({
      ...p,
      position: { x: 30 + poses[i]![0]!, y: 32 + poses[i]![1]! },
      velocity: { x: poses[i]![2]!, y: poses[i]![3]! },
    }));
    s.continuousPlayerContacts = s.players
      .slice(1)
      .map((p) => ({ participants: [s.players[0]!.id, p.id], beganAt: s.time - 0.1 }));
    const r = resolveMultiBodyContact(
      s,
      s.players.map((p) => p.id),
      s.time,
    );
    check(r);
    expect(r.contacts.every((c) => c.kind === 'support' && c.restitution === 0)).toBe(true);
    for (let i = 0; i < r.players.length; i++)
      for (let j = i + 1; j < r.players.length; j++)
        expect(playerBodyClearance(r.players[i]!, r.players[j]!)).toBeGreaterThanOrEqual(-1e-8);
  });
  it('keeps six connected bodies as explicit overflow without changing their velocities or ownership', () => {
    const s = chain([80, 80, 80, 80, 80, 80]);
    s.players = s.players.map((p) => ({ ...p, velocity: { x: 0, y: 0 } }));
    const r = resolveMultiBodyContact(s, [s.players[0]!.id], s.time);
    expect(r.players).toHaveLength(6);
    expect(r.evidence.reason).toBe('body_count_bound');
    expect(r.evidence.unresolved).toBe(true);
    expect(r.contacts).toHaveLength(0);
    expect(r.evidence.iterations).toBe(0);
    expect(r.players).toEqual([...s.players].sort((a, b) => (a.id < b.id ? -1 : 1)));
    expect(s.ball.ownerId).toBeUndefined();
  });
});
