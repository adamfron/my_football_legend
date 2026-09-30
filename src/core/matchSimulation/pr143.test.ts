// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
  applyPlayerDecision,
  projectPlayerAgency,
  PlayerAgencyTracker,
  MATCH_PRESENTATION_POLICIES,
  advanceBackgroundBatch,
  projectMatchMoment,
  countSemanticPlayerChoices,
  type PlayerDecisionOption,
  createContextLeadIn,
  advanceContextLeadIn,
  isDecisionPresentationReady,
  requestedDecisionLeadIn,
  createConsequenceWindow,
  observeConsequenceWindow,
  type TacticalMatchState,
} from '.';
import {
  PresentationContextHistory,
  CONTEXT_MAX_SAMPLES,
} from '../../app/match/tacticalRenderer/contextHistory';
import { sampleReplayFrame } from '../../app/match/tacticalRenderer/replay';
import { tacticalFrameSchema } from '../../app/match/tacticalRenderer/model';

const world = createCanonicalWorldDatabase();
const makeState = (controlled = true) => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr143-agency',
      control: { mode: 'spectator' },
    }),
  );
  if (controlled) {
    const actor = state.players.find(
      (p) => p.team === 'home' && p.profile.primaryPosition !== 'goalkeeper',
    )!;
    state.controlledFootballerId = actor.id;
    actor.position = { x: 85, y: 34 };
    state.ball = { ...actor.position, ownerId: actor.id };
    state.possessionTeam = 'home';
    state.players.find((p) => p.team === 'away')!.position = { x: 85.5, y: 34 };
  }
  return state;
};

describe('PR143 agency belongs to football, viewing belongs to presentation', () => {
  it('preserves decision IDs, kinds, choices, counts and the entire canonical result across all five modes', () => {
    const results = Object.values(MATCH_PRESENTATION_POLICIES).map((policy) => {
      let state = makeState();
      const tracker = new PlayerAgencyTracker();
      const history = new PresentationContextHistory();
      const stream: unknown[] = [];
      // Identical selections alter future football identically. Presentation/batch sizes vary.
      for (let tick = 0; tick < 1200; tick++) {
        const evaluation = projectPlayerAgency(state);
        tracker.observe(state, evaluation);
        const opportunity = evaluation.opportunity;
        if (opportunity) {
          const stopped = advanceBackgroundBatch({
            state,
            maxTicks: 80,
            policy,
            project: (s) => projectMatchMoment(s, opportunity),
            advance: stepTacticalMatch,
            isRunning: () => true,
          });
          expect(stopped.stopReason).toBe('human_decision');
          expect(stopped.state).toBe(state);
          stream.push([
            opportunity.id,
            opportunity.kind,
            opportunity.openedAt,
            opportunity.options.map((o) => o.id),
          ]);
          history.observe(state, true);
          const lead = createContextLeadIn(
            state.time,
            policy.fullMatch ? 0 : requestedDecisionLeadIn(state, opportunity),
            0,
          );
          const snapshot = structuredClone(state);
          advanceContextLeadIn(lead, 10);
          sampleReplayFrame(history.leadIn(state.time, 4), lead.displayTime * 1000);
          expect(state).toEqual(snapshot);
          const option =
            opportunity.options.find(
              (o) =>
                o.kind === 'action' && o.action.type === (stream.length === 1 ? 'carry' : 'pass'),
            ) ?? opportunity.options[0]!;
          state = applyPlayerDecision(state, opportunity, option.id);
        } else {
          state = policy.fullMatch
            ? stepTacticalMatch(state, FIXED_MATCH_DT)
            : stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
        }
        history.observe(state);
      }
      expect(stream.length).toBeGreaterThan(1);
      return { state, stream, counts: tracker.snapshot(state.time) };
    });
    for (const result of results.slice(1)) expect(result).toEqual(results[0]);
  }, 60_000);

  it('delegates a genuinely forced close-down menu, but preserves distinct challenge commitments', () => {
    const state = makeState();
    const actor = state.players.find((p) => p.id === state.controlledFootballerId)!;
    const opponent = state.players.find((p) => p.team !== actor.team)!;
    actor.position = { x: 50, y: 34 };
    opponent.position = { x: 53.5, y: 34 };
    state.ball = { ...opponent.position, ownerId: opponent.id };
    state.possessionTeam = opponent.team;
    const snapshot = structuredClone(state);
    const forced = projectPlayerAgency(state);
    expect(forced.opportunity).toBeUndefined();
    expect(forced.probe).toMatchObject({
      blockedReason: 'single_option_autonomy',
      semanticChoiceCount: 1,
    });
    expect(state).toEqual(snapshot);
    expect(stepTacticalMatch(state).time).toBeGreaterThan(state.time);
    const tracker = new PlayerAgencyTracker();
    tracker.observe(state, forced);
    tracker.observe(state, forced);
    expect(tracker.snapshot(90).singleOptionDelegated).toBe(1);
    opponent.position = { x: 51.5, y: 34 };
    state.ball = { ...opponent.position, ownerId: opponent.id };
    expect(projectPlayerAgency(state).opportunity?.kind).toBe('defensive_response');
  });

  it('keeps different legal teammate targets meaningful even within the same pass family', () => {
    const option = (receiverId: string): PlayerDecisionOption => ({
      id: receiverId,
      kind: 'action',
      labelKey: 'pass',
      action: {
        type: 'pass',
        actorId: 'p',
        receiverId,
        target: { x: 40, y: 30 },
        intent: 'support',
      },
    });
    expect(countSemanticPlayerChoices([option('a'), option('b'), option('a')], 'on_ball')).toBe(2);
  });
});

