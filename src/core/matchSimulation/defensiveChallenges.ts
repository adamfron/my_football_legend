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
import type { ActionSource, MatchAction, MatchPlayerState, TacticalMatchState } from './matchState';
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
  ballReachable: z.boolean().optional(),
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
  byTechnique: z.partialRecord(defensiveTechniqueSchema, defensiveCountersSchema).optional(),
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
  technique?: DefensiveTechnique,
): TacticalMatchState => {
  const previous = state.defensiveTelemetry ?? { ...createDefensiveCounters(), byPlayer: {} };
  const player = previous.byPlayer[actorId] ?? createDefensiveCounters();
  return {
    ...state,
    defensiveTelemetry: {
      ...previous,
      [field]: previous[field] + 1,
      byPlayer: { ...previous.byPlayer, [actorId]: { ...player, [field]: player[field] + 1 } },
      ...(technique
        ? {
            byTechnique: {
              ...previous.byTechnique,
              [technique]: {
                ...(previous.byTechnique?.[technique] ?? createDefensiveCounters()),
                [field]: (previous.byTechnique?.[technique]?.[field] ?? 0) + 1,
              },
            },
          }
        : {}),
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

export const pressingPlanSchema = z.object({
  actorId: z.string(),
  opponentId: z.string(),
  intention: z.enum(['contain', 'screen', 'engage', 'emergency']),
  commitment: z.number().min(0).max(1),
  target: pitchPointSchema,
  standOff: z.number().nonnegative(),
  booked: z.boolean(),
  covering: z.number().int().nonnegative(),
  reason: z.enum([
    'protect_receiver',
    'wait_for_touch',
    'screen_lane',
    'close_ball_shoulder',
    'exposed_control',
    'immediate_threat',
    'selected_press',
    'recover_duel',
  ]),
});
export type PressingPlan = z.infer<typeof pressingPlanSchema>;

const projectPressingPlan = (
  state: TacticalMatchState,
  c: NonNullable<ReturnType<typeof deriveDefensiveContext>>,
  cooperativePress?: CooperativePress | null,
): PressingPlan => {
  const explicit = state.playerMovementIntent;
  const selected = Boolean(
    state.defensiveChallenge?.actorId === c.actor.id ||
      (explicit?.actorId === c.actor.id &&
        explicit.expiresAt > state.time &&
        explicit.type === 'attack_space'),
  );
  const protectedReceiver = protectedPressReceiver(state, c.actor);
  const progress = c.opponent.team === 'home' ? c.opponent.position.x : 105 - c.opponent.position.x;
  const nearGoal = progress >= 78 && Math.abs(c.opponent.position.y - 34) <= 18;
  const carry = state.ballCarrierIntent;
  const movingIntent = carry?.actorId === c.opponent.id && carry.expiresAt > state.time;
  const invited =
    state.currentAction?.type === 'hold' &&
    state.currentAction.actorId === c.opponent.id &&
    state.actionCooldown <= 0;
  const preparation = state.onBallPreparation;
  const unstableControl =
    distance(c.opponent.position, state.ball) > 1.45 ||
    (preparation?.actorId === c.opponent.id &&
      preparation.readyAt > state.time &&
      preparation.receptionKind === 'heavy_touch');
  const booked = Boolean(
    (state.discipline?.[c.actor.id]?.yellowCards ?? 0) > 0 ||
      state.pendingCards?.some((foul) => foul.actorId === c.actor.id && foul.card !== 'none'),
  );
  const a = c.actor.profile.attributes;
  const reading = (a.gameReading + a.positioning) / 200;
  const trailingLate =
    state.time >= 80 * 60 && state.score[c.actor.team] < state.score[c.opponent.team];
  // Temperament controls commitment. Tackling/strength are deliberately absent: neither
  // turns aggression into better execution or substitutes for willingness to engage.
  const commitment = Math.max(
    0,
    Math.min(
      1,
      (a.aggression / 100) * 0.64 +
        ((100 - a.composure) / 100) * 0.08 +
        reading * 0.08 +
        Math.min(3, c.covering) * 0.035 -
        (c.covering === 0 ? 0.12 : 0) +
        (unstableControl ? 0.29 : 0) +
        (movingIntent ? 0.12 : 0) +
        (invited ? 0.22 : 0) +
        (nearGoal || c.danger ? 0.25 : c.promisingAttack ? 0.12 : 0) +
        (trailingLate ? 0.1 : 0) -
        (booked ? 0.2 + (a.composure / 100) * 0.08 : 0),
    ),
  );
  const locked = isDefensiveEpisodeLocked(state, c.actor.id, c.opponent.id);
  const partner = cooperativePress?.secondaryId === c.actor.id;
  const screening =
    protectedReceiver ||
    (cooperativePress?.primaryId === c.actor.id &&
      !selected &&
      !invited &&
      !unstableControl &&
      !nearGoal);
  const intention: PressingPlan['intention'] = locked
    ? 'contain'
    : screening && !selected
      ? 'screen'
      : nearGoal && commitment >= 0.76
        ? 'emergency'
        : selected ||
            partner ||
            unstableControl ||
            invited ||
            (c.dogso && progress >= 88) ||
            (movingIntent && c.covering > 0) ||
            commitment >= 0.56
          ? 'engage'
          : 'contain';
  const reason: PressingPlan['reason'] = locked
    ? 'recover_duel'
    : protectedReceiver
      ? 'protect_receiver'
      : intention === 'screen'
        ? 'screen_lane'
        : selected || partner
          ? 'selected_press'
          : unstableControl
            ? 'exposed_control'
            : nearGoal
              ? 'immediate_threat'
              : intention === 'engage'
                ? 'close_ball_shoulder'
                : 'wait_for_touch';
  const dir = c.opponent.team === 'home' ? 1 : -1;
  const anticipation = 0.08 + reading * 0.26;
  const predicted = {
    x: c.opponent.position.x + c.opponent.velocity.x * anticipation,
    y: c.opponent.position.y + c.opponent.velocity.y * anticipation,
  };
  // A pincer screen occupies the body side, while its partner approaches the ball
  // shoulder. Standing farther back makes the carrier shield only the arriving partner.
  let standOff =
    cooperativePress?.primaryId === c.actor.id
      ? 1.12
      : intention === 'contain'
        ? 1.75 + (1 - commitment) * 0.8
        : intention === 'screen'
          ? 2.1
          : 1.12;
  let target = {
    x: predicted.x + dir * standOff,
    y: predicted.y + (cooperativePress?.primaryId === c.actor.id ? 0 : (34 - predicted.y) * 0.055),
  };
  if (protectedReceiver && !selected)
    target = { x: protectedReceiver.position.x + dir * 2, y: protectedReceiver.position.y };
  else if (partner) target = cooperativePress!.target;
  else if ((intention === 'engage' || intention === 'emergency') && c.opponentDistance < 3.5) {
    // Reach the actual exposed shoulder, orbiting around protected control. A goal-side
    // resting point can lie permanently outside poke reach; enlarging tackle radii hides it.
    const bx = state.ball.x - c.opponent.position.x,
      by = state.ball.y - c.opponent.position.y;
    const ballAngle =
      Math.hypot(bx, by) > 0.15
        ? Math.atan2(by, bx)
        : Math.atan2(
            c.actor.position.y - c.opponent.position.y,
            c.actor.position.x - c.opponent.position.x,
          );
    const currentAngle = Math.atan2(
      c.actor.position.y - c.opponent.position.y,
      c.actor.position.x - c.opponent.position.x,
    );
    const turn = normalizeAngle(ballAngle - currentAngle);
    const approachAngle = currentAngle + Math.max(-Math.PI / 3, Math.min(Math.PI / 3, turn));
    standOff = Math.abs(turn) > Math.PI / 3 ? 1.3 : 1.12;
    target = {
      x: predicted.x + Math.cos(approachAngle) * standOff,
      y: predicted.y + Math.sin(approachAngle) * standOff,
    };
  }
  return {
    actorId: c.actor.id,
    opponentId: c.opponent.id,
    intention,
    commitment,
    target: clampPitchPoint(target),
    standOff,
    booked,
    covering: c.covering,
    reason,
  };
};

/** Pure continuous tactical projection; recomputed from physical context, without a press timer. */
export const derivePressingPlan = (
  state: TacticalMatchState,
  actorId: string,
  cooperativePress?: CooperativePress | null,
): PressingPlan | undefined => {
  const c = deriveDefensiveContext(state, actorId);
  return c
    ? projectPressingPlan(
        state,
        c,
        cooperativePress === undefined
          ? deriveCooperativePress(state, c.actor.team)
          : cooperativePress,
      )
    : undefined;
};

/** Ordinary covered circulation is jockeyed; threats, exposed control and chosen presses close down. */
export const shouldCommitRoutinePress = (
  state: TacticalMatchState,
  actorId: string,
  cooperativePress?: CooperativePress | null,
): boolean => {
  const intention = derivePressingPlan(state, actorId, cooperativePress)?.intention;
  return intention === 'engage' || intention === 'emergency';
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

/** A press must not abandon a dangerous nearby receiver without a real marking handoff. */
export const protectedPressReceiver = (
  state: TacticalMatchState,
  candidate: MatchPlayerState,
  availableCover?: MatchPlayerState[],
): MatchPlayerState | undefined => {
  if (state.restart?.phase === 'setup') return;
  const carrier = state.players.find((p) => p.id === state.ball.ownerId);
  if (!carrier || carrier.team === candidate.team) return;
  // No receiver at advanced depth can lie inside these two physical distance envelopes.
  const depth = (p: MatchPlayerState) =>
    carrier.team === 'home' ? p.position.x : 105 - p.position.x;
  if (
    depth(carrier) < COOPERATIVE_PRESS_TUNING.advancedThreatProgress - 30 ||
    depth(candidate) < COOPERATIVE_PRESS_TUNING.advancedThreatProgress - 10
  )
    return;
  const defenders = state.players.filter(
    (p) =>
      p.team === candidate.team &&
      p.id !== candidate.id &&
      p.slot.position !== 'goalkeeper' &&
      !state.discipline?.[p.id]?.sentOff,
  );
  const engaging = defenders
    .filter(
      (p) => distance(p.position, carrier.position) <= COOPERATIVE_PRESS_TUNING.engagingDistance,
    )
    .sort(
      (a, b) => distance(a.position, carrier.position) - distance(b.position, carrier.position),
    )[0];
  const remaining = availableCover ?? defenders.filter((p) => p.id !== engaging?.id);
  const dir = carrier.team === 'home' ? 1 : -1;
  return state.players.find((receiver) => {
    if (
      receiver.team !== carrier.team ||
      receiver.id === carrier.id ||
      receiver.slot.position === 'goalkeeper' ||
      (carrier.team === 'home' ? receiver.position.x : 105 - receiver.position.x) <
        COOPERATIVE_PRESS_TUNING.advancedThreatProgress ||
      state.discipline?.[receiver.id]?.sentOff ||
      distance(receiver.position, carrier.position) > 30 ||
      Math.abs(receiver.position.y - 34) > 23 ||
      dir * (receiver.position.x - carrier.position.x) < -5
    )
      return false;
    const assigned = distance(candidate.position, receiver.position);
    if (assigned > 10) return false;
    const inherited = Math.min(...remaining.map((p) => distance(p.position, receiver.position)));
    return inherited > COOPERATIVE_PRESS_TUNING.inheritedMarkDistance || inherited > assigned + 3;
  });
};

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
    // Safe cover permits initiative; temperament and a booking shift recruitment
    // continuously rather than excluding every cautious or booked player.
    const candidateAttributes = candidate.profile.attributes;
    const booked = (state.discipline?.[candidate.id]?.yellowCards ?? 0) > 0;
    const initiative =
      (candidateAttributes.aggression / 100) * 0.58 +
      willingness * 0.4 +
      (candidateAttributes.gameReading / 100) * 0.12 +
      (candidateAttributes.positioning / 100) * 0.06 +
      (shield || confined ? 0.2 : 0) +
      (progress >= 78 ? 0.18 : 0) -
      (booked ? 0.17 + (candidateAttributes.composure / 100) * 0.06 : 0);
    if (initiative < 0.34) continue;
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
    const exposedReceiver = protectedPressReceiver(state, candidate, remaining);
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
    (c.danger ||
      distance(c.actor.position, c.actor.anchor) >= 4.5 ||
      c.actor.profile.attributes.aggression >= 70) &&
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
    countDefensiveEvent(next, action.actorId, 'opportunities', action.technique),
    action.actorId,
    'attempted',
    action.technique,
  );
  if (action.technique === 'slide')
    next = countDefensiveEvent(next, action.actorId, 'slides', action.technique);
  if (action.technique === 'tactical')
    next = countDefensiveEvent(next, action.actorId, 'tacticalIntents', action.technique);
  if (action.technique !== 'standing')
    next = countDefensiveEvent(next, action.actorId, 'highRiskIntents', action.technique);
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
  if (!c) return;
  const plan = projectPressingPlan(
    state,
    c,
    cooperativePress === undefined ? deriveCooperativePress(state, c.actor.team) : cooperativePress,
  );
  const commits = plan.intention === 'engage' || plan.intention === 'emergency';
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
    (c.covering === 0 && !c.danger ? 10 : 0) +
    Math.min(3, c.covering) * 3 -
    (rearApproach ? 10 : 0) -
    (booked ? 28 : 0);
  // Choosing an aggressive intent is not choosing to run through an inaccessible ball.
  // Containment/movement closes the remaining distance; an actual tackle is committed
  // only when the ball is exposed and already inside that technique's contact window.
  const exposedBall = !rearApproach && c.ballDistance <= c.opponentDistance + 0.24;
  const forwardRole = ['striker', 'left_winger', 'right_winger'].includes(actor.slot.position);
  // A forward closes/screens the route while a low-skill poke at protected control has little
  // value. A clearly exposed ball or immediate threat still admits a real opportunistic tackle.
  const standingWorthwhile =
    !forwardRole ||
    a.tackling >= 58 ||
    c.danger ||
    (exposedBall && c.ballDistance < c.opponentDistance - 0.12 && a.gameReading >= 45);
  // Containment is still effective defence: a clearly reachable exposed ball may be
  // poked safely without converting every jockey into a committed engagement.
  if (!commits)
    return standingWorthwhile && exposedBall && (c.danger || c.covering < 2)
      ? comfortableStanding
      : undefined;
  const committedWindow = Math.max(0.75, 1.1 - c.relativeSpeed * 0.025);
  const slideWindow = Math.max(1.05, 1.75 - c.relativeSpeed * 0.03);
  // Eager closing does not justify replacing an immediate legal poke with a slower
  // opponent-first action. Prepared contact must still find the exposed ball later.
  if (comfortableStanding && standingWorthwhile) return comfortableStanding;
  const ballVector = { x: state.ball.x - actor.position.x, y: state.ball.y - actor.position.y };
  const closingSpeed =
    -(
      (c.opponent.velocity.x - actor.velocity.x) * ballVector.x +
      (c.opponent.velocity.y - actor.velocity.y) * ballVector.y
    ) / Math.max(0.01, c.ballDistance);
  const controlledShoulderReachable = distance(plan.target, state.ball) <= comfortableReach + 0.06;
  // Continue the actual approach when the chosen shoulder offers a safe standing
  // solution. There is no wait timer and no feedback from observed foul totals.
  if (controlledShoulderReachable && c.relativeSpeed <= 4.5 && closingSpeed >= -0.5 && !c.dogso)
    return;
  const contactForecast = (seconds: number) => {
    const actorPoint = {
      x: actor.position.x + actor.velocity.x * seconds,
      y: actor.position.y + actor.velocity.y * seconds,
    };
    const opponentPoint = {
      x: c.opponent.position.x + c.opponent.velocity.x * seconds,
      y: c.opponent.position.y + c.opponent.velocity.y * seconds,
    };
    let ballPoint = {
      x: state.ball.x + c.opponent.velocity.x * seconds,
      y: state.ball.y + c.opponent.velocity.y * seconds,
    };
    if (
      state.onBallPreparation?.actorId === c.opponent.id &&
      state.onBallPreparation.micro?.shielding
    ) {
      const nearest = state.players
        .filter((p) => p.team === actor.team)
        .map((p) => ({
          x: p.position.x + p.velocity.x * seconds,
          y: p.position.y + p.velocity.y * seconds,
        }))
        .sort((a, b) => distance(a, opponentPoint) - distance(b, opponentPoint))[0];
      if (nearest) {
        const length = Math.max(0.01, distance(nearest, opponentPoint));
        ballPoint = {
          x: opponentPoint.x + ((opponentPoint.x - nearest.x) / length) * 0.38,
          y: opponentPoint.y + ((opponentPoint.y - nearest.y) / length) * 0.38,
        };
      }
    }
    const ballMetres = distance(actorPoint, ballPoint);
    const bodyMetres = distance(actorPoint, opponentPoint);
    return {
      ballMetres,
      exposed: ballMetres < bodyMetres - 0.1,
      aligned:
        Math.abs(
          normalizeAngle(
            angleForVector({ x: ballPoint.x - actorPoint.x, y: ballPoint.y - actorPoint.y }) -
              actor.facingAngle,
          ),
        ) <
        Math.PI * 0.4,
    };
  };
  // An individual/context threshold, never a quota or match-wide random foul budget.
  if (
    riskAppetite >= 72 &&
    c.opponentDistance <= 1.35 &&
    !c.dogso &&
    !isDefendingPenaltyArea(actor.team, c.opponent.position)
  ) {
    const tactical = options.find((action) => action.technique === 'tactical');
    if (tactical) return tactical;
  }
  const slide = options.find((action) => action.technique === 'slide');
  const slideContact = slide && contactForecast(0.18);
  if (
    slide &&
    riskAppetite >= 64 &&
    a.tackling >= 65 &&
    exposedBall &&
    c.ballDistance <= slideWindow &&
    slideContact?.exposed &&
    slideContact.aligned &&
    slideContact.ballMetres <= 1.65
  )
    return slide;
  const committed = options.find((action) => action.technique === 'committed');
  const committedContact = committed && contactForecast(0.1);
  if (
    committed &&
    riskAppetite >= 58 &&
    exposedBall &&
    c.ballDistance <= committedWindow &&
    committedContact?.exposed &&
    committedContact.aligned &&
    committedContact.ballMetres <= 1.1
  )
    return committed;
  return standingWorthwhile ? comfortableStanding : undefined;
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
      ballReachable: false,
    };
    const next = { ...state, lastChallenge: diagnostic };
    delete next.defensiveChallenge;
    return {
      state: countDefensiveEvent(next, intent.actorId, 'missed', intent.technique),
      diagnostic,
    };
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
      ? c.relativeSpeed > 3.5 && (fromBehind || !ballReachable)
        ? 0.6
        : 0.15
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
  const autonomousStanding =
    intent.technique === 'standing' &&
    (intent.source === 'autonomous_routine' || intent.source === 'autonomous_npc');
  const routineWithdrawn =
    autonomousStanding && (fromBehind || !ballReachable || c.relativeSpeed > 4.5 || lateness > 0.3);
  // Any autonomous routine poke is withdrawn when the timing deteriorates. Human identity
  // does not change physics; an explicitly selected or committed tackle retains its risk.
  if (routineWithdrawn) opponentContact = false;
  // A standing poke that fails to find the ball is often simply beaten. Mere proximity is
  // not an infringement; opponent-first contact needs a committed/impeding physical action.
  const impedingContact =
    intent.technique !== 'standing' || (c.relativeSpeed > 3.5 && (fromBehind || lateness > 0.3));
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
    ballReachable,
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
    intent.technique,
  );
  return {
    state: next,
    diagnostic,
    ...(outcome === 'loose_ball'
      ? { looseVelocity: { x: (rng.float() - 0.5) * 5, y: (rng.float() - 0.5) * 5 } }
      : {}),
  };
};
