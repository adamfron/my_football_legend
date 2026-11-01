// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  createPr213Scene,
  tracePr213,
  normalizedPr213State,
} from '../../../scripts/pr213Scenarios';
import {
  resolvePlayerBodyImpulse,
  findPlayerBodyContact,
  retainPlayerBodyContacts,
} from './playerBodyContact';
import { integrateCanonicalBodyRemainder, integrateCanonicalMovement } from './canonicalMovement';
import { advancePendingStrikeInterval } from './pendingStrikeInterval';
import {
  executeFootContact,
  playerFootGeometry,
  retainContinuousFootContacts,
  isContinuousFootContact,
} from './footContact';
import { canonicalStrikeFoot } from './pendingStrike';
import { tacticalMatchStateSchema, type MatchPlayerState } from './matchState';
import { withIntegrationProfile } from './integrationProfile';
import { createPr211Scene } from '../../../scripts/pr211Scenarios';
import { stepTacticalMatch } from './matchSimulation';
import { classifyChallengeFoul } from './matchRules';
import { projectPlayerDecisionOpportunity } from './playerDecision';

const pair = () => {
  const s = createPr213Scene({ name: 'pair' }).initial;
  const a = structuredClone(s.players.find((p) => p.id === s.defensiveChallenge!.actorId)!);
  const b = structuredClone(s.players.find((p) => p.id === s.defensiveChallenge!.opponentId)!);
  a.position = { x: 30, y: 30 };
  b.position = { x: 30.68, y: 30 };
  a.velocity = { x: 3, y: 0 };
  b.velocity = { x: -3, y: 0 };
  a.profile.weightKg = b.profile.weightKg = 75;
  return { s, a, b };
};
const impulse = (a: MatchPlayerState, b: MatchPlayerState, e = 0.05) =>
  resolvePlayerBodyImpulse(a, b, 10, false, e);

