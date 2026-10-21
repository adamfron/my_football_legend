import type { TacticalMatchState } from '../../core/matchSimulation/matchState';
import type { MatchFlowTelemetry } from '../../core/matchSimulation/matchFlowTelemetry';

/** Match Lab only. A bounded observer window, never a target for the football engine. */
export const FirstTouchDiagnostics = ({
  state,
  telemetry,
  errors,
}: {
  state: TacticalMatchState;
  telemetry: MatchFlowTelemetry;
  errors: number;
}) => {
  const intervals = telemetry.actionTempoSamples
    .slice(-128)
    .filter((s) => s.kind === 'team_action')
    .slice(-64)
    .map((s) => s.interval)
    .sort((a, b) => a - b);
  const mean = intervals.reduce((a, b) => a + b, 0) / Math.max(1, intervals.length);
  const median = intervals.length
    ? (intervals[Math.floor((intervals.length - 1) / 2)]! +
        intervals[Math.floor(intervals.length / 2)]!) /
      2
    : 0;
  const attempts = telemetry.observedPassAttemptIds.length;
  return (
    <details className="player-diagnostics">
      <summary>DEV · Tempo i pierwszy kontakt</summary>
      <p>
        Polityka: {state.decisionPolicy ?? 'legacy-pr176'}
        <br />
        Obserwowane podania z pierwszej piłki: {telemetry.firstTimePassAttempts} · ukończone:{' '}
        {telemetry.firstTimePassCompleted} · udział w {attempts} zaobserwowanych próbach:{' '}
        {attempts ? ((100 * telemetry.firstTimePassAttempts) / attempts).toFixed(1) : '0.0'}%<br />
        Odstęp między akcjami (ostatnie {intervals.length}): średnia {mean.toFixed(2)} s · mediana{' '}
        {median.toFixed(2)} s<br />
        Kontakt:{' '}
        {state.ball.travelKind
          ? 'piłka w ruchu'
          : (state.lastReceptionOutcome?.kind ??
            (state.ball.ownerId ? 'kontrola' : 'piłka wolna'))}{' '}
        · stopa: {state.lastGroundContact?.region ?? '—'}
        <br />
        Błędy obserwatora: {errors}. Zakres obejmuje wyłącznie okresy włączonej obserwacji.
      </p>
    </details>
  );
};
