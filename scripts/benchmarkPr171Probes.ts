import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  PR171_SHOT_CASES,
  runShotProbe,
  centralProbe,
  carryProbe,
  restartProbe,
  boundaryProbe,
  shotResolutionProbe,
} from './pr171Probes';
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
  'docs/performance/PR171-shot-resolution.json',
  JSON.stringify(
    {
      version: 1,
      scope: '72 prescribed shot contacts; not natural AI selection frequency',
      rows: resolution,
    },
    null,
    2,
  ),
);
writeFileSync(
  'docs/performance/PR171-restart-continuity.json',
  JSON.stringify({ version: 1, carry, restarts, boundary }, null, 2),
);
writeFileSync(
  'docs/performance/PR171-controlled-probes.json',
  JSON.stringify(
    {
      version: 1,
      harnessHash: createHash('sha256')
        .update(readFileSync('scripts/pr171Probes.ts'))
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
