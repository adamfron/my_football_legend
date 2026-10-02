import { z } from 'zod';
import { RandomGenerator } from '../random/RandomGenerator';
import { distance, pitchPointSchema, physicalPointSchema, teamSideSchema } from './matchSpace';
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
  if (!actor || !opponent || actor.team === opponent.team || state.restart?.phase === 'setup')
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
    state.defensiveChallenge
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
): DefensiveChallengeAction | undefined => {
  const options = enumerateDefensiveChallengeActions(state, actorId);
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return;
  if (actorId === state.controlledFootballerId)
    return options.find((action) => action.technique === 'standing');
  const desperate =
    state.time >= 80 * 60 &&
    state.score[actor.team] < state.score[actor.team === 'home' ? 'away' : 'home'];
  const aggression = actor.profile.attributes.aggression;
  if (aggression >= (desperate ? 65 : 82)) {
    const tactical = options.find((action) => action.technique === 'tactical');
    if (tactical) return tactical;
  }
  const slide = options.find((action) => action.technique === 'slide');
  if (slide && aggression >= 70 && actor.profile.attributes.tackling >= 45) return slide;
  const committed = options.find((action) => action.technique === 'committed');
  if (committed && aggression >= 65) return committed;
  return options.find((action) => action.technique === 'standing');
};

export const challengeResolutionSchema = z.object({
  state: z.custom<TacticalMatchState>(),
  diagnostic: challengeDiagnosticSchema.optional(),
  looseVelocity: physicalPointSchema.optional(),
});
export type ChallengeResolution = z.infer<typeof challengeResolutionSchema>;
/** Resolves a physical attempt once. The caller applies possession/loose ball via the existing lifecycle. */
export const resolveDefensiveChallenge = (state: TacticalMatchState): ChallengeResolution => {
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
  const opponentContact =
    c.opponentDistance <= (intent.technique === 'slide' ? 1.75 : 1.35) && aligned;
  const ballReachable = c.ballDistance <= reach && aligned && (state.ball.height ?? 0) < 0.5;
  if (elapsed < minimumTime || (!opponentContact && !ballReachable)) {
    if (state.time < intent.expiresAt) return { state };
  }
  const rng = RandomGenerator.fromSeed(intent.id);
  const skill =
    (c.actor.profile.attributes.tackling +
      c.actor.profile.attributes.gameReading +
      c.actor.profile.attributes.positioning) /
    300;
  const attackerSkill =
    (c.opponent.profile.attributes.dribbling +
      c.opponent.profile.attributes.technique +
      c.opponent.profile.attributes.agility +
      c.opponent.profile.attributes.composure) /
    400;
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
    execution < Math.max(0.015, (1 - skill) * 0.08 + c.relativeSpeed * 0.006 + lateness * 0.06);
  const illegalContact =
    opponentContact &&
    (intent.technique === 'tactical' || !ballFirst || accidentalMistiming || force > 8.5);
  let outcome: ChallengeDiagnostic['outcome'] = 'missed';
  if (illegalContact) outcome = 'foul';
  else if (ballReachable && originalPossession) {
    const success =
      execution +
      (skill - attackerSkill) * 0.35 +
      (1 - c.facingError / Math.PI) * 0.08 -
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
