import { readFileSync } from 'node:fs';
import { hash, files, writeReceipt } from './pr194Evidence.mjs';
import { readPr194Evidence } from './readPr194Evidence.mjs';
const root = 'docs/performance/pr194';
const matches = files(root + '/matches')
  .filter((p) => p.endsWith('.json'))
  .map((path) => ({ path, ...readPr194Evidence(path) }))
  .filter((r) => r.version === 'v4');
if (matches.length !== 27 || matches.some((r) => r.status !== 'full_time' || r.failure))
  throw Error('Incomplete development set');
const median = (a) => {
  const v = [...a].sort((x, y) => x - y);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};
const cpuSeconds = (p) => (p.cpu.user + p.cpu.system) / 1e6;
const combined = matches.filter((r) => r.mode === 'combined' && r.observed);
const table = combined.map((r) => ({
  design: r.design,
  policy: r.policy,
  passes: [r.prior.passes.attempted, r.passes.attempted],
  shots: [r.prior.shots, r.shots],
  activeMinutes: [r.prior.time.ballInPlaySeconds / 60, r.time.ballInPlaySeconds / 60],
  preparedIncomingContacts: r.perception.preparedReceptions,
  matchedPreparedReleases: r.perception.matchedPreparedReleases,
  scans: r.perception.scans,
  invalidations: r.perception.invalidatedOptions,
  latencyMedian: median(r.perception.latencies),
  wallSeconds: r.performance.wallSeconds,
  cpuSeconds: cpuSeconds(r.performance),
  peakMiB: r.performance.maxRSSKiB / 1024,
  passesPerActiveMinute: r.passes.attempted / (r.time.ballInPlaySeconds / 60),
  reasons: r.perception.reasons,
}));
const lab = JSON.parse(readFileSync(root + '/laboratory-v4.json'));
const profile = JSON.parse(readFileSync(root + '/profile-v4.json'));
const totals = (key) => table.reduce((n, r) => [n[0] + r[key][0], n[1] + r[key][1]], [0, 0]);
const summary = {
  schema: 'mfl-pr194-summary-v2',
  readiness: 'NOT READY',
  rejectedPilots: ['v2', 'v3'].map((v) =>
    JSON.parse(readFileSync(root + '/pilot-' + v + '-interrupted.json')),
  ),
  independentConfirmation: 'sealed',
  stagedDesign: {
    combined: 15,
    ablations: 9,
    baseline: 1,
    bareTwins: 2,
    scope:
      'all five policies WW/SS/SW combined; three axes only WW/O,SS/O,SW/H,not a complete five-way matrix',
  },
  totals: { passes: totals('passes'), shots: totals('shots') },
  table,
  ablations: matches
    .filter((r) => r.mode !== 'combined')
    .map((r) => ({
      design: r.design,
      policy: r.policy,
      mode: r.mode,
      passes: r.passes,
      shots: r.shots,
      time: r.time,
      baselineParity: r.baselineParity,
      cpuSeconds: cpuSeconds(r.performance),
      wallSeconds: r.performance.wallSeconds,
    })),
  observerTwins: matches
    .filter((r) => !r.observed)
    .map((r) => {
      const t = combined.find((t) => t.design === r.design && t.policy === r.policy);
      return {
        design: r.design,
        policy: r.policy,
        sameState: t.finalHash === r.finalHash,
        cpuSeconds: [cpuSeconds(t.performance), cpuSeconds(r.performance)],
        wallSeconds: [t.performance.wallSeconds, r.performance.wallSeconds],
      };
    }),
  lab: {
    conditions: lab.count,
    actualReceiverContacts: lab.summary.filter((r) => r.receiverContactAt !== null).length,
    preparedBeforeContact: lab.summary.filter((r) => r.preparedBeforeContact).length,
    mutatingObserverChecks: lab.summary.filter((r) => r.observerNeutral === true).length,
  },
  profile: ['baseline', 'perception', 'positions', 'tempo', 'combined'].map((mode) => ({
    mode,
    offMedianCpuMs: median(
      profile.rows.filter((r) => r.mode === mode && !r.debug).map((r) => cpuSeconds(r) * 1000),
    ),
    onMedianCpuMs: median(
      profile.rows.filter((r) => r.mode === mode && r.debug).map((r) => cpuSeconds(r) * 1000),
    ),
  })),
  limits: [
    'Incoming contact counter includes loose-ball claims; not pure pass receptions.',
    'Matched releases do not establish causal candidate reuse, particularly for B/R3.',
    'Immediate accepted carry intention is not a fresh decision latency or another contact.',
    'No independent validation,complete ablation,global policy superiority or universal checkpoint speed factor.',
  ],
};
writeReceipt(root + '/summary-v4.json', summary);
const names = {
  'state-value-v1': 'B',
  'phase-role-hybrid-v1': 'R3',
  'opportunity-driven-v1': 'O',
  'hierarchical-intent-v1': 'H',
  'contextual-judgment-v1': 'C',
};
const markdown =
  [
    '| Match | Policy | Pass attempts 193 → 194 | Shots 193 → 194 | Active min 193 → 194 | CPU s | Peak MiB |',
    '|---|---|---:|---:|---:|---:|---:|',
    ...table.map(
      (r) =>
        `| ${r.design.toUpperCase()} | ${names[r.policy]} | ${r.passes.join(' → ')} | ${r.shots.join(' → ')} | ${r.activeMinutes.map((v) => v.toFixed(2)).join(' → ')} | ${r.cpuSeconds.toFixed(1)} | ${r.peakMiB.toFixed(1)} |`,
    ),
  ].join('\n') + '\n';
// Markdown is a derived view; the immutable JSON above is the source of the numbers.
const { writeFileSync } = await import('node:fs');
writeFileSync(root + '/full-match-table.md', markdown, { flag: 'wx' });
writeReceipt(root + '/evidence-index-v4.json', {
  schema: 'mfl-pr194-evidence-index-v1',
  hashConvention: 'UTF-8 LF for text,exact bytes for gzip/JPEG',
  files: files(root)
    .filter((p) => !p.endsWith('evidence-index-v4.json'))
    .sort()
    .map((path) => ({
      path,
      sha256: hash(
        path.endsWith('.gz') || path.endsWith('.jpg')
          ? readFileSync(path)
          : readFileSync(path, 'utf8').replaceAll('\r\n', '\n'),
      ),
    })),
});
