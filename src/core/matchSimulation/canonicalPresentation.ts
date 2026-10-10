import { z } from 'zod';
import { BALL_RADIUS } from './ballFlight';
import { contactBodyRegionSchema } from './ballContactGeometry';
import { physicalPointSchema } from './matchSpace';
import { matchInjurySchema } from './matchInjuries';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { projectMatchVisiblePlayers } from './substitutions';
import { shotContactSchema, shotIntentSchema } from './shotIntent';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

/** A compact canonical release fact; old sampled recordings can omit it. */
export const releasePresentationSchema = z.object({
  kind: z.enum(['pass', 'shot', 'cross', 'throw', 'header', 'distribution']),
  atMs: z.number().nonnegative(),
  travelKind: z
    .enum([
      'pass',
      'through_ball',
      'cross',
      'long_distribution',
      'free_kick_delivery',
      'corner_delivery',
      'shot',
      'header',
      'throw_in',
    ])
    .optional(),
  shotIntent: shotIntentSchema.or(z.literal('header')).optional(),
  shotContact: shotContactSchema.optional(),
  firstTime: z.boolean().optional(),
  contactHeight: z.number().nonnegative().optional(),
});
export type ReleasePresentation = z.infer<typeof releasePresentationSchema>;
export const RELEASE_PRESENTATION_DURATION_MS = 620;

/** Existing release diagnostics preserve the brief follow-through after physical contact. */
export const projectCanonicalReleasePresentation = (
  state: TacticalMatchState,
  actorId: string,
): ReleasePresentation | undefined => {
  const ball = state.ball;
  const nowMs = state.time * 1000;
  const recent = (atMs: number) =>
    atMs >= 0 && atMs <= nowMs && nowMs - atMs < RELEASE_PRESENTATION_DURATION_MS;
  const shot =
    ball.shot?.shooterId === actorId
      ? ball.shot
      : state.lastShot?.shooterId === actorId
        ? state.lastShot
        : undefined;
  const candidates: ReleasePresentation[] = [];
  if (
    shot?.shooterId === actorId &&
    shot.releasedAt !== undefined &&
    recent(shot.releasedAt * 1000)
  )
    candidates.push({
      kind: shot.contact === 'header' ? 'header' : 'shot',
      atMs: shot.releasedAt * 1000,
      travelKind: shot.contact === 'header' ? 'header' : 'shot',
      shotIntent: shot.intent,
      shotContact: shot.contact,
      firstTime: shot.firstTime,
      contactHeight: shot.ballHeightAtContact,
    });
  const thrown = state.lastThrowInDiagnostic;
  if (thrown?.throwerId === actorId && recent(thrown.releasedAt * 1000))
    candidates.push({ kind: 'throw', travelKind: 'throw_in', atMs: thrown.releasedAt * 1000 });
  if (ball.travelKind && ball.lastTouchPlayerId === actorId && ball.flightTime !== undefined) {
    const currentShot = ball.shot?.shooterId === actorId ? ball.shot : undefined;
    const inferredAt = state.time - ball.flightTime;
    const pass = state.lastPassDiagnostic;
    const releasedAt =
      currentShot?.releasedAt ??
      (ball.travelKind === 'throw_in' && thrown?.throwerId === actorId
        ? thrown.releasedAt
        : pass?.passerId === actorId && Math.abs(pass.releasedAt - inferredAt) < 0.000001
          ? pass.releasedAt
          : inferredAt);
    const atMs = releasedAt * 1000;
    const actor = state.players.find((player) => player.id === actorId);
    if (recent(atMs))
      candidates.push({
        kind:
          ball.travelKind === 'throw_in'
            ? 'throw'
            : currentShot?.contact === 'header' || ball.sourceAction === 'header'
              ? 'header'
              : ball.sourceAction === 'shot'
                ? 'shot'
                : ball.sourceAction === 'cross'
                  ? 'cross'
                  : actor && isMatchGoalkeeper(actor)
                    ? 'distribution'
                    : 'pass',
        atMs,
        travelKind: ball.travelKind,
        ...(currentShot
          ? {
              shotIntent: currentShot.intent,
              shotContact: currentShot.contact,
              firstTime: currentShot.firstTime,
              contactHeight: currentShot.ballHeightAtContact,
            }
          : {}),
      });
  }
  return candidates.reduce<ReleasePresentation | undefined>(
    (latest, candidate) => (!latest || candidate.atMs >= latest.atMs ? candidate : latest),
    undefined,
  );
};

