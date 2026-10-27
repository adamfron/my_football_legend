/** Early v1 match observers retained a released restart context as a terminal stoppage.
 * The raw receipts stay immutable. Without the tick stream we cannot disambiguate that
 * origin from an immediate new award, so these episodes are excluded, never called failures. */
export const eligiblePassOutcomes = (run) =>
  run.passOutcomes.filter(
    (p) =>
      !p.restartOrigin &&
      !(p.outcome.terminal === 'restart' && p.outcome.terminalAt <= p.releasedAt + 0.025001),
  );
