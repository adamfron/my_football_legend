import { distance, signedForwardDistance } from './matchSpace';
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
  const movement =
    state.playerMovementIntent?.actorId === player.id ? state.playerMovementIntent : undefined;
  if (movement?.type === 'run_in_behind') return result('sprint', 'depth_run');
  if (movement?.type === 'hold_shape') return result(metres < 3 ? 'walk' : 'jog', 'contain');
  if (movement?.type === 'attack_space')
    return result(metres > 7 ? 'sprint' : 'run', 'press_commit');
  const looseRace = !state.ball.ownerId && distance(player.position, state.ball) < 15;
  if (looseRace) return result('sprint', 'loose_ball_race');
  if (state.nearestChallengerId === player.id)
    return result(metres > 8 ? 'sprint' : 'run', 'press_commit');
  const defensiveTransition = state.teams[player.team].phase === 'defensive_transition';
  const ownGoalX = player.team === 'home' ? 0 : 105;
  const behindPlay =
    Math.abs(player.position.x - ownGoalX) > Math.abs(state.ball.x - ownGoalX) + 10;
  if (defensiveTransition && behindPlay && metres > 8) return result('sprint', 'recovery_run');
  const carry = state.ballCarrierIntent?.actorId === player.id;
  if (carry) return result(metres > 10 ? 'run' : 'jog', 'ball_carry');
  const forward = signedForwardDistance(player.position, target, player.team);
  if (player.duty === 'attack' && forward > 10 && metres > 12) return result('sprint', 'depth_run');
  if (metres < 2.5) return result('walk', 'structural_adjustment');
  if (metres < 7) return result('jog', 'maintain_shape');
  return result('run', player.team === state.possessionTeam ? 'support_run' : 'maintain_shape');
};
