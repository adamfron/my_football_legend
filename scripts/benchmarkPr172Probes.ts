import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pr172SourceHash } from './pr172Evidence';
const stage = z
  .enum(['before', 'gate-b', 'after'])
  .parse(process.argv.find((a) => a.startsWith('--stage='))?.slice(8) ?? 'after');
const engineRoot = resolve(
  process.argv.find((a) => a.startsWith('--engine-root='))?.slice(14) ?? '.',
);
const out = resolve(
  process.argv.find((a) => a.startsWith('--output-dir='))?.slice(13) ?? 'docs/performance',
);
mkdirSync(out, { recursive: true });
const manifest = { sourceHash: pr172SourceHash(engineRoot), fixedDt: 0.025, stage };
const {
  PR171_SHOT_CASES,
  runShotProbe,
  centralProbe,
  carryProbe,
  restartProbe,
  boundaryProbe,
  shotResolutionProbe,
} = (await import(
  pathToFileURL(resolve(engineRoot, 'scripts/pr171Probes.ts')).href
)) as typeof import('./pr171Probes');
const start = performance.now();
const shots = PR171_SHOT_CASES.flatMap((name) =>
  ['pr171-case-a', 'pr171-case-b'].map((seed) => runShotProbe(name, seed)),
);
const central = (['open', 'pressured', 'wide_competitor', 'gifted', 'ordinary'] as const).map(
  centralProbe,
);
const carry = [
  'straight',
  'pressure',
  'behind_ball',
  'sharp_turn',
  'destination_reached',
  'intercepted',
  'unreachable',
  'out',
  'expired',
].map(carryProbe);
const restarts = (['indirect', 'penalty', 'halftime'] as const).flatMap((k) =>
  k === 'halftime' ? [restartProbe(k)] : [restartProbe(k), restartProbe(k, true)],
);
const boundary = [false, true].flatMap((switched) =>
  [false, true].flatMap((last) => [
    boundaryProbe(last, switched),
    boundaryProbe(last, switched, true),
  ]),
);
const resolution = [
  'keeper_central',
  'keeper_lateral',
  'keeper_weak',
  'block_central',
  'block_diagonal',
  'wide_no_touch',
].flatMap((context) =>
  Array.from({ length: 12 }, (_, i) => shotResolutionProbe(context, `pr171-resolution-${i}`)),
);
writeFileSync(
  resolve(out, `PR172-${stage}-shot-resolution.json`),
  JSON.stringify(
    {
      version: 1,
      manifest,
      scope: '72 prescribed shot contacts; not natural AI selection frequency',
      rows: resolution,
    },
    null,
    2,
  ),
);
writeFileSync(
  resolve(out, `PR172-${stage}-restart-continuity.json`),
  JSON.stringify({ version: 1, manifest, carry, restarts, boundary }, null, 2),
);
writeFileSync(
  resolve(out, `PR172-${stage}-controlled-probes.json`),
  JSON.stringify(
    {
      version: 1,
      manifest,
      harnessHash: createHash('sha256')
        .update(readFileSync(resolve(engineRoot, 'scripts/pr171Probes.ts')))
        .digest('hex'),
      wallMs: performance.now() - start,
      shots,
      central,
    },
    null,
    2,
  ),
);
console.log(
  `completed ${shots.length} shooting, ${central.length} midfield, ${carry.length} carry, ${restarts.length} restart, ${boundary.length} boundary probes`,
);
