import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import {
  PR192_BASE,
  POLICIES,
  hash,
  writeReceipt,
  readDevelopmentInput,
} from './pr193Evidence.mjs';
const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true });
const paths = git(
  'ls-tree',
  '-r',
  '--name-only',
  PR192_BASE,
  'src',
  'scripts',
  'package.json',
  'package-lock.json',
  'AGENTS.md',
  'vite.config.ts',
  'vitest.config.ts',
  '.github/workflows/ci.yml',
)
  .trim()
  .split('\n')
  .filter(Boolean);
const source = paths
  .sort()
  .map((path) => ({
    path,
    sha256: hash(git('show', `${PR192_BASE}:${path}`).replaceAll('\r\n', '\n')),
  }));
const reports = [
  'PR192_BALL_ORIENTED_MOVEMENT_RECOVERY_AND_NATURAL_MATCH_FLOW.md',
  'PR191_FIRST_TOUCH_DIRECTIONAL_CONTROL_AND_ONE_TOUCH_LAB.md',
  'PR190_PASSING_REALISM_EFFECTIVE_PLAYING_TIME_AND_ARTICULATED_CONTACT.md',
  'PR189_BALL_CONTACT_DUEL_GEOMETRY_AND_DEADLOCK_RESOLUTION.md',
  'ROADMAP.md',
  'PROJECT_STATE.md',
].map((p) => {
  const path = 'docs/' + p;
  return { path, sha256: hash(git('show', `${PR192_BASE}:${path}`).replaceAll('\r\n', '\n')) };
});
const inputs = ['ww', 'ss', 'sw'].flatMap((design) =>
  POLICIES.map((policy) => {
    const { input, path } = readDevelopmentInput(design, policy);
    return { design, policy, path, sha256: hash(input), seed: input.seed };
  }),
);
writeReceipt('docs/performance/pr193/frozen-pr192.json', {
  schema: 'mfl-pr193-frozen-pr192-v1',
  mergedCommit: PR192_BASE,
  pr192Head: '379a87f73ee446e096195caf5e31d2ca8655eca1',
  source,
  sourceHash: hash(source),
  reports,
  inputs,
  historicalIndex: {
    path: 'docs/performance/pr192/evidence-index.json',
    sha256: hash(readFileSync('docs/performance/pr192/evidence-index.json')),
  },
  stepSeconds: 0.025,
  defaultPolicy: 'state-value-v1',
  independentConfirmation: 'sealed; not read or executed',
  comparisonBaselineFlags: { experimentalBallRecovery: true, experimentalRestartPreparation: true },
  newFlagsAbsentByDefault: [
    'experimentalTransitionIntelligence',
    'experimentalStrategicClearances',
  ],
  environment: {
    node: process.version,
    platform: process.platform,
    lockHash: hash(readFileSync('package-lock.json')),
  },
});
