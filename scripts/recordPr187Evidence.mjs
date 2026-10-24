/* global structuredClone */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';

const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || v instanceof Uint8Array ? v : JSON.stringify(v))
    .digest('hex');
const read = (p) => JSON.parse(readFileSync(p));
const root = 'docs/performance',
  baseline = read(`${root}/PR187-baseline.json`);
for (const f of baseline.historical)
  if (
    sha(
      f.path.endsWith('.json')
        ? readFileSync(f.path, 'utf8').replaceAll('\r\n', '\n')
        : readFileSync(f.path),
    ) !== f.sha256
  )
    throw Error(`Historical modification: ${f.path}`);
const names = readdirSync(root)
  .filter((p) => /^PR187-match-.*\.json$/.test(p))
  .sort();
const receipts = names.map((name) => {
  const r = read(`${root}/${name}`),
    bytes = readFileSync(r.archive),
    payload = gunzipSync(bytes);
  if (sha(bytes) !== r.archiveSha256 || sha(payload) !== r.payloadSha256)
    throw Error(`Invalid archive: ${name}`);
  const data = JSON.parse(payload);
  if (data.finalState && sha(data.finalState) !== r.finalStateSha256)
    throw Error(`Final state mismatch: ${name}`);
  return { name, r, data };
});
const current = receipts.filter(({ name, r }) => r.full && r.observed && name.endsWith('-4.json'));
if (current.length !== 15 || current.some(({ r }) => r.failure || r.status !== 'full_time'))
  throw Error(`Expected 15 completed paired development variants, found ${current.length}`);
if (new Set(current.map(({ r }) => r.sourceSha256)).size !== 1)
  throw Error('Mixed production sources');
for (const design of ['dev-ss', 'dev-sw', 'dev-ww']) {
  const inputs = current
    .filter(({ r }) => r.design === design)
    .map(({ data }) => {
      const input = structuredClone(data.input);
      delete input.decisionPolicy;
      return sha(input);
    });
  if (new Set(inputs).size !== 1) throw Error(`Unpaired physical inputs: ${design}`);
}
const policies = ['opportunity-driven-v1', 'hierarchical-intent-v1', 'contextual-judgment-v1'];
const observerNeutrality = policies.map((policy) => {
  const observed = current.find(({ r }) => r.design === 'dev-sw' && r.policy === policy);
  const bare = receipts.find(
    ({ name, r }) =>
      r.full &&
      !r.observed &&
      r.design === 'dev-sw' &&
      r.policy === policy &&
      name.endsWith('-4.json'),
  );
  if (
    !bare ||
    bare.r.status !== 'full_time' ||
    bare.r.finalStateSha256 !== observed.r.finalStateSha256 ||
    bare.r.inputSha256 !== observed.r.inputSha256
  )
    throw Error(`Full observer replay mismatch: ${policy}`);
  return {
    policy,
    design: 'dev-sw',
    inputSha256: bare.r.inputSha256,
    finalStateSha256: bare.r.finalStateSha256,
    equivalent: true,
    canonicalSeconds: bare.r.canonicalSeconds,
  };
});
const research = read(`${root}/PR187-research-final.json`);
if (sha(readFileSync(research.archive)) !== research.archiveSha256)
  throw Error('Research archive mismatch');
