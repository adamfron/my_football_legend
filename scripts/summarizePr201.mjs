import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import console from 'node:console';
import { ROOT, BASE, read, hash, identity, options } from './pr201Evidence.mjs';

const profiles = [
  'canonical-pr199',
  'realism-candidate-v0',
  'realism-candidate-v1',
  'realism-candidate-no-recovery-v1',
];
const nested = (rows) => ({
  trials: rows.length,
  directTouch: rows.filter((p) => p.outcome.directReceiverTouch).length,
  directControl: rows.filter((p) => p.outcome.directReceiverTouch && p.outcome.receiverControl)
    .length,
  directRetained: rows.filter(
    (p) => p.outcome.directReceiverTouch && p.outcome.teamPossessionAtOneSecond,
  ).length,
  allControl: rows.filter((p) => p.outcome.receiverControl).length,
  allRetained: rows.filter((p) => p.outcome.teamPossessionAtOneSecond).length,
  deflectedTouch: rows.filter((p) => p.outcome.deflectedReceiverTouch).length,
  censored: rows.filter((p) => p.outcome.censored).length,
});
const locals = Object.fromEntries(
  ['frozen', 'fresh200', 'fresh201'].map((mode) => {
    const path = `${ROOT}/receivers-${mode}-v1.json.gz`,
      { result: r, costs } = read(path);
    const paired = {};
    for (const event of ['directTouch', 'directControl', 'directRetained']) {
      const yes = (row) =>
        event === 'directTouch'
          ? row.outcome.directReceiverTouch
          : row.outcome.directReceiverTouch &&
            row.outcome[
              event === 'directControl' ? 'receiverControl' : 'teamPossessionAtOneSecond'
            ];
      let gained = 0,
        lost = 0;
      for (let i = 0; i < r.rows.length; i += 2) {
        const [a, b] = r.rows.slice(i, i + 2);
        gained += Number(!yes(a) && yes(b));
        lost += Number(yes(a) && !yes(b));
      }
      paired[event] = { gained, lost };
    }
    return [
      mode,
      {
        path,
        sha256: hash(readFileSync(path)),
        source: r.source,
        summary: r.summary,
        paired,
        costs,
      },
    ];
  }),
);
const matches = readdirSync(`${ROOT}/matches`)
  .filter((n) => n.endsWith('-v1.json.gz'))
  .sort()
  .map((name) => {
    const path = `${ROOT}/matches/${name}`,
      { result: r, costs: c } = read(path),
      f = r.football;
    return {
      path,
      sha256: hash(readFileSync(path)),
      source: r.source,
      design: r.design,
      policy: r.policy,
      profile: r.profile,
      implementation: r.manifest.implementation,
      configurationFingerprint: r.manifest.fingerprint,
      inputPath: r.inputPath,
      originalInputHash: r.originalInputHash,
      initialHash: r.initialHash,
      finalHash: r.finalHash,
      seed: r.seed,
      status: r.status,
      seconds: r.seconds,
      ticks: r.ticks,
      passes: r.passes,
      receptions: nested(r.passOutcomes),
      shots: {
        attempted: r.shots,
        onTarget: f.shotsOnTarget,
        blocked: f.shotsBlocked,
        saves: f.saves,
        failedSaves: f.failedSaves,
      },
      score: r.score,
      releases: {
        long: r.counts.longPasses,
        through: r.counts.throughBalls,
        progressive10m: r.counts.progressivePasses,
        lofted: r.counts.loftReleases,
      },
      progression: {
        finalThirdEntries: f.finalThirdEntries,
        finalThirdPossessionSeconds: f.finalThirdPossessionSeconds,
        boxEntries: f.boxEntries,
        boxTouches: f.boxTouches,
        backwardPasses: f.backwardPasses,
        lateralPasses: f.lateralPasses,
        progressivePasses: f.progressivePasses,
        threatFlow: f.threatFlow,
        carries: f.carries,
      },
      possession: {
        bothTeamChanges: f.possessionChanges,
        bothTeamTurnoverCauses: f.turnoverCauses,
        homeTurnovers: r.disruption.turnovers.length,
        looseEpisodes: r.disruption.looseBallEpisodes,
      },
      goalkeeper: {
        catches: r.disruption.goalkeeperCatches,
        parries: r.disruption.goalkeeperParries,
        rebounds: r.disruption.goalkeeperRebounds,
      },
      playingTime: r.time,
      decisionTraces: {
        decisions: r.counts.decisions,
        attempts: r.counts.attempts,
        menuCoverage:
          'unavailable; selected profiles disable active perception and transition intelligence',
        candidates: null,
        rejections: null,
      },
      costs: {
        cpuSeconds: (c.cpu.user + c.cpu.system) / 1e6,
        wallSeconds: c.wallSeconds,
        peakRSSMiB: c.peakRSSKiB / 1024,
        node: c.node,
        cpuModel: c.cpuModel,
        scope: c.mode,
      },
      // Full ledgers, not only score, support equality of the isolated recovery-off arm.
      physicalLedgerHash: hash([
        r.passes,
        r.shots,
        r.score,
        r.seconds,
        r.ticks,
        r.time,
        r.football,
        r.disruption,
        r.passOutcomes,
        r.counts,
      ]),
    };
  });
