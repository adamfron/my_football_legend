import { z } from 'zod';
import { RandomGenerator } from '../random/RandomGenerator';
import {
  clampPitchPoint,
  distance,
  pitchPointSchema,
  physicalPointSchema,
  teamSideSchema,
  type TeamSide,
} from './matchSpace';
import type { ActionSource, MatchAction, TacticalMatchState } from './matchState';
import { angleForVector, normalizeAngle } from './playerOrientation';

export const defensiveTechniqueSchema = z.enum(['standing', 'committed', 'slide', 'tactical']);
export type DefensiveTechnique = z.infer<typeof defensiveTechniqueSchema>;
export const defensiveChallengeSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  opponentId: z.string(),
  technique: defensiveTechniqueSchema,
  source: z.enum([
    'human_selected',
    'dev_ai_selected',
    'restart_liveness_watchdog',
    'autonomous_routine',
    'autonomous_npc',
  ]),
  startedAt: z.number().nonnegative(),
  expiresAt: z.number().nonnegative(),
  target: pitchPointSchema,
});
export type DefensiveChallenge = z.infer<typeof defensiveChallengeSchema>;
export const defensiveEpisodeSchema = z.object({
  participants: z.tuple([z.string(), z.string()]),
  ballEpisode: z.number().int().nonnegative(),
  resolvedAt: z.number().nonnegative(),
  position: pitchPointSchema,
});
export type DefensiveEpisode = z.infer<typeof defensiveEpisodeSchema>;
export const challengeDiagnosticSchema = z.object({
  id: z.string(),
  at: z.number().nonnegative(),
  actorId: z.string(),
  team: teamSideSchema,
  opponentId: z.string(),
  technique: defensiveTechniqueSchema,
  source: defensiveChallengeSchema.shape.source,
  position: pitchPointSchema,
  outcome: z.enum(['clean_win', 'loose_ball', 'missed', 'foul', 'beaten']),
  ballFirst: z.boolean(),
  opponentContact: z.boolean(),
  ballDistance: z.number().nonnegative(),
  opponentDistance: z.number().nonnegative(),
  facingError: z.number().nonnegative(),
  relativeSpeed: z.number().nonnegative(),
  lateness: z.number().nonnegative(),
  force: z.number().nonnegative(),
  fromBehind: z.boolean(),
});
export type ChallengeDiagnostic = z.infer<typeof challengeDiagnosticSchema>;
const counter = z.number().int().nonnegative();
export const defensiveCountersSchema = z.object({
  opportunities: counter,
  attempted: counter,
  missed: counter,
  beaten: counter,
  cleanWins: counter,
  looseBalls: counter,
  fouls: counter,
  yellowCards: counter,
  redCards: counter,
  secondYellowDismissals: counter,
  straightReds: counter,
  penalties: counter,
  advantageRecalled: counter,
  highRiskIntents: counter,
  slides: counter,
  tacticalIntents: counter,
  advantagePlayed: counter,
});
export type DefensiveCounters = z.infer<typeof defensiveCountersSchema>;
export const defensiveTelemetrySchema = defensiveCountersSchema.extend({
  byPlayer: z.record(z.string(), defensiveCountersSchema),
});
export const createDefensiveCounters = (): DefensiveCounters => ({
  opportunities: 0,
  attempted: 0,
  missed: 0,
  beaten: 0,
  cleanWins: 0,
  looseBalls: 0,
  fouls: 0,
  yellowCards: 0,
  redCards: 0,
  secondYellowDismissals: 0,
  straightReds: 0,
  penalties: 0,
  advantageRecalled: 0,
  highRiskIntents: 0,
  slides: 0,
  tacticalIntents: 0,
  advantagePlayed: 0,
});
/** Fixed-size totals plus at most the match roster's identities; no historical arrays. */
export const countDefensiveEvent = (
  state: TacticalMatchState,
  actorId: string,
  field: keyof DefensiveCounters,
): TacticalMatchState => {
  const previous = state.defensiveTelemetry ?? { ...createDefensiveCounters(), byPlayer: {} };
  const player = previous.byPlayer[actorId] ?? createDefensiveCounters();
  return {
    ...state,
    defensiveTelemetry: {
      ...previous,
      [field]: previous[field] + 1,
      byPlayer: { ...previous.byPlayer, [actorId]: { ...player, [field]: player[field] + 1 } },
    },
  };
};

