import { z } from 'zod';
import { projectContextualInteractions } from './contextualInteractions';
import {
  enumerateAvailableActions,
  chooseRestartAction,
  chooseNpcAction,
  npcPossessionDecisionDelay,
  type RankedAiAction,
  resolveMatchAction,
  rankAvailableActionsForAI,
  hasActiveMatchActionParticipants,
  chooseIncomingShotAction,
} from './matchActions';
import { evaluateMatchSituation, matchSituationEvaluationSchema } from './matchSituationEvaluator';
import {
  attackDirection,
  clampPitchPoint,
  distance,
  distanceToSegment,
  fieldValue,
  pitchPointSchema,
  signedForwardDistance,
  toPitchPointIfInPlay,
  type PitchPoint,
} from './matchSpace';
import {
  matchActionSchema,
  playerMovementIntentSchema,
  type MatchAction,
  type TacticalMatchState,
} from './matchState';
import type { TeamSide } from './matchSpace';
import { evaluateGlobalBallRace, ballRaceCandidateSchema } from './looseBallPhysics';
import { isActionResolutionInProgress } from './actionLifecycle';
import { evaluateActionImpact } from './actionImpact';
import { estimatePlayerArrivalTime, playerArrivalEstimateSchema } from './playerArrival';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import { projectFutureBallTrajectory } from './ballPhysics';
import { BALL_RADIUS } from './ballFlight';
import { enumerateRestartActions } from './matchActions';
import {
  enumerateCanonicalShootingOptions,
  incomingShotContact,
  canExecuteCanonicalShot,
} from './shootingOptions';
import { hasActiveHumanPossession, humanPossessionRedecisionReason } from './possessionAgency';
import { PLAYER_AGENCY_CALIBRATION } from './agencyCalibration';
import { canContactAfterThrowIn } from './throwIn';
import { enumerateDefensiveChallengeActions } from './defensiveChallenges';
import { deriveStructuralPosition } from './tacticalPositioning';
import { arbitrateGoalkeeperClaim } from './goalkeeperClaim';
import { isShotAction } from './actionAgency';
import { enumerateFirstTimePasses } from './firstTimePassing';

export const proxyResolutionStatusSchema = z.enum([
  'resolved_action',
  'delegated_to_canonical_autonomy',
  'no_legal_action',
  'terminal_or_no_longer_relevant',
]);
export type ProxyResolutionStatus = z.infer<typeof proxyResolutionStatusSchema>;
export const proxyResolutionResultSchema = z.object({
  state: z.custom<TacticalMatchState>(),
  status: proxyResolutionStatusSchema,
  opportunityKind: z.enum([
    'on_ball',
    'incoming_ball',
    'off_ball_run',
    'defensive_response',
    'goalkeeper_response',
    'loose_ball',
    'restart',
  ]),
  selectedOptionId: z.string().optional(),
  reason: z.string(),
});
export type ProxyResolutionResult = z.infer<typeof proxyResolutionResultSchema>;

export const playerDecisionOptionSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('action'),
    labelKey: z.string(),
    action: matchActionSchema,
  }),
  z.object({
    id: z.string(),
    kind: z.literal('movement'),
    labelKey: z.string(),
    intent: playerMovementIntentSchema,
  }),
]);
export type PlayerDecisionOption = z.infer<typeof playerDecisionOptionSchema>;
export const playerChoiceFamilySchema = z.enum([
  'pass_to_feet',
  'lead_pass',
  'through_ball',
  'carry',
  'sprint',
  'dribble',
  'retain',
  'control',
  'directional_touch',
  'first_time_pass',
  'play_into_space',
  'shoot',
  'cross',
  'intercept',
  'challenge',
  'aggressive_challenge',
  'slide_tackle',
  'tactical_foul',
  'contain',
  'hold_shape',
  'goalkeeper_claim',
  'restart_receiver',
]);
export type PlayerChoiceFamily = z.infer<typeof playerChoiceFamilySchema>;

/** Reduces implementation variants to intentions that are actually distinct to the player. */
export const derivePlayerChoiceFamily = (
  option: PlayerDecisionOption,
  kind?: PlayerDecisionOpportunity['kind'],
): PlayerChoiceFamily => {
  if (kind === 'restart' && option.kind === 'action' && option.action.type === 'pass')
    return 'restart_receiver';
  if (option.kind === 'movement') {
    if (option.intent.type === 'hold_shape') return 'hold_shape';
    if (option.labelKey.includes('claim') || option.labelKey.includes('sweep'))
      return 'goalkeeper_claim';
    if (option.labelKey.includes('intercept')) return 'intercept';
    if (option.labelKey.includes('contain')) return 'contain';
    return 'challenge';
  }
  const action = option.action;
  if (kind === 'incoming_ball') {
    if (action.type === 'hold') return 'control';
    if (action.type === 'carry') return 'directional_touch';
    if (action.type === 'pass' && action.firstTime) return 'first_time_pass';
  }
  if (action.type === 'challenge')
    return action.technique === 'slide'
      ? 'slide_tackle'
      : action.technique === 'tactical'
        ? 'tactical_foul'
        : action.technique === 'committed'
          ? 'aggressive_challenge'
          : 'challenge';
  if (action.type === 'carry') return action.movementMode ?? 'carry';
  if (action.type === 'space_pass') return 'play_into_space';
  if (action.type === 'shot') return 'shoot';
  if (action.type === 'header' && action.intent === 'header_shot') return 'shoot';
  if (action.type === 'cross') return 'cross';
  if (action.type === 'pass') {
    if (kind === 'restart') return 'restart_receiver';
    if (action.intent === 'lead') return 'lead_pass';
    if (action.intent === 'through') return 'through_ball';
    return 'pass_to_feet';
  }
  return 'hold_shape';
};

export const countSemanticPlayerChoices = (
  options: PlayerDecisionOption[],
  kind?: PlayerDecisionOpportunity['kind'],
): number => {
  return new Set(
    options.map((option) => {
      const family = derivePlayerChoiceFamily(option, kind);
      // A different legal teammate or space is a genuine alternative, even within one family.
      if (option.kind === 'action' && option.action.type === 'pass')
        return `${family}:${option.action.receiverId}`;
      if (option.kind === 'action' && option.action.type === 'shot')
        return `${family}:${option.action.intent}:${option.action.contact ?? 'settled'}`;
      if (option.kind === 'action' && option.action.type === 'header')
        return `${family}:${option.action.intent}`;
      if (
        option.kind === 'action' &&
        (option.action.type === 'carry' ||
          option.action.type === 'cross' ||
          option.action.type === 'space_pass')
      )
        return `${family}:${option.action.target.x.toFixed(1)}:${option.action.target.y.toFixed(1)}`;
      return family;
    }),
  ).size;
};
export const playerDecisionOpportunitySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  openedAt: z.number().nonnegative(),
  kind: z.enum([
    'on_ball',
    'incoming_ball',
    'off_ball_run',
    'defensive_response',
    'goalkeeper_response',
    'loose_ball',
    'restart',
  ]),
  triggerReason: z.string(),
  signature: z.string(),
  situation: matchSituationEvaluationSchema,
  options: z.array(playerDecisionOptionSchema).min(1),
});
export type PlayerDecisionOpportunity = z.infer<typeof playerDecisionOpportunitySchema>;
export interface PlayerDecisionGate {
  lastSituationSignature?: string;
  lastResolvedAt?: number;
}
export const playerDecisionProbeSchema = z.object({
  actorId: z.string().optional(),
  candidate: z.boolean(),
  opportunityKind: playerDecisionOpportunitySchema.shape.kind.optional(),
  blockedReason: z
    .enum([
      'no_controlled_player',
      'agency_disabled',
      'not_open_play',
      'resolution_in_progress',
      'routine',
      'not_relevant',
      'same_situation',
      'cooldown',
      'no_options',
      'single_option_autonomy',
      'no_contextual_interactions',
      'friendly_ball',
      'possession_continuity',
    ])
    .optional(),
  semanticChoiceCount: z.number().int().nonnegative().optional(),
  semanticFamilies: z.array(playerChoiceFamilySchema).optional(),
  ownershipReason: z.string().optional(),
  situationKind: z.string().optional(),
  decisionWorthiness: z.number().optional(),
  pressure: z.number().optional(),
  signature: z.string().optional(),
  roleProfile: z.enum(['goalkeeper', 'defender', 'midfielder', 'forward']).optional(),
  ballRelevance: z.unknown().optional(),
  possessionMismatch: z.boolean().optional(),
  interception: z
    .object({
      interceptPoint: pitchPointSchema,
      ballArrivalTime: z.number().nonnegative(),
      playerArrivalTime: z.number().nonnegative(),
      distanceToIntercept: z.number().nonnegative(),
      initialPlayerSpeed: z.number().nonnegative(),
      targetSpeed: z.number().positive(),
      turnAngle: z.number().nonnegative(),
      arrivalMargin: z.number(),
      ownerId: z.string().optional(),
      teammateArrivalTime: z.number().nonnegative().optional(),
      ownershipReason: z.string().optional(),
    })
    .optional(),
});
export type PlayerDecisionProbe = z.infer<typeof playerDecisionProbeSchema>;