const trials = JSON.parse(gunzipSync(readFileSync(research.archive)));
const rows = current.map(({ name, r, data }) => {
  const telemetry = data.telemetry;
  return {
    receipt: name,
    design: r.design,
    policy: r.policy,
    canonicalSeconds: r.canonicalSeconds,
    score: r.score,
    passes: telemetry.passesAttempted,
    completedPasses: telemetry.passesCompleted,
    shots: telemetry.shots,
    goals: telemetry.goals,
    saves: telemetry.saves,
    threatFlow: telemetry.threatFlow,
    counts: r.counts,
    wallMilliseconds: r.wallMilliseconds,
    cpuMicroseconds: r.cpuMicroseconds,
    rssBytes: r.rssBytes,
    finalStateSha256: r.finalStateSha256,
    sourceSha256: r.sourceSha256,
    evaluatorSha256: r.evaluatorSha256,
  };
});
const summary = {
  schemaVersion: 1,
  cohort: 'development_only',
  baseCommit: baseline.baseCommit,
  codeCommit: 'bdc8db10db0b82cb0f116a0eeca581d24fb992ac',
  sourceSha256: current[0].r.sourceSha256,
  preservedHistoricalFiles: baseline.historical.length,
  independentDevelopmentDesigns: 3,
  pairedFullMatchVariants: 15,
  additionalFullObserverReplays: 3,
  independentConfirmationDesigns: 0,
  confirmationStatus: 'not_run_blocked_by_incomplete_whole_match_perception_and_calibration',
  informationComparison:
    'Historical B/R3 versus experimental on-ball policies sharing unbounded defensive/GK/restart controllers. Not a whole-match equal-information comparison.',
  rows,
  observerNeutrality,
  shootingSummary: research.shootingSummary,
  patternSummary: trials.patternTrials.map((r) => ({
    pattern: r.pattern,
    familiarity: r.familiarity,
    blocked: r.blocked,
    movement: r.movement,
    firstRecognition: r.traces
      .filter((t) => t.stage === 'pattern' && t.reason.startsWith('observed:'))
      .slice(0, 2)
      .map((t) => ({
        actorId: t.actorId,
        observedAt: t.at,
        recognisedAt: Number(t.reason.split('recognised_at:')[1]),
      })),
    estimatedPassAvailableAt: r.passAvailableAt,
    passAttemptedAt: r.passAttemptedAt,
    passReleasedAt: r.passReleasedAt,
    receiverArrival: r.receiverArrival,
    passOutcome: r.passOutcome,
  })),
  negativeDevelopmentRuns: receipts
    .filter(({ r }) => r.failure)
    .map(({ name, r }) => ({
      receipt: name,
      sourceSha256: r.sourceSha256,
      at: r.canonicalSeconds,
      failure: r.failure,
    })),
  allMatchReceipts: names,
  researchReceipt: 'PR187-research-final.json',
  previousApparatusReceipt: 'PR187-research.json',
};
const path = `${root}/PR187-evidence-index.json`;
if (process.argv.includes('--replay')) {
  if (sha(read(path)) !== sha(summary)) throw Error('Evidence index mismatch');
} else {
  writeFileSync(path, JSON.stringify(summary, null, 2) + '\n');
  const table = [
    '| Projekt | Polityka | Wynik | Podania / celne | Strzały | Decyzje / inspekcje | Wzorce / dotarcia |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(
      (r) =>
        `| ${r.design} | ${r.policy} | ${r.score.home}:${r.score.away} | ${r.passes}/${r.completedPasses} | ${r.shots} | ${r.counts.decisions}/${r.counts.evaluations} | ${r.counts.patternObservations}/${r.counts.patternArrivals} |`,
    ),
  ].join('\n');
  const shotTable = [
    '| Technika | Próby / release | Rozstrzygnięte / null | Średnia prognoza | Gole w rozstrzygniętych | Brier |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...research.shootingSummary.map(
      (r) =>
        `| ${r.intent} | ${r.trials}/${r.releases} | ${r.resolved}/${r.nullOutcomes} | ${r.predictedMean.toFixed(3)} | ${r.goals}/${r.resolved} | ${r.brierMean.toFixed(3)} |`,
    ),
  ].join('\n');
  const content = `15/15 wariantów development kończy mecz (trzy nowe polityki × trzy projekty oraz B/R3 × trzy projekty). Trzy dodatkowe pełne SW observer on/off mają identyczne wejścia i końcowe hashe. Historyczne pliki: ${baseline.historical.length}/${baseline.historical.length} zachowane.\n\n${table}\n\n${shotTable}\n\nWcześniejsze błędy/non-completions zachowano w ${summary.negativeDevelopmentRuns.length} receipts; krótkie próby i poprzednia aparatura również pozostają w indeksie. Tabele nie ustanawiają zwycięzcy ani gotowości canonical. Surowe traces, wejścia, CPU/RSS i hashe: [PR187-evidence-index.json](performance/PR187-evidence-index.json).`;
  const report = 'docs/PR187_BOUNDED_FOOTBALL_INTELLIGENCE_AND_POLICY_VALIDATION.md';
  writeFileSync(
    report,
    readFileSync(report, 'utf8').replace(
      /<!-- PR187_RESULTS_START -->[\s\S]*?<!-- PR187_RESULTS_END -->/,
      `<!-- PR187_RESULTS_START -->\n\n${content}\n\n<!-- PR187_RESULTS_END -->`,
    ),
  );
}
console.log({
  full: current.length,
  designs: 3,
  observerReplays: observerNeutrality.length,
  historical: baseline.historical.length,
  failures: summary.negativeDevelopmentRuns.length,
});
