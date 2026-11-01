// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createPr210Carry,
  createPr210Cases,
  pr210Frame,
  tracePr210Carry,
} from '../../../scripts/pr210Scenarios';
import { stepTacticalMatch } from './matchSimulation';
import { enumerateAvailableActions, resolveMatchAction } from './matchActions';
import { applyPlayerDecision, projectPlayerAgency } from './playerDecision';
import {
  applyContextualInteraction,
  projectContextualInteractions,
} from './contextualInteractions';
import { canOfferOwnedBallActions } from './decisionReadiness';
import { deriveCarryPursuit } from './carryPursuit';
import { hasActiveHumanPossession, reconcileHumanPossession } from './possessionAgency';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { projectMatchMoment } from './matchMoment';

describe('PR210 physical actionability through the canonical 40 Hz executor', () => {
  it('reproduces the zone boundary without an unreachable ordinary menu or cached pass', () => {
    const state = createPr210Carry(),
      actor = state.players.find((p) => p.id === state.controlledFootballerId)!;
    expect(deriveCarryPursuit(state, actor)).toBeDefined();
    const next = stepTacticalMatch(state, 0.025),
      f = pr210Frame(next);
    expect(next.time).toBeCloseTo(20.025);
    expect(f.footDistance).toBeGreaterThan(f.footReach);
    expect(projectPlayerAgency(next).opportunity).toBeUndefined();
    expect(enumerateAvailableActions(next, actor.id)).toEqual([]);
    const ready = tracePr210Carry(createPr210Cases().short).state;
    const stale = projectPlayerAgency(ready).opportunity!;
    const separated = { ...ready, ball: { ...ready.ball, x: ready.ball.x + 3 } };
    expect(applyPlayerDecision(separated, stale, stale.options[0]!.id)).toBe(separated);
  });
  it('continues a sprint to an executed finite touch and a playable decision without reversing', () => {
    const r = tracePr210Carry(createPr210Carry());
    const contact = r.frames.find((f) => f.contact?.executed && f.contact.at === f.time);
    expect(contact?.contact?.surfaceContact?.available).toBe(true);
    expect(contact!.time).toBeGreaterThan(20.025);
    expect(r.frames.at(-1)!.decision?.kind).toBe('on_ball');
    for (const f of r.frames) {
      if (f.decision?.kind === 'on_ball') expect(f.readiness.ready).toBe(true);
      expect(f.actor.velocity.x).toBeGreaterThanOrEqual(0);
    }
    expect(r.frames.at(-1)!.actor.position.x - r.frames[0]!.actor.position.x).toBeGreaterThan(10);
  });
  it('reacquires a loose ball only at an available foot', () => {
    const r = tracePr210Carry(createPr210Cases().recovered);
    const loose = r.frames.findIndex((f) => !f.ball.ownerId);
    const recovered = r.frames.findIndex(
      (f) => f.recovery?.playerId === r.state.controlledFootballerId,
    );
    expect(loose).toBeGreaterThan(0);
    expect(recovered).toBeGreaterThan(loose);
    expect(r.frames[recovered]!.footDistance).toBeLessThanOrEqual(r.frames[recovered]!.footReach);
    expect(r.frames.slice(loose, recovered).every((f) => !f.ball.ownerId)).toBe(true);
    expect(r.frames.at(-1)!.decision?.kind).toBe('on_ball');
  });
  it('keeps a short dribble responsive at the existing motor-readiness boundary', () => {
    const r = tracePr210Carry(createPr210Cases().short),
      last = r.frames.at(-1)!;
    expect(last.decision?.kind).toBe('on_ball');
    expect(r.state.time - 20).toBeLessThan(0.2);
    expect(last.readiness.ready).toBe(true);
    const contact = r.frames.find((f) => f.contact?.executed)!;
    expect(r.state.time).toBeLessThan(contact.readiness.readyAt + 0.025 + 1e-8);
  });
  it.each(['intercepted', 'teammate'] as const)('ends the old carry after %s recovery', (name) => {
    const r = tracePr210Carry(createPr210Cases()[name]);
    expect(
      r.frames.find((f) => f.recovery && f.recovery.playerId !== r.state.controlledFootballerId),
    ).toBeDefined();
    expect(r.state.ballCarrierIntent?.actorId).not.toBe(r.state.controlledFootballerId);
    expect(hasActiveHumanPossession(r.state)).toBe(false);
    expect(r.frames.every((f) => f.decision?.kind !== 'on_ball')).toBe(true);
  });
  it.each(['boundary', 'failed'] as const)(
    'ends %s pursuit at the real boundary/restart',
    (name) => {
      const r = tracePr210Carry(createPr210Cases()[name]);
      expect(r.state.scenario).toBe(name === 'boundary' ? 'throw_in' : 'goal_kick');
      expect(r.state.restart?.restartTeam).toBe('away');
      expect(r.state.ball.ownerId).toBeUndefined();
      expect(r.state.humanPossessionEpisode).toBeUndefined();
      expect(r.state.ballCarrierIntent).toBeUndefined();
      expect(projectPlayerAgency(r.state).opportunity?.kind).not.toBe('on_ball');
      expect(r.state.time).toBeGreaterThan(20);
    },
  );
  it('offers immediate prospective movement under pressure, with world-space targets', () => {
    const state = createPr210Cases().intervention,
      opportunity = projectPlayerAgency(state).opportunity!;
    expect(opportunity.kind).toBe('loose_ball');
    expect(opportunity.triggerReason).toBe('major_pressure');
    expect(opportunity.options.every((o) => o.kind === 'movement')).toBe(true);
    expect(stepTacticalMatch(state, 0.025)).toBe(state);
    const target = { x: 81, y: 11 };
    const choices = projectContextualInteractions(state, opportunity, {
      kind: 'space',
      point: target,
    });
    expect(choices.every((c) => c.resolution.kind === 'movement')).toBe(true);
    const selected = applyContextualInteraction(state, opportunity, choices[0]!);
    expect(selected.playerMovementIntent!.target).toEqual(target);
    expect(selected.ball).toEqual(state.ball);
    expect(selected.ballCarrierIntent).toBeUndefined();
    expect(selected.humanPossessionEpisode).toBeUndefined();
    const direct = applyPlayerDecision(state, opportunity, opportunity.options[0]!.id);
    expect(direct.humanPossessionEpisode).toBeUndefined();
    expect(direct.ballCarrierIntent).toBeUndefined();
    expect(
      projectContextualInteractions(state, opportunity, { kind: 'goal', side: 'away' }),
    ).toEqual([]);
  });
  it('freezes all canonical state while a physically available decision is open', () => {
    const { state } = tracePr210Carry(createPr210Cases().short),
      snapshot = structuredClone(state);
    const opportunity = projectPlayerAgency(state).opportunity!;
    expect(
      canOfferOwnedBallActions(state, state.players.find((p) => p.id === opportunity.actorId)!),
    ).toBe(true);
    for (let i = 0; i < 5; i++) {
      expect(stepTacticalMatch(state, 0.025)).toBe(state);
      expect(projectMatchMoment(state, opportunity).detectedAt).toBe(opportunity.openedAt);
    }
    expect(state).toEqual(snapshot);
  });

  it.each([
    [0.6, 3, 0, 2],
    [2.2, 7, Math.PI / 2, 6],
    [4, 12, Math.PI, 3],
    [7, 20, 0, 0],
  ])(
    'keeps separation %s / ball speed %s / facing %s / body speed %s physically lawful',
    (separation, speed, facing, bodySpeed) => {
      const initial = createPr210Carry(separation, speed);
      const actor = initial.players.find((p) => p.id === initial.controlledFootballerId)!;
      actor.facingAngle = facing;
      actor.velocity = { x: bodySpeed, y: 0 };
      const result = tracePr210Carry(initial);
      for (const frame of result.frames)
        if (frame.decision?.kind === 'on_ball') expect(frame.readiness.ready).toBe(true);
      expect(result.frames.length).toBeGreaterThan(1);
    },
  );
  it('ends the carry immediately on another touch or physical unavailability', () => {
    const initial = createPr210Carry();
    const other = initial.players.find((p) => p.id !== initial.controlledFootballerId)!;
    initial.ball.lastTouchPlayerId = other.id;
    const ended = reconcileHumanPossession(initial);
    expect(ended.ballCarrierIntent).toBeUndefined();
    expect(ended.humanPossessionEpisode).toBeUndefined();
    const dismissed = createPr210Carry();
    dismissed.discipline = {
      ...dismissed.discipline,
      [dismissed.controlledFootballerId!]: { team: 'home', yellowCards: 0, sentOff: true },
    };
    expect(reconcileHumanPossession(dismissed).ballCarrierIntent).toBeUndefined();
  });
  it('preserves valid intents and deterministic continuation through validated save/reload', () => {
    const initial = tacticalMatchStateSchema.parse(
      JSON.parse(JSON.stringify(createPr210Carry())),
    ) as unknown as TacticalMatchState;
    const restored = tacticalMatchStateSchema.parse(
      JSON.parse(JSON.stringify(initial)),
    ) as unknown as TacticalMatchState;
    expect(restored.ballCarrierIntent).toEqual(initial.ballCarrierIntent);
    expect(tracePr210Carry(restored)).toEqual(tracePr210Carry(initial));
    const intervention = createPr210Cases().intervention;
    const ended = applyPlayerDecision(
      intervention,
      projectPlayerAgency(intervention).opportunity!,
      'hold-position',
    );
    const reloaded = tacticalMatchStateSchema.parse(
      JSON.parse(JSON.stringify(ended)),
    ) as unknown as TacticalMatchState;
    expect(reloaded.ballCarrierIntent).toBeUndefined();
    expect(reconcileHumanPossession(reloaded).humanPossessionEpisode).toBeUndefined();
  });
  it('lets a new explicit carry replace the previous pursuit movement after physical recovery', () => {
    const initial = createPr210Cases().intervention;
    const opportunity = projectPlayerAgency(initial).opportunity!;
    const approaching = applyPlayerDecision(initial, opportunity, 'pursue');
    // Contact-ready checkpoint after that approach; no movement/ownership award by the choice.
    const actor = approaching.players.find((p) => p.id === approaching.controlledFootballerId)!;
    const atContact = { ...approaching, ball: { ...approaching.ball, ...actor.position } };
    const target = { x: 83, y: 14 };
    const carried = resolveMatchAction(
      atContact,
      { type: 'carry', actorId: actor.id, target },
      'human_selected',
    );
    expect(carried.playerMovementIntent).toBeUndefined();
    expect(carried.ballCarrierIntent?.target).toEqual(target);
    expect(hasActiveHumanPossession(carried)).toBe(true);
    expect(carried.ball).toEqual(atContact.ball);
  });
});
