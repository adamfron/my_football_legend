// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPr214Scene, tracePr214 } from '../../../scripts/pr214Scenarios';
import { normalizedPr213State, createPr213Scene } from '../../../scripts/pr213Scenarios';
import { advancePendingStrikeInterval } from './pendingStrikeInterval';
import { integrateCanonicalBodyRemainder } from './canonicalMovement';
import { resolveMultiBodyContact } from './multiBodyContact';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { withIntegrationProfile } from './integrationProfile';
import { stepTacticalMatch } from './matchSimulation';
import { beginVerticalJump } from './bodyMechanics';

const drift = (input: TacticalMatchState) => {
  const s = {
    ...input,
    defensiveChallenge:
      input.defensiveChallenge ??
      createPr213Scene({ name: 'drift-apparatus' }).initial.defensiveChallenge!,
  };
  return advancePendingStrikeInterval(
    s,
    {
      ...s,
      time: s.time + 0.025,
      players: s.players.map((p) => ({
        ...p,
        position: integrateCanonicalBodyRemainder(p, 0.025),
      })),
    },
    0.025,
    { boundary: (q) => q, body: (q) => q, control: (q) => q },
  );
};
const physical = (s: TacticalMatchState) =>
  s.players
    .map((p) => ({ id: p.id, position: p.position, velocity: p.velocity }))
    .sort((a, b) => a.id.localeCompare(b.id));

