import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
const root = 'docs/performance/pr190',
  partial = process.argv.includes('--partial'),
  version = process.argv.find((v) => v.startsWith('--version='))?.slice(10) ?? 'spin-final';
const historical = JSON.parse(readFileSync('docs/performance/pr189/summary.json')).rows;
const loadVersion = (version) =>
  readdirSync(root)
    .filter((f) => /^(ww|ss|sw)-/.test(f) && f.endsWith(`-${version}.json`))
    .map((f) => ({ ...JSON.parse(readFileSync(`${root}/${f}`)), path: `${root}/${f}` }));
const baseline = loadVersion('baseline-full'),
  current = loadVersion(version);
if (!partial && (baseline.length !== 15 || current.length !== 15))
  throw Error(`Incomplete cohort ${baseline.length}/${current.length}`);
const rows = [];
const canonicalLedgers = (players, minutes) => ({
  possessionGainsPerInPlayMinute: players.reduce((n, p) => n + p.possessionWon, 0) / minutes,
  possessionLossesPerInPlayMinute: players.reduce((n, p) => n + p.possessionLost, 0) / minutes,
  lossCauses: players.reduce((all, p) => {
    for (const [cause, count] of Object.entries(p.possessionLossCauses))
      all[cause] = (all[cause] ?? 0) + count;
    return all;
  }, {}),
});
for (const after of current) {
  const before = baseline.find((r) => r.design === after.design && r.policy === after.policy),
    old = historical.find((r) => r.design === after.design && r.policy === after.policy);
  if (!before || !old || after.inputSha256 !== before.inputSha256)
    throw Error('Unpaired development input');
  const receipt = JSON.parse(readFileSync(old.path));
  if (
    before.passes.attempted !== old.passes.attempted ||
    before.passes.completed !== old.passes.completed ||
    before.finalStateSha256 !== receipt.finalStateSha256
  )
    throw Error('PR189 baseline drift');
  const validate = (r) => {
    const t = r.time;
    if (
      Math.abs(t.canonicalElapsedSeconds - t.ballInPlaySeconds - t.deadBallSeconds) > 1e-6 ||
      Math.abs(t.canonicalElapsedSeconds - t.regulationSeconds - t.addedSecondsActuallyPlayed) >
        1e-6 ||
      Math.abs(
        Object.values(t.deadBallByReason).reduce((n, v) => n + v, 0) +
          t.unclassifiedDeadBallSeconds -
          t.deadBallSeconds,
      ) > 1e-6
    )
      throw Error('Time partition mismatch');
    if (r.status !== 'full_time') throw Error('Full match not completed');
  };
  validate(before);
  validate(after);
  const records = JSON.parse(gunzipSync(readFileSync(after.archive))),
    flow = JSON.parse(gunzipSync(readFileSync(after.flowArchive)));
  const groups = {};
  let selfReclaims = 0;
  for (const r of records) {
    const p = r.diagnostic,
      metres = Math.hypot(
        p.predictedReceptionPoint.x - r.release.ball.x,
        p.predictedReceptionPoint.y - r.release.ball.y,
      ),
      key = [
        metres <= 15 ? 'short' : metres <= 30 ? 'medium' : 'long',
        (p.selectionQuality?.pressure ?? 0) > 0.4 ? 'pressured' : 'clear',
        Math.hypot(p.receiverVelocityAtRelease.x, p.receiverVelocityAtRelease.y) > 0.7
          ? 'moving'
          : 'static',
      ].join(':');
    const g = (groups[key] ??= { attempted: 0, completed: 0, firstTouchFailures: 0 });
    g.attempted++;
    g.completed += Number(p.finalResult === 'completed' && p.actualReceiverId !== p.passerId);
    g.firstTouchFailures += Number(['heavy_touch', 'failed_control'].includes(p.receptionOutcome));
    selfReclaims += Number(p.finalResult === 'completed' && p.actualReceiverId === p.passerId);
  }
  const minutes = after.time.ballInPlaySeconds / 60,
    turnovers = Object.values(flow.turnoverCauses).reduce((a, b) => a + b, 0),
    durations = flow.possessionSpellDurations;
  rows.push({
    design: after.design,
    policy: after.policy,
    before: {
      path: before.path,
      canonicalStatisticsPath: old.path,
      passes: before.passes,
      shots: before.shots,
      score: before.score,
      time: before.time,
      inPlayMinutes: before.time.ballInPlaySeconds / 60,
      passesPerInPlayMinute: before.time.passesPerInPlayMinute,
      shotsPerInPlayMinute: before.shots / (before.time.ballInPlaySeconds / 60),
      canonicalPlayerLedgers: canonicalLedgers(
        receipt.statistics.players,
        before.time.ballInPlaySeconds / 60,
      ),
      matchFlowCoverage:
        'baseline full flow observer was not collected; use the canonical player ledgers, archived pass trajectories and independently retained PR189 statistics',
      meanPossessionSequenceSeconds: null,
      finalThirdEntries: null,
      boxEntries: null,
      cpu: before.cpu,
      rssBytes: before.rssBytes,
    },
    after: {
      path: after.path,
      sourceSha256: after.sourceSha256,
      diagnosticSha256: after.diagnosticSha256,
      passes: after.passes,
      completion: after.passes.completed / after.passes.attempted,
      shots: after.shots,
      score: after.score,
      canonicalPlayerLedgers: canonicalLedgers(after.statistics.players, minutes),
      time: after.time,
      passesPerInPlayMinute: after.time.passesPerInPlayMinute,
      possessionExchangesPerInPlayMinute: flow.possessionChanges / minutes,
      turnoversPerInPlayMinute: turnovers / minutes,
      shotsPerInPlayMinute: after.shots / minutes,
      meanPossessionSequenceSeconds: durations.length
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null,
      finalThirdEntries: flow.finalThirdEntries,
      boxEntries: flow.boxEntries,
      receptions: flow.receptions,
      byContext: groups,
      canonicalSelfReclaims: selfReclaims,
      causes: after.counts,
      cpu: after.cpu,
      rssBytes: after.rssBytes,
      wallMs: after.wallMs,
    },
    baselineStateMatchesPr189: true,
  });
}
const measured = loadVersion('measured-final');
const fullObserverComparisons = loadVersion('final-v6')
  .filter((b) => measured.some((a) => a.design === b.design && a.policy === b.policy))
  .map((b) => {
    const a = measured.find((a) => a.design === b.design && a.policy === b.policy);
    if (a.finalStateSha256 !== b.finalStateSha256)
      throw Error('Full-match telemetry observer changed football');
    return {
      design: b.design,
      policy: b.policy,
      comparisonVersion: 'pre-spin measured-final against final-v6',
      finalStateSha256: a.finalStateSha256,
      equal: true,
    };
  });
