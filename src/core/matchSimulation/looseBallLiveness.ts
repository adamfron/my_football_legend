import { z } from 'zod';
import { BALL_RADIUS } from './ballFlight';
import { ballAcquisitionSchema } from './ballAcquisition';
import { playerContactGeometry } from './ballContactGeometry';
import { deriveLooseBallAssignments } from './looseBallPhysics';
import { canParticipatePhysically } from './matchInjuries';
import { distance, physicalPointSchema, pitchPointSchema } from './matchSpace';
import type { TacticalMatchState } from './matchState';
import { isBallWithinPlayingBoundary } from './pitchBoundary';
import { canContactAfterThrowIn } from './throwIn';

const seconds = z.number().nonnegative().finite();
export const looseBallLivenessObservationSchema = z.object({
  episode: z.string(),
  since: seconds,
  sampledAt: seconds,
  lastProgressAt: seconds,
  ball: physicalPointSchema,
  minimumFootDistance: seconds.optional(),
  lastDiagnosticAt: seconds.optional(),
});
export type LooseBallLivenessObservation = z.infer<typeof looseBallLivenessObservationSchema>;

export const looseBallLivenessDiagnosticSchema = z.object({
  at: seconds,
  unresolvedSeconds: seconds,
  progressAbsentSeconds: seconds,
  classification: z.enum(['legal_unresolved', 'legal_recovery_in_progress']),
  ballEpisode: z.number().int().nonnegative(),
  ball: physicalPointSchema.extend({
    radius: z.number().positive(),
    height: seconds,
    velocity: physicalPointSchema,
  }),
  minimumFootDistance: seconds.optional(),
  acquisition: ballAcquisitionSchema.optional(),
  actors: z
    .array(
      z.object({
        id: z.string(),
        position: physicalPointSchema,
        target: pitchPointSchema,
        velocity: physicalPointSchema,
        footDistance: seconds,
        footReach: z.number().positive(),
        assigned: z.boolean(),
        canContact: z.boolean(),
      }),
    )
    .max(8),
});
export type LooseBallLivenessDiagnostic = z.infer<typeof looseBallLivenessDiagnosticSchema>;

/** One 1 Hz sample, eight actors and 32 diagnostics. The clocks only describe; they never
 * award possession, move a ball/body, release a restart or alter decision/RNG state. */
export const observeLooseBallLiveness = (state: TacticalMatchState): TacticalMatchState => {
  if (
    state.scenario !== 'open_play' ||
    state.ball.ownerId ||
    state.ball.travelKind ||
    state.ball.looseSince === undefined ||
    !isBallWithinPlayingBoundary(state.ball) ||
    state.postGoal ||
    state.injuryAssessment ||
    (state.status !== 'first_half' && state.status !== 'second_half')
  ) {
    if (!state.looseBallLivenessObservation) return state;
    const { looseBallLivenessObservation: _finished, ...next } = state;
    void _finished;
    return next;
  }
  const episode = `${state.ballEpisode ?? 0}:${state.ball.looseSince}`;
  const previous = state.looseBallLivenessObservation;
  if (previous?.episode === episode && state.time - previous.sampledAt < 1) return state;
  const actors = state.players
    .filter((player) => canParticipatePhysically(player) && !state.discipline?.[player.id]?.sentOff)
    .map((player) => {
      const geometry = playerContactGeometry(player);
      const footDistance = Math.min(
        distance(geometry.leftFoot, state.ball),
        distance(geometry.rightFoot, state.ball),
      );
      return {
        id: player.id,
        position: { ...player.position },
        target: { ...player.target },
        velocity: { ...player.velocity },
        footDistance,
        footReach: geometry.footReach,
        assigned: false,
        canContact:
          footDistance <= geometry.footReach &&
          (state.ball.height ?? 0) < 0.5 &&
          canContactAfterThrowIn(state, player.id),
      };
    })
    .sort((a, b) => a.footDistance - b.footDistance || a.id.localeCompare(b.id))
    .slice(0, 8);
  const minimumFootDistance = actors[0]?.footDistance;
  const continuing = previous?.episode === episode;
  const progressed =
    !continuing ||
    distance(previous.ball, state.ball) > 0.25 ||
    (minimumFootDistance !== undefined &&
      previous.minimumFootDistance !== undefined &&
      previous.minimumFootDistance - minimumFootDistance > 0.1);
  let observation: LooseBallLivenessObservation = {
    episode,
    since: continuing ? previous.since : state.time,
    sampledAt: state.time,
    lastProgressAt: progressed ? state.time : previous.lastProgressAt,
    ball: { x: state.ball.x, y: state.ball.y },
    ...(minimumFootDistance !== undefined ? { minimumFootDistance } : {}),
    ...(continuing && previous.lastDiagnosticAt !== undefined
      ? { lastDiagnosticAt: previous.lastDiagnosticAt }
      : {}),
  };
  if (state.time - (observation.lastDiagnosticAt ?? observation.since) < 30)
    return { ...state, looseBallLivenessObservation: observation };
  const assigned = new Set(deriveLooseBallAssignments(state).map(({ playerId }) => playerId));
  const diagnostic: LooseBallLivenessDiagnostic = {
    at: state.time,
    unresolvedSeconds: state.time - observation.since,
    progressAbsentSeconds: state.time - observation.lastProgressAt,
    classification:
      state.time - observation.lastProgressAt >= 10
        ? 'legal_unresolved'
        : 'legal_recovery_in_progress',
    ballEpisode: state.ballEpisode ?? 0,
    ball: {
      x: state.ball.x,
      y: state.ball.y,
      radius: BALL_RADIUS,
      height: state.ball.height ?? 0,
      velocity: { x: state.ball.velocity?.x ?? 0, y: state.ball.velocity?.y ?? 0 },
    },
    ...(minimumFootDistance !== undefined ? { minimumFootDistance } : {}),
    ...(state.ballAcquisition ? { acquisition: structuredClone(state.ballAcquisition) } : {}),
    actors: actors.map((actor) => ({ ...actor, assigned: assigned.has(actor.id) })),
  };
  observation = { ...observation, lastDiagnosticAt: state.time };
  return {
    ...state,
    looseBallLivenessObservation: observation,
    looseBallLivenessDiagnostics: [...(state.looseBallLivenessDiagnostics ?? []), diagnostic].slice(
      -32,
    ),
  };
};