export const controlledBallRelationshipSchema = z.enum([
  'intended_receiver',
  'friendly_possible_receiver',
  'opponent_interceptor',
  'uninvolved',
]);
export type ControlledBallRelationship = z.infer<typeof controlledBallRelationshipSchema>;

/** Canonical ownership of an in-flight ball, never inferred from its geometry. */
export const deriveBallSourceTeam = (state: TacticalMatchState): TeamSide | undefined => {
  const actionActor =
    state.currentAction && ['pass', 'cross', 'header'].includes(state.currentAction.type)
      ? state.currentAction.actorId
      : undefined;
  const sourceId = state.ball.lastTouchPlayerId ?? actionActor;
  return state.players.find((player) => player.id === sourceId)?.team;
};

export const deriveControlledBallRelationship = (
  state: TacticalMatchState,
  actorId: string,
): ControlledBallRelationship => {
  const actor = state.players.find((player) => player.id === actorId);
  const sourceTeam = deriveBallSourceTeam(state);
  if (!actor || !state.ball.travelKind || state.ball.ownerId) return 'uninvolved';
  if (sourceTeam === actor.team) {
    if (state.ball.intendedReceiverId === actorId) return 'intended_receiver';
    return state.ball.target && distance(actor.position, state.ball.target) <= 3
      ? 'friendly_possible_receiver'
      : 'uninvolved';
  }
  return sourceTeam ? 'opponent_interceptor' : 'uninvolved';
};

export const playerInteractionTargetDescriptorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('player'), playerId: z.string() }),
  z.object({ kind: z.literal('ball'), point: pitchPointSchema }),
  z.object({ kind: z.literal('space'), point: pitchPointSchema }),
  z.object({ kind: z.literal('goal'), side: z.enum(['home', 'away']) }),
]);
export type PlayerInteractionTargetDescriptor = z.infer<
  typeof playerInteractionTargetDescriptorSchema
>;

/** Finite, RNG-free bridge proving that a pause has a usable world target. */
const projectSelectableInteractionTargetsCanonical = (
  state: TacticalMatchState,
  opportunity: PlayerDecisionOpportunity,
): PlayerInteractionTargetDescriptor[] => {
  if (state.status === 'abandoned' || state.status === 'full_time' || state.status === 'half_time')
    return [];
  const actor = state.players.find((player) => player.id === opportunity.actorId);
  if (!actor) return [];
  if (opportunity.kind === 'restart') {
    const targets: PlayerInteractionTargetDescriptor[] = [];
    for (const option of opportunity.options) {
      if (option.kind !== 'action') continue;
      if (option.action.type === 'pass')
        targets.push({ kind: 'player', playerId: option.action.receiverId });
      else if (option.action.type === 'shot')
        targets.push({ kind: 'goal', side: actor.team === 'home' ? 'away' : 'home' });
      else if (option.action.type === 'cross')
        targets.push({ kind: 'space', point: option.action.target });
    }
    return targets;
  }
  if (opportunity.kind === 'incoming_ball') {
    const ballPoint = toPitchPointIfInPlay(state.ball);
    const result: PlayerInteractionTargetDescriptor[] = ballPoint
      ? [{ kind: 'ball', point: ballPoint }]
      : [];
    const carry = opportunity.options.find(
      (option) => option.kind === 'action' && option.action.type === 'carry',
    );
    if (carry?.kind === 'action' && carry.action.type === 'carry')
      result.push({ kind: 'space', point: carry.action.target });
    for (const option of opportunity.options)
      if (option.kind === 'action' && option.action.type === 'pass')
        result.push({ kind: 'player', playerId: option.action.receiverId });
    if (
      opportunity.options.some(
        (option) => option.kind === 'action' && option.action.type === 'shot',
      )
    )
      result.push({ kind: 'goal', side: actor.team === 'home' ? 'away' : 'home' });
    return result;
  }
  if (opportunity.kind === 'defensive_response') {
    if (!state.ball.ownerId) {
      const point = toPitchPointIfInPlay(state.ball);
      return point ? [{ kind: 'ball', point }] : [];
    }
    return [{ kind: 'player', playerId: state.ball.ownerId }];
  }
  if (opportunity.kind === 'goalkeeper_response') {
    if (state.ball.ownerId) return [{ kind: 'player', playerId: state.ball.ownerId }];
    const point = toPitchPointIfInPlay(state.ball);
    return point ? [{ kind: 'ball', point }] : [];
  }
  if (opportunity.kind === 'loose_ball') {
    const point = toPitchPointIfInPlay(state.ball);
    return point ? [{ kind: 'ball', point }] : [];
  }
  if (opportunity.kind === 'off_ball_run')
    return opportunity.options.flatMap((option) =>
      option.kind === 'movement' ? [{ kind: 'space' as const, point: option.intent.target }] : [],
    );
  return [{ kind: 'player', playerId: actor.id }];
};

/** Cached menus cannot expose a footballer who has left the active roster. */
export const projectSelectableInteractionTargets = (
  state: TacticalMatchState,
  opportunity: PlayerDecisionOpportunity,
): PlayerInteractionTargetDescriptor[] =>
  projectSelectableInteractionTargetsCanonical(state, opportunity).filter(
    (target) =>
      target.kind !== 'player' || state.players.some((player) => player.id === target.playerId),
  );

export const decisionRoleSchema = z.enum(['goalkeeper', 'defender', 'midfielder', 'forward']);
export type DecisionRole = z.infer<typeof decisionRoleSchema>;
export const ballRelevanceSchema = z.object({
  relevant: z.boolean(),
  estimatedArrivalTime: z.number().optional(),
  ballArrivalTime: z.number().optional(),
  contenderRank: z.number().int().positive().optional(),
  actor: ballRaceCandidateSchema.optional(),
  bestOverall: ballRaceCandidateSchema.optional(),
  bestTeammate: ballRaceCandidateSchema.optional(),
  bestOpponent: ballRaceCandidateSchema.optional(),
  trajectoryRelevant: z.boolean(),
  reason: z.enum([
    'reachable_soon',
    'trajectory_intersection',
    'direct_contest',
    'critical_cover',
    'too_far',
    'other_player_dominant',
  ]),
});
export type BallRelevance = z.infer<typeof ballRelevanceSchema>;
export const onBallDecisionRelevanceSchema = z.object({
  relevant: z.boolean(),
  score: z.number(),
  reasons: z.array(z.string()),
  viableFamilies: z.array(z.string()),
});
export type OnBallDecisionRelevance = z.infer<typeof onBallDecisionRelevanceSchema>;
const actionFamily = (action: MatchAction) =>
  action.type === 'pass'
    ? action.intent === 'support'
      ? 'safe_pass'
      : action.intent === 'progressive'
        ? 'progressive_pass'
        : 'direct_pass'
    : action.type;