export const deriveDefensiveContext = (
  state: TacticalMatchState,
  actorId: string,
  opponentId?: string,
) => {
  const actor = state.players.find((p) => p.id === actorId);
  const opponent = state.players.find((p) => p.id === (opponentId ?? state.ball.ownerId));
  if (
    !actor ||
    !opponent ||
    actor.team === opponent.team ||
    state.restart?.phase === 'setup' ||
    state.status === 'abandoned' ||
    state.status === 'full_time' ||
    state.status === 'half_time' ||
    state.discipline?.[actor.id]?.sentOff ||
    state.discipline?.[opponent.id]?.sentOff
  )
    return;
  const opponentDistance = distance(actor.position, opponent.position);
  const ballDistance = distance(actor.position, state.ball);
  const facingError = Math.abs(
    normalizeAngle(
      angleForVector({ x: state.ball.x - actor.position.x, y: state.ball.y - actor.position.y }) -
        actor.facingAngle,
    ),
  );
  const relativeSpeed = Math.hypot(
    actor.velocity.x - opponent.velocity.x,
    actor.velocity.y - opponent.velocity.y,
  );
  const attackDirection = opponent.team === 'home' ? 1 : -1;
  const progress = opponent.team === 'home' ? opponent.position.x : 105 - opponent.position.x;
  const covering = state.players.filter(
    (p) =>
      p.team === actor.team &&
      p.id !== actor.id &&
      p.profile.primaryPosition !== 'goalkeeper' &&
      attackDirection * (p.position.x - opponent.position.x) > 0 &&
      Math.abs(p.position.y - opponent.position.y) < 12 &&
      distance(p.position, opponent.position) < 22,
  ).length;
  const advancing = opponent.velocity.x * attackDirection > 1.2;
  const promisingAttack =
    progress >= 60 &&
    Math.abs(opponent.position.y - 34) <= 23 &&
    (advancing || state.teams[opponent.team].phase === 'attacking_transition');
  const danger = progress >= 71 && covering <= 1;
  const dogso =
    progress >= 78 &&
    Math.abs(opponent.position.y - 34) <= 14 &&
    covering === 0 &&
    (advancing || progress >= 88);
  return {
    actor,
    opponent,
    opponentDistance,
    ballDistance,
    facingError,
    relativeSpeed,
    promisingAttack,
    danger,
    dogso,
    covering,
  };
};

const shouldCommitPressInContext = (
  state: TacticalMatchState,
  c: NonNullable<ReturnType<typeof deriveDefensiveContext>>,
  cooperativePress?: CooperativePress | null,
): boolean => {
  const explicit = state.playerMovementIntent;
  if (
    state.defensiveChallenge?.actorId === c.actor.id ||
    (explicit?.actorId === c.actor.id &&
      explicit.expiresAt > state.time &&
      explicit.type === 'attack_space')
  )
    return true;
  const progress = c.opponent.team === 'home' ? c.opponent.position.x : 105 - c.opponent.position.x;
  const nearGoal = progress >= 78 && Math.abs(c.opponent.position.y - 34) <= 18;
  if (c.covering < 2 || c.danger || c.promisingAttack || nearGoal) return true;
  const carry = state.ballCarrierIntent;
  if (carry?.actorId === c.opponent.id && carry.expiresAt > state.time) return true;
  // Finishing a chosen scan/shield invites pressure: containing an uncommitted
  // reception must not let an explicitly waiting owner stand unchallenged forever.
  if (
    state.currentAction?.type === 'hold' &&
    state.currentAction.actorId === c.opponent.id &&
    state.actionCooldown <= 0
  )
    return true;
  const preparation = state.onBallPreparation;
  const unstableControl =
    distance(c.opponent.position, state.ball) > 1.45 ||
    (preparation?.actorId === c.opponent.id &&
      preparation.readyAt > state.time &&
      preparation.receptionKind === 'heavy_touch');
  if (unstableControl) return true;
  // A structurally vetted partner is already a chosen press, even while the first
  // defender contains. Contact still requires the ordinary comfortable window.
  if (cooperativePress?.secondaryId === c.actor.id) return true;
  const booked =
    (state.discipline?.[c.actor.id]?.yellowCards ?? 0) > 0 ||
    state.pendingCards?.some((foul) => foul.actorId === c.actor.id && foul.card !== 'none');
  const a = c.actor.profile.attributes;
  return !booked && a.aggression >= 75 && (a.gameReading + a.positioning) / 2 >= 70;
};

