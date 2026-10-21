import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { pr172SourceHash } from './pr172Evidence.ts';
const log = readFileSync('../pr180-verify.log', 'utf8');
const suites = [
  ...log.matchAll(/Test Files\s+(\d+) passed \((\d+)\)[\s\S]*?Tests\s+(\d+) passed \((\d+)\)/g),
].map((m) => ({ files: Number(m[1]), tests: Number(m[3]) }));
if (suites.length !== 4 || /Failed Tests|FAIL /u.test(log) || !/built in/u.test(log))
  throw Error('Complete successful verify output required');
const sha = (v) => createHash('sha256').update(v).digest('hex');
writeFileSync('docs/performance/pr180-evidence/verify.log.gz', gzipSync(log));
const previous = readFileSync('../pr180-verify-concurrent.log');
writeFileSync(
  'docs/performance/pr180-evidence/verify-concurrent-timeouts.log.gz',
  gzipSync(previous),
);
const receipt = {
  command: 'npm run verify',
  exitCode: 0,
  sourceHash: pr172SourceHash(),
  runtime: process.version,
  tests: suites.reduce((n, s) => n + s.tests, 0),
  suites,
  logSha256: sha(log),
  scope:
    'Full original lint/unit/integration/career-contract/full-career/TypeScript/Vite chain. Started after all 30 cohort and five closest-fixture runs finished, with browser games paused. No test timeout or performance/career budget changed.',
  earlierConcurrentAttempt: {
    unitTestsPassed: 1940,
    integrationTimeouts: [
      { test: 'whole CPU half with penalty', timeoutMs: 90000 },
      { test: 'controlled-player substitution spectator transition', timeoutMs: 30000 },
    ],
    logSha256: sha(previous),
    interpretation:
      'This earlier run competed with five cohort workers. Final serial verify supersedes it; preserved as workload evidence.',
  },
  baseline: {
    commit: '5646bb0e757289e1fa6ffde79ff9f94766139f48',
    pr179Head: 'f12c52b',
    sourceTreeDiffExit: 0,
  },
  assertions:
    'All telemetry fields, complete golden hashes, canonical schemas and identity assertions retained. Geometric/timing reception fixtures now exercise finite contact and actual later crossings; historical header input frozen before the contact.',
};
writeFileSync('docs/performance/PR180-verification.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