/** Observer memory only: one recent release per actor, with an explicit TTL and body cap. */
export const observeCanonicalReleasePresentations = (
  state: TacticalMatchState,
  cache: Map<string, ReleasePresentation>,
) => {
  for (const [id, cue] of cache)
    if (
      state.time * 1000 < cue.atMs ||
      state.time * 1000 - cue.atMs >= RELEASE_PRESENTATION_DURATION_MS
    )
      cache.delete(id);
  const actors = new Set([
    state.ball.lastTouchPlayerId,
    state.ball.shot?.shooterId,
    state.lastShot?.shooterId,
    state.lastThrowInDiagnostic?.throwerId,
  ]);
  for (const actorId of actors) {
    if (!actorId) continue;
    const cue = projectCanonicalReleasePresentation(state, actorId);
    if (cue && (!cache.has(actorId) || cue.atMs >= cache.get(actorId)!.atMs))
      cache.set(actorId, cue);
  }
  while (cache.size > 52) {
    const oldest = [...cache].sort((a, b) => a[1].atMs - b[1].atMs)[0]!;
    cache.delete(oldest[0]);
  }
};

export const contactPresentationSchema = z.object({
  region: contactBodyRegionSchema.optional(),
  plannedPoint: physicalPointSchema.optional(),
  plannedAtMs: z.number().nonnegative().optional(),
  lastRegion: contactBodyRegionSchema.optional(),
  lastIntendedRegion: contactBodyRegionSchema.optional(),
  lastPoint: physicalPointSchema.optional(),
  lastAtMs: z.number().nonnegative().optional(),
  failedAtMs: z.number().nonnegative().optional(),
  regionEvidence: z.enum(['planned_geometry', 'reachable_geometry']).optional(),
  quality: z.number().min(0).max(1).optional(),
  retained: z.boolean().optional(),
  nextFailed: z.boolean().optional(),
  incomingVelocity: physicalPointSchema.optional(),
  outgoingVelocity: physicalPointSchema.optional(),
  physicalCount: z.number().int().nonnegative().optional(),
  balance: z.number().min(0).max(1).optional(),
});
export const goalkeeperPresentationSchema = z.object({
  kind: z.enum([
    'ready',
    'penalty_ready',
    'adjust',
    'claim',
    'punch',
    'attempt_interception',
    'catch',
    'parry',
    'parry_away',
    'failed_save',
    'no_chance',
    'keeper_miss',
    'distribution',
    'goal_kick',
  ]),
  target: physicalPointSchema.optional(),
  atMs: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
});
export const goalResponsePresentationSchema = z.object({
  goalId: z.string(),
  role: z.enum(['scorer', 'retriever', 'teammate', 'conceded']),
  phase: z.enum(['celebration', 'urgent_retrieval', 'reaction', 'return_to_kickoff']),
  startedAtMs: z.number().nonnegative(),
  reactionUntilMs: z.number().nonnegative().optional(),
  urgent: z.boolean().optional(),
  scorerId: z.string().optional(),
  retrieverId: z.string().optional(),
  retrievalStage: z.enum(['approach', 'transport', 'placed']).optional(),
});
export const canonicalPlayerPresentationShape = {
  acceleration: physicalPointSchema.optional(),
  angularVelocity: z.number().finite().optional(),
  role: z.string().optional(),
  duty: z.enum(['defend', 'support', 'attack']).optional(),
  movementMode: z.enum(['forward', 'diagonal', 'shuffle', 'backpedal', 'turn_and_run']).optional(),
  locomotionIntensity: z.enum(['walk', 'jog', 'run', 'sprint']).optional(),
  locomotionReason: z.string().optional(),
  fitness: z
    .object({ capacity: z.number().min(0).max(1), burstReadiness: z.number().min(0).max(1) })
    .optional(),
  injury: matchInjurySchema.optional(),
  participation: z
    .enum(['active', 'departing', 'staged', 'entering', 'assisted_removal'])
    .optional(),
  contact: contactPresentationSchema.optional(),
  goalkeeperIntervention: goalkeeperPresentationSchema.optional(),
  goalResponse: goalResponsePresentationSchema.optional(),
  defensive: z
    .object({
      intent: z.enum(['contain', 'engage', 'recovery']),
      targetId: z.string().optional(),
      technique: z.enum(['standing', 'committed', 'slide', 'tactical']).optional(),
      outcome: z.enum(['clean_win', 'loose_ball', 'missed', 'foul', 'beaten']).optional(),
    })
    .optional(),
  markingTargetId: z.string().optional(),
  supportAssignment: z.object({ kind: z.string(), target: physicalPointSchema }).optional(),
  pressAssignment: z
    .object({ intent: z.enum(['contain', 'engage', 'recovery']), targetId: z.string().optional() })
    .optional(),
  wallResponse: z
    .object({
      choice: z.enum(['hold', 'jump']),
      jumpHeight: z.number().nonnegative(),
      reactionAtMs: z.number().nonnegative(),
    })
    .optional(),
};
export const canonicalPlayerPresentationSchema = z.object(canonicalPlayerPresentationShape);
export type CanonicalPlayerPresentation = z.infer<typeof canonicalPlayerPresentationSchema>;

