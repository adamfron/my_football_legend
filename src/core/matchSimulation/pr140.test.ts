import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  applyPlayerDecision,
  createTacticalMatch,
  FIXED_MATCH_DT,
  isInteractiveOutcomeWindowOpen,
  projectPlayerDecisionOpportunity,
  stepTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
  type TacticalMatchState,
} from '.';

const makeState = () => {
  const world = createCanonicalWorldDatabase();
  return createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr140-fast-path',
      control: { mode: 'spectator' },
    }),
  );
};

describe('PR140 canonical fast path', () => {
  it('reuses a tactical plan between cadence boundaries and invalidates on possession semantics', () => {
    let state = stepTacticalMatch(makeState(), FIXED_MATCH_DT);
    const plannedAt = state.planningSchedule!.lastTacticalPlanAt;
    state = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(state.planningSchedule!.lastTacticalPlanAt).toBe(plannedAt);
    const changed = {
      ...state,
      possessionTeam: state.possessionTeam === 'home' ? ('away' as const) : ('home' as const),
    };
    expect(stepTacticalMatch(changed, FIXED_MATCH_DT).planningSchedule!.lastTacticalPlanAt).toBe(
      changed.time + FIXED_MATCH_DT,
    );
  });

  it('fast entry is canonical after the exact agency probe found no decision', () => {
    const state = makeState();
    expect(projectPlayerDecisionOpportunity(state)).toBeUndefined();
    expect(stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT)).toEqual(
      stepTacticalMatch(state, FIXED_MATCH_DT),
    );
  });

  it('keeps a human outcome window open while canonical action resolution is pending', () => {
    const controlled = makeState().players.find((player) => player.profile.primaryPosition !== 'goalkeeper')!;
    let state: TacticalMatchState = { ...makeState(), controlledFootballerId: controlled.id };
    const opportunity = projectPlayerDecisionOpportunity(state);
    if (!opportunity) return;
    state = applyPlayerDecision(state, opportunity, opportunity.options[0]!.id);
    expect(isInteractiveOutcomeWindowOpen(state)).toBe(Boolean(state.pendingPlayerDecision));
  });
});
