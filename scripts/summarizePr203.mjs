import { readFileSync, writeFileSync } from 'node:fs';
import console from 'node:console';
import { read, hash, FINAL_VERSION } from './pr203Evidence.mjs';
const profiles = ['realism-candidate-v1', 'situational-awareness-v1', 'prospective-play-v1'];
const evidence = Object.fromEntries(
  ['support', 'awareness', 'roles', 'reception'].map((mode) => [
    mode,
    read(`docs/performance/pr203/${mode}-${FINAL_VERSION}.json.gz`),
  ]),
);
const summary = {
  classification: 'development only; confirmation sealed',
  source: evidence.support.result.source,
  mechanismDecisions: {
    memory: 'RETAIN_EXPERIMENTAL',
    prospective: 'NEEDS_REPAIR',
    covariance: 'DIAGNOSTIC_ONLY_INSUFFICIENT_DATA',
  },
  profileDecision: 'NOT_READY_FOR_PROMOTION',
  profiles: [],
  skills: [],
  scenarios: [],
  fits: evidence.reception.result.fits,
};
const count = (rows, predicate) => rows.filter(predicate).length;
const metrics = (rows) => ({
  trials: rows.length,
  prospectiveMovement: count(rows, (r) => r.startedAt !== null),
  movementBeforeRelease: count(rows, (r) => r.movementLeadSeconds > 0),
  released: count(rows, (r) => r.releaseAt !== null),
  bEverControl: count(rows, (r) => r.firstBControl !== null),
  cAvailable: count(rows, (r) => r.availabilitySeconds > 0),
  cSeen: rows.every((r) => r.cSeenByB === null) ? null : count(rows, (r) => r.cSeenByB === true),
  cChosen: count(rows, (r) => r.cSelectedByB),
  cReleased: count(rows, (r) => r.cReleasedByB),
  abTouch: count(rows, (r) => r.outcome?.directReceiverTouch),
  abControl: count(rows, (r) => r.outcome?.directReceiverTouch && r.outcome.receiverControl),
  abRetained: count(
    rows,
    (r) => r.outcome?.directReceiverTouch && r.outcome.teamPossessionAtOneSecond,
  ),
  bcTouch: rows.flatMap((r) => r.nextOutcomes).filter((o) => o.directReceiverTouch).length,
  bcControl: rows
    .flatMap((r) => r.nextOutcomes)
    .filter((o) => o.directReceiverTouch && o.receiverControl).length,
  bcRetained: rows
    .flatMap((r) => r.nextOutcomes)
    .filter((o) => o.directReceiverTouch && o.teamPossessionAtOneSecond).length,
  withdrawn: count(rows, (r) => r.withdrawnAt !== null),
  meanWholeWindowMetres: rows.reduce((s, r) => s + r.costMetres, 0) / rows.length,
  meanLeadSeconds:
    rows
      .filter((r) => r.movementLeadSeconds !== null)
      .reduce((s, r) => s + r.movementLeadSeconds, 0) /
    Math.max(
      1,
      count(rows, (r) => r.movementLeadSeconds !== null),
    ),
});
for (const profile of profiles) {
  const rows = evidence.support.result.rows.filter((r) => r.profile === profile),
    reception = evidence.reception.result.rows.filter((r) => r.profile === profile),
    arms = evidence.support.costs.arms.filter((r) => r.profile === profile);
  summary.profiles.push({
    profile,
    ...metrics(rows),
    long: {
      trials: reception.length,
      touch: count(reception, (r) => r.outcome.directReceiverTouch),
      control: count(reception, (r) => r.outcome.directReceiverTouch && r.outcome.receiverControl),
      retained: count(
        reception,
        (r) => r.outcome.directReceiverTouch && r.outcome.teamPossessionAtOneSecond,
      ),
      residuals: count(reception, (r) => r.residual !== null),
    },
    cost: {
      cpuSeconds: arms.reduce((n, r) => n + (r.cpu.user + r.cpu.system) / 1e6, 0),
      wallSeconds: arms.reduce((n, r) => n + r.wallSeconds, 0),
      maxRuntimeBytes: Math.max(...arms.map((r) => r.runtimeBytes)),
      maxSaveBytes: Math.max(...arms.map((r) => r.saveBytes)),
    },
  });
  for (const reading of [20, 85])
    summary.skills.push({
      profile,
      reading,
      ...metrics(rows.filter((r) => r.reading === reading)),
    });
}
for (const scenario of new Set(evidence.support.result.rows.map((r) => r.scenario)))
  for (const profile of profiles)
    summary.scenarios.push({
      scenario,
      profile,
      ...metrics(
        evidence.support.result.rows.filter(
          (r) => r.scenario === scenario && r.profile === profile,
        ),
      ),
    });
