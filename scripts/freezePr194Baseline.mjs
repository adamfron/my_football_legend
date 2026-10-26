import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { platform, arch, cpus, totalmem } from 'node:os';
import process from 'node:process';
import { hash, files, readDevelopmentInput, POLICIES, writeReceipt } from './pr193Evidence.mjs';
const base = 'bc7c71b2e8daf910ed5a4ded5d731f5aa668cc4d';
const sourcePaths = execFileSync('git', ['ls-tree', '-r', '--name-only', base, 'src'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort();
const buffer = execFileSync('git', ['cat-file', '--batch'], {
  input: sourcePaths.map((p) => `${base}:${p}`).join('\n') + '\n',
  maxBuffer: 128 * 1024 * 1024,
  windowsHide: true,
});
let offset = 0;
const source = sourcePaths.map((path) => {
  const end = buffer.indexOf(10, offset),
    header = buffer.subarray(offset, end).toString().split(' '),
    size = Number(header[2]);
  if (header[1] !== 'blob') throw Error('Missing baseline blob');
  const content = buffer
    .subarray(end + 1, end + 1 + size)
    .toString('utf8')
    .replaceAll('\r\n', '\n');
  offset = end + 1 + size + 1;
  return { path, sha256: hash(content) };
});
const portableHash = (path) =>
  hash(
    path.endsWith('.gz') ? readFileSync(path) : readFileSync(path, 'utf8').replaceAll('\r\n', '\n'),
  );
writeReceipt('docs/performance/pr194/frozen-pr193.json', {
  schema: 'mfl-pr194-baseline-v1',
  base,
  pr193Head: '35f9a5569f2ef933eeeedb3fab58d306b3c8e14f',
  source,
  textHashConvention: 'UTF-8 with LF; binary gzip hashed as bytes',
  policies: POLICIES,
  inputs: ['ww', 'ss', 'sw'].flatMap((design) =>
    POLICIES.map((policy) => {
      const { input, path } = readDevelopmentInput(design, policy);
      return { design, policy, path, seed: input.seed, sha256: hash(input) };
    }),
  ),
  historicalEvidence: files('docs/performance/pr193')
    .sort()
    .map((path) => ({ path, sha256: portableHash(path) })),
  reports: [
    'PR193_TRANSITION_INTELLIGENCE_STRATEGIC_CLEARANCES_AND_OPPORTUNITY_WINDOWS.md',
    'PR192_BALL_ORIENTED_MOVEMENT_RECOVERY_AND_NATURAL_MATCH_FLOW.md',
    'PR191_FIRST_TOUCH_DIRECTIONAL_CONTROL_AND_ONE_TOUCH_LAB.md',
    'PR190_PASSING_REALISM_EFFECTIVE_PLAYING_TIME_AND_ARTICULATED_CONTACT.md',
  ].map((name) => ({ path: 'docs/' + name, sha256: portableHash('docs/' + name) })),
  environment: {
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    totalMemory: totalmem(),
  },
  negatives: {
    combinedPasses: 22546,
    combinedShots: 183,
    wwO: [1512, 1],
    wwH: [1404, 0],
    ssO: [1943, 4],
    swH: [1620, 9],
    checkpointCpuMs: [219, 375],
  },
  readiness: 'NOT READY',
  independentConfirmation: 'sealed',
});
