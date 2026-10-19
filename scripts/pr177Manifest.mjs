import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import console from 'node:console';

const hash = (v) => createHash('sha256').update(v).digest('hex');
const paths = (root) =>
  readdirSync(root, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? paths(`${root}/${e.name}`) : [`${root}/${e.name}`],
  );
const files = [...paths('src'), 'package.json', 'package-lock.json'].sort().map((path) => ({
  path,
  sha256: hash(readFileSync(path)),
  normalizedSha256: hash(readFileSync(path, 'utf8').replaceAll('\r\n', '\n')),
}));
const receipt = {
  version: 1,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  reference: execFileSync('git', ['rev-parse', 'match-engine-legacy-pr176'], {
    encoding: 'utf8',
  }).trim(),
  statusBeforeChanges: execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
  }),
  files,
  sourceHash: hash(JSON.stringify(files)),
  evaluation: {
    development:
      'six PR176 frozen development initial states, all policies; at most two documented revisions',
    validation:
      'six sealed initial states, run once after candidate source freeze; no tuning afterwards',
    primary: [
      'controlled progression',
      'midfield receptions',
      'natural shot releases and outcomes',
      'transition exposure, progress and recovery',
      'pass volume and diversity',
    ],
    correctness: [
      'physical contacts',
      'offside and restarts',
      'ownership',
      'determinism',
      'human agency',
      'exactly-once career result',
    ],
    performance: { medianRatioBudget: 1.35, selectedWorstRatioBudget: 1.6, physicsDt: 0.025 },
    noQuotas: true,
    noTurnoverOrCounterattackRateCeilings: true,
  },
};
writeFileSync('docs/performance/PR177-baseline.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(
  JSON.stringify({
    commit: receipt.commit,
    reference: receipt.reference,
    clean: !receipt.statusBeforeChanges,
    sourceHash: receipt.sourceHash,
  }),
);
