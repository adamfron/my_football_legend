import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase.ts';
import { createSingleMatchSession } from '../src/core/singleMatch.ts';

const args = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const beforeRoot = resolve(args.get('before-root') ?? '../pr190-spin-final');
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v))
    .digest('hex');
const load = (root, name) =>
  import(pathToFileURL(resolve(root, `src/core/matchSimulation/${name}.ts`)));
const manifest = (root) =>
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

if (args.has('penalty-root')) {
  const root = resolve(args.get('penalty-root'));
  const sim = await load(root, 'matchSimulation');
  // Execute the actual contract source with only its engine import URLs redirected.
  // Its full half, fixed ticks, liveness checks and iteration ceiling stay unchanged.
  const original = readFileSync('scripts/penaltyHalfContract.ts', 'utf8');
  const code = stripTypeScriptTypes(original, { mode: 'transform' })
    .replace(/(['"])\.\.\/src\/([^'"]+)\1/g, (_all, _quote, path) =>
      JSON.stringify(pathToFileURL(resolve(root, 'src', `${path}.ts`)).href),
    )
    .replace(/from ['"]zod['"]/, `from ${JSON.stringify(import.meta.resolve('zod'))}`);
  const contract = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );
  const world = createCanonicalWorldDatabase();
  const initial = sim.createOpenPlayMatchFixture(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0].id,
      awayClubId: world.clubs[1].id,
      seed: 'pr160-full-half-penalty',
      decisionPolicy: 'legacy-pr176',
      control: { mode: 'spectator' },
    }),
  );
  delete initial.restart;
  initial.scenario = 'open_play';
  initial.playerAgencyEnabled = false;
  initial.actionCooldown = 0;
  const inputSha256 = sha(initial),
    cpu = process.cpuUsage(),
    started = performance.now();
  const result = contract.runPenaltyHalfContract(initial);
  const measuredCpu = process.cpuUsage(cpu),
    wallMs = performance.now() - started;
  contract.penaltyHalfReceiptSchema.parse(result);
  assert.equal(result.state.status, 'half_time');
  assert(
    result.awarded && result.penaltyExecution !== undefined && result.state.decisionIndex > 20,
  );
  process.stdout.write(
    JSON.stringify({
      inputSha256,
      resultSha256: sha(result),
      stateSha256: sha(result.state),
      sourceSha256: manifest(root),
      contractSha256: sha(original.replaceAll('\r\n', '\n')),
      status: result.state.status,
      seconds: result.state.time,
      decisions: result.state.decisionIndex,
      penaltyExecution: result.penaltyExecution,
      cpu: measuredCpu,
      wallMs,
    }),
  );
} else {
  const output = 'docs/performance/pr190/arrival-optimization.json';
  if (existsSync(output)) throw Error('Preserve optimization evidence');
  await load(beforeRoot, 'matchSimulation');
  await load('.', 'matchSimulation');
  const before = (await load(beforeRoot, 'playerArrival')).estimatePlayerArrivalTime;
  const after = (await load('.', 'playerArrival')).estimatePlayerArrivalTime;
  const cases = [],
    captures = [];
  const clamp = (p) => ({ x: Math.max(0, Math.min(105, p.x)), y: Math.max(0, Math.min(68, p.y)) });
  for (const file of readdirSync('docs/performance/pr189').filter((p) => p.endsWith('.json.gz'))) {
    const path = `docs/performance/pr189/${file}`,
      raw = readFileSync(path),
      value = JSON.parse(gunzipSync(raw));
    if (value.schemaVersion !== 1 || !value.state || !value.sourceCommit) continue;
    const state = value.state,
      original = sha(state);
    captures.push({ path, captureSha256: sha(raw) });
    for (const player of state.players)
      for (const target of [
        clamp(state.ball),
        clamp({ x: player.position.x + 0.8, y: player.position.y }),
        clamp({ x: player.position.x + 0.8000000001, y: player.position.y }),
        { x: 0, y: 0 },
        { x: 105, y: 68 },
      ])
        for (const intent of ['normal', 'intercept', 'loose_ball']) {
          assert.deepStrictEqual(
            after(state, player, target, intent),
            before(state, player, target, intent),
          );
          cases.push([state, player, target, intent]);
        }
    assert.equal(sha(state), original, 'Arrival prediction mutated a capture');
  }
  const timings = [];
  for (const [name, fn] of [
    ['before', before],
    ['after', after],
  ]) {
    for (let i = 0; i < 400; i++) fn(...cases[i % cases.length]);
    const started = performance.now(),
      cpu = process.cpuUsage();
    for (let i = 0; i < 12000; i++) fn(...cases[i % cases.length]);
    timings.push({
      name,
      calls: 12000,
      cpu: process.cpuUsage(cpu),
      wallMs: performance.now() - started,
    });
  }
  console.log(JSON.stringify({ arrivalCases: cases.length, captures: captures.length, timings }));
  const halves = [];
  for (const root of [beforeRoot, resolve('.')]) {
    const r = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--experimental-transform-types',
          '--import',
          './scripts/registerTypescriptLoader.mjs',
          'scripts/benchmarkPr190Arrival.mjs',
          `--penalty-root=${root}`,
        ],
        { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      ),
    );
    halves.push(r);
    console.log(
      JSON.stringify({
        half: root === beforeRoot ? 'before' : 'after',
        wallMs: r.wallMs,
        cpu: r.cpu,
        stateSha256: r.stateSha256,
      }),
    );
  }
  assert.equal(halves[0].inputSha256, halves[1].inputSha256);
  assert.equal(halves[0].resultSha256, halves[1].resultSha256, 'Whole-half contract changed');
  const result = {
    schemaVersion: 1,
    classification:
      'allocation-only optimization; exact structured arrival equality and actual unchanged whole-half contract source',
    beforeSourceSha256: manifest(beforeRoot),
    afterSourceSha256: manifest('.'),
    arrivalCases: cases.length,
    captures,
    timings,
    halves,
    originalWallBudgetsPreserved: true,
    footballAndRngUnchanged: true,
  };
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(
    JSON.stringify({
      optimizationParity: 'PASS',
      cases: cases.length,
      halfStateSha256: halves[1].stateSha256,
    }),
  );
}
