import type {
  MatchPlayerState,
  TacticalMatchState,
  LocomotionIntensity,
  LocomotionReason,
} from './matchState';
export const tempoEffort = (
  state: TacticalMatchState,
  p: MatchPlayerState,
  intensity: LocomotionIntensity,
  reason: LocomotionReason,
): LocomotionIntensity => {
  if (
    !state.experimentalTeamTempo ||
    (state.playerAgencyEnabled !== false && p.id === state.controlledFootballerId)
  )
    return intensity;
  const tempo = state.activePerceptionRuntime?.tempo[p.id];
  if (!tempo || state.time >= tempo.expiresAt) return intensity;
  // Explicit human/motor commitments, real races, receptions and defensive recovery retain priority.
  if (!['support_run', 'maintain_shape', 'structural_adjustment', 'depth_run'].includes(reason))
    return intensity;
  if (tempo.mode === 'patient' && reason !== 'depth_run')
    return intensity === 'run' || intensity === 'sprint' ? 'jog' : intensity;
  if (
    (tempo.mode === 'accelerate' || tempo.mode === 'urgent') &&
    (reason === 'support_run' || reason === 'depth_run')
  )
    return intensity === 'walk' ? 'jog' : intensity === 'jog' ? 'run' : 'sprint';
  return intensity;
};
