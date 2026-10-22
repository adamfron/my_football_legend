import { z } from 'zod';
import {
  tacticalMatchStateSchema,
  type TacticalMatchState,
} from '../src/core/matchSimulation/matchState';
import {
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import { awardNaturalRestart } from '../src/core/matchSimulation/restartScenarios';

export const penaltyHalfReceiptSchema = z.object({
  state: tacticalMatchStateSchema,
  awarded: z.boolean(),
  penaltyExecution: z.number().nonnegative().optional(),
});

/** Native Node executes the identical fixed-tick contract without Vitest's hot-path
 * module instrumentation. The parent test's original wall budget includes this process. */
export const runPenaltyHalfContract = (initial: TacticalMatchState) => {
  tacticalMatchStateSchema.parse(initial);
  let state = initial,
    awarded = false,
    penaltyExecution: number | undefined;
  let lastProgressAt = 0,
    lastDecision = state.decisionIndex;
  for (let i = 0; i < 140000 && state.status === 'first_half'; i++) {
    if (
      !awarded &&
      state.time >= 415 &&
      !state.restart &&
      !state.postGoal &&
      state.scenario === 'open_play'
    ) {
      state = awardNaturalRestart(state, 'penalty', {
        restartTeam: 'away',
        incidentId: 'pr160-full-half-penalty',
        incidentPoint: { x: 11, y: 34 },
        cause: 'foul',
      });
      awarded = true;
    }
    state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    penaltyExecution ??= state.stoppageLedger?.intervals.find(
      (p) => p.incidentId === 'pr160-full-half-penalty' && p.endReason === 'execution',
    )?.executedAt;
    if (state.decisionIndex !== lastDecision) {
      lastProgressAt = state.time;
      lastDecision = state.decisionIndex;
    }
    if (state.time - lastProgressAt > 180)
      throw new Error(
        `No canonical football/restart action for ${state.time - lastProgressAt}s; ${JSON.stringify(state.restart?.readiness)}`,
      );
    const locks =
      state.restartLivenessDiagnostics?.filter(
        (d) => d.classification === 'soft_lock' && d.unchangedSeconds >= 120,
      ) ?? [];
    if (locks.length) throw new Error(`Restart soft lock: ${JSON.stringify(locks.at(-1))}`);
  }
  return { state, awarded, penaltyExecution };
};