/** Ordinary covered circulation is jockeyed; threats, exposed control and chosen presses close down. */
export const shouldCommitRoutinePress = (
  state: TacticalMatchState,
  actorId: string,
  cooperativePress?: CooperativePress | null,
): boolean => {
  const c = deriveDefensiveContext(state, actorId);
  return c
    ? shouldCommitPressInContext(
        state,
        c,
        cooperativePress === undefined
          ? deriveCooperativePress(state, c.actor.team)
          : cooperativePress,
      )
    : false;
};

export const cooperativePressSchema = z.object({
  primaryId: z.string(),
  secondaryId: z.string(),
  target: pitchPointSchema,
  coverIds: z.array(z.string()).max(22),
  safetyScore: z.number().min(0).max(1),
});
export type CooperativePress = z.infer<typeof cooperativePressSchema>;
export const COOPERATIVE_PRESS_TUNING = {
  engagingDistance: 3.6,
  supportDistance: 11,
  slowCarrierSpeed: 2.4,
  inheritedMarkDistance: 8,
  goalCoverDistance: 28,
  advancedThreatProgress: 71,
  adaptiveDoublePressThreshold: 0.25,
} as const;

/** A second body is recruited by ball/coverage geometry, never by a shielding timer.
 * availability is the neutral hook for future stamina and fatigue. */