describe('PR214 bounded canonical multi-body remainder', () => {
  it('stops future cluster travel when the existing referee interrupts before the next collision', () => {
    const f = createPr214Scene('line-three');
    const s = f.initial;
    s.defensiveChallenge = createPr213Scene({
      name: 'referee-control',
    }).initial.defensiveChallenge!;
    const out = stepTacticalMatch(s, 0.025);
    expect(out.lastRestartAward?.cause).toBe('foul');
    const impact = out.playerBodyContacts!.find((c) => c.kind === 'impact')!;
    expect(out.lastRestartAward!.eventAt).toBe(impact.at);
    for (let i = 0; i < 2; i++)
      expect(out.players.find((p) => p.id === impact.participants[i])!.position).toEqual(
        impact.positionsAtContact![i],
      );
  });
  it('retains a non-upright incoming keeper as uncertainty rather than drifting through it', () => {
    const s = createPr214Scene('line-three').initial;
    const third = s.players.find((p) => Math.abs(p.position.x - 31.44) < 1e-8)!;
    third.goalkeeperRole = true;
    third.verticalJump = beginVerticalJump(third, { armAssistance: false, approach: false })!;
    const out = drift(s);
    expect(out.multiBodyResolutions!.some((c) => c.reason === 'unsupported_body_state')).toBe(true);
  });
  it('resolves an upright keeper in the same passive component with conserved momentum', () => {
    const s = createPr214Scene('line-three').initial;
    const third = s.players.find((p) => Math.abs(p.position.x - 31.44) < 1e-8)!;
    third.goalkeeperRole = true;
    const out = drift(s);
    expect(out.executionWitnesses?.unresolved).toBeUndefined();
    const c = out.multiBodyResolutions!.find(c=>c.participants.includes(third.id))!;
    expect(c.unresolved).toBe(false);
    expect(c.energyAfter).toBeLessThanOrEqual(c.energyBefore + 1e-7);
    for(const axis of ['x','y'] as const)
      expect(c.momentumAfter[axis]-c.momentumBefore[axis]).toBeCloseTo(c.boundaryImpulse[axis],8);
  });
  it('keeps a keeper on the legal goal plane without widening the outfield movement area', () => {
    const s = createPr214Scene('line-three').initial;
    const [keeper, runner] = s.players.slice(0, 2);
    s.players = [
      { ...keeper!, goalkeeperRole: true, position: {x:0,y:32}, velocity:{x:-1,y:0} },
      { ...runner!, goalkeeperRole: false, position: {x:0.68,y:32}, velocity:{x:-2,y:0} },
    ];
    delete s.pendingStrike;
    delete s.defensiveChallenge;
    const r = resolveMultiBodyContact(s, [keeper!.id], s.time);
    expect(r.evidence.unresolved).toBe(false);
    expect(r.players.find(p=>p.id===keeper!.id)!.position.x).toBe(0);
    expect(r.evidence.positionCorrection).toBe(0);
    expect(r.evidence.boundaryImpulse.x).toBeGreaterThan(0);
    expect(r.evidence.momentumAfter.x-r.evidence.momentumBefore.x).toBeCloseTo(r.evidence.boundaryImpulse.x,8);
    expect(r.evidence.energyAfter).toBeLessThanOrEqual(r.evidence.energyBefore + 1e-7);
    s.players[0]!.goalkeeperRole = false;
    expect(resolveMultiBodyContact(s,[keeper!.id],s.time).evidence.reason).toBe('initial_player_outside_movement_area');
  });
  it('rejects overlarge/duplicate saved rosters and never teleports an initially outside player', () => {
    const s = createPr214Scene('line-three').initial;
    expect(
      tacticalMatchStateSchema.safeParse({ ...s, players: [...s.players, s.players[0]] }).success,
    ).toBe(false);
    const actor = s.players.find((p) => p.id === s.pendingStrike!.actorId)!;
    actor.position = { x: -1, y: 32 };
    actor.velocity = { x: -1, y: 0 };
    const out = drift(s);
    expect(
      out.multiBodyResolutions!.some((c) => c.reason === 'initial_player_outside_movement_area'),
    ).toBe(true);
    expect(out.players.find((p) => p.id === actor.id)!.position).toEqual(actor.position);
  });
  it('rearms a pair within the same interval after real clearance and a distinct third-body reversal', () => {
    const f = createPr214Scene('line-three'),
      s = f.initial;
    const a = s.players.find((p) => p.id === f.pairIds[0])!;
    const b = s.players.find((p) => p.id === f.pairIds[1])!;
    const c = s.players.find((p) => Math.abs(p.position.x - 31.44) < 1e-8)!;
    b.position = { x: 30, y: 32 };
    b.velocity = { x: 0, y: 0 };
    a.position = { x: 30.68, y: 32 };
    a.velocity = { x: 6, y: 0 };
    a.profile.weightKg = 55;
    c.position = { x: 31.384, y: 32 };
    c.velocity = { x: -6, y: 0 };
    c.profile.weightKg = 110;
    s.continuousPlayerContacts = [{ participants: [a.id, b.id], beganAt: 9 }];
    const out = drift(s);
    const recontact = out
      .multiBodyResolutions!.flatMap((c) => c.impulses)
      .find((j) => j.participants.every((id) => [a.id, b.id].includes(id)));
    expect(recontact?.kind).toBe('impact');
    expect(recontact?.restitution).toBe(0.05);
    expect(recontact!.at - s.time).toBeLessThan(0.025);
  });
  it('retains the exact isolated PR213 pair impulse and endpoints', () => {
    const s = createPr214Scene('pair-reference').initial;
    const old = drift({ ...s, experimentalPlayerBodyImpulse: 'upright-pair-dev-v1' });
    const next = drift(s);
    expect(physical(next)).toEqual(physical(old));
    expect(next.playerBodyContacts![0]!.normalImpulse).toBe(
      old.playerBodyContacts![0]!.normalImpulse,
    );
  });
  it('continues two sequential impacts in one 25ms step without undoing the first', () => {
    const s = createPr214Scene('line-three').initial,
      out = drift(s);
    const impacts = out.playerBodyContacts!.filter((c) => c.kind === 'impact');
    expect(impacts).toHaveLength(2);
    expect(impacts[1]!.at).toBeGreaterThan(impacts[0]!.at);
    expect(impacts[1]!.at - s.time).toBeLessThan(0.025);
    const reference = drift(createPr214Scene('pair-reference').initial);
    expect(impacts[0]!.after).toEqual(reference.playerBodyContacts![0]!.after);
    expect(out.multiBodyResolutions!.every((c) => !c.unresolved)).toBe(true);
    expect(out.ball.ownerId).toBeUndefined();
  });
  it.each(['simultaneous-three', 'line-four'] as const)(
    'dissipates passive energy and conserves cluster momentum: %s',
    (name) => {
      const out = drift(createPr214Scene(name).initial);
      expect(out.multiBodyResolutions!.some((c) => c.participants.length >= 3)).toBe(true);
      for (const c of out.multiBodyResolutions!) {
        expect(c.unresolved).toBe(false);
        expect(c.energyAfter).toBeLessThanOrEqual(c.energyBefore + 1e-7);
        expect(c.residualClosingSpeed).toBeLessThanOrEqual(1e-4);
        for (const axis of ['x', 'y'] as const)
          expect(c.momentumAfter[axis] - c.momentumBefore[axis]).toBeCloseTo(
            c.boundaryImpulse[axis],
            8,
          );
        for (const j of c.impulses)
          expect(j.energyAfter).toBeLessThanOrEqual(j.energyBefore + 1e-7);
      }
    },
  );
  it('uses deterministic pair/tie order independent of incidental player array order', () => {
    const s = createPr214Scene('line-four').initial;
    const a = drift(s),
      b = drift({ ...s, players: [...s.players].reverse() });
    expect(physical(a)).toEqual(physical(b));
    expect(a.multiBodyResolutions).toEqual(b.multiBodyResolutions);
  });
  it('does not give a continuous contact another restitution impact when struck by a third body', () => {
    const s = createPr214Scene('line-four').initial;
    const pair = [
      s.pendingStrike!.actorId,
      s.players.find((p) => Math.abs(p.position.x - 31.36) < 1e-8)!.id,
    ] as [string, string];
    s.continuousPlayerContacts = [{ participants: pair, beganAt: 9 }];
    const out = drift(s);
    const supports = out
      .multiBodyResolutions!.flatMap((c) => c.impulses)
      .filter((c) => c.participants.every((id) => pair.includes(id)));
    expect(supports.length).toBeGreaterThan(0);
    expect(supports.every((c) => c.kind === 'support' && c.restitution === 0)).toBe(true);
  });
  it('preserves explicit overflow/deep-overlap/tangent states instead of forcing a winner', () => {
    for (const [scene, reason] of [
      ['deep-overlap', 'initial_body_overlap'],
      ['near-tangent', 'near_tangent_body'],
    ] as const) {
      const out = drift(createPr214Scene(scene).initial);
      expect(out.multiBodyResolutions!.some((c) => c.reason === reason && c.unresolved)).toBe(true);
      expect(out.ball.ownerId).toBeUndefined();
    }
  });
  it('corrects a shallow overlap finitely without claiming a new impact or creating movement energy', () => {
    const f = createPr214Scene('shallow-overlap'),
      s = f.initial;
    const r = resolveMultiBodyContact(s, f.pairIds, s.time);
    expect(r.evidence.positionCorrection).toBeGreaterThan(0);
    expect(r.evidence.positionCorrection).toBeLessThanOrEqual(0.002);
    expect(r.contacts.every((c) => c.kind === 'support')).toBe(true);
    expect(r.evidence.energyAfter).toBeLessThanOrEqual(r.evidence.energyBefore);
  });
  it('constrains the player edge with external momentum and no ball wall', () => {
    const s = createPr214Scene('player-edge').initial,
      out = drift(s);
    expect(out.multiBodyResolutions!.some((c) => c.boundaryImpulse.y > 0)).toBe(true);
    for (const p of out.players)
      if (p.position.x === 30) expect(p.position.y).toBeGreaterThanOrEqual(0.4 - 1e-8);
    expect(out.ball).toEqual(drift(createPr214Scene('pair-reference').initial).ball);
  });
  it('replays schema-valid unfinished canonical multi-body continuations', () => {
    const initial = createPr214Scene('body-pass-third').initial;
    const checkpoint = tracePr214(initial, 2).state;
    const a = tracePr214(checkpoint, 8),
      b = tracePr214(normalizedPr213State(checkpoint), 8);
    expect(a.frames).toEqual(b.frames);
    expect(normalizedPr213State(a.state)).toEqual(normalizedPr213State(b.state));
  });
  it('validates the edition dependencies and preserves historical profile isolation', () => {
    const s = createPr214Scene('line-three').initial;
    expect(tacticalMatchStateSchema.safeParse(s).success).toBe(true);
    expect(
      tacticalMatchStateSchema.safeParse({ ...s, experimentalContactTimeline: undefined }).success,
    ).toBe(false);
    const out = withIntegrationProfile(drift(s), 'realism-candidate-v1');
    expect(out.experimentalPlayerBodyImpulse).toBeUndefined();
    expect(out.multiBodyResolutions).toBeUndefined();
    expect(tacticalMatchStateSchema.safeParse(out).success).toBe(true);
  });
});
