import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';

const sha = (v) => createHash('sha256').update(v).digest('hex');
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const fixtures = JSON.parse(gunzipSync(readFileSync('docs/performance/PR176-pr177-initial-states.json.gz')));
const out = 'docs/performance/pr177-evidence';
mkdirSync(out, { recursive: true });
const artifacts = [];
const archive = (source, name) => {
  const bytes = readFileSync(source), compressed = source.endsWith('.gz') ? bytes : gzipSync(bytes);
  const path = `${out}/${name}${name.endsWith('.gz') ? '' : '.gz'}`;
  writeFileSync(path, compressed);
  artifacts.push({ source, path, originalSha256: sha(bytes), compressedSha256: sha(compressed), bytes: compressed.length });
  return path;
};
const groups = [
  ['pristine-development', '../pr177-pristine-development', 'development'],
  ['legacy-development', '../pr177-final-development-legacy', 'development'],
  ['A-development', '../pr177-final-development-A', 'development'],
  ['B-development', '../pr177-final-development-B', 'development'],
  ['pristine-validation', '../pr177-pristine-validation', 'validation'],
  ['B-validation', '../pr177-final-validation-B', 'validation'],
];
const rows = [];
for (const [group, root, split] of groups) for (const fixture of fixtures.filter((f) => f.design.split === split)) {
  const path = `${root}/${fixture.design.id}.json`;
  if (!existsSync(path)) throw new Error(`Incomplete cohort: ${path}; never invent or omit this result`);
  const receipt = json(path);
  const rawPath = `${root}/${fixture.design.id}-raw.json.gz`;
  const raw = JSON.parse(gunzipSync(readFileSync(rawPath)));
  const observation = raw.observations;
  const transitions = raw.transitions;
  const initialCM = new Set(fixture.state.players.filter((p) => p.slot.position === 'central_midfielder').map((p) => p.id));
  const total = (key) => (receipt.official.home[key] ?? 0) + (receipt.official.away[key] ?? 0);
  const cm = receipt.statistics.players.filter((p) => initialCM.has(p.playerId)).reduce((n, p) => n + p.passesReceived, 0);
  const actualProgress = observation.passes.filter((p) => p.result === 'completed' && p.controlledProgress >= 5);
  const choices = new Map(observation.choices.map((c) => [c.id, c]));
  const spatialReleases = observation.passes.filter((p) => {
    const selected = choices.get(p.choiceId)?.selected;
    return selected?.type === 'space_pass' || (selected?.type === 'pass' && selected.requestedSpace);
  });
  const exposed = transitions.filter((t) => t.exposure.active);
  const transitionedShots = new Set(exposed.flatMap((t) => t.shots.map((s) => s.shotId)));
  const forwardDelays = exposed.filter((t) => t.firstForwardAction).map((t) => t.firstForwardAction.at - t.at);
  const controlledChoices = observation.choices.filter((c) => c.controlled);
  const controlled5mDelays = exposed.flatMap((t) => {
    const seen = controlledChoices.find((c) => c.team === t.team && c.at >= t.at && c.at <= t.end && c.depth >= t.depth + 5);
    return seen ? [seen.at - t.at] : [];
  });
  const football = {
    passes: total('passesAttempted'), completed: total('passesCompleted'), shots: total('shots'), goals: total('goals'),
    onTarget: total('shotsOnTarget'), blocks: total('blockedShots'), corners: total('corners'), fouls: total('fouls'),
    offsides: total('offsides'), playerCreditedLosses: total('possessionLost'), turnoverFacts: receipt.statistics.observedPossessionLossIds?.length ?? 0,
    initialCMReceptions: cm, receptions: total('passesReceived'), controlledForwardPasses: actualProgress.length,
    controlledForwardMetres: actualProgress.reduce((n, p) => n + p.controlledProgress, 0),
    spatialReleases: spatialReleases.length, spatialCompletions: spatialReleases.filter((p) => p.result === 'completed').length,
    combinations: observation.combinations.length, completedCombinations: observation.combinations.filter((c) => c.outcome === 'completed').length,
    exposedRecoveries: exposed.length, transitionAttempts: exposed.filter((t) => t.firstForwardAction).length,
    transitionsGaining10m: exposed.filter((t) => t.maxControlledProgress >= 10).length,
    transitionsFailingToGain5m: exposed.filter((t) => t.firstForwardAction && t.maxControlledProgress < 5).length,
    transitionTurnovers: exposed.filter((t) => t.outcome === 'turnover').length,
    defenceRecovered: exposed.filter((t) => t.recovered).length, transitionShotIds: transitionedShots.size,
    recoveryDefensiveThird: transitions.filter((t) => t.depth < 35).length,
    recoveryMiddleThird: transitions.filter((t) => t.depth >= 35 && t.depth < 70).length,
    recoveryAttackingThird: transitions.filter((t) => t.depth >= 70).length,
    firstForwardDelayTotalSeconds: forwardDelays.reduce((n, s) => n + s, 0),
    firstForwardDelayObservations: forwardDelays.length,
    decisionSampled5mDelayTotalSeconds: controlled5mDelays.reduce((n, s) => n + s, 0),
    decisionSampled5mDelayObservations: controlled5mDelays.length,
    liveSeconds: observation.counts.liveSeconds ?? 0, stoppedSeconds: observation.counts.stoppedSeconds ?? 0,
    credibleEpisodes: observation.counts['episode:credible_opportunity'] ?? 0,
    progressionEpisodes: observation.counts['episode:physical_progression'] ?? 0,
    contactIdentityCount: receipt.statistics.observedContactIds.length,
  };
  rows.push({ group, design: fixture.design, inputHash: fixture.inputHash, source: receipt.manifest,
    status: receipt.status, elapsed: receipt.time, score: receipt.score, finalHash: receipt.finalHash,
    football, cpuMs: receipt.cpuMs, wallMs: receipt.wallMs,
    maxRankedCandidates: Math.max(0, ...observation.choices.map((c) => c.count)),
    metadata: archive(path, `${group}-${fixture.design.id}.json`), raw: archive(rawPath, `${group}-${fixture.design.id}-raw.json.gz`) });
}
const metrics = Object.keys(rows[0].football);
const summary = groups.map(([group]) => {
  const matches = rows.filter((r) => r.group === group);
  return { group, matches: matches.length, fullTime: matches.filter((r) => r.status === 'full_time').length,
    totals: Object.fromEntries(metrics.map((k) => [k, matches.reduce((n, r) => n + r.football[k], 0)])),
    ranges: Object.fromEntries(['shots', 'goals', 'passes', 'playerCreditedLosses', 'exposedRecoveries'].map((k) => [k, { min: Math.min(...matches.map((r) => r.football[k])), max: Math.max(...matches.map((r) => r.football[k])) }])) };
});
const table = ['| Cohort / policy | Full time | Passes | Shots | Goals | Blocks | Corners | Controlled forward passes | Exposed recoveries / attempts / >=10m |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...summary.map((s) => `| ${s.group} | ${s.fullTime}/${s.matches} | ${s.totals.passes} | ${s.totals.shots} | ${s.totals.goals} | ${s.totals.blocks} | ${s.totals.corners} | ${s.totals.controlledForwardPasses} | ${s.totals.exposedRecoveries} / ${s.totals.transitionAttempts} / ${s.totals.transitionsGaining10m} |`) ].join('\n');
for (const [label, root] of [['pristine', '../pr177-pristine-frozen'], ['legacy', '../pr177-frozen-legacy-pr176'], ['A', '../pr177-frozen-risk-ablation-v1'], ['B', '../pr177-final-frozen-B']])
  if (existsSync(`${root}/frozen.json`)) archive(`${root}/frozen.json`, `frozen-${label}.json`);
const frozenB = json('../pr177-final-frozen-B/frozen.json');
const key = (a) => JSON.stringify(a);
const physical = (r) => JSON.stringify(r.continuation.rows.map((s) => ({ seconds: s.seconds, ball: s.ball, score: s.score, possession: s.possession,
  players: s.movements.map((p) => ({ id: p.id, position: p.position, velocity: p.velocity })) })));
const ablations = readdirSync('..', { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith('pr177-ablation-')).map((d) => {
  const path = `../${d.name}/frozen.json`, receipt = json(path);
  const reference = receipt.manifest.policy === 'state-value-v1' ? frozenB : json('../pr177-frozen-risk-ablation-v1/frozen.json');
  return { ablation: receipt.manifest.ablation, policy: receipt.manifest.policy, states: receipt.rows.length,
    selectedActionChanges: receipt.rows.filter((r) => key(r.ranking[0]?.action) !== key(reference.rows.find((p) => p.id === r.id).ranking[0]?.action)).length,
    physicalContinuationChanges: receipt.rows.filter((r) => physical(r) !== physical(reference.rows.find((p) => p.id === r.id))).length,
    method: 'Historical dependent states; compare decisions and ball/player checkpoint content. Policy/ablation-ID-only whole-state hash differences are not counted as football changes.',
    archive: archive(path, `${d.name}.json`) };
});
writeFileSync('docs/performance/PR177-ablations.json', JSON.stringify({ version: 1, rows: ablations }, null, 2) + '\n');
for (const [root, label] of [['../pr177-b-initial-short', 'initial-smoke'], ['../pr177-b-r1-short', 'r1-smoke'], ['../pr177-b-r1-development', 'r1-rejected'], ['../pr177-b-r2-development', 'r2-before-index'], ['../pr177-b-r2-development-tail', 'r2-tail-before-index'], ['../pr177-a-development', 'A-before-index']]) {
  if (!existsSync(root)) continue;
  for (const file of readdirSync(root).filter((p) => p.endsWith('.json') || p.endsWith('.json.gz')))
    archive(`${root}/${file}`, `${label}-${file}`);
}
for (const file of ['../pr177-final-source.json.gz', '../pr176-plain.json', '../pr177-debug-strength-half.json'])
  archive(file, file.split('/').at(-1));
for (const file of readdirSync('..').filter((p) => /^pr177.*\.log$/.test(p))) archive(`../${file}`, file);
const frozen = json('docs/performance/PR177-validation-freeze.json');
const sourceHash = sha(frozen.files.map((f) => `${f.path.split('/').at(-1)}\0${readFileSync(f.path, 'utf8').replaceAll('\r\n', '\n')}\0`).join(''));
if (sourceHash !== frozen.sourceHash) throw new Error('Frozen production changed after validation');
const comparison = { version: 1,
  method: 'One fixture is one dependent design observation, not a league population or independent tick. Six development and six sealed validation designs. Initial-CM receptions refer to starter identity, not inferred substitute slot/minute labels. Controlled-forward passes measure reception contact gain, not guaranteed retained possession after eight seconds. Transition 5/10m bins are descriptive posthoc reporting bins, not preregistered acceptance quotas. First-forward-action time is actual recorded action time; time to 5m controlled progress is sampled at actual controlled decision observations and can lag the first physical crossing. Do not treat cadence differences as a causal latency estimate. Recovery zones use 105m/3 equal depth thirds from the recovering team perspective.',
  sourceHash, rows, summary, ablations, artifacts,
  decision: { default: 'legacy-pr176', B: 'experimental, promotion rejected', reason: 'Inherited physical overlap/contact loop reproducible in pristine PR176 and B; material changes do not establish complete plausible football or justify promotion. See PR177-loose-contact-loop.json.' },
};
writeFileSync('docs/performance/PR177-comparison.json', JSON.stringify(comparison, null, 2) + '\n');
writeFileSync('docs/performance/PR177-results-table.md', table + '\n');
const sourceFiles = readdirSync('src/core/matchSimulation').filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts')).sort();
const scripts = readdirSync('scripts').filter((p) => /[Pp]r177/.test(p));
writeFileSync('docs/performance/PR177-final-manifest.json', JSON.stringify({ version: 1, frozen, sourceFiles: sourceFiles.map((p) => ({ path: `src/core/matchSimulation/${p}`, sha256: sha(readFileSync(`src/core/matchSimulation/${p}`)) })),
  scripts: scripts.map((p) => ({ path: `scripts/${p}`, sha256: sha(readFileSync(`scripts/${p}`)) })),
  dependencyLockSha256: sha(readFileSync('package-lock.json')), artifacts,
  historicalEvidencePreserved: true }, null, 2) + '\n');
if (existsSync('../../outputs/PR177-smoke.png')) copyFileSync('../../outputs/PR177-smoke.png', `${out}/browser-smoke.png`);
console.log(JSON.stringify({ matches: rows.length, summary: summary.map((s) => ({ group: s.group, fullTime: s.fullTime, shots: s.totals.shots, passes: s.totals.passes })) }));