/** RNG-free projection over the canonical action ranking; it changes only whether play pauses. */
export const evaluateOnBallDecisionRelevance = (
  state: TacticalMatchState,
  actorId: string,
  ranked: readonly RankedAiAction[] = rankAvailableActionsForAI(state, actorId),
): OnBallDecisionRelevance => {
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return { relevant: false, score: 0, reasons: [], viableFamilies: [] };
  const situation = evaluateMatchSituation(state, actorId);
  const best = ranked[0]?.canonicalScore ?? 0;
  const competitive = ranked.filter((a) => best - a.canonicalScore <= 14);
  const families = [...new Set(competitive.map((a) => actionFamily(a.action)))];
  const progressive = families.some((f) =>
    ['progressive_pass', 'direct_pass', 'carry', 'cross', 'shot'].includes(f),
  );
  const preferredImpact = ranked[0]
    ? evaluateActionImpact(state, ranked[0].action).family
    : 'routine';
  const preferredAction = ranked[0]?.action;
  // Hold and three nearby carry directions do not form a meaningful release/take-on choice.
  const hasTerminalAlternative = competitive.some(({ action }) =>
    ['pass', 'shot', 'cross', 'header'].includes(action.type),
  );
  const riskyCarry =
    preferredAction?.type === 'carry' &&
    state.players.some((player) => {
      if (player.team === actor.team) return false;
      const dx = preferredAction.target.x - actor.position.x;
      const dy = preferredAction.target.y - actor.position.y;
      const length = Math.max(0.01, Math.hypot(dx, dy));
      const projection =
        ((player.position.x - actor.position.x) * dx +
          (player.position.y - actor.position.y) * dy) /
        length;
      return (
        projection >= 1 &&
        projection <= length &&
        distance(actor.position, player.position) <=
          PLAYER_AGENCY_CALIBRATION.carryChallengeDistance &&
        distanceToSegment(player.position, actor.position, preferredAction.target) <=
          PLAYER_AGENCY_CALIBRATION.carryChallengeLaneRadius
      );
    });
  const hasAlternative = competitive.some(
    (item) =>
      ranked[0] &&
      item.action.type !== 'hold' &&
      actionFamily(item.action) !== actionFamily(ranked[0].action),
  );
  const reasons: string[] = [];
  if (families.length >= 2) reasons.push('meaningful_action_diversity');
  if (progressive) reasons.push('progressive_option');
  if ((situation.context.pressure ?? 0) >= 0.35) reasons.push('pressure');
  if (state.teams[actor.team].phase === 'attacking_transition') reasons.push('transition');
  const role = deriveDecisionRole(actor);
  const score =
    situation.decisionWorthiness +
    (families.length >= 2 ? 0.2 : 0) +
    (progressive ? 0.12 : 0) +
    (role === 'midfielder' && progressive ? 0.12 : 0);
  const shootingOpportunity = evaluateShootingOpportunity(state, actor);
  const credibleShot =
    shootingOpportunity.category === 'credible' || shootingOpportunity.category === 'high_value';
  const absolutePlayerOwned = ranked.some(
    ({ action }) => action.type === 'cross' || (action.type === 'shot' && credibleShot),
  );
  const significantPreferred =
    preferredImpact === 'high_impact' &&
    (preferredAction?.type !== 'carry' || (riskyCarry && hasTerminalAlternative));
  // A credible line-breaking outlet competes with recycling even when both options are passes.
  // fieldValue includes centrality, so use physical forward metres for this commitment.
  const progressiveRouteChoice = competitive.some(({ action, canonicalScore }) => {
    if (action.type !== 'pass' || best - canonicalScore > 5) return false;
    const forward = signedForwardDistance(actor.position, action.target, actor.team);
    if (forward < 18) return false;
    const breaksLine = state.players.some(
      (player) =>
        player.team !== actor.team &&
        signedForwardDistance(actor.position, player.position, actor.team) >= 4 &&
        signedForwardDistance(player.position, action.target, actor.team) >= 3 &&
        distanceToSegment(player.position, actor.position, action.target) <= 6,
    );
    return (
      breaksLine &&
      competitive.some(
        ({ action: alternative }) =>
          alternative.type === 'carry' ||
          (alternative.type === 'pass' &&
            alternative.receiverId !== action.receiverId &&
            distance(alternative.target, action.target) >= 10),
      )
    );
  });
  if (progressiveRouteChoice) reasons.push('line_breaking_outlet_choice');
  if (significantPreferred || absolutePlayerOwned) reasons.push('autopilot_escalation');
  return onBallDecisionRelevanceSchema.parse({
    relevant:
      absolutePlayerOwned || progressiveRouteChoice || (significantPreferred && hasAlternative),
    score,
    reasons,
    viableFamilies: families,
  });
};

export const incomingPlayerInvolvementSchema = z.object({
  relevant: z.boolean(),
  arrivalTime: z.number().nonnegative().optional(),
  important: z.boolean(),
  reasons: z.array(z.string()),
});
export type IncomingPlayerInvolvement = z.infer<typeof incomingPlayerInvolvementSchema>;

/** Stable identity of an authoritative incoming delivery, shared by direct and target menus. */
export const incomingBallIntentKey = (state: TacticalMatchState): string =>
  `flight:${state.ballEpisode ?? 0}:${
    (state.ball.sourceAction === 'pass' || state.ball.sourceAction === 'space_pass') &&
    state.lastPassDiagnostic
      ? state.lastPassDiagnostic.passId
      : `${state.ball.lastTouchPlayerId ?? 'unknown'}:${state.ball.travelKind ?? 'ball'}:${state.ball.from?.x ?? state.ball.target?.x ?? ''}:${state.ball.from?.y ?? state.ball.target?.y ?? ''}`
  }`;

/** RNG-free: observes an already committed trajectory, never hypothetical reach in open space. */
export const projectIncomingPlayerInvolvement = (
  state: TacticalMatchState,
  actorId: string,
): IncomingPlayerInvolvement => {
  const actor = state.players.find((player) => player.id === actorId);
  const ballSpeed = Math.max(
    0.1,
    Math.hypot(state.ball.velocity?.x ?? 0, state.ball.velocity?.y ?? 0),
  );
  const remaining = state.ball.target ? distance(state.ball, state.ball.target) / ballSpeed : 0;
  const committed = Boolean(
    actor &&
      !state.ball.ownerId &&
      deriveBallSourceTeam(state) === actor.team &&
      state.ball.target &&
      state.ball.travelKind &&
      (state.ball.intendedReceiverId === actorId ||
        (!state.ball.intendedReceiverId && distance(actor.position, state.ball.target) <= 3)),
  );
  const nearbyDefender = Boolean(
    actor &&
      state.ball.target &&
      state.players.some(
        (player) =>
          player.team !== actor.team && distance(player.position, state.ball.target!) <= 4,
      ),
  );
  const attacking = Boolean(
    actor &&
      fieldValue(state.ball.target ?? actor.position, actor.team) >
        PLAYER_AGENCY_CALIBRATION.meaningfulLongReceptionProgress,
  );
  const tightReceptionPressure = Boolean(
    actor &&
      state.ball.target &&
      state.players.some(
        (player) =>
          player.team !== actor.team &&
          distance(player.position, state.ball.target!) <=
            PLAYER_AGENCY_CALIBRATION.meaningfulReceptionPressureDistance,
      ),
  );
  const contact = actor && committed ? incomingShotContact(state, actor.id) : undefined;
  const finish =
    actor && contact
      ? evaluateShootingOpportunity(state, { ...actor, position: contact.point })
      : undefined;
  // Physical availability of a speculative first-time shot does not make safe circulation
  // worth opening a new episode. The legal shot remains available inside a surfaced episode.
  const firstTimeFinish = Boolean(
    actor &&
      finish &&
      (finish.category === 'credible' || finish.category === 'high_value') &&
      enumerateCanonicalShootingOptions(state, actor.id).length,
  );
  const importantKind =
    ['through_ball', 'cross'].includes(state.ball.travelKind ?? '') ||
    (state.ball.travelKind === 'long_distribution' && (attacking || tightReceptionPressure));
  const important = importantKind || (attacking && tightReceptionPressure) || firstTimeFinish;
  // Time to contact is observed from the live trajectory. Routine arrivals and a ball already
  // on the feet cannot open the incoming menu merely because control and a token carry exist.
  const relevant = committed && remaining >= 0.35 && remaining <= 1.8 && important;
  return incomingPlayerInvolvementSchema.parse({
    relevant,
    ...(committed ? { arrivalTime: Math.max(0, remaining) } : {}),
    important,
    reasons: [
      ...(importantKind ? [state.ball.travelKind!] : []),
      ...(nearbyDefender ? ['defender_competition'] : []),
      ...(attacking ? ['attacking_territory'] : []),
      ...(firstTimeFinish ? ['first_time_finishing_choice'] : []),
    ],
  });
};

