// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createPr212Scene, tracePr212 } from '../../../scripts/pr212Scenarios';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { compareSharedContactEvents } from './sharedContactTimeline';
import { withIntegrationProfile } from './integrationProfile';
import { FOOT_CONTACT_PHYSICS } from './footContact';
import { stepTacticalMatch } from './matchSimulation';
import { createPr211Scene } from '../../../scripts/pr211Scenarios';
import { beginDefensiveChallenge } from './defensiveChallenges';
import { ballBodyClearance, supportContinuousBodyContacts } from './ballContactResolution';

describe('PR212 canonical standing contact chronology', () => {
  it('changes the first real event when only defender swing onset changes by 20ms', () => {
    const early = tracePr212(
      createPr212Scene({ name: 'early', timing: -0.02, ballSpeed: 1 }).initial,
      5,
    ).state;
    const late = tracePr212(
      createPr212Scene({ name: 'late', timing: 0, ballSpeed: 1 }).initial,
      5,
    ).state;
    expect(early.lastStrikeResolution?.reason).toBe('active_challenge');
    expect(late.lastStrikeResolution?.outcome).toBe('contact');
    expect(early.lastChallenge?.physical?.kind).toBe('ball');
    expect(early.ball.ownerId).toBeUndefined();
    expect(late.lastChallenge?.at).toBeGreaterThan(late.lastStrikeResolution!.at);
  });
  it('permits two distinct real impulses less than 25ms apart without granting two owners', () => {
    const s = tracePr212(createPr212Scene({ name: 'rapid' }).initial, 4).state;
    const a = s.lastStrikeResolution!,
      b = s.lastChallenge!;
    expect(a.outcome).toBe('contact');
    expect(b.physical?.kind).toBe('ball');
    expect(b.at - a.at).toBeGreaterThan(0);
    expect(b.at - a.at).toBeLessThan(0.025);
    expect(s.ball.ownerId).toBeUndefined();
    expect(s.lastPassDiagnostic?.finalResult).toBe('intercepted');
    expect(s.lastResolvedPass?.resolvedAt).toBe(b.at);
    const c = b.physical!.contact!;
    for (const axis of ['x', 'y', 'z'] as const)
      expect(c.outgoingVelocity[axis] - c.incomingVelocity[axis]).toBeCloseTo(
        c.impulse[axis] / FOOT_CONTACT_PHYSICS.mass,
        10,
      );
  });
  it('allows a standing attempt to miss both without a fictitious foul or impulse', () => {
    const s = tracePr212(createPr212Scene({ name: 'miss', separation: 0.34 }).initial, 5).state;
    expect(s.lastChallenge?.physical?.kind).toBe('miss');
    expect(s.lastChallenge?.outcome).toBe('missed');
    expect(s.lastChallenge?.opponentContact).toBe(false);
    expect(s.lastChallenge?.physical?.contact).toBeUndefined();
  });
  it('preserves prepared challenge and strike through schema reload and canonical batching', () => {
    const initial = createPr212Scene({ name: 'save', timing: -0.01 }).initial;
    const checkpoint = tracePr212(initial, 2).state;
    const restored = tacticalMatchStateSchema.parse(
      JSON.parse(JSON.stringify(checkpoint)),
    ) as unknown as TacticalMatchState;
    expect(tracePr212(restored, 8).frames).toEqual(tracePr212(checkpoint, 8).frames);
    expect(stepTacticalMatch(initial, 0.1)).toEqual(tracePr212(initial, 4).state);
    const alone = createPr212Scene({ name: 'alone', pass: false }).initial;
    expect(stepTacticalMatch(alone, 0.1)).toEqual(tracePr212(alone, 4).state);
  });
  it('retains bounded search uncertainty instead of awarding either intended action', () => {
    const s = tracePr212(
      createPr212Scene({ name: 'uncertain', ballSpeed: 1, timing: -0.01 }).initial,
      5,
    ).state;
    expect(s.lastChallenge?.physical?.kind).toBe('unresolved');
    expect(s.lastStrikeResolution?.outcome).toBe('unresolved');
    expect(s.lastChallenge?.physical?.contact).toBeUndefined();
  });
  it('lets an earlier body witness end the pass without inventing a ball contact or downed body', () => {
    const s = tracePr212(
      createPr212Scene({ name: 'body', separation: 0.2, lateral: 0.5, defenderSpeed: -6 }).initial,
      4,
    ).state;
    expect(s.lastChallenge?.physical?.kind).toBe('body');
    expect(s.lastStrikeResolution?.reason).toBe('active_body_contact');
    expect(s.lastChallenge?.ballFirst).toBe(false);
    expect(s.lastChallenge?.physical?.contact).toBeUndefined();
  });
  it('keeps a whole-ball exit authoritative in the shared edition', () => {
    const f = createPr211Scene('touchline', 0);
    f.selected.experimentalContactTimeline = 'standing-contact-dev-v1';
    const s = stepTacticalMatch(f.selected, 0.025);
    expect(s.lastStrikeResolution?.reason).toBe('boundary');
    expect(s.restart).toBeDefined();
    expect(s.lastPassDiagnostic).toBeUndefined();
  });
  it('does not install a foot attempt against protected keeper-held control', () => {
    const f = createPr212Scene({ name: 'keeper' }).initial;
    delete f.defensiveChallenge;
    const actor = f.players.find((p) => p.id !== f.ball.ownerId && p.team !== f.possessionTeam)!;
    f.ball.heldByKeeperId = f.ball.ownerId!;
    expect(
      beginDefensiveChallenge(
        f,
        {
          type: 'challenge',
          actorId: actor.id,
          opponentId: f.ball.ownerId!,
          technique: 'standing',
        },
        'autonomous_npc',
      ),
    ).toBe(f);
  });
  it('retains incompatible clinch constraints with no second restituting impulse', () => {
    const bodies = [-0.25, 0.25].map((x, i) => ({
      kind: 'defender' as const,
      playerId: String(i),
      centre: { x, y: 0, z: 0.9 },
      radius: 0.72,
    }));
    const r = supportContinuousBodyContacts(
      { x: 0, y: 0, z: 0.11 },
      { x: 0, y: 0, z: 0 },
      bodies,
      0.025,
    );
    expect(r.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(bodies.some((b) => ballBodyClearance(r.position, b) < 0)).toBe(true);
    expect(Math.hypot(r.position.x, r.position.y)).toBeLessThan(0.01);
  });
  it('keeps deterministic legal/tie identity without changing unequal physical times', () => {
    const a = { at: 0.01, rank: 3, key: 'a', kind: 'strike' as const };
    const b = { at: 0.01, rank: 2, key: 'b', kind: 'challenge' as const };
    expect([a, b].sort(compareSharedContactEvents)).toEqual([b, a]);
    expect([a, { ...b, at: 0.011 }].sort(compareSharedContactEvents)[0]).toBe(a);
    expect(
      [
        { ...b, key: 'z' },
        { ...b, key: 'a' },
      ].sort(compareSharedContactEvents)[0]!.key,
    ).toBe('a');
  });
  it('rejects incompatible saved editions and clears shared state on historical profile application', () => {
    const s = createPr212Scene({ name: 'profile' }).initial;
    expect(
      tacticalMatchStateSchema.safeParse({ ...s, experimentalPendingStrike: undefined }).success,
    ).toBe(false);
    const reset = withIntegrationProfile(s, 'realism-candidate-v1', 'state-value-v1');
    expect(reset.experimentalContactTimeline).toBeUndefined();
    expect(reset.defensiveChallenge).toBeUndefined();
  });
});