/** The scored-ball reaction and actual kickoff retrieval are existing football facts. */
export const projectGoalResponse = (
  state: TacticalMatchState,
  player: MatchPlayerState,
): z.infer<typeof goalResponsePresentationSchema> | undefined => {
  const reaction = state.postGoal;
  const award = state.lastRestartAward;
  const goalKickoff =
    state.scenario === 'kick_off' &&
    state.restart?.phase !== 'release' &&
    state.restart?.awardId === award?.id &&
    award?.cause === 'goal';
  const goalId = reaction?.goalId ?? (goalKickoff ? award?.incidentId : undefined);
  if (!goalId) return;
  if (!state.players.some((active) => active.id === player.id)) return;
  const scorerId =
    state.lastShot?.shotId === goalId && state.lastShot.outcome === 'goal'
      ? state.lastShot.shooterId
      : undefined;
  const scoringTeam = reaction?.scoringTeam ?? (award!.team === 'home' ? 'away' : 'home');
  const retrieverId = reaction?.retrieverId ?? state.restart?.retrieval?.playerId;
  return {
    goalId,
    role:
      player.id === scorerId
        ? 'scorer'
        : player.id === retrieverId
          ? 'retriever'
          : player.team === scoringTeam
            ? 'teammate'
            : 'conceded',
    phase: reaction
      ? reaction.urgent && player.id === retrieverId
        ? 'urgent_retrieval'
        : !reaction.urgent && player.team === scoringTeam && state.time < reaction.reactionUntil
          ? 'celebration'
          : 'reaction'
      : 'return_to_kickoff',
    startedAtMs: (reaction?.startedAt ?? award!.eventAt ?? award!.at) * 1000,
    ...(reaction
      ? { urgent: reaction.urgent, reactionUntilMs: reaction.reactionUntil * 1000 }
      : {}),
    ...(scorerId ? { scorerId } : {}),
    ...(retrieverId ? { retrieverId } : {}),
    ...(goalKickoff && state.restart?.retrieval
      ? { retrievalStage: state.restart.retrieval.stage }
      : {}),
  };
};