export const deriveCooperativePress = (
  state: TacticalMatchState,
  side: TeamSide,
  availability: (playerId: string) => number = () => 1,
): CooperativePress | undefined => {
  if (state.restart?.phase === 'setup' || !state.ball.ownerId) return;
  const carrier = state.players.find((player) => player.id === state.ball.ownerId);
  if (!carrier || carrier.team === side) return;
  const shield =
    (state.ballCarrierIntent?.actorId === carrier.id &&
      (state.ballCarrierIntent.executionMode === 'shield' ||
        state.ballCarrierIntent.movementMode === 'retain')) ||
    (state.currentAction?.actorId === carrier.id && state.currentAction.type === 'hold') ||
    (state.humanPossessionEpisode?.actorId === carrier.id &&
      state.humanPossessionEpisode.intent === 'retain');
  const confined = carrier.position.y < 6 || carrier.position.y > 62;
  const slow =
    Math.hypot(carrier.velocity.x, carrier.velocity.y) <= COOPERATIVE_PRESS_TUNING.slowCarrierSpeed;
  const progress = carrier.team === 'home' ? carrier.position.x : 105 - carrier.position.x;
  const willingness = state.teams[side].threatMemory?.response.doublePress ?? 0.15;
  // An ordinary covered reception remains a scan. Slow control recruits a partner
  // only for an advanced threat or a channel the team has learned to double press.
  if (
    !shield &&
    !confined &&
    (!slow ||
      (progress < COOPERATIVE_PRESS_TUNING.advancedThreatProgress &&
        willingness <= COOPERATIVE_PRESS_TUNING.adaptiveDoublePressThreshold))
  )
    return;
  const defenders = state.players
    .filter(
      (player) =>
        player.team === side &&
        player.profile.primaryPosition !== 'goalkeeper' &&
        !state.discipline?.[player.id]?.sentOff,
    )
    .sort(
      (a, b) =>
        distance(a.position, carrier.position) - distance(b.position, carrier.position) ||
        a.id.localeCompare(b.id),
    );
  const primary =
    state.defensiveChallenge?.opponentId === carrier.id
      ? defenders.find((player) => player.id === state.defensiveChallenge?.actorId)
      : defenders
          .filter(
            (player) =>
              distance(player.position, carrier.position) <=
              COOPERATIVE_PRESS_TUNING.engagingDistance,
          )
          .sort((a, b) => {
            // Keep the goal-side screen primary as its partner passes closer to the ball.
            // Nearest-body reassignment would send the arriving partner back to containment.
            const dir = carrier.team === 'home' ? 1 : -1;
            const screenScore = (player: typeof a) =>
              dir * (player.position.x - carrier.position.x) -
              Math.abs(player.position.y - carrier.position.y) * 0.5;
            return screenScore(b) - screenScore(a) || a.id.localeCompare(b.id);
          })[0];
  if (
    !primary ||
    distance(primary.position, carrier.position) > COOPERATIVE_PRESS_TUNING.engagingDistance
  )
    return;
  const attackDirection = carrier.team === 'home' ? 1 : -1;
  const toGoal = {
    x: (carrier.team === 'home' ? 105 : 0) - carrier.position.x,
    y: 34 - carrier.position.y,
  };
  const goalDistance = Math.max(0.001, Math.hypot(toGoal.x, toGoal.y));
  for (const candidate of defenders) {
    if (
      candidate.id === primary.id ||
      isDefensiveEpisodeLocked(state, candidate.id, carrier.id) ||
      availability(candidate.id) < 0.5 ||
      distance(candidate.position, carrier.position) >
        COOPERATIVE_PRESS_TUNING.supportDistance + willingness * 2 ||
      (state.playerMovementIntent?.actorId === candidate.id &&
        state.playerMovementIntent.expiresAt > state.time)
    )
      continue;
    const remaining = defenders.filter(
      (player) => player.id !== primary.id && player.id !== candidate.id,
    );
    const goalCover = remaining.filter(
      (player) =>
        ((player.position.x - carrier.position.x) * toGoal.x +
          (player.position.y - carrier.position.y) * toGoal.y) /
          goalDistance >
          2 &&
        Math.abs(player.position.y - 34) < 20 &&
        distance(player.position, carrier.position) < COOPERATIVE_PRESS_TUNING.goalCoverDistance,
    );
    // Even a trapped carrier may release centrally. Keep an outfield screen behind the duel.
    if (progress > 45 && goalCover.length === 0) continue;
    const exposedReceiver = state.players.some((receiver) => {
      if (
        receiver.team !== carrier.team ||
        receiver.id === carrier.id ||
        receiver.profile.primaryPosition === 'goalkeeper' ||
        state.discipline?.[receiver.id]?.sentOff ||
        distance(receiver.position, carrier.position) > 30 ||
        Math.abs(receiver.position.y - 34) > 23 ||
        attackDirection * (receiver.position.x - carrier.position.x) < -5
      )
        return false;
      const assignedDistance = distance(candidate.position, receiver.position);
      if (assignedDistance > 10) return false;
      const inheritedDistance = Math.min(
        ...remaining.map((player) => distance(player.position, receiver.position)),
      );
      return (
        inheritedDistance > COOPERATIVE_PRESS_TUNING.inheritedMarkDistance ||
        inheritedDistance > assignedDistance + 3
      );
    });
    if (exposedReceiver) continue;
    const fromPrimary = {
      x: carrier.position.x - primary.position.x,
      y: carrier.position.y - primary.position.y,
    };
    const primaryDistance = Math.max(0.001, Math.hypot(fromPrimary.x, fromPrimary.y));
    const protectedDirection = {
      x: fromPrimary.x / primaryDistance,
      y: fromPrimary.y / primaryDistance,
    };
    const shoulder = { x: -protectedDirection.y, y: protectedDirection.x };
    const shoulderSide =
      Math.sign(
        (candidate.position.x - carrier.position.x) * shoulder.x +
          (candidate.position.y - carrier.position.y) * shoulder.y,
      ) || 1;
    // Approach the exposed ball shoulder rather than escorting the same goal-side lane.
    // A short orbit waypoint takes a rear approach around the body before closing contact.
    const desired = {
      x: protectedDirection.x * 1.05 + shoulder.x * shoulderSide * 0.1,
      y: protectedDirection.y * 1.05 + shoulder.y * shoulderSide * 0.1,
    };
    const desiredAngle = Math.atan2(desired.y, desired.x);
    const currentAngle = Math.atan2(
      candidate.position.y - carrier.position.y,
      candidate.position.x - carrier.position.x,
    );
    const turn = normalizeAngle(desiredAngle - currentAngle);
    const orbiting = Math.abs(turn) > Math.PI / 3;
    const targetAngle = orbiting ? currentAngle + (Math.sign(turn) * Math.PI) / 3 : desiredAngle;
    const radius = orbiting ? 1.05 : Math.max(0.55, Math.hypot(desired.x, desired.y));
    return {
      primaryId: primary.id,
      secondaryId: candidate.id,
      target: clampPitchPoint({
        x: carrier.position.x + Math.cos(targetAngle) * radius,
        y: carrier.position.y + Math.sin(targetAngle) * radius,
      }),
      coverIds: goalCover.map((player) => player.id),
      safetyScore: Math.min(1, 0.55 + goalCover.length * 0.15 + (confined || shield ? 0.15 : 0)),
    };
  }
};

