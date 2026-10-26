import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serialize, deserialize } from 'node:v8';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase.ts';
import { createSingleMatchSession } from '../src/core/singleMatch.ts';
import { createOpenPlayMatchFixture } from '../src/core/matchSimulation/matchSimulation.ts';

// Matched-host measurement, not a replacement for the integration assertions.
// Both children execute the original entry and retain its 89.5 s process budget.
const base = '9ea0e599f72800f4210092df2722e2ee16778ab7';
const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr192-penalty-control-'));
const archive = join(scratch, 'source.tar');
execFileSync(
  'git',
  ['archive', '--format=tar', '--output=' + archive, base, 'src', 'scripts', 'package.json'],
  { windowsHide: true },
);
execFileSync('tar', ['-xf', archive, '-C', scratch], { windowsHide: true });
symlinkSync(
  resolve('node_modules'),
  join(scratch, 'node_modules'),
  process.platform === 'win32' ? 'junction' : 'dir',
);
const world = createCanonicalWorldDatabase();
const made = createOpenPlayMatchFixture(
  createSingleMatchSession(world, {
    homeClubId: world.clubs[0].id,
    awayClubId: world.clubs[1].id,
    seed: 'pr160-full-half-penalty',
    decisionPolicy: 'legacy-pr176',
    control: { mode: 'spectator' },
  }),
);
const { restart: _restart, ...open } = made;
void _restart;
const input = { ...open, scenario: 'open_play', playerAgencyEnabled: false, actionCooldown: 0 };
const bytes = serialize(input);
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
console.log(
  JSON.stringify({
    experiment: 'PR192 matched-host native penalty control',
    base,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    node: process.version,
    platform: process.platform,
    cpu: cpus()[0]?.model,
    inputHash: hash(input),
    processBudgetMs: 89500,
  }),
);
for (const [kind, root] of [
  ['PR191', scratch],
  ['PR192', process.cwd()],
]) {
  const started = performance.now();
  const r = spawnSync(
    process.execPath,
    [
      '--max-semi-space-size=64',
      '--experimental-transform-types',
      '--import',
      pathToFileURL(join(root, 'scripts/registerTypescriptLoader.mjs')).href,
      join(root, 'scripts/runPenaltyHalfContract.mjs'),
    ],
    { cwd: root, input: bytes, windowsHide: true, timeout: 89500, maxBuffer: 64 * 1024 * 1024 },
  );
  const value = r.status === 0 ? deserialize(r.stdout) : null;
  console.log(
    JSON.stringify({
      kind,
      elapsedMs: performance.now() - started,
      exitCode: r.status,
      signal: r.signal,
      error: r.error?.code ?? null,
      stateHash: value ? hash(value.state) : null,
      status: value?.state.status,
      at: value?.state.time,
      awarded: value?.awarded,
      penaltyExecution: value?.penaltyExecution,
      stderr: r.stderr?.toString(),
    }),
  );
}
// The hosted runner discards this private temporary directory after the job.
// No source file, fixture, timeout, or assertion is modified by this measurement.
console.log(
  JSON.stringify({
    classification:
      'diagnostic complete; child failures above remain failures, not passing integration results',
    sourceEntry: createHash('sha256')
      .update(readFileSync('scripts/runPenaltyHalfContract.mjs'))
      .digest('hex'),
  }),
);
