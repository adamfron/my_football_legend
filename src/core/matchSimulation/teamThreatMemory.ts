import { z } from 'zod';
import { distance, pitchPointSchema, type PitchPoint, type TeamSide } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

/** Football time, metres and bounded evidence; shared by observation, response and tests. */
export const TEAM_THREAT_TUNING = {
  evaluationSeconds: 2,
  evidenceHalfLifeSeconds: 180,
  repeatedDangerThreshold: 3.2,
  responsePersistenceSeconds: 24,
  responseRisePerSecond: 0.035,
  responseFallPerSecond: 0.012,
  maximumDepthMetres: 9,
  buildUpDepth: 48,
  finalThirdDepth: 70,
  maximumPlayerMemories: 22,
  nearbyPressMetres: 11,
  reliefPressureStart: 0.25,
  reliefPressureFull: 0.7,
  meaningfulPressureEscape: 0.35,
} as const;
const scoreSchema = z.number().min(0).max(20).finite();
const channelsSchema = z.tuple([scoreSchema, scoreSchema, scoreSchema]);
const biasSchema = z.number().min(0).max(1).finite();
export const tacticalResponseSchema = z.object({
  caution: biasSchema,
  lineDepthMetres: z.number().min(0).max(TEAM_THREAT_TUNING.maximumDepthMetres),
  compactness: biasSchema,
  buildUpSafety: biasSchema,
  support: biasSchema,
  flankProtection: z.tuple([biasSchema, biasSchema, biasSchema]),
  doublePress: biasSchema,
  reason: z.enum([
    'neutral',
    'matchup',
    'repeated_build_up_loss',
    'channel_exposure',
    'territorial_pressure',
    'protecting_lead',
  ]),
});
export type TacticalResponse = z.infer<typeof tacticalResponseSchema>;
export const recentSolutionSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: z.string(),
  receiverId: z.string().optional(),
  channel: z.number().int().min(0).max(2),
  origin: pitchPointSchema,
  at: z.number().nonnegative(),
  pressure: z.number().min(0).max(1),
  outcome: z.enum([
    'completed',
    'intercepted',
    'out_of_play',
    'technical_error',
    'unclaimed',
    'inaccurate',
    'tackle',
    'other',
  ]),
});
export type RecentSolution = z.infer<typeof recentSolutionSchema>;
export const teamThreatMemorySchema = z.object({
  evaluatedAt: z.number().nonnegative(),
  decayedAt: z.number().nonnegative(),
  retainUntil: z.number().nonnegative(),
  matchupCaution: biasSchema,
  territorialPressure: biasSchema,
  buildUpLosses: channelsSchema,
  channelEntries: channelsSchema,
  lineExposures: channelsSchema,
  isolation: channelsSchema,
  shots: channelsSchema,
  overloads: channelsSchema,
  pressuredPlayers: z.array(z.object({ playerId: z.string(), score: scoreSchema })).max(22),
  recentSolutions: z.array(recentSolutionSchema).max(32).default([]),
  observedEpisode: z.number().int(),
  controlOrigin: pitchPointSchema,
  entryObserved: z.boolean(),
  lineObserved: z.boolean(),
  isolationObserved: z.boolean(),
  lastShotId: z.string().optional(),
  response: tacticalResponseSchema,
});
export type TeamThreatMemory = z.infer<typeof teamThreatMemorySchema>;
export const tacticalAdaptationModifiersSchema = z.object({
  adaptability: z.number().min(0.5).max(1.5).optional(),
  riskTolerance: z.number().min(-0.2).max(0.2).optional(),
});
export type TacticalAdaptationModifiers = z.infer<typeof tacticalAdaptationModifiersSchema>;
type ChannelScores = z.infer<typeof channelsSchema>;
const clamp = (value: number, maximum = 1) => Math.max(0, Math.min(maximum, value));
export const threatChannel = (point: PitchPoint): 0 | 1 | 2 =>
  point.y < 23 ? 0 : point.y > 45 ? 2 : 1;
