import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { distance, teamSideSchema } from './matchSpace';
import { beginStoppage, endStoppage } from './stoppageLedger';
import { integrateBallFlight } from './ballPhysics';
import { BALL_RADIUS } from './ballFlight';
import { isRestartSetup } from './restartPhase';
import { canParticipatePhysically } from './matchInjuries';
import { advanceMatchIntervalFitness } from './matchFitness';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import {
  advanceMatchSubstitutions,
  clearUnavailableExecution,
  moveSubstitutionBody,
  planCoachSubstitutions,
  substitutionBlocksRestart,
} from './substitutions';

export const injuryAssessmentSchema = z.object({
  id: z.string(),
  startedAt: z.number().nonnegative(),
  until: z.number().nonnegative(),
  dropTeam: teamSideSchema,
  existingRestart: z.boolean().optional(),
  droppedAt: z.number().nonnegative().optional(),
});
export type InjuryAssessment = z.infer<typeof injuryAssessmentSchema>;
export const droppedBallTouchRestrictionSchema = z.object({
  assessmentId: z.string(),
  team: teamSideSchema,
  firstTouchId: z.string().optional(),
  secondPlayerTouched: z.boolean(),
});
export type DroppedBallTouchRestriction = z.infer<typeof droppedBallTouchRestrictionSchema>;
export const observeDroppedBallContact = (
  state: TacticalMatchState,
  playerId: string,
): TacticalMatchState => {
  const restriction = state.droppedBallTouchRestriction;
  if (!restriction || restriction.secondPlayerTouched) return state;
  const player = state.players.find((actor) => actor.id === playerId);
  if (!player) return state;
  if (!restriction.firstTouchId)
    return {
      ...state,
      droppedBallTouchRestriction: { ...restriction, firstTouchId: playerId, team: player.team },
    };
  return playerId === restriction.firstTouchId
    ? state
    : { ...state, droppedBallTouchRestriction: { ...restriction, secondPlayerTouched: true } };
};
export const resolveDroppedBallGoalOutcome = (
  state: TacticalMatchState,
  scoringTeam: 'home' | 'away',
): 'goal' | 'goal_kick' | 'corner' => {
  const restriction = state.droppedBallTouchRestriction;
  if (!restriction || restriction.secondPlayerTouched) return 'goal';
  return scoringTeam === restriction.team ? 'goal_kick' : 'corner';
};

/** Protect the injured actor immediately. A previously released shot remains physically live. */
export const processInjuryAssessment = (input: TacticalMatchState): TacticalMatchState => {
  if (input.status === 'full_time' || input.status === 'abandoned' || input.status === 'half_time')
    return input;
  const unavailable = input.players.filter((player) => !canParticipatePhysically(player));
  if (!unavailable.length && !input.pendingInjuryAssessment) return input;
  let state = input;
  for (const player of unavailable) {
    state = clearUnavailableExecution(
      {
        ...state,
        players: state.players.filter((active) => active.id !== player.id),
        departedPlayers: [
          ...(state.departedPlayers ?? []).filter((departed) => departed.id !== player.id),
          player,
        ],
        ...(state.statistics
          ? {
              statistics: {
                ...state.statistics,
                playerActiveUntil: {
                  ...state.statistics.playerActiveUntil,
                  [player.id]: state.time,
                },
                players: state.statistics.players.map((entry) =>
                  entry.playerId === player.id
                    ? {
                        ...entry,
                        minutesPlayed:
                          (state.statistics!.playerMinutesBeforeEntry?.[player.id] ?? 0) +
                          Math.max(0, state.time - (player.activeSince ?? 0)) / 60,
                      }
                    : entry,
                ),
              },
            }
          : {}),
      },
      player.id,
    );
  }
  // Complete a real shot before the injury whistle; no vanished shot or invented replacement.
  if (state.ball.shot && !state.ball.shot.outcome) return state;
  const terminalPenalty = state.timekeeping?.terminalPenalty;
  const movingShotRebound =
    state.lastShot &&
    state.pendingPossessionLoss?.id === `${state.seed}:shot-rebound:${state.lastShot.shotId}` &&
    !state.ball.ownerId &&
    (Math.hypot(
      state.ball.velocity?.x ?? 0,
      state.ball.velocity?.y ?? 0,
      state.ball.velocity?.z ?? 0,
    ) > 0.15 ||
      (state.ball.height ?? 0) > 0.15);
  // A parry/frame rebound remains a released shot. Remove the unable actor, but do not
  // freeze the ball or replace the remaining flight with a dropped ball.
  if (movingShotRebound || (terminalPenalty?.shotId && terminalPenalty.completedAt === undefined))
    return state;
  if (state.injuryAssessment) return state;
  const injury =
    unavailable[0]?.injury ??
    state.injuries?.find((fact) => fact.id === state.pendingInjuryAssessment);
  if (!injury) {
    const next = { ...state };
    delete next.pendingInjuryAssessment;
    return next;
  }
  const actors = [...state.players, ...(state.departedPlayers ?? [])];
  const lastTouch =
    actors.find((player) => player.id === input.ball.ownerId) ??
    actors.find((player) => player.id === state.ball.lastTouchPlayerId);
  const existingRestart = isRestartSetup(state) || Boolean(state.postGoal);
  state = beginStoppage(
    {
      ...state,
      injuryAssessment: {
        id: injury.id,
        startedAt: state.time,
        until: state.time + 18,
        dropTeam: lastTouch?.team ?? state.possessionTeam,
        existingRestart,
      },
    },
    injury.id,
    'injury',
    injury.at,
  );
  const next = { ...state };
  delete next.pendingInjuryAssessment;
  return planCoachSubstitutions(next);
};