describe('PR143 historical context and outcome windows', () => {
  it('captures usable hidden football at 10 Hz, catches up before activation, and never rewinds state', () => {
    const history = new PresentationContextHistory();
    let state = makeState(false);
    history.observe(state);
    for (let tick = 0; tick < 200; tick++) {
      state = stepTacticalMatch(state, FIXED_MATCH_DT);
      history.observe(state);
    }
    const snapshot = structuredClone(state);
    history.observe(state, true);
    const frames = history.leadIn(state.time, 3);
    expect(frames.length).toBeGreaterThan(25);
    frames.forEach((frame) => expect(tacticalFrameSchema.safeParse(frame).success).toBe(true));
    const lead = createContextLeadIn(state.time, 3, frames[0]!.timestampMs / 1000);
    expect(lead.availableSeconds).toBeGreaterThanOrEqual(2.9);
    expect(isDecisionPresentationReady(lead)).toBe(false);
    expect(isDecisionPresentationReady(advanceContextLeadIn(lead, 2))).toBe(false);
    expect(isDecisionPresentationReady(advanceContextLeadIn(lead, 4))).toBe(true);
    const frozen = structuredClone(frames);
    for (let at = frames[0]!.timestampMs; at <= state.time * 1000; at += 16)
      sampleReplayFrame(frames, at);
    expect(frames).toEqual(frozen);
    expect(state).toEqual(snapshot);
    expect(history.snapshot().samplesWritten).toBeLessThanOrEqual(52);
  });

  it('keeps a selected pass visible until canonical reception and a readable tail', () => {
    let state = makeState();
    const opportunity = projectPlayerAgency(state).opportunity!;
    const selected = opportunity.options.find(
      (o) => o.kind === 'action' && o.action.type === 'pass',
    )!;
    let window = createConsequenceWindow(state, opportunity.actorId);
    state = applyPlayerDecision(state, opportunity, selected.id);
    expect(observeConsequenceWindow(window, state).endReason).toBeUndefined();
    let ended = false;
    for (let tick = 0; tick < 1100; tick++) {
      // Explicit test autonomy allows the chosen action to resolve before later choices.
      const { controlledFootballerId: _control, ...autonomous } = state;
      void _control;
      state = stepTacticalMatch(autonomous, FIXED_MATCH_DT);
      const result = observeConsequenceWindow(window, state);
      window = result.window;
      if (result.endReason) {
        expect(window.outcomeAt).toBeDefined();
        expect(state.time - window.outcomeAt!).toBeGreaterThanOrEqual(2.5);
        expect(result.endReason).not.toBe('bounded_safety_fallback');
        ended = true;
        break;
      }
    }
    expect(ended).toBe(true);
  }, 30_000);

  it('merges dangerous continuation through a result, then ends on quiet canonical context or a safety bound', () => {
    const state = makeState();
    const window = {
      ...createConsequenceWindow(state, state.controlledFootballerId!),
      outcomeAt: 1,
      outcomeReason: 'shot_resolved',
    };
    const dangerous = { ...state, time: 6 };
    const result = observeConsequenceWindow(window, dangerous);
    expect(result.merged).toBe(true);
    expect(result.endReason).toBeUndefined();
    const quiet: TacticalMatchState = {
      ...state,
      time: 10,
      ball: { x: 40, y: 34 },
      possessionTeam: 'home',
    };
    expect(observeConsequenceWindow(result.window, quiet).endReason).toBe(
      'shot_resolved:tail_complete',
    );
    expect(observeConsequenceWindow(window, { ...dangerous, time: 26 }).endReason).toBe(
      'bounded_safety_fallback',
    );
  });

  it('bounds history through long hidden runs and copies mutable positional fields', () => {
    const history = new PresentationContextHistory();
    const state = makeState(false);
    for (let tick = 0; tick < 4000; tick++) history.observe({ ...state, time: tick * 0.025 });
    const metrics = history.snapshot();
    expect(metrics.samplesRetained).toBeLessThanOrEqual(CONTEXT_MAX_SAMPLES);
    expect(metrics.samplesWritten).toBe(1000);
    const frame = history.sample(99_900)!;
    const original = frame.players[0]!.x;
    state.players[0]!.position.x++;
    expect(frame.players[0]!.x).toBe(original);
    expect(
      history.leadIn(100, 6).at(-1)!.timestampMs - history.leadIn(100, 6)[0]!.timestampMs,
    ).toBeLessThanOrEqual(6000);
  });
});