const depth = (point: PitchPoint, side: TeamSide) => (side === 'home' ? point.x : 105 - point.x);
const opposing = (side: TeamSide): TeamSide => (side === 'home' ? 'away' : 'home');
const emptyChannels = (): ChannelScores => [0, 0, 0];
export const neutralTacticalResponse = (): TacticalResponse => ({
  caution: 0,
  lineDepthMetres: 0,
  compactness: 0,
  buildUpSafety: 0,
  support: 0,
  flankProtection: [0, 0, 0],
  doublePress: 0,
  reason: 'neutral',
});
export const createTeamThreatMemory = (matchupCaution = 0, time = 0): TeamThreatMemory => ({
  evaluatedAt: time,
  decayedAt: time,
  retainUntil: time,
  matchupCaution: clamp(matchupCaution),
  territorialPressure: 0,
  buildUpLosses: emptyChannels(),
  channelEntries: emptyChannels(),
  lineExposures: emptyChannels(),
  isolation: emptyChannels(),
  shots: emptyChannels(),
  overloads: emptyChannels(),
  pressuredPlayers: [],
  recentSolutions: [],
  observedEpisode: -1,
  controlOrigin: { x: 52.5, y: 34 },
  entryObserved: false,
  lineObserved: false,
  isolationObserved: false,
  response: neutralTacticalResponse(),
});

/** The same geometry can still be the best route. Evidence fades over football seconds and
 * changed origins/pressure; successful, safe switches receive only a small repetition cost. */
export const deriveSolutionPenalty = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  action: string,
  target: PitchPoint,
  receiverId?: string,
  expectedCompletion = 0.5,
) =>
  (state.teams[actor.team].threatMemory?.recentSolutions ?? []).reduce((sum, entry) => {
    if (
      entry.actorId !== actor.id ||
      entry.action !== action ||
      (receiverId ? entry.receiverId !== receiverId : entry.channel !== threatChannel(target))
    )
      return sum;
    const unchanged =
      Math.max(0, 1 - distance(actor.position, entry.origin) / 18) *
      Math.max(0, 1 - Math.abs(state.currentPressure - entry.pressure) / 0.6);
    const weight = Math.pow(0.5, Math.max(0, state.time - entry.at) / 45) * unchanged;
    return (
      sum +
      weight *
        (entry.outcome === 'completed'
          ? 1.5 * (1 - expectedCompletion)
          : 9 + (1 - expectedCompletion) * 9)
    );
  }, 0);

const observeRecentSolutions = (
  previous: TacticalMatchState,
  next: TacticalMatchState,
  side: TeamSide,
  memory: TeamThreatMemory,
): TeamThreatMemory => {
  const events: RecentSolution[] = [];
  for (const pass of [next.lastResolvedPass, next.lastPassDiagnostic]) {
    if (!pass || pass.resolvedAt === undefined) continue;
    if (
      [previous.lastResolvedPass, previous.lastPassDiagnostic].some(
        (p) => p?.passId === pass.passId && p.resolvedAt !== undefined,
      )
    )
      continue;
    if (memory.recentSolutions?.some((e) => e.id === pass.passId)) continue;
    const actor = previous.players.find((p) => p.id === pass.passerId && p.team === side);
    if (!actor || !pass.finalResult) continue;
    events.push({
      id: pass.passId,
      actorId: actor.id,
      action: pass.intent ?? 'support',
      receiverId: pass.intendedReceiverId,
      channel: threatChannel(pass.intendedTarget ?? pass.predictedReceptionPoint),
      origin: previous.ball.from ?? actor.position,
      at: pass.resolvedAt,
      pressure: pass.selectionQuality?.pressure ?? previous.currentPressure,
      outcome: pass.finalResult,
    });
  }
  const carry = previous.ballCarrierIntent;
  if (
    carry &&
    next.ballCarrierIntent?.startedAt !== carry.startedAt &&
    previous.time - carry.startedAt > 0.9
  ) {
    const actor = previous.players.find((p) => p.id === carry.actorId && p.team === side);
    if (
      actor &&
      distance(actor.position, carry.startPosition) < 1.8 &&
      previous.currentPressure > 0.4
    )
      events.push({
        id: `${actor.id}:stalled-carry:${carry.startedAt}`,
        actorId: actor.id,
        action: 'carry',
        channel: threatChannel(carry.target),
        origin: carry.startPosition,
        at: next.time,
        pressure: previous.currentPressure,
        outcome: 'other',
      });
  }
  const loss = next.lastPossessionLoss;
  if (
    loss &&
    loss.id !== previous.lastPossessionLoss?.id &&
    loss.from === side &&
    loss.cause === 'tackle'
  ) {
    const actor = previous.players.find((p) => p.id === loss.loserId);
    if (actor)
      events.push({
        id: loss.id,
        actorId: actor.id,
        action: previous.ballCarrierIntent?.actorId === actor.id ? 'carry' : 'hold',
        channel: threatChannel(previous.ballCarrierIntent?.target ?? actor.position),
        origin: { ...actor.position },
        at: loss.at,
        pressure: previous.currentPressure,
        outcome: 'tackle',
      });
  }
  if (!events.length) return memory;
  const unique = new Map([...(memory.recentSolutions ?? []), ...events].map((e) => [e.id, e]));
  return {
    ...memory,
    recentSolutions: [...unique.values()].filter((e) => next.time - e.at < 240).slice(-32),
  };
};

