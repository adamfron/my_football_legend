import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { observeBoundedScene, knownBoundedPlayers } from './boundedPerception';
import { TACTICAL_PREFERENCE_DEFAULTS } from './tacticalPreferences';
import { type TempoIntention } from './activePerceptionState';
import { distance, distanceToSegment } from './matchSpace';
import { startPerformanceSpan, endPerformanceSpan } from './performanceProfiling';

/** Own coach instructions and score are shared context. Opponent organisation is
 * estimated only from local sightings; urgency does not assert physiological ability. */
export const observeTempoIntention = (
  state: TacticalMatchState,
  p: MatchPlayerState,
): TempoIntention => {
  const s = observeBoundedScene(state, p),
    known = knownBoundedPlayers(s);
  const pref =
    state.teams[p.team].tacticalPreferences ??
    TACTICAL_PREFERENCE_DEFAULTS[state.teams[p.team].style];
  const foes = known.filter((q) => q.team !== p.team),
    friends = known.filter((q) => q.team === p.team && !q.keeper);
  const owner = known.find((q) => q.id === s.ball?.ownerId);
  const ours = s.ball?.ownerId === p.id || owner?.team === p.team;
  const origin = ours && s.ball ? s.ball.position : s.position;
  const target = { x: Math.max(0, Math.min(105, origin.x + s.direction * 12)), y: origin.y };
  const lane = Math.min(8, ...foes.map((q) => distanceToSegment(q.position, origin, target)));
  const runners = friends.filter(
    (q) => s.direction * (q.position.x - origin.x) > 3 && distance(q.position, origin) < 25,
  ).length;
  const opportunity =
    ours && s.ball
      ? Math.max(0, Math.min(1, (lane - 1.5) / 7)) *
        (0.6 + Math.min(2, runners) * 0.2) *
        (foes.length >= 2 ? 1 : 0.5)
      : 0;
  const pressure = Math.min(20, ...foes.map((q) => distance(q.position, origin)));
  const chasing = s.scoreDifference < 0 && s.at > 4200,
    protecting = s.scoreDifference > 0 && s.at > 4200;
  const urgency = Math.max(
    0,
    Math.min(
      1,
      opportunity * 0.85 +
        Number(chasing) * 0.45 +
        Number(pressure < 4) * 0.25 +
        pref.verticality * 0.12,
    ),
  );
  const mode: TempoIntention['mode'] =
    owner && owner.team !== p.team
      ? 'recover'
      : opportunity > 0.55
        ? 'accelerate'
        : chasing
          ? 'urgent'
          : ours && (pref.possessionPatience > 0.65 || protecting) && pressure > 5
            ? 'patient'
            : 'balanced';
  return {
    at: s.at,
    expiresAt: s.at + 0.45,
    mode,
    urgency,
    opportunity,
    capacity: p.fitness?.burstReadiness ?? 1,
    reason:
      mode === 'accelerate'
        ? 'observed_channel_overrides_patient_preference'
        : mode === 'patient'
          ? 'coach_patience_with_local_space'
          : mode === 'recover'
            ? 'observed_opposition_possession'
            : mode === 'urgent'
              ? 'late_score_urgency'
              : 'ordinary_local_context',
  };
};
export const advanceTeamTempo = (state: TacticalMatchState): TacticalMatchState => {
  if (
    !state.experimentalTeamTempo ||
    !state.activePerceptionRuntime ||
    state.restart ||
    state.postGoal
  )
    return state;
  const span = startPerformanceSpan('team_tempo'),
    tempo: NonNullable<TacticalMatchState['activePerceptionRuntime']>['tempo'] = {};
  for (const p of state.players) {
    if (state.discipline?.[p.id]?.sentOff) continue;
    const old = state.activePerceptionRuntime.tempo[p.id];
    tempo[p.id] = old && state.time - old.at < 0.2 - 1e-8 ? old : observeTempoIntention(state, p);
  }
  endPerformanceSpan('team_tempo', span);
  return { ...state, activePerceptionRuntime: { ...state.activePerceptionRuntime, tempo } };
};
