import { z } from 'zod';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import { projectPlayerDecisionOpportunity } from './playerDecision';
import type { TacticalMatchState } from './matchState';
import type { TeamSide } from './matchSpace';

export const matchMomentKindSchema = z.enum([
  'player_decision',
  'incoming_ball',
  'dangerous_run',
  'defensive_duel',
  'dangerous_attack',
  'box_entry',
  'shot',
  'goal',
  'goalkeeper_intervention',
  'penalty',
  'dangerous_free_kick',
  'corner',
  'kickoff_after_goal',
  'routine',
]);
export type MatchMomentKind = z.infer<typeof matchMomentKindSchema>;

export const matchMomentCandidateSchema = z.object({
  kind: matchMomentKindSchema,
  importance: z.number().min(0).max(1),
  actorIds: z.array(z.string()),
  team: z.enum(['home', 'away']).optional(),
  reasons: z.array(z.string()),
  controlledPlayerInvolved: z.boolean(),
  requiresHumanDecision: z.boolean(),
  detectedAt: z.number().nonnegative(),
  suggestedLeadInSeconds: z.number().nonnegative(),
});
export type MatchMomentCandidate = z.infer<typeof matchMomentCandidateSchema>;

export const matchPresentationPolicySchema = z.object({
  id: z.enum(['key_player', 'player_extended', 'key_match', 'extended_match', 'full_match']),
  minimumPlayerDecisionImportance: z.number().min(0).max(1),
  minimumMatchMomentImportance: z.number().min(0).max(1),
  alwaysShow: z.array(matchMomentKindSchema),
  fullMatch: z.boolean(),
});
export type MatchPresentationPolicy = z.infer<typeof matchPresentationPolicySchema>;

export const MATCH_PRESENTATION_POLICIES: Record<
  MatchPresentationPolicy['id'],
  MatchPresentationPolicy
> = {
  key_player: {
    id: 'key_player',
    minimumPlayerDecisionImportance: 0.72,
    minimumMatchMomentImportance: 0.9,
    alwaysShow: ['goal', 'penalty'],
    fullMatch: false,
  },
  player_extended: {
    id: 'player_extended',
    minimumPlayerDecisionImportance: 0.5,
    minimumMatchMomentImportance: 0.86,
    alwaysShow: ['goal', 'penalty', 'shot'],
    fullMatch: false,
  },
  key_match: {
    id: 'key_match',
    minimumPlayerDecisionImportance: 0.62,
    minimumMatchMomentImportance: 0.68,
    alwaysShow: ['goal', 'penalty', 'shot'],
    fullMatch: false,
  },
  extended_match: {
    id: 'extended_match',
    minimumPlayerDecisionImportance: 0.38,
    minimumMatchMomentImportance: 0.48,
    alwaysShow: ['goal', 'penalty', 'shot', 'goalkeeper_intervention'],
    fullMatch: false,
  },
  full_match: {
    id: 'full_match',
    minimumPlayerDecisionImportance: 0,
    minimumMatchMomentImportance: 0,
    alwaysShow: [],
    fullMatch: true,
  },
};

const inPenaltyArea = (team: TeamSide, x: number, y: number) =>
  (team === 'home' ? x >= 88.5 : x <= 16.5) && y >= 13.8 && y <= 54.2;

/** Pure observational projection. It never owns an action, mutates state, or consumes RNG. */
export const projectMatchMoment = (state: TacticalMatchState): MatchMomentCandidate => {
  const controlledId = state.controlledFootballerId;
  const decision = projectPlayerDecisionOpportunity(state);
  const owner = state.players.find((player) => player.id === state.ball.ownerId);
  let kind: MatchMomentKind = 'routine';
  let importance = 0.08;
  let team: TeamSide | undefined = owner?.team ?? state.possessionTeam;
  let actorIds: string[] = [];
  let reasons = ['routine_play'];
  let lead = 0;

  if (state.lastShot?.outcome === 'goal' && state.goalCompletionUntil !== undefined) {
    kind = 'goal';
    importance = 1;
    actorIds = [state.lastShot.shooterId];
    reasons = ['goal'];
    lead = 4;
  } else if (state.scenario === 'penalty') {
    kind = 'penalty';
    importance = 0.98;
    reasons = ['penalty_restart'];
    lead = 3;
  } else if (state.ball.travelKind === 'shot' && state.ball.shot) {
    kind = 'shot';
    importance = 0.9;
    actorIds = [state.ball.shot.shooterId];
    reasons = ['shot_in_flight'];
    lead = 2;
  } else if (
    state.keeperIntervention?.intention !== undefined &&
    state.keeperIntervention.intention !== 'stay'
  ) {
    kind = 'goalkeeper_intervention';
    importance = 0.82;
    actorIds = [state.keeperIntervention.keeperId];
    reasons = ['active_keeper_intervention'];
    lead = 2;
  } else if (decision) {
    const worthiness = Math.max(0, Math.min(1, decision.situation.decisionWorthiness));
    kind =
      decision.kind === 'incoming_ball'
        ? 'incoming_ball'
        : decision.kind === 'defensive_response'
          ? 'defensive_duel'
          : decision.kind === 'off_ball_run'
            ? 'dangerous_run'
            : 'player_decision';
    importance = Math.max(0.35, worthiness);
    actorIds = [decision.actorId];
    team = state.players.find((player) => player.id === decision.actorId)?.team;
    reasons = [`decision:${decision.kind}`, `worthiness:${worthiness.toFixed(2)}`];
    lead = 1.5;
  } else if (state.scenario === 'corner') {
    kind = 'corner';
    importance = 0.58;
    reasons = ['attacking_restart'];
    lead = 3;
  } else if (state.scenario === 'free_kick_close' || state.scenario === 'free_kick_wide') {
    kind = 'dangerous_free_kick';
    importance = 0.72;
    reasons = [state.scenario];
    lead = 3;
  } else if (owner && inPenaltyArea(owner.team, state.ball.x, state.ball.y)) {
    const shot = evaluateShootingOpportunity(state, owner);
    kind = 'box_entry';
    importance = Math.min(0.88, 0.5 + shot.effectiveScoringExpectation);
    actorIds = [owner.id];
    reasons = ['penalty_area_possession', `threat:${shot.effectiveScoringExpectation.toFixed(2)}`];
    lead = 2;
  } else if (state.scenario === 'kick_off' && state.lastShot?.outcome === 'goal') {
    kind = 'kickoff_after_goal';
    importance = 0.7;
    reasons = ['restart_after_goal'];
  }

  const controlledPlayerInvolved = Boolean(controlledId && actorIds.includes(controlledId));
  return matchMomentCandidateSchema.parse({
    kind,
    importance,
    actorIds,
    ...(team ? { team } : {}),
    reasons,
    controlledPlayerInvolved,
    requiresHumanDecision: Boolean(decision && decision.actorId === controlledId),
    detectedAt: state.time,
    suggestedLeadInSeconds: lead,
  });
};

export const shouldSurfaceMatchMoment = (
  candidate: MatchMomentCandidate,
  policy: MatchPresentationPolicy,
) =>
  policy.fullMatch ||
  policy.alwaysShow.includes(candidate.kind) ||
  candidate.importance >=
    (candidate.controlledPlayerInvolved
      ? policy.minimumPlayerDecisionImportance
      : policy.minimumMatchMomentImportance);