export const passInterceptionOpportunitySchema = z.object({
  viable: z.boolean(),
  contactPoint: pitchPointSchema.optional(),
  distanceToPath: z.number().nonnegative().optional(),
  arrivalTime: z.number().nonnegative().optional(),
  structureRisk: z.number().min(0).max(1).optional(),
  playerArrival: playerArrivalEstimateSchema.optional(),
  arrivalMargin: z.number().optional(),
  ownerId: z.string().optional(),
  teammateArrivalTime: z.number().nonnegative().optional(),
  ownershipReason: z
    .enum(['controlled_best_eta', 'teammate_earlier_eta', 'teammate_in_lane'])
    .optional(),
});
export const evaluatePassInterceptionOpportunity = (
  state: TacticalMatchState,
  defenderId: string,
) => {
  const defender = state.players.find((player) => player.id === defenderId);
  const relationship = deriveControlledBallRelationship(state, defenderId);
  const velocity = state.ball.velocity;
  if (
    relationship !== 'opponent_interceptor' ||
    !defender ||
    !velocity ||
    state.ball.ownerId ||
    !state.ball.travelKind
  )
    return passInterceptionOpportunitySchema.parse({ viable: false });
  const samples = projectFutureBallTrajectory(
    {
      position: { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? BALL_RADIUS },
      velocity: { x: velocity.x, y: velocity.y, z: velocity.z ?? 0 },
      airborne: state.ball.airborne ?? false,
      bounceCount: state.ball.bounceCount ?? 0,
    },
    2.5,
    0.05,
  );
  // A physical flight continues after a line crossing, but the playable football action does not.
  // Stop at the first outside sample: clamping it would manufacture an interception on the line.
  const playableSamples: Array<(typeof samples)[number] & { point: PitchPoint }> = [];
  for (const sample of samples) {
    const point = toPitchPointIfInPlay(sample.ball.position);
    if (!point) break;
    playableSamples.push({ ...sample, point });
  }
  const candidates = playableSamples
    .map(({ at, ball, point }) => {
      const playerArrival = estimatePlayerArrivalTime(state, defender, point, 'intercept');
      const contactHeight = ball.position.z;
      const arrivalMargin = at + 0.12 - playerArrival.estimatedTime;
      return { at, point, playerArrival, contactHeight, arrivalMargin };
    })
    .filter((candidate) => candidate.at > 0)
    .sort((a, b) => a.playerArrival.distance - b.playerArrival.distance || a.at - b.at);
  const candidate = candidates[0];
  if (!candidate) return passInterceptionOpportunitySchema.parse({ viable: false });
  const contactPoint = candidate.point;
  const distanceToPath = distance(defender.position, contactPoint);
  const arrivalTime = candidate.at;
  const structureRisk = Math.min(1, distance(defender.anchor, contactPoint) / 18);
  const playerArrival = candidate.playerArrival;
  const arrivalMargin = candidate.arrivalMargin;
  const reachableContact =
    candidate.contactHeight <= (defender.profile.primaryPosition === 'goalkeeper' ? 2.65 : 2.15) &&
    playerArrival.reachable &&
    arrivalMargin >= 0 &&
    arrivalMargin <= 0.9;
  // Compare the same physical meeting point. A player standing in an earlier part of the
  // lane will contact the ball before this meeting, even if they are far from its endpoint.
  const teammates = state.players.filter(
    (player) =>
      player.team === defender.team &&
      player.id !== defender.id &&
      canContactAfterThrowIn(state, player.id),
  );
  const earlierLaneOwner = teammates.find((player) =>
    playableSamples.some(
      ({ at, ball, point }) =>
        at > 0 &&
        at + PLAYER_AGENCY_CALIBRATION.interceptionEarlierContactLead < arrivalTime &&
        ball.position.z <= (player.profile.primaryPosition === 'goalkeeper' ? 2.65 : 2.15) &&
        distance(player.position, point) <= PLAYER_AGENCY_CALIBRATION.interceptionLaneContactRadius,
    ),
  );
  const bestTeammate = teammates
    .map((player) => ({
      playerId: player.id,
      arrival: estimatePlayerArrivalTime(state, player, contactPoint, 'intercept'),
    }))
    .filter(({ arrival }) => arrival.reachable && arrival.estimatedTime <= arrivalTime + 0.12)
    .sort(
      (a, b) =>
        a.arrival.estimatedTime - b.arrival.estimatedTime || a.playerId.localeCompare(b.playerId),
    )[0];
  const teammateEarlier = Boolean(
    bestTeammate &&
      bestTeammate.arrival.estimatedTime + PLAYER_AGENCY_CALIBRATION.interceptionTeammateEtaLead <
        playerArrival.estimatedTime,
  );
  const ownerId = earlierLaneOwner?.id ?? (teammateEarlier ? bestTeammate!.playerId : defenderId);
  return passInterceptionOpportunitySchema.parse({
    viable: reachableContact && arrivalTime >= 0.1 && arrivalTime <= 2.5 && structureRisk < 0.85,
    contactPoint,
    distanceToPath,
    arrivalTime,
    structureRisk,
    playerArrival,
    arrivalMargin,
    ownerId,
    ...(bestTeammate ? { teammateArrivalTime: bestTeammate.arrival.estimatedTime } : {}),
    ownershipReason: earlierLaneOwner
      ? 'teammate_in_lane'
      : teammateEarlier
        ? 'teammate_earlier_eta'
        : 'controlled_best_eta',
  });
};

export const defensiveCommitmentSchema = z.object({
  meaningful: z.boolean(),
  reason: z.enum([
    'routine_line_adjustment',
    'routine_close_down',
    'protect_dangerous_space',
    'dangerous_receiver',
    'significant_step_out',
  ]),
  displacement: z.number().nonnegative(),
  shapeDeparture: z.number().nonnegative(),
});

/** A different movement button is meaningful only when it changes defensive responsibility. */
export const evaluateDefensiveCommitment = (
  state: TacticalMatchState,
  actorId: string,
  point: { x: number; y: number },
  kind: 'intercept' | 'challenge',
) => {
  const actor = state.players.find((player) => player.id === actorId);
  if (!actor)
    return defensiveCommitmentSchema.parse({
      meaningful: false,
      reason: 'routine_close_down',
      displacement: 0,
      shapeDeparture: 0,
    });
  const displacement = distance(actor.position, point);
  const structure = deriveStructuralPosition(state, actor);
  const shapeDeparture = distance(structure, point);
  const shapeDepartureIncrease = shapeDeparture - distance(structure, actor.position);
  const ownGoal = { x: actor.team === 'home' ? 0 : 105, y: 34 };
  const dangerousReceiver =
    distance(point, ownGoal) <= PLAYER_AGENCY_CALIBRATION.dangerousGoalDistance;
  const protectedRunner = state.players.some(
    (player) =>
      player.team !== actor.team &&
      player.id !== state.ball.ownerId &&
      deriveDecisionRole(actor) !== 'forward' &&
      distance(player.position, ownGoal) <= PLAYER_AGENCY_CALIBRATION.dangerousGoalDistance &&
      signedForwardDistance(player.position, actor.position, actor.team) > 2 &&
      distance(player.position, actor.position) <=
        PLAYER_AGENCY_CALIBRATION.protectedRunnerDistance &&
      distance(player.position, point) > displacement + 1.5,
  );
  const substantialStep =
    kind === 'challenge' || displacement >= PLAYER_AGENCY_CALIBRATION.minimumInterceptionCommitment;
  const responsibilityCovered =
    kind === 'intercept' &&
    state.players.some(
      (player) =>
        player.team === actor.team &&
        player.id !== actor.id &&
        deriveDecisionRole(player) === 'defender' &&
        signedForwardDistance(player.position, structure, actor.team) >= 0 &&
        Math.abs(player.position.y - structure.y) < 12 &&
        distance(player.position, structure) < 22,
    );
  const meaningful =
    substantialStep &&
    (dangerousReceiver ||
      protectedRunner ||
      (deriveDecisionRole(actor) !== 'forward' &&
        !responsibilityCovered &&
        shapeDepartureIncrease >= PLAYER_AGENCY_CALIBRATION.significantShapeDeparture));
  return defensiveCommitmentSchema.parse({
    meaningful,
    reason: meaningful
      ? protectedRunner
        ? 'protect_dangerous_space'
        : dangerousReceiver
          ? 'dangerous_receiver'
          : 'significant_step_out'
      : kind === 'intercept'
        ? 'routine_line_adjustment'
        : 'routine_close_down',
    displacement,
    shapeDeparture,
  });
};
export const deriveDecisionRole = (actor: TacticalMatchState['players'][number]): DecisionRole => {
  const position = actor.profile.primaryPosition;
  if (position === 'goalkeeper') return 'goalkeeper';
  if (position.includes('back') || position.includes('defender')) return 'defender';
  if (position.includes('midfielder')) return 'midfielder';
  return 'forward';
};
export const evaluateControlledPlayerBallRelevance = (
  state: TacticalMatchState,
  actorId: string,
): BallRelevance => {
  const actor = state.players.find((player) => player.id === actorId);
  if (!actor) return { relevant: false, trajectoryRelevant: false, reason: 'too_far' };
  const contenders = evaluateGlobalBallRace(state);
  const candidate = contenders.find((item) => item.playerId === actorId);
  const rank = contenders.findIndex((item) => item.playerId === actorId) + 1;
  const bestOverall = contenders[0];
  const bestTeammate = contenders.find((item) => item.team === actor.team);
  const bestOpponent = contenders.find((item) => item.team !== actor.team);
  const arrival = candidate?.estimatedArrivalTime ?? Infinity;
  const velocity = state.ball.velocity ?? { x: 0, y: 0 };
  const speed = Math.hypot(velocity.x, velocity.y);
  const ballArrivalTime = candidate?.ballArrivalTime;
  const trajectoryRelevant = Boolean(speed > 1 && candidate && candidate.timingDelta <= 0.45);
  const margin = speed > 9 ? 0.45 : 0.7;
  const competitive = Boolean(
    candidate && bestOverall && arrival <= bestOverall.estimatedArrivalTime + margin,
  );
  const teammateDominant = Boolean(
    candidate &&
      bestTeammate &&
      bestTeammate.playerId !== actorId &&
      arrival > bestTeammate.estimatedArrivalTime + 0.45,
  );
  const dominant = !competitive || teammateDominant;
  const rawDistance = distance(actor.position, state.ball);
  const relevant =
    !dominant &&
    Boolean(candidate) &&
    rawDistance <= 14 &&
    arrival <= 3 &&
    (rank <= 3 || trajectoryRelevant);
  return ballRelevanceSchema.parse({
    relevant,
    ...(candidate ? { estimatedArrivalTime: arrival, ballArrivalTime } : {}),
    ...(rank ? { contenderRank: rank } : {}),
    ...(candidate ? { actor: candidate } : {}),
    ...(bestOverall ? { bestOverall } : {}),
    ...(bestTeammate ? { bestTeammate } : {}),
    ...(bestOpponent ? { bestOpponent } : {}),
    trajectoryRelevant,
    reason: relevant
      ? trajectoryRelevant && arrival > 2.6
        ? 'trajectory_intersection'
        : arrival < 1
          ? 'direct_contest'
          : 'reachable_soon'
      : candidate && dominant
        ? 'other_player_dominant'
        : 'too_far',
  });
};

