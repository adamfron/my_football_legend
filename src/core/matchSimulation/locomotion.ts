import { distance, signedForwardDistance } from './matchSpace';
import { isDefensiveEpisodeLocked, shouldCommitRoutinePress } from './defensiveChallenges';
import type {
  LocomotionIntensity,
  LocomotionReason,
  MatchPlayerState,
  TacticalMatchState,
} from './matchState';

export interface LocomotionProjection {
  intensity: LocomotionIntensity;
  reason: LocomotionReason;
  targetSpeed: number;
}

/** Deterministic football-intention projection. Pace changes capability, never intention. */
export const projectLocomotion = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  target = player.target,
): LocomotionProjection => {
  const metres = distance(player.position, target);
  const pace = player.profile.attributes.pace / 100;
  const speedFor = (intensity: LocomotionIntensity) => {
    const sprint = 6.2 + pace * 3.3;
    return intensity === 'walk'
      ? 1.25 + pace * 0.75
      : intensity === 'jog'
        ? 2.6 + pace * 1.5
        : intensity === 'run'
          ? 4.4 + pace * 1.8
          : sprint;
  };
  const result = (intensity: LocomotionIntensity, reason: LocomotionReason) => ({
    intensity,
    reason,
    targetSpeed: speedFor(intensity),
  });
  if (state.restart?.phase === 'setup') return result('walk', 'restart_setup');
  if (
    state.receptionPreparation?.actorId === player.id &&
    state.time >= state.receptionPreparation.awarenessAt
  ) {
    const urgent = state.receptionPreparation.expectedArrivalTime - state.time;
    return result(metres < 2.5 ? 'jog' : urgent < 0.65 ? 'sprint' : 'run', 'receive_pass');
  }
  const movement =
    state.playerMovementIntent?.actorId === player.id ? state.playerMovementIntent : undefined;
  if (movement?.type === 'run_in_behind') return result('sprint', 'depth_run');
  if (movement?.type === 'hold_shape') return result(metres < 3 ? 'walk' : 'jog', 'contain');
  if (movement?.type === 'attack_space')
    return result(metres > 7 ? 'sprint' : 'run', 'press_commit');
  // A live delivery does not turn every nearby player into a loose-ball sprinter. The tactical
  // assignment must actually point at a physically loose ball before a race is urgent.
  const looseRace =
    !state.ball.ownerId &&
    !state.ball.travelKind &&
    state.ball.looseSince !== undefined &&
    distance(player.position, state.ball) < 15 &&
    distance(target, state.ball) < 5;
  if (looseRace) return result('sprint', 'loose_ball_race');
  if (
    state.nearestChallengerId === player.id &&
    state.ball.ownerId &&
    state.defensiveChallenge?.actorId !== player.id &&
    (isDefensiveEpisodeLocked(state, player.id, state.ball.ownerId) ||
      !shouldCommitRoutinePress(state, player.id))
  )
    return result(metres < 3 ? 'walk' : 'jog', 'contain');
  if (state.nearestChallengerId === player.id)
    return result(metres > 8 ? 'sprint' : 'run', 'press_commit');
  const defensiveTransition = state.teams[player.team].phase === 'defensive_transition';
  const ownGoalX = player.team === 'home' ? 0 : 105;
  const behindPlay =
    Math.abs(player.position.x - ownGoalX) > Math.abs(state.ball.x - ownGoalX) + 10;
  if (defensiveTransition && behindPlay && metres > 8) return result('sprint', 'recovery_run');
  const carry = state.ballCarrierIntent?.actorId === player.id;
  if (carry) {
    const mode = state.ballCarrierIntent?.executionMode;
    const projection = result(
      mode === 'burst' ? 'sprint' : mode === 'controlled' || mode === 'evade' ? 'run' : 'jog',
      'ball_carry',
    );
    return {
      ...projection,
      targetSpeed:
        projection.targetSpeed *
        (mode === 'shield'
          ? 0.42
          : mode === 'tight_dribble'
            ? 0.58
            : mode === 'evade'
              ? 0.72
              : mode === 'controlled'
                ? 0.85
                : 1),
    };
  }
  const forward = signedForwardDistance(player.position, target, player.team);
  if (
    player.duty === 'attack' &&
    forward > 14 &&
    metres > 16 &&
    state.teams[player.team].phase === 'attacking_transition'
  )
    return result('sprint', 'depth_run');
  if (metres < 2.5) return result('walk', 'structural_adjustment');
  // Ordinary block corrections are jogging intentions, not continuous high-speed support runs.
  if (metres < 18) return result('jog', 'maintain_shape');
  return result('run', player.team === state.possessionTeam ? 'support_run' : 'maintain_shape');
};

/** Sprint accounting follows sustained speed episodes, independently of the current target label.
 * Clearing optional fields is explicit so a previous snapshot cannot keep a finished episode alive. */
export const projectSprintEpisode = (
  player: Pick<
    MatchPlayerState,
    'sprintStartedAt' | 'sprintRecoveryStartedAt' | 'sprintBurstCounted'
  >,
  speedRatio: number,
  at: number,
  dt: number,
) => {
  const interruptedCandidate =
    player.sprintStartedAt !== undefined && !player.sprintBurstCounted && speedRatio <= 0.7;
  const startedAt = interruptedCandidate
    ? undefined
    : (player.sprintStartedAt ?? (speedRatio >= 0.82 ? at : undefined));
  const recoveryAt =
    startedAt !== undefined && speedRatio <= 0.7
      ? (player.sprintRecoveryStartedAt ?? at)
      : undefined;
  const ended = recoveryAt !== undefined && at + dt - recoveryAt >= 1.2;
  const sustained = startedAt !== undefined && at + dt - startedAt >= 0.65 && !ended;
  const countBurst = sustained && !player.sprintBurstCounted && speedRatio >= 0.82;
  return {
    sprintStartedAt: ended ? undefined : startedAt,
    sprintRecoveryStartedAt: ended ? undefined : recoveryAt,
    sprintBurstCounted: !ended && Boolean(player.sprintBurstCounted || countBurst),
    countBurst,
    // Physical sprint distance stays continuous; only the episode counter waits for maturation.
    actualSprinting: !ended && (speedRatio >= 0.82 || (sustained && speedRatio > 0.7)),
  };
};
