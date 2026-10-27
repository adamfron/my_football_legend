import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { args, read, sourceIdentity, finish } from './pr198Evidence.mjs';
import { continueRelease } from './pr198Laboratory.mjs';
const options = args(),
  model = options.get('model') ?? 'baseline',
  version = options.get('version') ?? 'v1';
const identity = sourceIdentity();
const models = {
  baseline: [],
  defence: ['D'],
  height: ['H'],
  receiver: ['R'],
  dh: ['D', 'H'],
  dr: ['D', 'R'],
  hr: ['H', 'R'],
  combined: ['D', 'H', 'R'],
  synchronized: ['D', 'H', 'R', 'S'],
};
if (!models[model]) throw Error('Unknown ablation');
const flags = {
  experimentalDefensiveReception: models[model].includes('D'),
  experimentalHeightAwarePassing: models[model].includes('H'),
  experimentalReceiverAnticipation: models[model].includes('R'),
  experimentalReceiverSynchronisation: models[model].includes('S'),
  experimentalCanonicalArrival: false,
};
const frozen = read('docs/performance/pr198/releases-v1.json.gz'),
  rows = [],
  start = performance.now(),
  cpu = process.cpuUsage();
for (const entry of frozen.result.rows) {
  const result = continueRelease(entry, flags);
  const { final, frames, ...compact } = result;
  void final;
  rows.push({
    family: entry.family,
    skill: entry.skill,
    sample: entry.sample,
    seed: entry.seed,
    releaseHash: entry.releaseHash,
    ballHash: entry.ballHash,
    receiverHash: entry.receiverHash,
    ...compact,
    frames: entry.sample === 0 && [20, 80].includes(entry.skill) ? frames : undefined,
  });
  if (rows.length % 20 === 0) console.log('PR198 reception', model, rows.length);
}
const summary = {
  released: rows.length,
  touch: rows.filter((r) => r.outcome.directReceiverTouch).length,
  control: rows.filter((r) => r.outcome.directReceiverTouch && r.outcome.receiverControl).length,
  retained: rows.filter((r) => r.outcome.directReceiverTouch && r.outcome.teamPossessionAtOneSecond)
    .length,
  censored: rows.filter((r) => r.outcome.censored).length,
  noTouch: rows.filter((r) => r.outcome.directReceiverTouch === false).length,
};
finish(
  `docs/performance/pr198/receptions-${model}-${version}.json.gz`,
  {
    schema: 'pr198-same-release-v1',
    source: identity,
    model,
    flags,
    method:
      'Paired 180 already-released original PR197 baseline balls. Full factorial isolates post-release effects; release-time forecasts and kicks are held fixed. Original-delivery-v3; later actions cannot rescue reception.',
    rows,
    summary,
  },
  {
    milliseconds: performance.now() - start,
    cpu: process.cpuUsage(cpu),
    maxRSSKiB: process.resourceUsage().maxRSS,
    memory: process.memoryUsage(),
    execution: options.get('execution') ?? 'concurrent development',
  },
);
console.log(JSON.stringify(summary));