/** Close bodies still contesting one possession are one duel, even after a short timer ends. */
const episodeIsActive = (state: TacticalMatchState, episode: DefensiveEpisode): boolean => {
  if (state.restart?.phase === 'setup') return false;
  const [firstId, secondId] = episode.participants;
  const first = state.players.find((p) => p.id === firstId);
  const second = state.players.find((p) => p.id === secondId);
  if (!first || !second || distance(first.position, second.position) > 4.5) return false;
  if (distance(state.ball, episode.position) > 6) return false;
  const releasedAfterDuel =
    Boolean(state.ball.travelKind) ||
    (state.lastPassDiagnostic?.releasedAt ?? -1) > episode.resolvedAt ||
    ((state.ball.shot ?? state.lastShot)?.releasedAt ?? -1) > episode.resolvedAt;
  if (releasedAfterDuel) return false;
  // A win, ricochet or reclaim within the same close pair is one football contest. Merely
  // switching owner/episode cannot re-arm it; a release, third player or spatial exit can.
  if (state.ball.ownerId) return episode.participants.includes(state.ball.ownerId);
  return state.time - episode.resolvedAt < 1.4;
};

export const isDefensiveEpisodeLocked = (
  state: TacticalMatchState,
  actorId: string,
  opponentId: string,
): boolean =>
  Boolean(
    state.defensiveEpisodes?.some(
      (episode) =>
        episode.participants.includes(actorId) &&
        episode.participants.includes(opponentId) &&
        episodeIsActive(state, episode),
    ),
  );

/** Contextual physical availability shared by NPC ranking and target-first human interaction. */
export type DefensiveChallengeAction = Extract<MatchAction, { type: 'challenge' }>;
export const enumerateDefensiveChallengeActions = (
  state: TacticalMatchState,
  actorId: string,
): DefensiveChallengeAction[] => {
  const c = deriveDefensiveContext(state, actorId);
  if (
    !c ||
    state.ball.ownerId !== c.opponent.id ||
    c.opponentDistance > 4.5 ||
    (state.ball.height ?? 0) > 0.65 ||
    state.defensiveChallenge ||
    isDefensiveEpisodeLocked(state, actorId, c.opponent.id)
  )
    return [];
  const action = (technique: DefensiveTechnique): DefensiveChallengeAction => ({
    type: 'challenge',
    actorId,
    opponentId: c.opponent.id,
    technique,
  });
  const actions: DefensiveChallengeAction[] = [];
  if (c.ballDistance <= 2.4 && c.facingError <= Math.PI * 0.42 && c.relativeSpeed <= 8.5)
    actions.push(action('standing'));
  if (
    (c.danger || distance(c.actor.position, c.actor.anchor) >= 4.5) &&
    c.ballDistance <= 2.4 &&
    c.facingError <= Math.PI * 0.55
  )
    actions.push(action('committed'));
  if (
    c.danger &&
    c.ballDistance >= 0.8 &&
    c.ballDistance <= 3.2 &&
    c.facingError <= Math.PI * 0.42 &&
    c.relativeSpeed >= 1.2 &&
    c.relativeSpeed <= 11
  )
    actions.push(action('slide'));
  if (c.promisingAttack && c.covering <= 1 && c.opponentDistance <= 2.7)
    actions.push(action('tactical'));
  return actions;
};

export const beginDefensiveChallenge = (
  state: TacticalMatchState,
  action: MatchAction,
  source: ActionSource,
): TacticalMatchState => {
  if (action.type !== 'challenge' || state.defensiveChallenge) return state;
  const c = deriveDefensiveContext(state, action.actorId, action.opponentId);
  if (!c || c.opponentDistance > 4.5 || state.ball.ownerId !== c.opponent.id) return state;
  if (isDefensiveEpisodeLocked(state, action.actorId, action.opponentId)) return state;
  if (
    action.technique !== 'standing' &&
    !enumerateDefensiveChallengeActions(state, action.actorId).some(
      (candidate) =>
        candidate.technique === action.technique && candidate.opponentId === action.opponentId,
    )
  )
    return state;
  if (
    action.technique !== 'standing' &&
    action.actorId === state.controlledFootballerId &&
    source !== 'human_selected' &&
    source !== 'dev_ai_selected'
  )
    return state;
  if (
    state.recentDuel &&
    state.recentDuel.expiresAt > state.time &&
    state.recentDuel.participants.includes(action.actorId) &&
    state.recentDuel.participants.includes(action.opponentId)
  )
    return state;
  const challenge: DefensiveChallenge = {
    id: `${state.seed}:challenge:${state.time.toFixed(6)}:${action.actorId}:${action.opponentId}:${action.technique}`,
    actorId: action.actorId,
    opponentId: action.opponentId,
    technique: action.technique,
    source,
    startedAt: state.time,
    expiresAt: state.time + (action.technique === 'standing' ? 0.55 : 1.2),
    target: { ...state.ball },
  };
  let next: TacticalMatchState = {
    ...state,
    defensiveChallenge: challenge,
    latestAction: action,
    latestActionSource: source,
  };
  next = countDefensiveEvent(
    countDefensiveEvent(next, action.actorId, 'opportunities'),
    action.actorId,
    'attempted',
  );
  if (action.technique === 'slide') next = countDefensiveEvent(next, action.actorId, 'slides');
  if (action.technique === 'tactical')
    next = countDefensiveEvent(next, action.actorId, 'tacticalIntents');
  if (action.technique !== 'standing')
    next = countDefensiveEvent(next, action.actorId, 'highRiskIntents');
  return next;
};