const actionLabel = (action: MatchAction) =>
  action.type === 'challenge'
    ? `challenge_${action.technique}`
    : action.type === 'hold'
      ? 'hold'
      : action.type === 'carry'
        ? 'carry'
        : action.type === 'shot'
          ? `shot_${action.intent}`
          : action.type === 'cross'
            ? `cross_${action.intent}`
            : action.type === 'pass'
              ? `pass_${action.intent}`
              : action.type === 'space_pass'
                ? 'play_into_space'
                : `header_${action.intent}`;
const signatureFor = (state: TacticalMatchState, kind: string) => {
  const situation = evaluateMatchSituation(state, state.controlledFootballerId);
  const pressureBand = Math.floor((situation.context.pressure ?? 0) * 4);
  const territoryBand = Math.floor((situation.context.fieldProgress ?? 0) * 5);
  const possessionEvent = state.ballOwnershipStartedAt ?? 0;
  const episode = `${state.ball.ownerId ?? 'loose'}:${possessionEvent}:${state.teams[state.possessionTeam].phase}:${territoryBand}`;
  // One defensive commitment belongs to one physical delivery or opponent possession.
  // Geometry bands would reopen it when a centimetre change straddles an arbitrary grid edge.
  if (kind === 'defensive_response' || kind === 'goalkeeper_response') {
    const pass = state.lastPassDiagnostic;
    const flight = state.ball.travelKind
      ? state.ball.sourceAction === 'pass' && pass && pass.passerId === state.ball.lastTouchPlayerId
        ? pass.passId
        : `${state.ball.travelKind}:${state.ball.from?.x ?? ''}:${state.ball.from?.y ?? ''}`
      : possessionEvent;
    return `${kind}:${state.ballEpisode ?? 0}:${state.ball.ownerId ?? state.ball.lastTouchPlayerId ?? 'loose'}:${flight}`;
  }
  // Off-ball prompts are possession episodes, not timers. On-ball chains deliberately retain
  // decisionIndex so a completed carry can expose a genuinely new choice immediately.
  return kind === 'off_ball_run'
    ? `${kind}:${episode}`
    : `${kind}:${state.decisionIndex}:${episode}:${pressureBand}`;
};

export const movementOpportunityValueSchema = z.object({
  useful: z.boolean(),
  score: z.number(),
  passingAngleGain: z.number(),
  forwardGain: z.number(),
  spaceGain: z.number(),
  laneGain: z.number(),
});
export type MovementOpportunityValue = z.infer<typeof movementOpportunityValueSchema>;
export const evaluateMovementOpportunityValue = (
  state: TacticalMatchState,
  actorId: string,
  target: { x: number; y: number },
): MovementOpportunityValue => {
  const actor = state.players.find((p) => p.id === actorId),
    carrier = state.players.find((p) => p.id === state.ball.ownerId);
  if (!actor || !carrier)
    return {
      useful: false,
      score: 0,
      passingAngleGain: 0,
      forwardGain: 0,
      spaceGain: 0,
      laneGain: 0,
    };
  const foes = state.players.filter((p) => p.team !== actor.team);
  const clearance = (point: { x: number; y: number }) =>
    Math.min(...foes.map((p) => distance(point, p.position)), 30);
  const currentVector = Math.atan2(
      actor.position.y - carrier.position.y,
      actor.position.x - carrier.position.x,
    ),
    nextVector = Math.atan2(target.y - carrier.position.y, target.x - carrier.position.x);
  const passingAngleGain = Math.min(Math.PI, Math.abs(nextVector - currentVector));
  const forwardGain = Math.max(0, signedForwardDistance(target, actor.position, actor.team));
  const spaceGain = clearance(target) - clearance(actor.position);
  const laneGain =
    Math.abs(target.y - carrier.position.y) - Math.abs(actor.position.y - carrier.position.y);
  const displacement = distance(actor.position, target);
  const score =
    passingAngleGain * 8 +
    forwardGain * 0.8 +
    Math.max(0, spaceGain) * 1.2 +
    Math.max(0, laneGain) * 0.35;
  return movementOpportunityValueSchema.parse({
    useful: displacement >= 4 && score >= 6,
    score,
    passingAngleGain,
    forwardGain,
    spaceGain,
    laneGain,
  });
};

