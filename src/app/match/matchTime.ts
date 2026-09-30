/** Player-facing clock follows the displayed canonical second without fractional precision. */
export const formatMatchTime = (seconds: number) => {
  const wholeSeconds = Math.floor(Math.max(0, seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`;
};

/** DEV diagnostics retain enough precision to identify fixed-step canonical boundaries. */
export const formatDiagnosticMatchTime = (seconds: number) => {
  const milliseconds = Math.round(Math.max(0, seconds) * 1000);
  const minutes = Math.floor(milliseconds / 60_000);
  const second = Math.floor((milliseconds % 60_000) / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
};