/** NPC context/profile ranking selects an intent; contact and discipline still use the one resolver. */
export const chooseNpcDefensiveChallengeAction = (
  state: TacticalMatchState,
  actorId: string,
  cooperativePress?: CooperativePress | null,
): DefensiveChallengeAction | undefined => {
  const options = enumerateDefensiveChallengeActions(state, actorId);
  if (options.length === 0) return;
  const c = deriveDefensiveContext(state, actorId);
  if (
    !c ||
    !shouldCommitPressInContext(
      state,
      c,
      cooperativePress === undefined
        ? deriveCooperativePress(state, c.actor.team)
        : cooperativePress,
    )
  )
    return;
  const actor = c.actor;
  const forward = { x: Math.sin(c.opponent.facingAngle), y: Math.cos(c.opponent.facingAngle) };
  const rearApproach =
    ((actor.position.x - c.opponent.position.x) * forward.x +
      (actor.position.y - c.opponent.position.y) * forward.y) /
      Math.max(0.01, c.opponentDistance) <
    -0.45;
  const standing = options.find((action) => action.technique === 'standing');
  const defensiveControl =
    (actor.profile.attributes.tackling +
      actor.profile.attributes.positioning +
      actor.profile.attributes.gameReading) /
    300;
  // 0.95 m is the physical maximum of an explicitly committed poke. Routine defence waits
  // for a comfortable contact window: skill extends reliable reach, relative motion narrows it.
  const comfortableReach = Math.max(0.45, 0.55 + defensiveControl * 0.3 - c.relativeSpeed * 0.025);
  const comfortableStanding =
    !rearApproach && c.ballDistance <= comfortableReach ? standing : undefined;
  if (actorId === state.controlledFootballerId) {
    // Routine support can wait for clean ball access; serious commitment requires a choice.
    if (rearApproach || c.relativeSpeed > 4.5 || c.facingError > Math.PI * 0.3) return;
    return comfortableStanding;
  }
  const desperate =
    state.time >= 80 * 60 &&
    state.score[actor.team] < state.score[actor.team === 'home' ? 'away' : 'home'];
  const a = actor.profile.attributes;
  const booked =
    (state.discipline?.[actorId]?.yellowCards ?? 0) > 0 ||
    state.pendingCards?.some((foul) => foul.actorId === actorId && foul.card !== 'none');
  const riskAppetite =
    a.aggression * 0.5 +
    (100 - a.composure) * 0.12 +
    (a.tackling + a.positioning + a.gameReading) * 0.08 +
    (c.danger ? 12 : 0) +
    (desperate ? 8 : 0) -
    Math.min(3, c.covering) * 7 -
    (rearApproach ? 10 : 0) -
    (booked ? 28 : 0);
  // An individual/context threshold, never a quota or match-wide random foul budget.
  if (riskAppetite >= 72 && !c.dogso && !isDefendingPenaltyArea(actor.team, c.opponent.position)) {
    const tactical = options.find((action) => action.technique === 'tactical');
    if (tactical) return tactical;
  }
  const slide = options.find((action) => action.technique === 'slide');
  if (slide && riskAppetite >= 64 && a.tackling >= 65 && !rearApproach) return slide;
  const committed = options.find((action) => action.technique === 'committed');
  if (committed && riskAppetite >= 58 && a.tackling >= 50) return committed;
  return comfortableStanding;
};

const isDefendingPenaltyArea = (team: 'home' | 'away', point: { x: number; y: number }) =>
  point.y >= 13.84 && point.y <= 54.16 && (team === 'home' ? point.x <= 16.5 : point.x >= 88.5);