/** Assessment, replacement and lawful dropped-ball preparation share the existing stoppage. */
const stepInjuryAssessmentIntervalCore = (
  input: TacticalMatchState,
  dt: number,
): TacticalMatchState => {
  if (!input.injuryAssessment) return input;
  let state = advanceMatchSubstitutions(input, { ...input, time: input.time + dt }, dt);
  const assessment = state.injuryAssessment!;
  if (assessment.existingRestart) {
    state = {
      ...state,
      players: state.players.map((player) => moveSubstitutionBody(player, player.position, dt)),
    };
    if (state.time < assessment.until || substitutionBlocksRestart(state)) return state;
    const next = { ...state };
    delete next.injuryAssessment;
    return next;
  }
  // Law 8: the defending goalkeeper receives a drop in their penalty area; otherwise the team
  // of the last touch receives it. Other bodies must actually move four metres away.
  const defending =
    state.ball.x < 16.5 && state.ball.y >= 13.84 && state.ball.y <= 54.16
      ? 'home'
      : state.ball.x > 88.5 && state.ball.y >= 13.84 && state.ball.y <= 54.16
        ? 'away'
        : undefined;
  const recipients = state.players.filter(
    (player) => player.team === (defending ?? assessment.dropTeam),
  );
  const receiver = recipients.sort(
    (a, b) =>
      (defending ? Number(isMatchGoalkeeper(b)) - Number(isMatchGoalkeeper(a)) : 0) ||
      distance(a.position, state.ball) - distance(b.position, state.ball) ||
      a.id.localeCompare(b.id),
  )[0];
  if (!receiver) return state;
  if (assessment.droppedAt === undefined) {
    state = {
      ...state,
      players: state.players.map((player) => {
        if (player.id === receiver.id)
          return moveSubstitutionBody(
            player,
            { x: state.ball.x, y: state.ball.y + (state.ball.y > 67 ? -0.6 : 0.6) },
            dt,
          );
        const metres = distance(player.position, state.ball);
        if (metres >= 4.2) return { ...player, velocity: { x: 0, y: 0 } };
        const dx = player.position.x - state.ball.x,
          dy = player.position.y - state.ball.y,
          magnitude = Math.max(0.001, Math.hypot(dx, dy));
        let target = {
          x: Math.max(
            0,
            Math.min(105, state.ball.x + (magnitude === 0.001 ? 1 : dx / magnitude) * 4.4),
          ),
          y: Math.max(0, Math.min(68, state.ball.y + (dy / magnitude) * 4.4)),
        };
        if (distance(target, state.ball) < 4.2) {
          const towardCentre = { x: 52.5 - state.ball.x, y: 34 - state.ball.y };
          const length = Math.max(0.001, Math.hypot(towardCentre.x, towardCentre.y));
          target = {
            x: state.ball.x + (towardCentre.x / length) * 4.4,
            y: state.ball.y + (towardCentre.y / length) * 4.4,
          };
        }
        return moveSubstitutionBody(player, target, dt);
      }),
    };
    const ready = state.players.every((player) =>
      player.id === receiver.id
        ? distance(player.position, state.ball) < 1
        : distance(player.position, state.ball) >= 4,
    );
    if (state.time < assessment.until || substitutionBlocksRestart(state) || !ready) return state;
    return {
      ...state,
      possessionTeam: receiver.team,
      ball: {
        x: state.ball.x,
        y: state.ball.y,
        height: 0.6,
        airborne: true,
        velocity: { x: 0, y: 0, z: 0 },
        looseSince: state.time,
        ...(state.ball.lastTouchPlayerId
          ? { lastTouchPlayerId: state.ball.lastTouchPlayerId }
          : {}),
      },
      injuryAssessment: { ...assessment, droppedAt: state.time },
    };
  }
  const flight = integrateBallFlight(
    {
      position: { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? BALL_RADIUS },
      velocity: {
        x: state.ball.velocity?.x ?? 0,
        y: state.ball.velocity?.y ?? 0,
        z: state.ball.velocity?.z ?? 0,
      },
      airborne: state.ball.airborne ?? true,
      bounceCount: state.ball.bounceCount ?? 0,
    },
    dt,
  );
  state = {
    ...state,
    ball: {
      ...state.ball,
      x: flight.position.x,
      y: flight.position.y,
      height: flight.position.z,
      velocity: flight.velocity,
      airborne: flight.airborne,
      bounceCount: flight.bounceCount,
    },
  };
  if (!flight.bounceCount && flight.position.z > BALL_RADIUS) return state;
  const next = { ...state };
  delete next.injuryAssessment;
  next.droppedBallTouchRestriction = {
    assessmentId: assessment.id,
    team: receiver.team,
    secondPlayerTouched: false,
  };
  return endStoppage(next);
};

export const stepInjuryAssessmentInterval = (
  input: TacticalMatchState,
  dt: number,
): TacticalMatchState => {
  if (!input.injuryAssessment) return input;
  return advanceMatchIntervalFitness(input, stepInjuryAssessmentIntervalCore(input, dt), dt);
};
