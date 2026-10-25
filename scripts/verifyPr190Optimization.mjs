import {
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  createWriteStream,
} from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setPriority, constants } from 'node:os';
import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';

const args = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const root = resolve(args.get('engine-root') ?? '.');
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v))
    .digest('hex');
const manifest = () =>
  sha(
    readdirSync(`${root}/src`, { recursive: true })
      .map((p) => p.replaceAll('\\', '/'))
      .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
      .sort()
      .map((p) => ({
        path: `src/${p}`,
        sha256: sha(readFileSync(`${root}/src/${p}`, 'utf8').replaceAll('\r\n', '\n')),
      })),
  );
const policies = [
  'opportunity-driven-v1',
  'hierarchical-intent-v1',
  'contextual-judgment-v1',
  'state-value-v1',
  'phase-role-hybrid-v1',
];
if (args.has('case')) {
  const { PassLifecycleDiagnostics } = await import(
    '../src/core/matchSimulation/passLifecycleDiagnostics.ts'
  );
  const [design, policy] = args.get('case').split(':');
  assert(['ww', 'ss', 'sw'].includes(design) && policies.includes(policy));
  const expected = JSON.parse(
    readFileSync(`docs/performance/pr190/${design}-${policy}-spin-final.json`),
  );
  const original = JSON.parse(
    readFileSync(
      `docs/performance/PR188-match-dev-${design}-${policy}-full-observed-final-v1.json`,
    ),
  );
  const input = JSON.parse(gunzipSync(readFileSync(original.archive))).input;
  assert.equal(sha(input), expected.inputSha256);
  const sourceSha256 = manifest();
  const sim = await import(
    pathToFileURL(resolve(root, 'src/core/matchSimulation/matchSimulation.ts'))
  );
  const { withBoundedObserver } = await import(
    pathToFileURL(resolve(root, 'src/core/matchSimulation/boundedIntelligence.ts'))
  );
  let state = input,
    ticks = 0;
  const observer = new PassLifecycleDiagnostics(),
    cpu = process.cpuUsage();
  withBoundedObserver(
    (t) => observer.trace(t),
    () => {
      while (!['full_time', 'abandoned'].includes(state.status) && state.time < 7200) {
        if (state.status === 'half_time') state = sim.startSecondHalf(state);
        const previous = state;
        state = sim.stepTacticalMatchAfterDecisionProbe(state, 0.025);
        assert.notEqual(state, previous, 'Canonical continuation stalled');
        observer.observe(previous, state);
        if (++ticks % 64000 === 0) console.error(`${design}/${policy}: ${state.time.toFixed(1)}s`);
      }
    },
  );
  const finalStateSha256 = sha(state),
    passArchiveSha256 = sha(JSON.stringify(observer.snapshot()));
  assert.equal(state.status, 'full_time');
  assert.equal(ticks, expected.ticks);
  assert.equal(finalStateSha256, expected.finalStateSha256, 'Final canonical state drift');
  assert.equal(
    passArchiveSha256,
    sha(gunzipSync(readFileSync(expected.archive))),
    'Complete pass lifecycle/trajectory drift',
  );
  assert.equal(manifest(), sourceSha256, 'Runtime source changed during replay');
  process.stdout.write(
    JSON.stringify({
      design,
      policy,
      sourceSha256,
      beforeSourceSha256: expected.sourceSha256,
      inputSha256: expected.inputSha256,
      ticks,
      finalStateSha256,
      passArchiveSha256,
      identicalFinalState: true,
      identicalCompletePassArchive: true,
      cpu: process.cpuUsage(cpu),
    }),
  );
} else {
  const output = 'docs/performance/pr190/optimization-full-parity.json';
  const check = args.has('check');
  if (existsSync(output) && !check) throw Error('Preserve optimization replay; use --check');
  mkdirSync('../pr190-optimization-logs', { recursive: true });
  const queue = ['ww', 'ss', 'sw'].flatMap((design) =>
      policies.map((policy) => ({ design, policy })),
    ),
    rows = [];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const { design, policy } = queue.shift(),
          log = createWriteStream(`../pr190-optimization-logs/${design}-${policy}.log`);
        console.log(`START ${design}/${policy}`);
        const row = await new Promise((done, reject) => {
          const child = spawn(
            process.execPath,
            [
              '--experimental-transform-types',
              '--import',
              './scripts/registerTypescriptLoader.mjs',
              'scripts/verifyPr190Optimization.mjs',
              `--engine-root=${root}`,
              `--case=${design}:${policy}`,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
          );
          // Let interactive validation use the host first; physics remains fixed-tick.
          try {
            setPriority(child.pid, constants.priority.PRIORITY_BELOW_NORMAL);
          } catch (error) {
            log.write(`Priority unchanged: ${String(error)}\n`);
          }
          let text = '';
          child.stdout.on('data', (chunk) => (text += chunk));
          child.stderr.pipe(log);
          child.on('error', reject);
          child.on('close', (code) => {
            log.end();
            if (code !== 0) reject(Error(`Parity failed ${design}/${policy}: ${code}`));
            else {
              try {
                done(JSON.parse(text));
              } catch (error) {
                reject(error);
              }
            }
          });
        });
        rows.push(row);
        console.log(`PASS ${design}/${policy}`);
      }
    }),
  );
  assert.equal(rows.length, 15);
  assert(rows.every((r) => r.sourceSha256 === manifest()));
  rows.sort((a, b) => `${a.design}:${a.policy}`.localeCompare(`${b.design}:${b.policy}`));
  const result = {
    schemaVersion: 1,
    classification:
      'all 15 full development matches on the allocation-optimized runtime; exact complete final states and complete pass lifecycle/trajectory archive bytes match the retained pre-optimization stage',
    complete: true,
    sourceSha256: manifest(),
    observerSha256: sha(
      readFileSync('src/core/matchSimulation/passLifecycleDiagnostics.ts', 'utf8').replaceAll(
        '\r\n',
        '\n',
      ),
    ),
    rows,
  };
  if (check) {
    const comparable = (value) => ({
      ...value,
      rows: value.rows.map(({ cpu: _timing, ...row }) => {
        void _timing;
        return row;
      }),
    });
    assert.deepStrictEqual(comparable(result), comparable(JSON.parse(readFileSync(output))));
  } else writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({
      complete: true,
      matches: 15,
      identical: true,
      sourceSha256: result.sourceSha256,
    }),
  );
}