export const challengeResolutionSchema = z.object({
  state: z.custom<TacticalMatchState>(),
  diagnostic: challengeDiagnosticSchema.optional(),
  looseVelocity: physicalPointSchema.optional(),
});
export type ChallengeResolution = z.infer<typeof challengeResolutionSchema>;
/** Resolves a physical attempt once. The caller applies possession/loose ball via the existing lifecycle. */
export const resolveDefensiveChallenge = (state: TacticalMatchState): ChallengeResolution => {
  if (state.status === 'abandoned' || state.status === 'full_time' || state.status === 'half_time')
    return { state };
  const intent = state.defensiveChallenge;
  if (!intent) return { state };
  const c = deriveDefensiveContext(state, intent.actorId, intent.opponentId);
  if (!c) {
    const actor = state.players.find((p) => p.id === intent.actorId);
    const opponent = state.players.find((p) => p.id === intent.opponentId);
    const diagnostic: ChallengeDiagnostic = {
      id: intent.id,
      at: state.time,
      actorId: intent.actorId,
      team: actor?.team ?? state.discipline?.[intent.actorId]?.team ?? 'home',
      opponentId: intent.opponentId,
      technique: intent.technique,
      source: intent.source,
      position: opponent?.position ?? intent.target,
      outcome: 'missed',
      ballFirst: false,
      opponentContact: false,
      ballDistance: actor ? distance(actor.position, state.ball) : 0,
      opponentDistance: actor && opponent ? distance(actor.position, opponent.position) : 0,
      facingError: 0,
      relativeSpeed: 0,
      lateness: 0,
      force: 0,
      fromBehind: false,
    };
    const next = { ...state, lastChallenge: diagnostic };
    delete next.defensiveChallenge;
    return { state: countDefensiveEvent(next, intent.actorId, 'missed'), diagnostic };
  }
  const elapsed = state.time - intent.startedAt;
  const reach = intent.technique === 'slide' ? 1.9 : intent.technique === 'committed' ? 1.25 : 0.95;
  const minimumTime =
    intent.technique === 'standing' ? 0 : intent.technique === 'slide' ? 0.18 : 0.1;
  const aligned = c.facingError <= Math.PI * (intent.technique === 'tactical' ? 0.68 : 0.5);
  let opponentContact =
    c.opponentDistance <= (intent.technique === 'slide' ? 1.75 : 1.35) && aligned;
  const ballReachable = c.ballDistance <= reach && aligned && (state.ball.height ?? 0) < 0.5;
  if (elapsed < minimumTime || (!opponentContact && !ballReachable)) {
    if (state.time < intent.expiresAt) return { state };
  }
  const rng = RandomGenerator.fromSeed(intent.id);
  const skill =
    (c.actor.profile.attributes.tackling * 0.4 +
      c.actor.profile.attributes.gameReading * 0.25 +
      c.actor.profile.attributes.positioning * 0.25 +
      c.actor.profile.attributes.strength * 0.1) /
    100;
  const attackerSkill =
    (c.opponent.profile.attributes.dribbling * 0.4 +
      c.opponent.profile.attributes.technique * 0.25 +
      c.opponent.profile.attributes.agility * 0.2 +
      c.opponent.profile.attributes.composure * 0.15) /
    100;
  const execution = rng.float();
  const forward = { x: Math.sin(c.opponent.facingAngle), y: Math.cos(c.opponent.facingAngle) };
  const offset = {
    x: c.actor.position.x - c.opponent.position.x,
    y: c.actor.position.y - c.opponent.position.y,
  };
  const fromBehind =
    (offset.x * forward.x + offset.y * forward.y) / Math.max(0.01, c.opponentDistance) < -0.45;
  const lateness =
    Math.max(0, c.ballDistance - reach) +
    Math.max(0, c.facingError / Math.PI - 0.3) +
    Math.max(0, elapsed - 0.45) * 0.35;
  const commitment =
    intent.technique === 'standing'
      ? 0.15
      : intent.technique === 'committed'
        ? 0.65
        : intent.technique === 'slide'
          ? 0.9
          : 0.5;
  const force = c.relativeSpeed * commitment;
  const originalPossession = state.ball.ownerId === intent.opponentId;
  const ballFirst =
    ballReachable &&
    originalPossession &&
    !fromBehind &&
    c.ballDistance <= c.opponentDistance + 0.24 &&
    execution + skill * 0.65 - lateness * 0.35 > 0.2;
  const accidentalMistiming =
    execution < Math.max(0.008, (1 - skill) * 0.025 + c.relativeSpeed * 0.002 + lateness * 0.025);
  const controlledRoutine =
    c.actor.id === state.controlledFootballerId &&
    intent.source !== 'human_selected' &&
    intent.source !== 'dev_ai_selected';
  const routineWithdrawn =
    controlledRoutine &&
    (fromBehind ||
      !ballReachable ||
      c.relativeSpeed > 4.5 ||
      lateness > 0.3 ||
      accidentalMistiming);
  // A routine poke is withdrawn when the timing deteriorates. An explicitly selected tackle
  // retains its commitment and all normal foul/card consequences in this same resolver.
  if (routineWithdrawn) opponentContact = false;
  // A standing poke that fails to find the ball is often simply beaten. Mere proximity is
  // not an infringement; opponent-first contact needs a committed/impeding physical action.
  const impedingContact =
    intent.technique !== 'standing' ||
    (c.relativeSpeed > 3.5 && (fromBehind || lateness > 0.3)) ||
    lateness > 0.55;
  const illegalContact =
    opponentContact &&
    (intent.technique === 'tactical' ||
      (!ballFirst && impedingContact) ||
      (accidentalMistiming && ballReachable) ||
      force > 8.5);
  let outcome: ChallengeDiagnostic['outcome'] = 'missed';
  if (illegalContact) outcome = 'foul';
  else if (ballReachable && originalPossession && !routineWithdrawn && !ballFirst)
    outcome = 'beaten';
  else if (ballReachable && originalPossession && !routineWithdrawn) {
    const success =
      execution +
      Math.max(-0.42, Math.min(0.42, (skill - attackerSkill) * 0.85)) +
      (1 - c.facingError / Math.PI) * 0.08 -
      Math.max(
        0,
        c.opponent.velocity.x * (c.opponent.team === 'home' ? 1 : -1) -
          c.actor.profile.attributes.pace / 18,
      ) *
        0.04 +
      Math.min(
        2,
        state.players.filter(
          (p) =>
            p.team === c.actor.team &&
            p.id !== c.actor.id &&
            distance(p.position, c.opponent.position) < 4.2,
        ).length,
      ) *
        0.035 -
      (state.ballCarrierIntent?.executionMode === 'shield' ? 0.16 : 0);
    outcome = success > 0.58 ? 'clean_win' : success > 0.42 ? 'loose_ball' : 'beaten';
  }
  const diagnostic: ChallengeDiagnostic = {
    id: intent.id,
    at: state.time,
    actorId: c.actor.id,
    team: c.actor.team,
    opponentId: c.opponent.id,
    technique: intent.technique,
    source: intent.source,
    position: { ...c.opponent.position },
    outcome,
    ballFirst,
    opponentContact,
    ballDistance: c.ballDistance,
    opponentDistance: c.opponentDistance,
    facingError: c.facingError,
    relativeSpeed: c.relativeSpeed,
    lateness,
    force,
    fromBehind,
  };
  let next: TacticalMatchState = {
    ...state,
    lastChallenge: diagnostic,
    defensiveEpisodes: [
      ...(state.defensiveEpisodes ?? []).filter((episode) => episodeIsActive(state, episode)),
      {
        participants: [c.actor.id, c.opponent.id].sort() as [string, string],
        resolvedAt: state.time,
        ballEpisode: state.ballEpisode ?? 0,
        position: { ...state.ball },
      },
    ].slice(-22),
    recentDuel: {
      participants: [c.actor.id, c.opponent.id].sort() as [string, string],
      ...(outcome === 'clean_win' ? { winnerId: c.actor.id } : {}),
      resolvedAt: state.time,
      expiresAt: state.time + (intent.technique === 'slide' ? 1.35 : 0.8),
      ballEpisode: state.ballEpisode ?? 0,
    },
  };
  delete next.defensiveChallenge;
  next = countDefensiveEvent(
    next,
    c.actor.id,
    outcome === 'clean_win'
      ? 'cleanWins'
      : outcome === 'loose_ball'
        ? 'looseBalls'
        : outcome === 'foul'
          ? 'fouls'
          : outcome,
  );
  return {
    state: next,
    diagnostic,
    ...(outcome === 'loose_ball'
      ? { looseVelocity: { x: (rng.float() - 0.5) * 5, y: (rng.float() - 0.5) * 5 } }
      : {}),
  };
};