export const projectPlayerAgency = (
  state: TacticalMatchState,
  suppliedGate?: PlayerDecisionGate,
): { probe: PlayerDecisionProbe; opportunity?: PlayerDecisionOpportunity } => {
  const gate = suppliedGate ?? state.playerDecisionGate ?? {};
  const actorId = state.controlledFootballerId;
  const actor = state.players.find((p) => p.id === actorId);
  const blocked = (blockedReason: PlayerDecisionProbe['blockedReason'], extra = {}) => ({
    probe: playerDecisionProbeSchema.parse({ actorId, candidate: false, blockedReason, ...extra }),
  });
  if (!actorId || !actor) return blocked('no_controlled_player');
  if (state.playerAgencyEnabled === false) return blocked('agency_disabled');
  if (state.status === 'abandoned' || state.status === 'full_time' || state.status === 'half_time')
    return blocked('not_open_play');
  if (state.defensiveChallenge?.actorId === actorId) return blocked('resolution_in_progress');
  const controlledRestart =
    state.scenario !== 'open_play' &&
    state.restart?.phase === 'setup' &&
    state.restart.takerId === actorId;
  if (state.scenario !== 'open_play' && state.restart?.phase !== 'release' && !controlledRestart)
    return blocked('not_open_play');
  const humanPossession = hasActiveHumanPossession(state);
  // Share one pure ranking within this probe. Agency and relevance inspect identical policy;
  // no cache survives a snapshot mutation or changes the engine's RNG/decision cadence.
  let ownerRanking: RankedAiAction[] | undefined;
  const rankedOwnerActions = () => (ownerRanking ??= rankAvailableActionsForAI(state, actorId));
  let ownerRelevance: OnBallDecisionRelevance | undefined;
  const onBallRelevance = () =>
    (ownerRelevance ??= evaluateOnBallDecisionRelevance(state, actorId, rankedOwnerActions()));
  const routineReady =
    state.restart?.phase === 'setup' ||
    state.ballOwnershipStartedAt === undefined ||
    state.time - state.ballOwnershipStartedAt >= npcPossessionDecisionDelay(state, actor);
  const autonomousChoice =
    !humanPossession && !state.pendingReceptionIntent
      ? state.ball.ownerId === actorId && state.actionCooldown <= 0 && routineReady
        ? rankedOwnerActions()[0]?.action
        : !state.ball.ownerId && state.ball.travelKind && distance(actor.position, state.ball) < 2.2
          ? chooseIncomingShotAction(state, actorId)
          : undefined
      : undefined;
  const mandatoryShot = Boolean(
    (state.shotAgencyRequest?.actorId === actorId &&
      isShotAction(state.shotAgencyRequest) &&
      canExecuteCanonicalShot(state, state.shotAgencyRequest)) ||
      (autonomousChoice && isShotAction(autonomousChoice)) ||
      (controlledRestart && enumerateRestartActions(state).some(isShotAction)),
  );
  let redecisionReason = humanPossessionRedecisionReason(state);
  const preparation = state.onBallPreparation;
  if (
    !redecisionReason &&
    humanPossession &&
    !mandatoryShot &&
    state.humanPossessionEpisode?.intent === 'control' &&
    preparation?.actorId === actorId &&
    state.time >= preparation.readyAt &&
    (!preparation.continuation || state.time >= preparation.continuation.until) &&
    onBallRelevance().relevant
  )
    redecisionReason = 'controlled_reception_complete';
  const continuingCarry = humanPossession && state.ballCarrierIntent?.actorId === actorId;
  // A committed ball flight is precisely when reception/interception control may begin.
  if (
    !controlledRestart &&
    isActionResolutionInProgress(state) &&
    !state.ball.travelKind &&
    !redecisionReason &&
    !mandatoryShot
  )
    return blocked('resolution_in_progress');
  if (
    humanPossession &&
    !mandatoryShot &&
    !redecisionReason &&
    (continuingCarry || state.postActionAgencyCheckpoint?.actorId !== actorId)
  )
    return blocked('possession_continuity');
  const situation = evaluateMatchSituation(state, actorId);
  const roleProfile = deriveDecisionRole(actor);
  const context: Partial<PlayerDecisionProbe> = {
    situationKind: situation.kind,
    decisionWorthiness: situation.decisionWorthiness,
    pressure: situation.context.pressure,
    roleProfile,
    possessionMismatch: Boolean(
      state.ball.ownerId &&
        state.players.find((player) => player.id === state.ball.ownerId)?.team !==
          state.possessionTeam,
    ),
  };
  const interceptionDiagnostic = !state.ball.ownerId
    ? evaluatePassInterceptionOpportunity(state, actorId)
    : undefined;
  if (interceptionDiagnostic?.contactPoint && interceptionDiagnostic.playerArrival) {
    context.interception = {
      interceptPoint: interceptionDiagnostic.contactPoint,
      ballArrivalTime: interceptionDiagnostic.arrivalTime ?? 0,
      playerArrivalTime: interceptionDiagnostic.playerArrival.estimatedTime,
      distanceToIntercept: interceptionDiagnostic.playerArrival.distance,
      initialPlayerSpeed: interceptionDiagnostic.playerArrival.initialSpeed,
      targetSpeed: interceptionDiagnostic.playerArrival.targetSpeed,
      turnAngle: interceptionDiagnostic.playerArrival.turnAngle,
      arrivalMargin: interceptionDiagnostic.arrivalMargin ?? 0,
      ownerId: interceptionDiagnostic.ownerId,
      teammateArrivalTime: interceptionDiagnostic.teammateArrivalTime,
      ownershipReason: interceptionDiagnostic.ownershipReason,
    };
  }
  let kind: PlayerDecisionOpportunity['kind'] | undefined;
  let options: PlayerDecisionOption[] = [];
  const agencyHandoff = state.postActionAgencyCheckpoint?.actorId === actorId;
  if (
    state.ball.ownerId === actorId &&
    state.onBallPreparation?.actorId === actorId &&
    state.onBallPreparation.kind === 'shielding' &&
    state.time < state.onBallPreparation.readyAt &&
    !mandatoryShot &&
    !humanPossession
  )
    return blocked('routine', {
      ...context,
      opportunityKind: 'on_ball',
      ownershipReason: 'routine_shielding_preparation',
      semanticChoiceCount: 1,
      semanticFamilies: ['hold_shape'],
    });
  if (controlledRestart) {
    kind = 'restart';
    options = enumerateRestartActions(state).map((action, index) => ({
      id: `restart-${index}`,
      kind: 'action' as const,
      labelKey: actionLabel(action),
      action,
    }));
  } else if (
    state.ball.ownerId === actorId &&
    (mandatoryShot || agencyHandoff || redecisionReason || onBallRelevance().relevant)
  ) {
    kind = 'on_ball';
    const available = enumerateAvailableActions(state, actorId);
    const roleActions =
      roleProfile === 'goalkeeper'
        ? available.filter((action) => action.type === 'hold' || action.type === 'pass')
        : available;
    options = roleActions.map((action, index) => ({
      id: `action-${index}`,
      kind: 'action' as const,
      labelKey: actionLabel(action),
      action,
    }));
  } else if (!state.ball.ownerId) {
    const incoming = projectIncomingPlayerInvolvement(state, actorId);
    const interception = interceptionDiagnostic!;
    const keeperFlight =
      roleProfile === 'goalkeeper' &&
      [
        'through_ball',
        'cross',
        'long_distribution',
        'free_kick_delivery',
        'corner_delivery',
      ].includes(state.ball.travelKind ?? '') &&
      interception.viable &&
      (interception.arrivalMargin ?? -Infinity) >= -0.35 &&
      Boolean(
        interception.contactPoint &&
          arbitrateGoalkeeperClaim(
            state,
            actor,
            interception.contactPoint,
            interception.arrivalTime,
          ).meaningfulChoice,
      );
    if (keeperFlight) {
      kind = 'goalkeeper_response';
      const cross = ['cross', 'free_kick_delivery', 'corner_delivery'].includes(
        state.ball.travelKind ?? '',
      );
      options = [
        {
          id: 'keeper-stay',
          kind: 'movement',
          labelKey: cross ? 'keeper_stay_line' : 'keeper_stay',
          intent: {
            actorId,
            type: 'hold_shape',
            target: actor.position,
            startedAt: state.time,
            expiresAt: state.time + Math.max(0.5, interception.arrivalTime ?? 1),
          },
        },
        {
          id: 'keeper-come',
          kind: 'movement',
          labelKey: cross ? 'keeper_claim_cross' : 'keeper_sweep',
          intent: {
            actorId,
            type: 'attack_space',
            target: interception.contactPoint!,
            startedAt: state.time,
            expiresAt: state.time + Math.max(0.5, interception.arrivalTime ?? 1),
          },
        },
      ];
    } else if (
      !state.pendingReceptionIntent &&
      (incoming.relevant || mandatoryShot) &&
      roleProfile !== 'goalkeeper'
    ) {
      kind = 'incoming_ball';
      const target = state.ball.target ?? actor.position;
      options = [
        {
          id: 'control',
          kind: 'action',
          labelKey: 'control_ball',
          action: { type: 'hold', actorId },
        },
        {
          id: 'first-touch',
          kind: 'action',
          labelKey: 'first_touch_into_space',
          action: {
            type: 'carry',
            actorId,
            movementMode: 'carry',
            target: clampPitchPoint({
              x: target.x + attackDirection(actor.team) * 6,
              y: target.y,
            }),
          },
        },
      ];
      options.push(
        ...enumerateCanonicalShootingOptions(state, actorId).map((action, index) => ({
          id: `first-time-shot-${index}`,
          kind: 'action' as const,
          labelKey: actionLabel(action),
          action,
        })),
      );
      options.push(
        ...enumerateFirstTimePasses(state, actorId).map((action, index) => ({
          id: `first-time-pass-${index}`,
          kind: 'action' as const,
          labelKey: 'first_time_pass',
          action,
        })),
      );
    } else if (interception.viable && roleProfile !== 'goalkeeper') {
      const commitment = evaluateDefensiveCommitment(
        state,
        actorId,
        interception.contactPoint!,
        'intercept',
      );
      if (interception.ownerId !== actorId || !commitment.meaningful)
        return blocked('routine', {
          ...context,
          opportunityKind: 'defensive_response',
          ownershipReason:
            interception.ownerId !== actorId ? interception.ownershipReason : commitment.reason,
          semanticFamilies: ['hold_shape'],
          semanticChoiceCount: 1,
          signature: signatureFor(state, 'defensive_response'),
        });
      context.ownershipReason = commitment.reason;
      kind = 'defensive_response';
      options = [
        {
          id: 'hold-line',
          kind: 'movement',
          labelKey: 'hold_line',
          intent: {
            actorId,
            type: 'hold_shape',
            target: actor.position,
            startedAt: state.time,
            expiresAt: state.time + 1.5,
          },
        },
        {
          id: 'intercept',
          kind: 'movement',
          labelKey: 'intercept',
          intent: {
            actorId,
            type: 'attack_space',
            target: interception.contactPoint!,
            startedAt: state.time,
            expiresAt: state.time + (interception.arrivalTime ?? 1),
          },
        },
      ];
    }
  } else if (state.ball.ownerId !== actorId) {
    const carrier = state.players.find((player) => player.id === state.ball.ownerId);
    const ownerTeam = carrier?.team;
    if (ownerTeam !== actor.team) {
      const metres = carrier ? distance(actor.position, carrier.position) : Infinity;
      const role = roleProfile;
      const ownGoal = { x: actor.team === 'home' ? 0 : 105, y: 34 };
      const keeperThreat =
        role === 'goalkeeper' &&
        Boolean(
          carrier &&
            distance(carrier.position, ownGoal) < 27 &&
            arbitrateGoalkeeperClaim(state, actor, carrier.position).meaningfulChoice,
        );
      const threshold = keeperThreat
        ? 32
        : role === 'defender'
          ? 13
          : role === 'midfielder'
            ? 9
            : role === 'forward'
              ? 5.5
              : 0;
      if (carrier && metres <= (keeperThreat ? threshold : Math.min(threshold, 4.5))) {
        const commitment = evaluateDefensiveCommitment(
          state,
          actorId,
          carrier.position,
          'challenge',
        );
        if (!keeperThreat && !commitment.meaningful)
          return blocked('routine', {
            ...context,
            opportunityKind: 'defensive_response',
            ownershipReason: commitment.reason,
            semanticFamilies: ['contain'],
            semanticChoiceCount: 1,
            signature: signatureFor(state, 'defensive_response'),
          });
        context.ownershipReason = keeperThreat
          ? 'goalkeeper_breakaway_commitment'
          : commitment.reason;
        kind = keeperThreat ? 'goalkeeper_response' : 'defensive_response';
        options = [
          {
            id: 'contain',
            kind: 'movement',
            labelKey: keeperThreat ? 'keeper_hold_position' : 'contain',
            intent: {
              actorId,
              type: 'hold_shape',
              target: actor.position,
              startedAt: state.time,
              expiresAt: state.time + 2,
            },
          },
          {
            id: 'challenge',
            kind: 'movement',
            labelKey: keeperThreat ? 'keeper_close_angle' : 'challenge',
            intent: {
              actorId,
              type: 'attack_space',
              target: carrier.position,
              startedAt: state.time,
              expiresAt: state.time + 1.5,
            },
          },
        ];
        if (!keeperThreat)
          options = [
            options[0]!,
            ...enumerateDefensiveChallengeActions(state, actorId).map((action) => ({
              id: `challenge:${action.technique}`,
              kind: 'action' as const,
              labelKey:
                action.technique === 'slide'
                  ? 'slide_tackle'
                  : action.technique === 'tactical'
                    ? 'tactical_foul'
                    : action.technique === 'committed'
                      ? 'aggressive_challenge'
                      : 'normal_challenge',
              action,
            })),
          ];
      }
    }
  }
  if (!kind) {
    const relationship = deriveControlledBallRelationship(state, actorId);
    if (state.ball.ownerId === actorId) {
      context.opportunityKind = 'on_ball';
      context.ownershipReason = 'routine_possession_recycling';
    }
    return blocked(
      state.ball.ownerId === actorId
        ? 'routine'
        : relationship === 'intended_receiver' || relationship === 'friendly_possible_receiver'
          ? 'friendly_ball'
          : 'not_relevant',
      context,
    );
  }
  if (!options.length) return blocked('no_options', context);
  context.semanticFamilies = [
    ...new Set(options.map((option) => derivePlayerChoiceFamily(option, kind))),
  ];
  // A pause must expose a genuine choice. Single low-value prompts remain autonomous.
  if (!mandatoryShot && countSemanticPlayerChoices(options, kind) < 2)
    return blocked('single_option_autonomy', {
      ...context,
      opportunityKind: kind,
      semanticChoiceCount: countSemanticPlayerChoices(options, kind),
    });
  const signature = `${signatureFor(state, kind)}${redecisionReason ? `:${redecisionReason}` : ''}`;
  const postActionCheckpoint =
    kind === 'on_ball' && state.postActionAgencyCheckpoint?.actorId === actorId;
  if (
    !mandatoryShot &&
    !postActionCheckpoint &&
    !redecisionReason &&
    gate.lastSituationSignature === signature
  )
    return blocked('same_situation', { ...context, signature });
  const newPossessionEpisode =
    kind === 'on_ball' && (state.ballOwnershipStartedAt ?? -1) >= (gate.lastResolvedAt ?? Infinity);
  const shootingCategory =
    kind === 'on_ball' ? evaluateShootingOpportunity(state, actor).category : undefined;
  const credibleOwnershipShot =
    shootingCategory === 'credible' || shootingCategory === 'high_value';
  const absoluteOwnershipRequired =
    kind === 'on_ball' &&
    options.some(
      (option) =>
        option.kind === 'action' &&
        ((option.action.type === 'shot' && credibleOwnershipShot) ||
          option.action.type === 'cross'),
    );
  if (
    !newPossessionEpisode &&
    !postActionCheckpoint &&
    !redecisionReason &&
    !absoluteOwnershipRequired &&
    !mandatoryShot &&
    gate.lastResolvedAt !== undefined &&
    state.time - gate.lastResolvedAt < 1.5
  )
    return blocked('cooldown', { ...context, signature });
  const opportunity = playerDecisionOpportunitySchema.parse({
    id: `${actorId}:${state.decisionIndex}:${signature}`,
    actorId,
    openedAt: state.time,
    kind,
    triggerReason: mandatoryShot
      ? 'human_shot_selection_required'
      : kind === 'restart'
        ? `restart_${state.scenario}`
        : kind === 'on_ball'
          ? redecisionReason || onBallRelevance().reasons.join(',') || situation.reasons[0]
          : kind === 'incoming_ball'
            ? projectIncomingPlayerInvolvement(state, actorId).reasons.join(',')
            : (context.ownershipReason ?? situation.reasons[0]),
    signature,
    situation,
    options,
  });
  // Ownership is decided after actual legal UI target enumeration, independent of viewing policy.
  const targets = projectSelectableInteractionTargets(state, opportunity);
  // Action options already came from the canonical legality enumerator. Avoid repeating its
  // expensive pass/trajectory work for every possible UI target at every canonical tick.
  const contextual = ['defensive_response', 'goalkeeper_response', 'loose_ball'].includes(kind);
  const choices = contextual
    ? new Set(
        targets
          .flatMap((target) => projectContextualInteractions(state, opportunity, target))
          .map((interaction) => {
            const r = interaction.resolution;
            return r.kind === 'defensive'
              ? `${r.intent.type}:${r.intent.commitment}`
              : r.kind === 'movement'
                ? `${r.intent.type}:${r.intent.target.x.toFixed(1)}:${r.intent.target.y.toFixed(1)}`
                : r.action.type === 'challenge'
                  ? `challenge:${r.action.technique}`
                  : r.action.type;
          }),
      ).size
    : countSemanticPlayerChoices(options, kind);
  if (!mandatoryShot && choices < 2)
    return blocked(choices === 1 ? 'single_option_autonomy' : 'no_contextual_interactions', {
      ...context,
      opportunityKind: kind,
      signature,
      semanticChoiceCount: choices,
    });
  if (!projectSelectableInteractionTargets(state, opportunity).length)
    return blocked('no_contextual_interactions', { ...context, opportunityKind: kind, signature });
  if (contextual)
    context.semanticFamilies = [
      ...new Set(
        targets
          .flatMap((target) => projectContextualInteractions(state, opportunity, target))
          .map((interaction): PlayerChoiceFamily => {
            const r = interaction.resolution;
            return r.kind === 'defensive'
              ? r.intent.type === 'contain'
                ? 'contain'
                : r.intent.commitment === 'aggressive'
                  ? 'aggressive_challenge'
                  : 'challenge'
              : r.kind === 'action'
                ? derivePlayerChoiceFamily(
                    {
                      id: interaction.id,
                      kind: 'action',
                      labelKey: interaction.labelKey,
                      action: r.action,
                    },
                    kind,
                  )
                : interaction.labelKey.includes('intercept')
                  ? 'intercept'
                  : interaction.labelKey.includes('claim') || interaction.labelKey.includes('sweep')
                    ? 'goalkeeper_claim'
                    : 'hold_shape';
          }),
      ),
    ];
  return {
    opportunity,
    probe: playerDecisionProbeSchema.parse({
      actorId,
      candidate: true,
      semanticChoiceCount: choices,
      opportunityKind: kind,
      signature,
      ...context,
    }),
  };
};