describe('PR213 supported upright pair', () => {
  it('conserves isolated momentum, dissipates energy and changes both equal masses', () => {
    const { a, b } = pair();
    const r = impulse(a, b);
    const c = r.evidence;
    expect(c.kind).toBe('impact');
    expect(c.normalImpulse).toBeCloseTo(236.25, 10);
    expect(c.after[0].x).toBeCloseTo(-0.15, 10);
    expect(c.after[1].x).toBeCloseTo(0.15, 10);
    expect(c.momentumAfter.x).toBeCloseTo(c.momentumBefore.x, 10);
    expect(c.energyAfter).toBeLessThan(c.energyBefore);
    expect(c.energyAfter - c.energyBefore).toBeCloseTo(-0.5 * (75 / 2) * (1 - 0.05 ** 2) * 36, 8);
  });
  it('uses mass without awarding possession and preserves glancing tangent velocities', () => {
    const { a, b } = pair();
    a.profile.weightKg = 55;
    b.profile.weightKg = 110;
    a.velocity.y = 2;
    b.velocity.y = -1;
    const c = impulse(a, b).evidence;
    expect((c.after[0].x - 3) / (c.after[1].x + 3)).toBeCloseTo(-2, 9);
    expect(c.after[0].y).toBe(2);
    expect(c.after[1].y).toBe(-1);
    expect(c.tangentImpulse).toBe(0);
    expect(c.momentumAfter).toEqual(c.momentumBefore);
  });
  it('suppresses separating/resting restitution and distinguishes continuous support', () => {
    const { a, b } = pair();
    const first = impulse(a, b);
    expect(impulse(first.players[0], first.players[1]).evidence.normalImpulse).toBe(0);
    const support = resolvePlayerBodyImpulse(a, b, 10.025, true).evidence;
    expect(support.kind).toBe('support');
    expect(support.restitution).toBe(0);
    expect(support.energyAfter).toBeLessThanOrEqual(support.energyBefore);
  });
  it('requires clearance to rearm independently of ownership and ball episode', () => {
    const { s, a, b } = pair();
    s.players = [a, b];
    s.continuousPlayerContacts = [{ participants: [a.id, b.id], beganAt: 9 }];
    s.ballEpisode = 999;
    delete s.ball.ownerId;
    expect(retainPlayerBodyContacts(s)).toHaveLength(1);
    b.position.x += 0.011;
    expect(retainPlayerBodyContacts(s)).toHaveLength(0);
    b.position.x -= 0.011;
    expect(findPlayerBodyContact(a, b, 0.025, false)?.at).toBeCloseTo(0, 9);
  });
  it('retains initial overlap/tangent uncertainty and finite restitution sensitivity', () => {
    const { a, b } = pair();
    b.position.x = 30.6;
    expect(findPlayerBodyContact(a, b, 0.025, false)?.unresolved).toBe('initial_body_overlap');
    b.position = { x: 30.1, y: 30.68 };
    b.velocity = { x: -3, y: 0 };
    expect(findPlayerBodyContact(a, b, 0.025, false)?.unresolved).toBe('near_tangent_body');
    b.position = { x: 30.68, y: 30 };
    for (const e of [0, 0.05, 0.15, 0.3]) {
      const c = impulse(a, b, e).evidence;
      expect(c.energyAfter).toBeLessThanOrEqual(c.energyBefore + 1e-9);
      expect(c.momentumAfter.x).toBeCloseTo(c.momentumBefore.x, 9);
    }
  });
  it('replaces both nominal endpoints with independent post-collision canonical transport', () => {
    const { s, a, b } = pair();
    a.position = { x: 30, y: 32 };
    b.position = { x: 30.74, y: 32 };
    s.players = [a, b];
    s.ball = { x: 35, y: 40, height: 0.11, velocity: { x: 0, y: 0, z: 0 } };
    delete s.pendingStrike;
    const moved = {
      ...s,
      time: s.time + 0.025,
      players: s.players.map((p) => ({
        ...p,
        position: integrateCanonicalBodyRemainder(p, 0.025),
      })),
    };
    const out = advancePendingStrikeInterval(s, moved, 0.025, {
      boundary: (q) => q,
      body: (q) => q,
      control: (q) => q,
    });
    const c = out.playerBodyContacts![0]!;
    expect(c.at - s.time).toBeCloseTo(0.01, 9);
    for (let i = 0; i < 2; i++) {
      const p = out.players[i]!;
      expect(p.position.x).toBeCloseTo(
        s.players[i]!.position.x + c.before[i]!.x * 0.01 + c.after[i]!.x * 0.015,
        10,
      );
      expect(p.position.x).not.toBeCloseTo(moved.players[i]!.position.x, 5);
      expect(p.velocity.x).toBeCloseTo(c.after[i]!.x, 10);
    }
    expect(out.ball.ownerId).toBeUndefined();
  });
  it('keeps collision velocity through the next bounded actuator tick and disturbs balance', () => {
    const { a, b } = pair();
    a.plantBalance = { balance: 1, load: 0, support: 'left' };
    const r = impulse(a, b);
    const p = r.players[0];
    expect(p.plantBalance!.balance).toBeLessThan(1);
    const next = integrateCanonicalMovement(p, {
      target: { x: 50, y: 30 },
      targetSpeed: 8,
      desiredFacingAngle: Math.PI / 2,
      dt: 0.025,
      balance: 1,
      structural: false,
      receivingMomentum: false,
    });
    expect(
      Math.hypot(next.velocity.x - p.velocity.x, next.velocity.y - p.velocity.y),
    ).toBeLessThanOrEqual(next.capability.acceleration * 0.025 + 1e-9);
    expect(next.velocity.x).toBeLessThan(1);
  });
  it('stops an unsupported third-body remainder at its witness rather than tunnelling', () => {
    const { s, a, b } = pair();
    a.position = { x: 30, y: 32 };
    a.velocity = { x: 6, y: 0 };
    b.position = { x: 30.74, y: 32 };
    b.velocity = { x: 0, y: 0 };
    const third = structuredClone(
      s.players.find((p) => p.id !== a.id && p.id !== b.id && p.slot.position !== 'goalkeeper')!,
    );
    third.position = { x: 31.44, y: 32 };
    third.velocity = { x: 0, y: 0 };
    s.players = [a, b, third];
    delete s.pendingStrike;
    s.ball = { x: 35, y: 40, height: 0.11, velocity: { x: 0, y: 0, z: 0 } };
    const moved = {
      ...s,
      time: s.time + 0.025,
      players: s.players.map((p) => ({
        ...p,
        position: integrateCanonicalBodyRemainder(p, 0.025),
      })),
    };
    const out = advancePendingStrikeInterval(s, moved, 0.025, {
      boundary: (q) => q,
      body: (q) => q,
      control: (q) => q,
    });
    expect(out.playerBodyContacts![0]!.continuationUnresolvedReason).toBe('third_body_remainder');
    expect(out.playerBodyContacts![0]!.actualRemainderSeconds).toBeLessThan(0.015);
    expect(third.position.x - out.players[1]!.position.x).toBeCloseTo(0.68, 8);
  });
  it('assesses the body event independently after a ball touch without automatic foul classification', () => {
    const s = createPr213Scene({
      name: 'lawful',
      separation: 0.5,
      lateral: 0.5,
      defenderSpeed: -6,
    }).initial;
    const r = tracePr213(s, 5);
    const c = r.frames.flatMap((f) => f.playerContacts).find((c) => c.kind === 'impact')!;
    expect(c.refereeOutcome).toBe('missed');
    expect(r.state.lastChallenge?.physical?.kind).toBe('ball');
    expect(r.state.lastFoul).toBeUndefined();
    const bodyDiagnostic = {
      ...r.state.lastChallenge!,
      outcome: 'foul' as const,
      opponentContact: true,
      ballFirst: false,
      force: 5,
    };
    expect(classifyChallengeFoul(r.state, bodyDiagnostic)?.severity).toBe('reckless');
  });
  it.each(['touchline', 'goal-line', 'goal-post'])(
    'retains the existing whole-ball/law boundary: %s',
    (name) => {
      const f = createPr211Scene(name, 0);
      f.selected.experimentalContactTimeline = 'standing-contact-dev-v1';
      f.selected.experimentalPlayerBodyImpulse = 'upright-pair-dev-v1';
      const out = stepTacticalMatch(f.selected, 0.025);
      expect(out.pendingStrike).toBeUndefined();
      expect(out.lastStrikeResolution?.outcome).not.toBe('contact');
      expect(out.playerBodyContacts).toHaveLength(0);
    },
  );
  it('retains human pending-action authority without opening an immediate replacement menu', () => {
    const s = createPr213Scene({
      name: 'human',
      separation: 0.5,
      lateral: 0.3,
      defenderSpeed: -6,
    }).initial;
    s.playerAgencyEnabled = true;
    const next = stepTacticalMatch(s, 0.025);
    expect(next.time).toBeGreaterThan(s.time);
    expect(next.pendingStrike?.id).toBe(s.pendingStrike?.id);
    const offered = createPr211Scene('ordinary', 0).initial;
    offered.experimentalContactTimeline = 'standing-contact-dev-v1';
    offered.experimentalPlayerBodyImpulse = 'upright-pair-dev-v1';
    offered.playerAgencyEnabled = true;
    expect(projectPlayerDecisionOpportunity(offered)).toBeDefined();
    expect(stepTacticalMatch(offered, 0.025)).toBe(offered);
  });
  it.each([
    ['body-pass-challenge', 0.5, 0.3, -6, ['body', 'pass', 'challenge']],
    ['pass-challenge-body', 0.5, 0.5, -6, ['pass', 'challenge', 'body']],
    ['pass-body-challenge', 0.7, 0.5, -9, ['pass', 'body', 'challenge']],
  ] as const)(
    'resolves three real events in one tick: %s',
    (name, separation, lateral, defenderSpeed, expected) => {
      const r = tracePr213(
        createPr213Scene({ name, separation, lateral, defenderSpeed }).initial,
        5,
      );
      const body = r.frames.flatMap((f) => f.playerContacts).find((c) => c.kind === 'impact')!;
      const strike = r.state.lastStrikeResolution!;
      const challenge = r.state.lastChallenge!;
      expect(strike.outcome).toBe('contact');
      expect(challenge.physical?.kind).toBe('ball');
      const events = [
        { kind: 'body', at: body.at },
        { kind: 'pass', at: strike.at },
        { kind: 'challenge', at: challenge.at },
      ].sort((a, b) => a.at - b.at);
      expect(events.map((e) => e.kind)).toEqual(expected);
      expect(Math.floor((events[0]!.at - 10 + 1e-9) / 0.025)).toBe(
        Math.floor((events[2]!.at - 10 + 1e-9) / 0.025),
      );
      expect(body.energyAfter).toBeLessThanOrEqual(body.energyBefore + 1e-8);
    },
  );
  it('preserves pending and persistent-contact saves, batching and historical profile isolation', () => {
    const s = createPr213Scene({
      name: 'body',
      separation: 0.2,
      lateral: 0.5,
      defenderSpeed: -6,
    }).initial;
    const checkpoint = tracePr213(s, 2).state;
    expect(checkpoint.pendingStrike).toBeDefined();
    expect(checkpoint.continuousPlayerContacts).toHaveLength(1);
    expect(tracePr213(normalizedPr213State(checkpoint), 8).frames).toEqual(
      tracePr213(checkpoint, 8).frames,
    );
    expect(
      tacticalMatchStateSchema.safeParse({ ...s, experimentalContactTimeline: undefined }).success,
    ).toBe(false);
    const reset = withIntegrationProfile(s, 'realism-candidate-v1', 'state-value-v1');
    expect(reset.experimentalPlayerBodyImpulse).toBeUndefined();
    expect(reset.continuousPlayerContacts).toBeUndefined();
  });
  it('blocks another foot impulse while touching but permits another approach after real clearance', () => {
    const { s, a } = pair();
    const f = playerFootGeometry(a).rightFoot;
    s.ball = { x: f.x, y: f.y, height: 0.11, velocity: { x: 0, y: 0, z: 0 } };
    s.continuousFootContacts = [{ actorId: a.id, foot: 'right' }];
    const request = {
      intended: 'inside' as const,
      foot: 'right' as const,
      balance: 1,
      preparationSeconds: 0.2,
      contactSeconds: 0.025,
      pressure: 0,
      desiredVelocity: { x: 3, y: 0, z: 0 },
    };
    expect(executeFootContact(s, a, request).unavailableReason).toBe('continuous_contact');
    s.ball.x += 0.2;
    s.continuousFootContacts = retainContinuousFootContacts(s);
    expect(s.continuousFootContacts).toHaveLength(0);
    s.ball.x -= 0.2;
    expect(executeFootContact(s, a, request).available).toBe(true);
  });
  it('retains the actual prepared surface after its intention ends and through an episode change', () => {
    const s = createPr213Scene({ name: 'finished-foot', separation: 2 }).initial;
    const pending = s.pendingStrike!;
    const a = s.players.find((p) => p.id === pending.actorId)!;
    s.time = pending.selectedAt + 0.09;
    const f = canonicalStrikeFoot(pending, a, a, pending.plan.foot, pending.selectedAt, 0.1, 0.09);
    s.ball = {
      x: f.position.x,
      y: f.position.y,
      height: f.position.z,
      velocity: { x: 0, y: 0, z: 0 },
    };
    s.continuousFootContacts = [
      {
        actorId: a.id,
        foot: pending.plan.foot,
        prepared: {
          path: pending.path,
          selectedAt: pending.selectedAt,
          facingAngle: pending.plan.facingAngle,
        },
      },
    ];
    delete s.pendingStrike;
    s.ballEpisode = 777;
    expect(isContinuousFootContact(s, a, pending.plan.foot)).toBe(true);
    expect(retainContinuousFootContacts(normalizedPr213State(s))).toHaveLength(1);
  });
  it('does not rearm a passive ball-body surface merely because a pass creates a new ball episode', () => {
    const s = tracePr213(
      createPr213Scene({ name: 'passive-episode', separation: 2 }).initial,
      3,
    ).state;
    const third = s.players.find(
      (p) =>
        p.id !== s.pendingStrike!.actorId &&
        p.id !== s.defensiveChallenge!.actorId &&
        p.slot.position !== 'goalkeeper',
    )!;
    third.position = { x: s.ball.x + 0.25, y: s.ball.y };
    third.velocity = { x: 0, y: 0 };
    third.facingAngle = Math.PI / 2;
    s.ball.continuousBodyContacts = [third.id];
    const moved = {
      ...s,
      time: s.time + 0.025,
      players: s.players.map((p) => ({
        ...p,
        position: integrateCanonicalBodyRemainder(p, 0.025),
      })),
    };
    const out = advancePendingStrikeInterval(s, moved, 0.025, {
      boundary: (q) => q,
      body: (q) => q,
      control: (q) => q,
    });
    expect(out.lastStrikeResolution?.outcome).toBe('contact');
    expect(out.ballEpisode).toBeGreaterThan(s.ballEpisode ?? 0);
    expect(out.ball.continuousBodyContacts).toContain(third.id);
    expect(out.lastBallContact?.playerId).not.toBe(third.id);
  });
  it('accounts for real travelled distance rather than the discarded nominal endpoint', () => {
    const initial = createPr213Scene({
      name: 'distance',
      separation: 0.2,
      lateral: 0.5,
      defenderSpeed: -6,
    }).initial;
    const before = tracePr213(initial, 1).state;
    const after = stepTacticalMatch(before, 0.025);
    const c = after.playerBodyContacts!.find((c) => c.kind === 'impact')!;
    for (let i = 0; i < 2; i++) {
      const p = after.players.find((p) => p.id === c.participants[i])!;
      const previous = before.players.find((q) => q.id === c.participants[i])!;
      const expected =
        Math.hypot(c.before[i]!.x, c.before[i]!.y) * (c.at - before.time) +
        Math.hypot(c.after[i]!.x, c.after[i]!.y) * (after.time - c.at);
      expect(
        p.locomotionTelemetry!.distanceTotal - previous.locomotionTelemetry!.distanceTotal,
      ).toBeCloseTo(expected, 9);
      expect(p.position).toEqual(c.remainderPositions![i]);
    }
  });
});