/** Eleven metres gives a presser roughly one or two seconds to close. The existing pressure
 * model's 0.25–0.70 range runs from approaching pressure to a tight duel. Historical danger
 * changes readiness only while a presser is present; free build-up keeps its normal ambition. */
export const deriveBuildUpReliefWeight = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  currentPressure?: number,
): number => {
  if (depth(actor.position, actor.team) >= TEAM_THREAT_TUNING.buildUpDepth) return 0;
  let nearestSquared = Infinity;
  for (const opponent of state.players) {
    if (opponent.team === actor.team || state.discipline?.[opponent.id]?.sentOff) continue;
    const dx = opponent.position.x - actor.position.x;
    const dy = opponent.position.y - actor.position.y;
    nearestSquared = Math.min(nearestSquared, dx * dx + dy * dy);
  }
  if (nearestSquared >= TEAM_THREAT_TUNING.nearbyPressMetres ** 2) return 0;
  const nearest = Math.sqrt(nearestSquared);
  const pressure = currentPressure ?? Math.max(0, 1 - nearest / 14) * 0.62;
  const pressureUrgency = clamp(
    (pressure - TEAM_THREAT_TUNING.reliefPressureStart) /
      (TEAM_THREAT_TUNING.reliefPressureFull - TEAM_THREAT_TUNING.reliefPressureStart),
  );
  const memory = state.teams[actor.team].threatMemory;
  const playerEvidence =
    memory?.pressuredPlayers.find((player) => player.playerId === actor.id)?.score ?? 0;
  const channelEvidence = memory?.buildUpLosses[threatChannel(actor.position)] ?? 0;
  const rememberedTrap = clamp(
    (Math.max(playerEvidence, channelEvidence) - 1.5) / TEAM_THREAT_TUNING.repeatedDangerThreshold,
  );
  const trapUrgency =
    rememberedTrap * clamp((TEAM_THREAT_TUNING.nearbyPressMetres - nearest) / 7) * 0.75;
  return Math.max(pressureUrgency, trapUrgency);
};

/** Continuous matchup prior only. Threats, territory and game state decide the actual response. */
export const initialiseTeamThreatMemory = (state: TacticalMatchState): TacticalMatchState => {
  const quality = (side: TeamSide) => {
    const players = state.players.filter((player) => player.team === side);
    return (
      players.reduce((sum, player) => {
        const a = player.profile.attributes;
        return sum + (a.passing + a.technique + a.gameReading + a.tackling + a.pace) / 5;
      }, 0) / Math.max(1, players.length)
    );
  };
  const difference = quality('away') - quality('home');
  return {
    ...state,
    teams: {
      home: {
        ...state.teams.home,
        threatMemory: createTeamThreatMemory(clamp(difference / 55, 0.45), state.time),
      },
      away: {
        ...state.teams.away,
        threatMemory: createTeamThreatMemory(clamp(-difference / 55, 0.45), state.time),
      },
    },
  };
};