export const projectPlayerDecisionProbe = (state: TacticalMatchState, gate?: PlayerDecisionGate) =>
  projectPlayerAgency(state, gate).probe;

/** Pure, RNG-free projection. The gate is supplied explicitly; evaluator history stays outside it. */
export const projectPlayerDecisionOpportunity = (
  state: TacticalMatchState,
  gate?: PlayerDecisionGate,
): PlayerDecisionOpportunity | undefined => {
  return projectPlayerAgency(state, gate).opportunity;
};

/** Identity alone never reserves football actions. Only an exact meaningful opportunity does. */
export const hasPendingPlayerDecision = (state: TacticalMatchState, actorId: string): boolean =>
  state.playerAgencyEnabled !== false &&
  actorId === state.controlledFootballerId &&
  Boolean(projectPlayerDecisionOpportunity(state));

export const applyPlayerDecision = (
  state: TacticalMatchState,
  opportunity: PlayerDecisionOpportunity,
  optionId: string,
) => {
  if (
    state.status === 'abandoned' ||
    state.status === 'full_time' ||
    state.status === 'half_time' ||
    state.playerAgencyEnabled === false ||
    opportunity.actorId !== state.controlledFootballerId ||
    opportunity.openedAt !== state.time ||
    !state.players.some((player) => player.id === opportunity.actorId)
  )
    return state;
  if (
    state.playerDecisionGate?.lastSituationSignature === opportunity.signature &&
    opportunity.triggerReason !== 'human_shot_selection_required'
  )
    return state;
  const option = opportunity.options.find((candidate) => candidate.id === optionId);
  if (!option) return state;
  if (option.kind === 'action' && !hasActiveMatchActionParticipants(state, option.action))
    return state;
  const gated = {
    ...state,
    pendingPlayerDecision: createPendingOutcome(state, opportunity, option),
    playerDecisionGate: {
      lastSituationSignature: opportunity.signature,
      lastResolvedAt: state.time,
    },
  };
  if (opportunity.kind === 'incoming_ball' && option.kind === 'action') {
    return {
      ...gated,
      pendingReceptionIntent: {
        actorId: opportunity.actorId,
        action: option.action,
        actionSource: 'human_selected' as const,
        createdAt: state.time,
        expiresAt:
          state.time +
          Math.max(
            2,
            (projectIncomingPlayerInvolvement(state, opportunity.actorId).arrivalTime ?? 0) + 0.8,
          ),
        ballEpisode: incomingBallIntentKey(state),
        ...(state.ball.sourceAction ? { sourceAction: state.ball.sourceAction } : {}),
      },
    };
  }
  return option.kind === 'action'
    ? resolveMatchAction(gated, option.action, 'human_selected')
    : { ...gated, playerMovementIntent: option.intent };
};

