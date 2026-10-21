import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import console from 'node:console';
import { pr172SourceHash } from './pr172Evidence.ts';
const dir = 'docs/performance/pr180-evidence';
const read = (label, kind) =>
  JSON.parse(gunzipSync(readFileSync(`${dir}/browser-${label}-${kind}.json.gz`)));
const rows = ['r1', 'r2', 'r3', 'human'].map((label) => {
  const session = read(label, 'session'),
    roles = read(label, 'roles');
  if (
    session.metadata.policy !== roles.metadata.policy ||
    session.metadata.fixtureId !== roles.metadata.fixtureId ||
    session.metadata.sourceRevision !== roles.metadata.sourceRevision
  )
    throw Error('Browser export provenance mismatch');
  if (session.runtimeDiagnostics.length || roles.diagnostics.observerErrors.length)
    throw Error('Browser observer/runtime error');
  const stats = session.canonicalStatistics.players;
  const attempts = stats.reduce((n, p) => n + p.passesAttempted, 0);
  if (attempts !== session.matchFlowTelemetry.observedPassAttemptIds.length)
    throw Error('Browser attempt denominator mismatch');
  return {
    label,
    policy: session.metadata.policy,
    fixtureId: session.metadata.fixtureId,
    sourceRevision: session.metadata.sourceRevision,
    duration: session.duration,
    coverage: session.metadata.collectionScope,
    attempts,
    firstTimeAttempts: session.matchFlowTelemetry.firstTimePassAttempts,
    firstTimeCompleted: session.matchFlowTelemetry.firstTimePassCompleted,
    renderer: session.rendererLifecycle,
    runtimeErrors: session.runtimeDiagnostics,
    observerErrors: roles.diagnostics.observerErrors,
    ...(label === 'human'
      ? {
          controlledPlayer: session.controlledPlayer,
          playerStats: stats.find((p) => p.playerId === session.controlledPlayer),
          decisions: session.decisionTelemetry,
          agency: session.playerAgency,
        }
      : {}),
  };
});
if (
  new Set(rows.map((r) => r.sourceRevision)).size !== 1 ||
  new Set(rows.slice(0, 3).map((r) => r.fixtureId)).size !== 1
)
  throw Error('Unmatched browser source/input');
const output = {
  coreSourceHash: pr172SourceHash(),
  scope:
    'Actual local browser UI, canonical 25 ms engine, 16x requested playback and capture enabled from time zero. Partial smoke fragments, not full-match policy estimates.',
  consoleObservation: {
    method:
      'Browser dev.logs warn/error was read after each fragment; all four queries returned an empty list.',
    warningsAndErrors: 0,
  },
  humanUiActions: [
    { at: 0.125, choice: 'Podaj do nogi', receiverId: 'footballer_pro_9_13' },
    { at: 25.75, choice: 'Wyjdź do przechwytu' },
    {
      at: 129.075,
      choice: 'Podaj do nogi',
      receiverId: 'footballer_pro_9_13',
      passesReceivedBeforeChoice: 3,
    },
  ],
  humanScope:
    'Two selected on-ball passes and one defensive movement; ordinary receptions/delegated passes also occurred. No incoming_ball menu was manually selected. No injected ownership, state or DEV restart scenario.',
  rows,
};
writeFileSync('docs/performance/PR180-browser.json', JSON.stringify(output, null, 2) + '\n');
console.log(
  JSON.stringify(
    rows.map((r) => ({
      label: r.label,
      duration: r.duration,
      attempts: r.attempts,
      first: r.firstTimeAttempts,
      errors: r.runtimeErrors.length,
    })),
  ),
);