/** Read canonical facts only. Missing persisted assignments remain absent rather than reranked. */
export const projectCanonicalPlayerPresentation = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  previous?: TacticalMatchState,
): CanonicalPlayerPresentation => {
  const old = previous && projectMatchVisiblePlayers(previous).find((p) => p.id === player.id);
  const dt = previous ? state.time - previous.time : 0;
  const consecutive = old && previous?.seed === state.seed && dt > 0 && dt <= 0.15;
  const active =
    state.controlledBallContact?.actorId === player.id ? state.controlledBallContact : undefined;
  const latest =
    state.lastGroundContact?.actorId === player.id ? state.lastGroundContact : undefined;
  const request = state.substitutionState?.pending.find(
    (r) => r.outgoing.id === player.id || r.incoming.id === player.id,
  );
  const challenge =
    state.defensiveChallenge?.actorId === player.id ? state.defensiveChallenge : undefined;
  const result =
    state.lastChallenge?.actorId === player.id && state.time - state.lastChallenge.at < 0.9
      ? state.lastChallenge
      : undefined;
  const intent = challenge
    ? 'engage'
    : player.locomotionReason === 'contain'
      ? 'contain'
      : player.locomotionReason === 'press_commit'
        ? 'engage'
        : player.locomotionReason === 'recovery_run'
          ? 'recovery'
          : undefined;
  const movement =
    state.playerMovementIntent?.actorId === player.id &&
    state.playerMovementIntent.expiresAt >= state.time
      ? state.playerMovementIntent
      : undefined;
  const intervention =
    state.keeperIntervention?.keeperId === player.id ? state.keeperIntervention : undefined;
  const shot =
    state.lastShot?.keeperId === player.id &&
    (!state.ball.travelKind || Boolean(state.ball.shot)) &&
    ((state.lastBallContact?.playerId === player.id &&
      state.lastBallContact.at >= (state.lastShot.releasedAt ?? state.lastBallContact.at) &&
      state.time - state.lastBallContact.at < 0.9) ||
      (['failed_save', 'no_chance'].includes(state.lastShot.goalkeeperAction ?? '') &&
        state.lastShot.releasedAt !== undefined &&
        state.time - state.lastShot.releasedAt < 5))
      ? state.lastShot
      : undefined;
  const keeper = isMatchGoalkeeper(player);
  const goalResponse = projectGoalResponse(state, player);
  const keeperKind = keeper
    ? (shot?.goalkeeperAction ??
      (intervention?.finalOutcome === 'keeper_miss'
        ? 'keeper_miss'
        : intervention?.finalOutcome === 'keeper_claim'
          ? 'catch'
          : intervention?.finalOutcome === 'keeper_punch'
            ? 'punch'
            : intervention?.intention !== undefined && intervention.intention !== 'stay'
              ? intervention.intention
              : state.scenario === 'penalty' && state.restart?.phase !== 'release'
                ? 'penalty_ready'
                : state.scenario === 'goal_kick' && state.restart?.takerId === player.id
                  ? 'goal_kick'
                  : state.ball.sourceAction &&
                      state.ball.lastTouchPlayerId === player.id &&
                      state.ball.flightTime !== undefined &&
                      state.ball.flightTime < 0.9
                    ? 'distribution'
                    : Math.hypot(player.velocity.x, player.velocity.y) > 0.2
                      ? 'adjust'
                      : 'ready'))
    : undefined;
  return {
    ...(consecutive
      ? {
          acceleration: {
            x: (player.velocity.x - old.velocity.x) / dt,
            y: (player.velocity.y - old.velocity.y) / dt,
          },
          angularVelocity:
            Math.atan2(
              Math.sin(player.facingAngle - old.facingAngle),
              Math.cos(player.facingAngle - old.facingAngle),
            ) / dt,
        }
      : {}),
    role: player.slot.position,
    duty: player.duty,
    movementMode: player.movementMode,
    locomotionIntensity: player.locomotionIntensity,
    locomotionReason: player.locomotionReason,
    ...(player.fitness
      ? {
          fitness: {
            capacity: player.fitness.longTermCapacity,
            burstReadiness: player.fitness.burstReadiness,
          },
        }
      : {}),
    ...(player.injury ? { injury: { ...player.injury } } : {}),
    ...(goalResponse ? { goalResponse } : {}),
    participation:
      request?.outgoing.id === player.id
        ? request.injuryExitException
          ? 'assisted_removal'
          : 'departing'
        : request?.incoming.id === player.id
          ? request.refereeEntryAt === undefined
            ? 'staged'
            : 'entering'
          : 'active',
    ...(active || latest
      ? {
          contact: {
            ...(active
              ? {
                  region: active.nextContact.region,
                  plannedPoint: { ...active.nextContact.intendedPosition },
                  plannedAtMs: active.nextContact.earliestAt * 1000,
                  physicalCount: active.physicalContacts,
                  balance: active.balance,
                }
              : {}),
            ...(latest
              ? {
                  regionEvidence: latest.executed
                    ? ('reachable_geometry' as const)
                    : ('planned_geometry' as const),
                  ...(latest.executed
                    ? {
                        lastRegion: latest.region,
                        lastIntendedRegion: latest.intendedRegion,
                        lastPoint: { ...latest.point },
                        lastAtMs: latest.at * 1000,
                        quality: latest.quality,
                        incomingVelocity: { ...latest.incomingVelocity },
                        outgoingVelocity: { ...latest.outgoingVelocity },
                      }
                    : { failedAtMs: latest.at * 1000 }),
                  retained: latest.retained,
                  nextFailed: !latest.executed,
                  ...(!active ? { physicalCount: latest.physicalCount } : {}),
                }
              : {}),
          },
        }
      : {}),
    ...(keeperKind
      ? {
          goalkeeperIntervention: {
            kind: keeperKind,
            ...(intervention ? { target: { ...intervention.target } } : {}),
            ...(shot && state.lastBallContact?.playerId === player.id
              ? { atMs: state.lastBallContact.at * 1000, height: state.lastBallContact.point.z }
              : {}),
          },
        }
      : {}),
    ...(intent
      ? {
          defensive: {
            intent,
            targetId: challenge?.opponentId,
            technique: challenge?.technique ?? result?.technique,
            outcome: result?.outcome,
          },
          pressAssignment: { intent, targetId: challenge?.opponentId },
        }
      : result
        ? {
            defensive: {
              intent: 'recovery',
              targetId: result.opponentId,
              technique: result.technique,
              outcome: result.outcome,
            },
          }
        : {}),
    ...(state.restart?.roles[player.id]?.markerId
      ? { markingTargetId: state.restart.roles[player.id]!.markerId }
      : {}),
    ...(movement
      ? { supportAssignment: { kind: movement.type, target: { ...movement.target } } }
      : {}),
    ...(player.restartWallResponse
      ? {
          wallResponse: {
            choice: player.restartWallResponse.choice,
            jumpHeight: player.restartWallResponse.jumpHeight,
            reactionAtMs: player.restartWallResponse.reactionAt * 1000,
          },
        }
      : {}),
  };
};

