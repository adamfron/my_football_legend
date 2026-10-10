import type { TacticalMatchState } from '../../core/matchSimulation/matchState';

/** Player-facing clock follows the displayed canonical second without fractional precision. */
export const formatMatchTime = (seconds: number) => {
  const wholeSeconds = Math.floor(Math.max(0, seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`;
};

/** Period-relative stoppage time respects the actual (possibly extended) first-half end. */
export const formatPeriodClock = (state: TacticalMatchState, seconds = state.time) => {
  const clock = state.timekeeping;
  if (!clock || seconds < clock.periodStartedAt) return formatMatchTime(seconds);
  const elapsed = Math.max(0, seconds - clock.periodStartedAt);
  const base = clock.period === 'second_half' ? 45 : 0;
  return elapsed >= 2700
    ? `${base + 45}+${formatMatchTime(elapsed - 2700)}`
    : formatMatchTime(base * 60 + elapsed);
};

export const matchPeriodLabel = (state: TacticalMatchState) =>
  state.status === 'half_time'
    ? 'Przerwa'
    : state.status === 'full_time'
      ? 'Koniec meczu'
      : state.status === 'abandoned'
        ? 'Mecz przerwany'
        : state.status === 'second_half'
          ? 'Druga połowa'
          : 'Pierwsza połowa';

/** DEV diagnostics retain enough precision to identify fixed-step canonical boundaries. */
export const formatDiagnosticMatchTime = (seconds: number) => {
  const milliseconds = Math.round(Math.max(0, seconds) * 1000);
  const minutes = Math.floor(milliseconds / 60_000);
  const second = Math.floor((milliseconds % 60_000) / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
};