const result = {
  schemaVersion: 1,
  classification: 'development only; independent cohort unopened',
  version,
  ready: false,
  complete: current.length === 15,
  baselineMatches: baseline.length,
  currentMatches: current.length,
  rows,
  fullObserverComparisons,
  allocationOptimizationParity: (() => {
    const path = `${root}/optimization-full-parity.json`;
    if (!existsSync(path)) return null;
    const proof = JSON.parse(readFileSync(path));
    if (
      !proof.complete ||
      proof.rows.length !== 15 ||
      !proof.rows.every(
        (r) =>
          r.identicalFinalState &&
          r.identicalCompletePassArchive &&
          current.some(
            (a) =>
              a.design === r.design &&
              a.policy === r.policy &&
              a.finalStateSha256 === r.finalStateSha256,
          ),
      )
    )
      throw Error('Incomplete allocation optimization equivalence');
    return {
      path,
      optimizedSourceSha256: proof.sourceSha256,
      comparedFullMatches: 15,
      completeFinalStatesAndPassArchivesIdentical: true,
    };
  })(),
  timeOnlyConfiguration:
    'reporting-only: same canonical baseline/current executions, no independent clock intervention',
  remainingBlockers: [
    'circulation and chance creation',
    'excessive effective playing time and sparse natural interruptions',
    'advanced lower-limb collision surfaces, goalkeeper gaps and timed release choices',
  ],
};
writeFileSync(
  `${root}/${partial ? 'summary-partial' : 'summary'}.json`,
  JSON.stringify(result, null, 2) + '\n',
);
const table = [
  '| Design / policy | Baseline completed / attempted | Current completed / attempted | Shots before → after | In-play minutes before → after |',
  '|---|---:|---:|---:|---:|',
  ...rows.map(
    (r) =>
      `| ${r.design.toUpperCase()} / ${r.policy} | ${r.before.passes.completed} / ${r.before.passes.attempted} | ${r.after.passes.completed} / ${r.after.passes.attempted} | ${r.before.shots} → ${r.after.shots} | ${r.before.inPlayMinutes.toFixed(2)} → ${(r.after.time.ballInPlaySeconds / 60).toFixed(2)} |`,
  ),
];
writeFileSync(`${root}/development-table.md`, table.join('\n') + '\n');
console.log(
  JSON.stringify({
    paired: rows.length,
    baselineMatches: baseline.length,
    ready: false,
    summarySha256: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
  }),
);