const add = (scores: ChannelScores, channel: 0 | 1 | 2, value: number): ChannelScores => {
  const next: ChannelScores = [...scores];
  next[channel] = clamp(next[channel] + value, 20);
  return next;
};
const decayMemory = (memory: TeamThreatMemory, time: number): TeamThreatMemory => {
  const multiplier = Math.pow(
    0.5,
    Math.max(0, time - memory.decayedAt) / TEAM_THREAT_TUNING.evidenceHalfLifeSeconds,
  );
  const decay = (scores: ChannelScores): ChannelScores =>
    scores.map((score) => score * multiplier) as ChannelScores;
  return {
    ...memory,
    decayedAt: time,
    buildUpLosses: decay(memory.buildUpLosses),
    channelEntries: decay(memory.channelEntries),
    lineExposures: decay(memory.lineExposures),
    isolation: decay(memory.isolation),
    shots: decay(memory.shots),
    overloads: decay(memory.overloads),
    pressuredPlayers: memory.pressuredPlayers
      .map((player) => ({ ...player, score: player.score * multiplier }))
      .filter((player) => player.score > 0.03),
  };
};
const approach = (current: number, desired: number, elapsed: number, retain: boolean) => {
  if (retain && desired < current) return current;
  const speed =
    desired > current
      ? TEAM_THREAT_TUNING.responseRisePerSecond
      : TEAM_THREAT_TUNING.responseFallPerSecond;
  return current + Math.max(-elapsed * speed, Math.min(elapsed * speed, desired - current));
};

/** Future coaching modifiers default to sane universal survival, independent of coach quality. */
export const evaluateTeamThreatResponse = (
  state: TacticalMatchState,
  side: TeamSide,
  memory: TeamThreatMemory,
  modifiers: TacticalAdaptationModifiers = {},
): TeamThreatMemory => {
  const elapsed = Math.max(0, state.time - memory.evaluatedAt);
  const loss = Math.max(...memory.buildUpLosses);
  const channelScores = memory.channelEntries.map(
    (entry, channel) =>
      entry * 0.65 +
      memory.lineExposures[channel]! +
      memory.isolation[channel]! * 0.6 +
      memory.shots[channel]! * 1.2 +
      memory.overloads[channel]! * 0.45,
  );
  const exposure = Math.max(...channelScores);
  // Two dangerous build-up losses matter; a single incident has only a small influence.
  const repeatedLoss = clamp((loss - 1.5) / TEAM_THREAT_TUNING.repeatedDangerThreshold);
  const repeatedExposure = clamp((exposure - 1.5) / 5);
  const lead = state.score[side] - state.score[opposing(side)];
  const late = clamp((state.time - 60 * 60) / (30 * 60));
  const protectingLead = lead > 0 ? late * 0.38 : 0;
  const chasing = lead < 0 ? late * 0.3 : 0;
  const desired = clamp(
    (memory.matchupCaution * (0.55 + memory.territorialPressure * 0.45) +
      repeatedLoss * 0.56 +
      repeatedExposure * 0.42 +
      memory.territorialPressure * 0.18 +
      protectingLead -
      chasing) *
      (modifiers.adaptability ?? 1) -
      (modifiers.riskTolerance ?? 0),
    0.85,
  );
  const escalating = desired > memory.response.caution + 0.12;
  const retainUntil = escalating
    ? state.time + TEAM_THREAT_TUNING.responsePersistenceSeconds
    : memory.retainUntil;
  const retain = state.time < retainUntil;
  const caution = approach(memory.response.caution, desired, elapsed, retain);
  const protection = channelScores.map((score, channel) =>
    approach(memory.response.flankProtection[channel]!, clamp((score - 1) / 6), elapsed, retain),
  ) as ChannelScores;
  const buildUpSafety = approach(
    memory.response.buildUpSafety,
    clamp(caution * 0.65 + repeatedLoss * 0.55),
    elapsed,
    retain,
  );
  const reason: TacticalResponse['reason'] =
    repeatedLoss > 0.3
      ? 'repeated_build_up_loss'
      : repeatedExposure > 0.25
        ? 'channel_exposure'
        : protectingLead > 0.1
          ? 'protecting_lead'
          : memory.territorialPressure > 0.55
            ? 'territorial_pressure'
            : memory.matchupCaution > 0.1
              ? 'matchup'
              : 'neutral';
  return {
    ...memory,
    evaluatedAt: state.time,
    retainUntil,
    response: {
      caution,
      lineDepthMetres: caution * TEAM_THREAT_TUNING.maximumDepthMetres,
      compactness: caution,
      buildUpSafety,
      support: buildUpSafety,
      flankProtection: protection,
      doublePress: clamp(0.15 + repeatedExposure * 0.4),
      reason,
    },
  };
};