export const createPendingOutcome = (
  state: TacticalMatchState,
  opportunity: PlayerDecisionOpportunity,
  selection: {
    id: string;
    action?: MatchAction;
    intent?: { type: string };
    target?: unknown;
    resolution?: { kind: string; action?: MatchAction; intent?: { type: string } };
  },
) => {
  const actor = state.players.find((player) => player.id === opportunity.actorId)!;
  const action = selection.action ?? selection.resolution?.action;
  const intent = action
    ? action.type === 'pass' ||
      action.type === 'shot' ||
      action.type === 'cross' ||
      action.type === 'header'
      ? `${action.type}:${action.intent}`
      : action.type === 'challenge'
        ? `challenge:${action.technique}`
        : action.type
    : selection.intent
      ? selection.intent.type
      : (selection.resolution?.intent?.type ?? selection.id);
  return {
    decisionId: opportunity.id,
    actorId: opportunity.actorId,
    selectedAt: state.time,
    decisionKind: opportunity.kind,
    selectedIntent: intent,
    ...(selection.target !== undefined ? { selectedTarget: selection.target } : {}),
    startContext: {
      phase: state.teams[actor.team].phase,
      pressure: state.currentPressure,
      fieldProgress: fieldValue(actor.position, actor.team) / 100,
      possession: state.possessionTeam,
    },
  };
};
export const letAiDecide = (state: TacticalMatchState, opportunity: PlayerDecisionOpportunity) =>
  resolveDevPlayerDecision(state, opportunity).state;

/** Explicit DEV delegation only. Presentation sensitivity never calls this resolver. */
export const resolveDevPlayerDecision = (
  state: TacticalMatchState,
  opportunity: PlayerDecisionOpportunity,
): ProxyResolutionResult => {
  if (
    state.status === 'abandoned' ||
    state.status === 'half_time' ||
    state.status === 'full_time' ||
    state.playerAgencyEnabled === false ||
    opportunity.actorId !== state.controlledFootballerId ||
    opportunity.openedAt !== state.time ||
    (state.playerDecisionGate?.lastSituationSignature === opportunity.signature &&
      opportunity.triggerReason !== 'human_shot_selection_required') ||
    !state.players.some((player) => player.id === opportunity.actorId)
  )
    return {
      state,
      status: 'terminal_or_no_longer_relevant',
      opportunityKind: opportunity.kind,
      reason: 'opportunity_no_longer_matches_authoritative_state',
    };
  const gated = {
    ...state,
    playerDecisionGate: {
      lastSituationSignature: opportunity.signature,
      lastResolvedAt: state.time,
    },
  };
  if (opportunity.kind === 'on_ball') {
    const action = chooseNpcAction(state, opportunity.actorId);
    if (action && isShotAction(action))
      return {
        state,
        status: 'no_legal_action',
        opportunityKind: opportunity.kind,
        reason: 'human_shot_selection_required',
      };
    return action
      ? {
          state: resolveMatchAction(gated, action, 'dev_ai_selected'),
          status: 'resolved_action',
          opportunityKind: opportunity.kind,
          reason: 'normal_npc_action_ranking',
        }
      : {
          state: gated,
          status: 'no_legal_action',
          opportunityKind: opportunity.kind,
          reason: 'normal_npc_ranking_returned_no_action',
        };
  }

  // Restarts commit the same deterministic fallback selected for an autonomous restart. That
  // resolver draws from the exact canonical restart enumeration, avoiding a background-only AI.
  if (opportunity.kind === 'restart') {
    const action = chooseRestartAction(state);
    if (action && isShotAction(action))
      return {
        state,
        status: 'no_legal_action',
        opportunityKind: opportunity.kind,
        reason: 'human_shot_selection_required',
      };
    const selected = opportunity.options.find(
      (option) =>
        option.kind === 'action' && JSON.stringify(option.action) === JSON.stringify(action),
    );
    return action
      ? {
          state: resolveMatchAction(gated, action, 'dev_ai_selected'),
          status: 'resolved_action',
          opportunityKind: opportunity.kind,
          ...(selected ? { selectedOptionId: selected.id } : {}),
          reason: 'canonical_restart_action_ranking',
        }
      : {
          state: gated,
          status: 'no_legal_action',
          opportunityKind: opportunity.kind,
          reason: 'restart_enumerator_returned_no_legal_action',
        };
  }

  // These nodes are optional interventions over systems which already run every fixed tick:
  // reception, locomotion, defensive/GK positioning and the physical loose-ball race. Clearing
  // the pause gate deliberately delegates to those systems; it never awards possession.
  return {
    state: gated,
    status: 'delegated_to_canonical_autonomy',
    opportunityKind: opportunity.kind,
    reason: `canonical_${opportunity.kind}_resolver_owns_next_tick`,
  };
};
