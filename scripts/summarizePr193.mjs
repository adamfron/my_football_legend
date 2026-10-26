import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import console from 'node:console';
import { files, hash, writeReceipt, POLICIES } from './pr193Evidence.mjs';
import { readPr193Evidence } from './readPr193Evidence.mjs';
import { readPr192Evidence } from './readPr192Evidence.mjs';
const root = 'docs/performance/pr193';
const lab = JSON.parse(gunzipSync(readFileSync(root + '/laboratory-final-v6.json.gz')));
const matches = files(root + '/matches')
  .filter((p) => p.endsWith('.json'))
  .map((path) => ({ path, ...readPr193Evidence(path) }))
  .filter((r) => r.version === 'final-v2');
if (matches.length !== 31 || matches.some((r) => r.failure || r.status !== 'full_time'))
  throw Error('Incomplete development set');
const mean = (v) => (v.length ? v.reduce((n, x) => n + x, 0) / v.length : null);
const sum = (v) => v.reduce((n, x) => n + x, 0);
const f = (v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v);
const full = matches
  .filter((r) => r.mode === 'combined' && r.observed)
  .map((r) => {
    const b = readPr192Evidence(
      `docs/performance/pr192/matches/${r.design}-${r.policy}-combined-final-v2.json`,
    );
    const counts = r.naturalFlow.diagnostics.awards;
    return {
      design: r.design,
      policy: r.policy,
      path: r.path,
      baselinePasses: b.passes.attempted,
      passes: r.passes.attempted,
      baselineShots: b.shots,
      shots: r.shots,
      baselineActiveMinutes: b.time.ballInPlaySeconds / 60,
      activeMinutes: r.time.ballInPlaySeconds / 60,
      awards: counts,
      completion: r.passes.completed / Math.max(1, r.passes.attempted),
      passesPerActiveMinute: r.time.passesPerInPlayMinute,
      backward: r.detail.backwardPasses,
      forward: r.detail.forwardPasses,
      progressive: r.football.progressivePasses,
      thirdEntries: r.football.finalThirdEntries,
      boxEntries: r.football.boxEntries,
      carries: r.football.carries,
      shotDistance: mean(r.football.shotDistances),
      shotExpectation: mean(r.football.shotDiagnostics.map((s) => s.effectiveScoringExpectation)),
      shotsPer100Passes: (100 * r.shots) / Math.max(1, r.passes.attempted),
      turnoverCauses: r.football.turnoverCauses,
      observedWindows: r.detail.observedWindows,
      usedWindowEpisodes: r.detail.usedWindowEpisodes,
      expiredUnusedEpisodes: r.detail.expiredUnusedEpisodes,
      preparationChoices: r.detail.preparationChoices,
      runs: r.detail.runs,
      runsMoved: r.detail.runsMoved,
      tracking: r.detail.runsDrawingTracking,
      clearances: r.detail.clearances,
      physicalClearances: r.detail.physicalClearances,
      clearanceExits: r.detail.clearanceExits,
      fouls: r.detail.foulChallenges,
      behind: r.detail.behindFouls,
      finalFitness: r.detail.finalFitness,
      cpuSeconds: (r.performance.cpu.user + r.performance.cpu.system) / 1e6,
      wallSeconds: r.performance.wallSeconds,
      maxRSSKiB: r.performance.maxRSS,
    };
  });