/** Bounded summaries, never a scan of match history. Ordinary ticks reuse their existing summaries. */
export const observeTeamThreats = (
  previous: TacticalMatchState,
  next: TacticalMatchState,
): TacticalMatchState => {
  // A released goal-kick/GK build-up is already playable football even while presentation
  // retains its restart scenario. Setup and the committed penalty itself supply no threats.
  const live =
    next.restart?.phase !== 'setup' &&
    next.scenario !== 'penalty' &&
    !next.goalCompletionUntil &&
    next.status !== 'half_time' &&
    next.status !== 'full_time' &&
    next.status !== 'abandoned';
  const changedPossession = previous.possessionTeam !== next.possessionTeam;
  const episode = next.ballEpisode ?? 0;
  const owner = next.ball.ownerId
    ? next.players.find((player) => player.id === next.ball.ownerId)
    : undefined;
  const shot = next.ball.shot ?? next.lastShot;
  let teams = next.teams;
  for (const side of ['home', 'away'] as const) {
    const oldMemory = next.teams[side].threatMemory ?? createTeamThreatMemory(0, previous.time);
    const initial = observeRecentSolutions(previous, next, side, oldMemory);
    const due = next.time - initial.evaluatedAt >= TEAM_THREAT_TUNING.evaluationSeconds - 1e-9;
    const newShot = live && shot && shot.shotId !== initial.lastShotId;
    const turnover =
      live &&
      previous.restart?.phase !== 'setup' &&
      previous.scenario !== 'penalty' &&
      previous.ball.travelKind !== 'shot' &&
      !previous.ball.shot &&
      changedPossession &&
      previous.possessionTeam === side;
    const opposingOwner = live && owner?.team === opposing(side) ? owner : undefined;
    const newEpisode = opposingOwner && initial.observedEpisode !== episode;
    if (!due && !newShot && !turnover && !newEpisode && initial === oldMemory) continue;
    let memory = decayMemory(initial, next.time);
    if (newEpisode && opposingOwner)
      memory = {
        ...memory,
        observedEpisode: episode,
        controlOrigin: { ...opposingOwner.position },
        entryObserved: false,
        lineObserved: false,
        isolationObserved: false,
      };
    if (turnover) {
      const livePass =
        previous.ball.travelKind &&
        previous.ball.travelKind !== 'header' &&
        previous.lastPassDiagnostic?.resolvedAt === undefined
          ? previous.lastPassDiagnostic
          : undefined;
      const lostId = previous.ball.ownerId ?? previous.ball.lastTouchPlayerId ?? livePass?.passerId;
      const lost = previous.players.find((player) => player.id === lostId && player.team === side);
      const point = lost?.position ?? previous.ball;
      const nearest = Math.min(
        ...previous.players
          .filter((player) => player.team !== side && !previous.discipline?.[player.id]?.sentOff)
          .map((player) => distance(player.position, point)),
      );
      if (
        depth(point, side) < TEAM_THREAT_TUNING.buildUpDepth &&
        (nearest < 8 ||
          previous.currentPressure > 0.35 ||
          (livePass &&
            next.lastPassDiagnostic?.passId === livePass.passId &&
            next.lastPassDiagnostic.finalResult === 'intercepted' &&
            next.lastPassDiagnostic.resolvedAt !== undefined &&
            next.time - next.lastPassDiagnostic.resolvedAt < 0.1))
      ) {
        const severity = 1.7 + clamp(1 - nearest / 8) * 0.8;
        memory.buildUpLosses = add(memory.buildUpLosses, threatChannel(point), severity);
        if (lost) {
          const remembered = memory.pressuredPlayers.find((player) => player.playerId === lost.id);
          memory.pressuredPlayers = [
            ...memory.pressuredPlayers.filter((player) => player.playerId !== lost.id),
            { playerId: lost.id, score: clamp((remembered?.score ?? 0) + severity, 20) },
          ]
            .sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId))
            .slice(0, TEAM_THREAT_TUNING.maximumPlayerMemories);
        }
      }
    }
    if (opposingOwner) {
      const channel = threatChannel(opposingOwner.position);
      const progress = depth(opposingOwner.position, opposingOwner.team);
      if (!memory.entryObserved && progress >= TEAM_THREAT_TUNING.finalThirdDepth) {
        memory.channelEntries = add(memory.channelEntries, channel, 1);
        memory.entryObserved = true;
      }
      const defenders = next.players.filter(
        (player) =>
          player.team === side &&
          player.profile.primaryPosition !== 'goalkeeper' &&
          !next.discipline?.[player.id]?.sentOff,
      );
      const covering = defenders.filter(
        (player) =>
          depth(player.position, opposingOwner.team) > progress &&
          Math.abs(player.position.y - opposingOwner.position.y) < 15 &&
          distance(player.position, opposingOwner.position) < 26,
      );
      if (
        !memory.lineObserved &&
        progress >= 60 &&
        progress - depth(memory.controlOrigin, opposingOwner.team) >= 10 &&
        covering.length <= 2
      ) {
        memory.lineExposures = add(memory.lineExposures, channel, 1.6);
        memory.lineObserved = true;
      }
      if (!memory.isolationObserved && progress >= 70 && covering.length <= 1) {
        memory.isolation = add(memory.isolation, channel, 1.2);
        memory.isolationObserved = true;
      }
      if (due) {
        const attackers = next.players.filter(
          (player) =>
            player.team === opposingOwner.team &&
            !next.discipline?.[player.id]?.sentOff &&
            distance(player.position, opposingOwner.position) < 12,
        ).length;
        const localDefenders = defenders.filter(
          (player) => distance(player.position, opposingOwner.position) < 12,
        ).length;
        if (progress >= 60 && attackers > localDefenders && attackers >= 2)
          memory.overloads = add(memory.overloads, channel, (next.time - initial.evaluatedAt) / 12);
      }
    }
    if (newShot && shot) {
      const shooter = next.players.find((player) => player.id === shot.shooterId);
      if (shooter?.team === opposing(side) && shot.context !== 'penalty')
        memory.shots = add(
          memory.shots,
          threatChannel(next.ball.from ?? shooter.position),
          1 + shot.baseXg * 2,
        );
      memory.lastShotId = shot.shotId;
    }
    if (due) {
      const territory =
        live && next.possessionTeam !== side
          ? clamp((depth(next.ball, opposing(side)) - 45) / 40)
          : 0;
      const weight = 1 - Math.exp(-(next.time - initial.evaluatedAt) / 12);
      memory.territorialPressure += (territory - memory.territorialPressure) * weight;
      memory = evaluateTeamThreatResponse(next, side, memory);
    }
    if (teams === next.teams) teams = { ...next.teams };
    teams[side] = { ...next.teams[side], threatMemory: memory };
  }
  return teams === next.teams ? next : { ...next, teams };
};