summary.evidence = Object.fromEntries(
  Object.entries(evidence).map(([mode, e]) => [
    mode,
    {
      rows: e.result.rows.length,
      resultHash: hash(e.result),
      costs: {
        wallSeconds: e.costs.wallSeconds,
        cpu: e.costs.cpu,
        peakRSSKiB: e.costs.peakRSSKiB,
        serializedResultBytes: e.costs.serializedResultBytes,
      },
    },
  ]),
);
writeFileSync('docs/performance/pr203/summary.json', JSON.stringify(summary, null, 2) + '\n');
const table = (headers, rows) =>
  [headers.join(' | '), headers.map(() => '---').join(' | '), ...rows.map((r) => r.join(' | '))]
    .map((s) => '| ' + s + ' |')
    .join('\n');
const output = [
  `Source archive: \`${summary.source.fingerprint}\`, base \`${summary.source.base}\`.`,
  table(
    [
      'Profile',
      'Trials',
      'Early movement',
      'A releases',
      'A→B touch/control/retained',
      'B→C releases',
      'B→C touch/control/retained',
    ],
    summary.profiles.map((p) => [
      p.profile,
      p.trials,
      p.movementBeforeRelease,
      p.released,
      `${p.abTouch}/${p.abControl}/${p.abRetained}`,
      p.cReleased,
      `${p.bcTouch}/${p.bcControl}/${p.bcRetained}`,
    ]),
  ),
  table(
    [
      'Profile',
      'C geometrically available',
      'C in B menu',
      'C selected',
      'Withdrawn',
      'Mean 7s path m',
    ],
    summary.profiles.map((p) => [
      p.profile,
      p.cAvailable,
      p.cSeen ?? 'unavailable',
      p.cChosen,
      p.withdrawn,
      p.meanWholeWindowMetres.toFixed(2),
    ]),
  ),
  table(
    ['Profile', 'Reading', 'Early movement', 'Mean lead s', 'A→B retained', 'B→C control/retained'],
    summary.skills.map((p) => [
      p.profile,
      p.reading,
      p.movementBeforeRelease,
      p.meanLeadSeconds.toFixed(3),
      p.abRetained,
      `${p.bcControl}/${p.bcRetained}`,
    ]),
  ),
  table(
    ['Long reception profile', 'Trials', 'Touch/control/retained', 'Eligible signed residuals'],
    summary.profiles.map((p) => [
      p.profile,
      p.long.trials,
      `${p.long.touch}/${p.long.control}/${p.long.retained}`,
      p.long.residuals,
    ]),
  ),
  table(
    ['Support profile', 'Process CPU s', 'Wall s', 'Max memory state bytes', 'Max save bytes'],
    summary.profiles.map((p) => [
      p.profile,
      p.cost.cpuSeconds.toFixed(2),
      p.cost.wallSeconds.toFixed(2),
      p.cost.maxRuntimeBytes,
      p.cost.maxSaveBytes,
    ]),
  ),
  table(
    ['Lab', 'Rows', 'Wall s', 'Peak process RSS MiB'],
    Object.entries(summary.evidence).map(([k, e]) => [
      k,
      e.rows,
      e.costs.wallSeconds.toFixed(2),
      (e.costs.peakRSSKiB / 1024).toFixed(1),
    ]),
  ),
].join('\n\n');
const path = 'docs/PR203_SITUATIONAL_AWARENESS_PROSPECTIVE_PLAY.md';
writeFileSync(
  path,
  readFileSync(path, 'utf8').replace(
    /<!-- PR203_RESULTS:START -->[\s\S]*?<!-- PR203_RESULTS:END -->/,
    `<!-- PR203_RESULTS:START -->\n\n${output}\n\n<!-- PR203_RESULTS:END -->`,
  ),
);
console.log(
  'PR203 summary',
  summary.profiles.map((p) => [p.profile, p.bcControl, p.bcRetained]),
);