const labRows = lab.rows.map((r) => {
  const start = r.samples[0].at,
    first = r.samples[0];
  const runs = [
    ...new Map(
      r.samples.flatMap((s) => s.runs).map((v) => [`${v.actorId}:${v.observedAt}`, v]),
    ).values(),
  ];
  return {
    id: r.config.id,
    scenario: r.config.scenario,
    variant: r.config.variant,
    pair: `${r.config.attacker}/${r.config.defender}`,
    mirror: r.config.mirror,
    lane: r.config.lane,
    delay: r.config.delay,
    seed: r.config.seed,
    shots: r.shots,
    intentionalShotIds: r.intentionalShotIds,
    incidentalGoal: r.incidentalGoal,
    actions: r.actions.length,
    shotActors: r.actions.filter((a) => a.type === 'shot').map((a) => a.actorId),
    firstAction: r.actions[0] ?? null,
    firstRelease: r.decisions.find((d) => d.stage === 'attempt' && d.released)?.at - start,
    runs: runs.map((v) => ({
      actorId: v.actorId,
      kind: v.kind,
      start: v.observedAt - start,
      origin: v.origin,
      target: v.target,
    })),
    maxTracking: Math.max(...r.samples.map((s) => s.away.trackingRunners)),
    initialShape: first.away,
    finalShape: r.samples.at(-1).away,
    maxBallX: Math.max(...r.samples.map((s) => s.ball.x)),
    endBall: r.samples.at(-1).ball,
    endOwner: r.samples.at(-1).ownerId,
    firstRaces: r.races.map((v) => ({
      ...v,
      approachAt: v.approachAt === null ? null : v.approachAt - start,
      playableTouchAt: v.playableTouchAt === null ? null : v.playableTouchAt - start,
      actionAt: v.actionAt === null ? null : v.actionAt - start,
    })),
    initialWindow: r.candidates
      .filter((c) => c.opportunity)
      .map((c) => ({ id: c.id, risk: c.risk, benefit: c.benefit, window: c.opportunity })),
    clearanceForecast: r.clearanceDecision,
    award: r.award,
    crossing: r.crossing,
    physicalContacts: r.contacts.filter((c) => c.available).length,
    intentContacts: r.intentContacts.map((c) => ({
      actorId: c.actorId,
      objective: c.objective,
      available: c.contact.available,
      surface: c.contact.intendedSurface,
    })),
    collisions: r.collisions.map((c) => ({
      kind: c.kind,
      at: c.at - start,
      point: c.point,
      playerId: c.playerId,
    })),
    observerNeutral: r.observerNeutral,
  };
});
const ablations = matches
  .filter((r) => r.observed && r.mode !== 'combined')
  .map((r) => ({
    design: r.design,
    policy: r.policy,
    mode: r.mode,
    passes: r.passes.attempted,
    shots: r.shots,
    activeMinutes: r.time.ballInPlaySeconds / 60,
    awards: r.naturalFlow.diagnostics.awards,
    physicalClearances: r.detail.physicalClearances,
    runs: r.detail.runs,
    finalHash: r.finalHash,
  }));
const summary = {
  schema: 'mfl-pr193-summary-v1',
  laboratorySourceHash: lab.sourceHash,
  fullMatchVersion: 'final-v2',
  independentConfirmation: 'sealed',
  totals: {
    matches: 15,
    shots: sum(full.map((r) => r.shots)),
    baselineShots: sum(full.map((r) => r.baselineShots)),
    passes: sum(full.map((r) => r.passes)),
    baselinePasses: sum(full.map((r) => r.baselinePasses)),
    activeMinutesRange: [
      Math.min(...full.map((r) => r.activeMinutes)),
      Math.max(...full.map((r) => r.activeMinutes)),
    ],
  },
  full,
  ablations,
  laboratory: labRows,
};
writeReceipt(root + '/summary-final-v1.json', summary);
const policyName = (p) => ['B', 'R3', 'O', 'H', 'C'][POLICIES.indexOf(p)];
const header =
  '| Match | Policy | Passes 192 → 193 | Shots 192 → 193 | Active min 192 → 193 | Throw | Corner | Fouls |\n|---|---|---:|---:|---:|---:|---:|---:|\n';
writeFileSync(
  root + '/full-match-table.md',
  header +
    full
      .map(
        (r) =>
          `| ${r.design.toUpperCase()} | ${policyName(r.policy)} | ${r.baselinePasses} → ${r.passes} | ${r.baselineShots} → ${r.shots} | ${f(r.baselineActiveMinutes)} → ${f(r.activeMinutes)} | ${r.awards.throw_in ?? 0} | ${r.awards.corner ?? 0} | ${r.fouls} |`,
      )
      .join('\n') +
    '\n',
  { flag: 'wx' },
);
writeFileSync(
  root + '/ablations.csv',
  'design,policy,mode,passes,shots,activeMinutes,physicalClearances\n' +
    ablations
      .map((r) =>
        [
          r.design,
          r.policy,
          r.mode,
          r.passes,
          r.shots,
          f(r.activeMinutes),
          r.physicalClearances,
        ].join(','),
      )
      .join('\n') +
    '\n',
  { flag: 'wx' },
);
writeFileSync(
  root + '/laboratory-index.csv',
  'id,shots,physicalContacts,maxTracking,maxBallX,endOwner\n' +
    labRows
      .map((r) =>
        [r.id, r.shots, r.physicalContacts, r.maxTracking, f(r.maxBallX), r.endOwner ?? ''].join(
          ',',
        ),
      )
      .join('\n') +
    '\n',
  { flag: 'wx' },
);
console.log(JSON.stringify({ totals: summary.totals, summaryHash: hash(summary) }));