/** Staged entrants are presentation bodies outside the pitch, never football participants. */
export const projectPresentationPlayers = (state: TacticalMatchState): MatchPlayerState[] => [
  ...projectMatchVisiblePlayers(state),
  ...(state.substitutionState?.pending ?? []).map((r): MatchPlayerState => {
    const { fitness: _fitness, injury: _injury, ...body } = r.outgoing;
    void _fitness;
    void _injury;
    const fitness = r.entryFitness ?? r.incoming.fitness;
    return {
      ...body,
      id: r.incoming.id,
      profile: r.incoming.profile,
      position: r.entryPosition,
      target: { x: 52.5, y: 0.5 },
      velocity: r.entryVelocity,
      facingAngle: 0,
      ...(fitness ? { fitness } : {}),
      ...(r.incoming.injury ? { injury: r.incoming.injury } : {}),
      goalkeeperRole: r.incoming.profile.primaryPosition === 'goalkeeper',
    };
  }),
];

export const canonicalBallPresentation = (state: TacticalMatchState) => ({
  x: state.ball.x,
  y: state.ball.y,
  height: state.ball.height ?? 0,
  ownerId: state.ball.ownerId,
  radius: BALL_RADIUS,
  ...(state.ball.velocity ? { velocity: { ...state.ball.velocity } } : {}),
});

/** Boundary markers are observer signatures, never gameplay gates. */
export const presentationDiscontinuity = (state: TacticalMatchState) =>
  [
    state.status,
    state.score.home,
    state.score.away,
    state.scenario,
    state.restart?.awardId ?? state.restart?.startedAt,
    state.restart?.phase,
    state.postGoal?.goalId,
    state.injuryAssessment?.startedAt,
    projectPresentationPlayers(state)
      .map((p) => `${p.id}:${state.players.some((active) => active.id === p.id)}`)
      .join(','),
  ].join('|');

export const ballPresentationDiscontinuity = (state: TacticalMatchState) =>
  [
    presentationDiscontinuity(state),
    state.ball.ownerId,
    state.ball.travelKind,
    state.ball.flightTime !== undefined ? (state.time - state.ball.flightTime).toFixed(6) : '',
    state.lastGroundContact?.at,
    state.lastGroundContact?.actorId,
    state.lastBallContact?.at,
    state.lastBallContact?.kind,
    state.lastAerialContact?.id,
    state.lastChallenge?.id,
  ].join('|');

export const importantPresentationChange = (
  previous: TacticalMatchState | undefined,
  state: TacticalMatchState,
) =>
  Boolean(
    previous &&
      (presentationDiscontinuity(previous) !== presentationDiscontinuity(state) ||
        previous.ball.ownerId !== state.ball.ownerId ||
        previous.ball.travelKind !== state.ball.travelKind ||
        `${previous.lastGroundContact?.actorId}:${previous.lastGroundContact?.at}:${previous.lastGroundContact?.physicalCount}:${previous.lastGroundContact?.retained}` !==
          `${state.lastGroundContact?.actorId}:${state.lastGroundContact?.at}:${state.lastGroundContact?.physicalCount}:${state.lastGroundContact?.retained}` ||
        `${previous.lastBallContact?.at}:${previous.lastBallContact?.kind}:${previous.lastBallContact?.playerId}` !==
          `${state.lastBallContact?.at}:${state.lastBallContact?.kind}:${state.lastBallContact?.playerId}` ||
        previous.lastAerialContact?.id !== state.lastAerialContact?.id ||
        previous.lastChallenge?.id !== state.lastChallenge?.id ||
        previous.actionEventSequence !== state.actionEventSequence),
  );
