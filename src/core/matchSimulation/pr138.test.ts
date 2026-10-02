import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  MATCH_PRESENTATION_POLICIES,
  RESTART_SETUP_WATCHDOG_SECONDS,
  advancePresentationClock,
  applyRestartScenario,
  createPresentationClock,
  createTacticalMatch,
  enumerateRestartActions,
  projectMatchMoment,
  projectPlayerDecisionOpportunity,
  resolveDevPlayerDecision,
  shouldSurfaceMatchMoment,
  stepTacticalMatch,
  type PlayerDecisionOpportunity,
} from '.';

const world = createCanonicalWorldDatabase();
const makeState = () =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr138-restart-liveness',
      control: { mode: 'spectator' },
    }),
  );

const controlledThrowIn = () => {
  const state = applyRestartScenario(makeState(), 'throw_in', {
    restartTeam: 'home',
    restartPoint: { x: 45, y: 0 },
  });
  state.controlledFootballerId = state.restart!.takerId;
  expect(enumerateRestartActions(state).length).toBeGreaterThan(1);
  return state;
};

describe('PR138 explicit DEV delegation liveness', () => {
  it('surfaces a controlled throw-in in key_player and permits explicit DEV delegation', () => {
    let state = controlledThrowIn();
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    const candidate = projectMatchMoment(state);
    expect(opportunity.kind).toBe('restart');
    expect(shouldSurfaceMatchMoment(candidate, MATCH_PRESENTATION_POLICIES.key_player)).toBe(true);

    const first = resolveDevPlayerDecision(state, opportunity);
    const second = resolveDevPlayerDecision(controlledThrowIn(), opportunity);
    expect(first.status).toBe('resolved_action');
    expect(first.state.restart?.phase).toBe('release');
    expect(first.state.latestActionSource).toBe('dev_ai_selected');
    expect(first.state.latestAction).toEqual(second.state.latestAction);

    state = first.state;
    const releasedAt = state.time;
    // Verify this throw's first physical contact. Later PR147 fouls can lawfully stop play again.
    for (let tick = 0; tick < 180 && state.scenario !== 'open_play'; tick += 1)
      state = stepTacticalMatch(state, 0.025);
    expect(state.scenario).toBe('open_play');
    expect(state.restart).toBeUndefined();
    expect(state.lastThrowInDiagnostic?.releasedAt).toBe(releasedAt);
    expect(state.lastThrowInDiagnostic?.nextContactAt).toBeGreaterThan(releasedAt);
    expect(state.throwInRestriction).toBeUndefined();
    expect(state.time).toBeGreaterThan(releasedAt);
  });

  it.each([
    'incoming_ball',
    'off_ball_run',
    'defensive_response',
    'goalkeeper_response',
    'loose_ball',
  ] as const)('explicitly delegates DEV %s to canonical autonomy', (kind) => {
    const state = controlledThrowIn();
    const source = projectPlayerDecisionOpportunity(state)!;
    const opportunity: PlayerDecisionOpportunity = { ...source, kind };
    const result = resolveDevPlayerDecision(state, opportunity);
    expect(result.status).toBe('delegated_to_canonical_autonomy');
    expect(result.state.playerDecisionGate?.lastSituationSignature).toBe(opportunity.signature);
    expect(stepTacticalMatch(result.state, 0.025).time).toBeGreaterThan(state.time);
  });

  it('uses the canonical restart watchdog only after a pathological controlled stall', () => {
    let state = controlledThrowIn();
    state.time = state.restart!.startedAt + RESTART_SETUP_WATCHDOG_SECONDS - 0.1;
    state = stepTacticalMatch(state, 0.025);
    expect(state.restart?.phase).toBe('setup');
    expect(state.lastRestartLivenessRecovery).toBeUndefined();
    state.time = state.restart!.startedAt + RESTART_SETUP_WATCHDOG_SECONDS;
    state = stepTacticalMatch(state, 0.025);
    expect(state.restart?.phase).toBe('release');
    expect(state.lastRestartLivenessRecovery?.recovery).toBe('canonical_restart_fallback');
  });
});

describe('PR138 presentation clock', () => {
  it('catches up monotonically without exceeding canonical time and freezes when paused', () => {
    const initial = createPresentationClock(100);
    const first = advancePresentationClock(initial, 120, 0.1);
    const second = advancePresentationClock(first, 120, 0.1);
    expect(first.displayTime).toBeGreaterThan(100);
    expect(second.displayTime).toBeGreaterThan(first.displayTime);
    expect(second.displayTime).toBeLessThanOrEqual(120);
    expect(advancePresentationClock(second, 140, 1, true).displayTime).toBe(second.displayTime);
  });

  it('is presentation-only and does not mutate authoritative input', () => {
    const state = makeState();
    const snapshot = structuredClone(state);
    advancePresentationClock(createPresentationClock(0), state.time + 20, 0.25);
    expect(state).toEqual(snapshot);
  });
});
