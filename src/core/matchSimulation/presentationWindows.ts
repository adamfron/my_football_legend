import { isRestartSetup } from './restartPhase';
import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import type { PlayerDecisionOpportunity } from './playerDecision';
import { agencyOwnershipSchema } from './playerAgency';

export const presentationWindowDiagnosticSchema = z.object({
  at: z.number().nonnegative(),
  type: z.string(),
  reason: z.string().optional(),
  ownership: agencyOwnershipSchema.optional(),
  opportunityKind: z.string().optional(),
  semanticChoiceCount: z.number().int().nonnegative().optional(),
  policyId: z.string().optional(),
  actorId: z.string().optional(),
  merged: z.boolean().optional(),
  footageHidden: z.boolean().optional(),
  hiddenReason: z.string().optional(),
  requestedSeconds: z.number().nonnegative().optional(),
  availableSeconds: z.number().nonnegative().optional(),
});
export type PresentationWindowDiagnostic = z.infer<typeof presentationWindowDiagnosticSchema>;

// All durations are presentation seconds on the canonical timeline. No football transition here.
export const PRESENTATION_WINDOW_RULES = Object.freeze({
  routineLeadIn: 2.5,
  incomingLeadIn: 3,
  dangerousLeadIn: 4,
  normalTail: 2.5,
  dangerousTail: 4,
  goalTail: 5,
  safetyLimit: 25,
  mergeQuietSeconds: 3,
  maximumEpisodeSeconds: 35,
});

export const isDangerousPresentationContext = (state: TacticalMatchState): boolean => {
  const actor = state.players.find((p) => p.id === state.controlledFootballerId);
  const owner = state.players.find((p) => p.id === state.ball.ownerId);
  const team = owner?.team ?? actor?.team ?? state.possessionTeam;
  const progress = team === 'home' ? state.ball.x : 105 - state.ball.x;
  return (
    progress >= 70 ||
    Boolean(state.ball.shot) ||
    ['cross', 'corner_delivery', 'free_kick_delivery'].includes(state.ball.travelKind ?? '')
  );
};

export const requestedDecisionLeadIn = (
  state: TacticalMatchState,
  opportunity: PlayerDecisionOpportunity,
) =>
  isDangerousPresentationContext(state)
    ? PRESENTATION_WINDOW_RULES.dangerousLeadIn
    : ['incoming_ball', 'defensive_response', 'goalkeeper_response'].includes(opportunity.kind)
      ? PRESENTATION_WINDOW_RULES.incomingLeadIn
      : PRESENTATION_WINDOW_RULES.routineLeadIn;

export const contextLeadInSchema = z.object({
  boundaryTime: z.number().nonnegative(),
  displayTime: z.number().nonnegative(),
  requestedSeconds: z.number().nonnegative(),
  availableSeconds: z.number().nonnegative(),
});
export type ContextLeadIn = z.infer<typeof contextLeadInSchema>;
export const createContextLeadIn = (
  boundaryTime: number,
  requestedSeconds: number,
  oldestTime: number,
): ContextLeadIn => {
  const displayTime = Math.min(
    boundaryTime,
    Math.max(0, oldestTime, boundaryTime - requestedSeconds),
  );
  return {
    boundaryTime,
    displayTime,
    requestedSeconds,
    availableSeconds: boundaryTime - displayTime,
  };
};
export const advanceContextLeadIn = (window: ContextLeadIn, elapsed: number): ContextLeadIn => ({
  ...window,
  displayTime: Math.min(window.boundaryTime, window.displayTime + Math.max(0, elapsed)),
});
export const isDecisionPresentationReady = (window: ContextLeadIn) =>
  window.displayTime >= window.boundaryTime;

export const consequenceWindowSchema = z.object({
  selectedAt: z.number().nonnegative(),
  actorId: z.string(),
  initialOwnerId: z.string().optional(),
  dangerous: z.boolean(),
  outcomeAt: z.number().nonnegative().optional(),
  outcomeReason: z.string().optional(),
  lastDangerAt: z.number().nonnegative(),
});
export type ConsequenceWindow = z.infer<typeof consequenceWindowSchema>;
export const createConsequenceWindow = (
  state: TacticalMatchState,
  actorId: string,
): ConsequenceWindow => ({
  selectedAt: state.time,
  actorId,
  initialOwnerId: state.ball.ownerId,
  dangerous: isDangerousPresentationContext(state),
  lastDangerAt: state.time,
});

/** Canonical evidence closes resolution; a small tail makes the result readable. Never resolves it. */
export const observeConsequenceWindow = (
  window: ConsequenceWindow,
  state: TacticalMatchState,
): {
  window: ConsequenceWindow;
  endReason?: string;
  merged: boolean;
} => {
  const dangerous = isDangerousPresentationContext(state);
  let next = { ...window, lastDangerAt: dangerous ? state.time : window.lastDangerAt };
  const completed = state.lastPlayerDecisionOutcome;
  const defensiveStillMoving =
    state.playerMovementIntent?.actorId === window.actorId &&
    state.ball.ownerId === window.initialOwnerId &&
    state.time < state.playerMovementIntent.expiresAt;
  const evidence =
    state.lastBallContact && state.lastBallContact.at >= window.selectedAt
      ? `contact:${state.lastBallContact.kind}`
      : undefined;
  const outcome =
    !defensiveStillMoving &&
    completed?.actorId === window.actorId &&
    completed.selectedAt >= window.selectedAt &&
    completed.result
      ? completed.result.kind
      : undefined;
  const reception =
    state.lastPassDiagnostic?.resolvedAt !== undefined &&
    state.lastPassDiagnostic.resolvedAt >= window.selectedAt &&
    state.lastPassDiagnostic.passerId === window.actorId
      ? 'pass_reception_or_interception'
      : undefined;
  const turnover =
    state.ball.ownerId &&
    state.ball.ownerId !== window.initialOwnerId &&
    !state.ball.travelKind &&
    state.time > window.selectedAt
      ? 'possession_consequence'
      : undefined;
  const ballOut = isRestartSetup(state) && state.restart.startedAt > window.selectedAt;
  if (
    next.outcomeAt === undefined &&
    (outcome || ballOut || reception || turnover || (evidence && !state.ball.travelKind))
  ) {
    next = {
      ...next,
      outcomeAt: state.time,
      outcomeReason: outcome ?? (ballOut ? 'ball_out' : (reception ?? turnover ?? evidence)),
    };
  }
  if (state.time - window.selectedAt >= PRESENTATION_WINDOW_RULES.safetyLimit)
    return { window: next, endReason: 'bounded_safety_fallback', merged: false };
  const goal = next.outcomeReason === 'shot_resolved' && state.lastShot?.outcome === 'goal';
  const tail = goal
    ? PRESENTATION_WINDOW_RULES.goalTail
    : window.dangerous
      ? PRESENTATION_WINDOW_RULES.dangerousTail
      : PRESENTATION_WINDOW_RULES.normalTail;
  const connected =
    dangerous || state.time - next.lastDangerAt < PRESENTATION_WINDOW_RULES.mergeQuietSeconds;
  if (next.outcomeAt !== undefined && state.time - next.outcomeAt >= tail && !connected)
    return { window: next, endReason: `${next.outcomeReason}:tail_complete`, merged: false };
  return { window: next, merged: next.outcomeAt !== undefined && connected };
};
