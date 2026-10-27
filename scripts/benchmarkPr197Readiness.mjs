import process from 'node:process';
import console from 'node:console';
import { createFootballLabProfile } from './footballLabProfile.ts';
import { createFirstTouchLabCatalog } from '../src/core/matchSimulation/firstTouchLabCatalog.ts';
import { runFirstTouchLab } from '../src/core/matchSimulation/firstTouchLaboratory.ts';
import { sourceIdentity, argumentsMap, finish, hash } from './pr197Evidence.mjs';
import { performance } from 'node:perf_hooks';
const args = argumentsMap(),
  identity = sourceIdentity(),
  profile = createFootballLabProfile(),
  catalog = createFirstTouchLabCatalog(),
  start = performance.now(),
  rows = [];
const ground = catalog.find((c) => c.id === 'ground');
const cases = [
  ground,
  { ...ground, id: 'toward', bodyVelocity: { x: -3, y: 0 } },
  { ...ground, id: 'across', bodyVelocity: { x: 0, y: 4 } },
  { ...ground, id: 'away', bodyVelocity: { x: 4, y: 0 } },
  ...catalog.filter((c) =>
    [
      'behind',
      'bouncing',
      'rising',
      'flat_aerial',
      'pressure',
      'late_preparation',
      'fast_low',
      'descending_thigh',
    ].includes(c.id),
  ),
];
for (const config of cases)
  for (const skill of [20, 40, 60, 80, 100])
    for (const sample of [0, 1]) {
      const player = globalThis.structuredClone(profile);
      for (const key of Object.keys(player.attributes)) player.attributes[key] = skill;
      const seed = `pr197-readiness-${sample}`,
        result = runFirstTouchLab(config, player, seed);
      rows.push({
        id: config.id,
        skill,
        sample,
        input: result.input,
        inputHash: hash(result.input),
        resultHash: hash(result),
        metrics: result.metrics,
        contacts: result.contacts,
        choices: result.choices,
        first: result.samples[0],
        last: result.samples.at(-1),
      });
    }
finish(
  `docs/performance/pr197/readiness-${args.get('version') ?? 'v1'}.json.gz`,
  {
    schema: 'pr197-readiness-v1',
    source: identity,
    method:
      'Reuses PR191/192 first-touch laboratory and finite surface receipts. Initial player motion is prescribed apparatus, not autonomous tactical success. Experimental body surfaces here do not promote them in matches.',
    rows,
  },
  {
    milliseconds: performance.now() - start,
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
  },
  args.has('check'),
);
console.log('readiness', rows.length, 'conditions', cases.length);