assert.equal(matches.length, 28, 'All seven four-arm configurations are required');
const keys = [...new Set(matches.map((r) => `${r.design}/${r.policy}`))];
assert.equal(keys.length, 7);
const comparisons = keys.map((key) => {
  const arms = Object.fromEntries(
    profiles.map((p) => [
      p,
      matches.find((r) => `${r.design}/${r.policy}` === key && r.profile === p),
    ]),
  );
  assert.ok(Object.values(arms).every(Boolean));
  const before = arms['realism-candidate-v0'],
    after = arms['realism-candidate-v1'],
    off = arms['realism-candidate-no-recovery-v1'];
  assert.equal(
    before.physicalLedgerHash,
    off.physicalLedgerHash,
    'Recovery-off physical ledger differs',
  );
  return {
    fixture: key,
    arms: Object.fromEntries(profiles.map((p) => [p, arms[p].path])),
    completedPassDelta: after.passes.completed - before.passes.completed,
    directControlDelta: after.receptions.directControl - before.receptions.directControl,
    directRetentionDelta: after.receptions.directRetained - before.receptions.directRetained,
    shotDelta: after.shots.attempted - before.shots.attempted,
    cpuRatio: after.costs.cpuSeconds / before.costs.cpuSeconds,
    recoveryOffLedgerEqualsPR200: true,
  };
});
const result = {
  schema: 'pr201-summary-v1',
  base: BASE,
  source: identity(),
  locals,
  matches,
  comparisons,
  decision: 'NOT_READY_FOR_PROMOTION',
  mechanismDecision: 'RETAIN_EXPERIMENTAL',
  canonical: 'NOT READY',
  independentConfirmation: 'sealed',
  limitations: [
    'One dependent development seed per configuration, not independent match populations',
    'Whole-match costs include different event/stoppage histories and concurrent host load',
    'Raw control/retention are not necessarily nested under direct touch; strict direct counts remain separate',
    'Candidate menus unavailable in these profiles; inherited zero counters do not show absence',
    'Disruption turnovers use home perspective; football possession-change counters cover both teams',
  ],
};
let section =
  '<!-- PR201_MATCH_MATRIX:START -->\n\nAll **28 complete matches** finished. The table uses strict direct touch/control/one-second retention (D/C/R). Each cell also gives actual shots and score. The recovery-off successor independently reproduces every original pass/physical telemetry ledger of PR200 in all seven fixtures; its separately replayed complete state hashes and all four arms remain in [the summary](performance/pr201/summary.json) and source-bound receipts. Different profile selections remain part of the complete state identity.\n\n| Fixture | Canonical D/C/R; shots; score | PR200 D/C/R; shots; score | Recovery D/C/R; shots; score |\n| --- | --- | --- | --- |\n';
const outcome = (r) =>
  `${r.receptions.directTouch}/${r.receptions.directControl}/${r.receptions.directRetained}; ${r.shots.attempted}; ${r.score.home}:${r.score.away}`;
for (const c of comparisons) {
  const arm = (p) => matches.find((r) => r.path === c.arms[p]);
  section += `| ${c.fixture} | ${outcome(arm(profiles[0]))} | ${outcome(arm(profiles[1]))} | ${outcome(arm(profiles[2]))} |\n`;
}
section +=
  '\n| Fixture | Passes attempted/completed: PR200 → recovery | CPU seconds: before → after (ratio) | Wall seconds: before → after | Peak RSS MiB: before → after |\n| --- | --- | --- | --- | --- |\n';
for (const c of comparisons) {
  const b = matches.find((r) => r.path === c.arms[profiles[1]]),
    a = matches.find((r) => r.path === c.arms[profiles[2]]);
  section += `| ${c.fixture} | ${b.passes.attempted}/${b.passes.completed} → ${a.passes.attempted}/${a.passes.completed} | ${b.costs.cpuSeconds.toFixed(1)} → ${a.costs.cpuSeconds.toFixed(1)} (${c.cpuRatio.toFixed(2)}×) | ${b.costs.wallSeconds.toFixed(1)} → ${a.costs.wallSeconds.toFixed(1)} | ${b.costs.peakRSSMiB.toFixed(1)} → ${a.costs.peakRSSMiB.toFixed(1)} |\n`;
}
section +=
  '\nCPU is measured user+system process time; RSS is each process maximum. No serial/no-debug budget or real-world calibration is certified. Per-configuration progression, shot consequences, turnovers, playing time, source/input/configuration identities and full hashes are in the summary.\n\n<!-- PR201_MATCH_MATRIX:END -->';
const summaryPath = `${ROOT}/summary.json`,
  reportPath = 'docs/PR201_BOUNDED_PERCEPTION_RECEIVER_RECOVERY.md',
  json = JSON.stringify(result, null, 2) + '\n';
let report = readFileSync(reportPath, 'utf8').replaceAll('\r\n', '\n');
if (options.has('check')) {
  assert.equal(readFileSync(summaryPath, 'utf8'), json, 'Generated summary drift');
  assert.ok(report.includes(section), 'Generated match report drift');
  assert.ok(!report.includes('_PENDING'), 'Report gate unfinished');
} else {
  writeFileSync(summaryPath, json);
  report = report.includes('MATCH_MATRIX_PENDING')
    ? report.replace('MATCH_MATRIX_PENDING', section)
    : report.replace(
        /<!-- PR201_MATCH_MATRIX:START -->[\s\S]*?<!-- PR201_MATCH_MATRIX:END -->/,
        section,
      );
  writeFileSync(reportPath, report);
}
console.log(
  'PR201 summary',
  matches.length,
  'complete matches; four arms; NOT_READY_FOR_PROMOTION',
);
