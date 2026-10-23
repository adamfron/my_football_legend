import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { digest, pr183SourceHash } from './pr183Evidence.mjs';

if (process.argv.includes('--child')) {
  const { createCanonicalWorldDatabase } = await import('./createCanonicalWorldDatabase.ts');
  const { createSingleMatchSession } = await import('../src/core/singleMatch.ts');
  const { createTacticalMatch } = await import('../src/core/matchSimulation/matchSimulation.ts');
  const { runPenaltyHalfContract, penaltyHalfReceiptSchema } = await import(
    './penaltyHalfContract.ts'
  );
  const world = createCanonicalWorldDatabase();
  const created = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0].id,
      awayClubId: world.clubs[1].id,
      seed: 'pr160-full-half-penalty',
      decisionPolicy: 'legacy-pr176',
      control: { mode: 'spectator' },
    }),
  );
  const { restart: discarded, ...open } = created;
  void discarded;
  const initial = { ...open, scenario: 'open_play', playerAgencyEnabled: false, actionCooldown: 0 };
  const result = penaltyHalfReceiptSchema.parse(runPenaltyHalfContract(initial));
  const cpu = process.cpuUsage();
  console.log(
    JSON.stringify({
      inputHash: digest(initial),
      resultHash: digest(result),
      stateHash: digest(result.state),
      status: result.state.status,
      time: result.state.time,
      decisions: result.state.decisionIndex,
      penaltyExecution: result.penaltyExecution,
      awarded: result.awarded,
      cpuSeconds: (cpu.user + cpu.system) / 1e6,
      maxRssBytes: process.resourceUsage().maxRSS * 1024,
    }),
  );
} else {
  const existing = process.argv.includes('--extra-only')
    ? JSON.parse(readFileSync('docs/performance/PR183-closure-ci-heap.json'))
    : undefined;
  if (existing && existing.sourceHash !== pr183SourceHash())
    throw Error('Previous heap probe source differs');
  const rows = existing?.rows ?? [];
  const configurations = [
    ['default', []],
    ['64MiB', ['--max-semi-space-size=64']],
    ['fixed64MiB', ['--min-semi-space-size=64', '--max-semi-space-size=64']],
  ];
  for (const [label, options] of existing ? configurations.slice(2) : configurations) {
    const started = performance.now();
    const output = spawnSync(
      process.execPath,
      [
        ...options,
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        'scripts/benchmarkPr183PenaltyHeap.mjs',
        '--child',
      ],
      { encoding: 'utf8', maxBuffer: 1024 * 1024, windowsHide: true, timeout: 180000 },
    );
    if (output.status !== 0) throw Error(`Heap probe failed ${label}: ${output.stderr}`);
    rows.push({
      label,
      nodeOptions: options,
      wholeProcessWallSeconds: (performance.now() - started) / 1000,
      ...JSON.parse(output.stdout),
    });
    console.log(JSON.stringify(rows.at(-1)));
  }
  if (
    rows.some((r) => r.inputHash !== rows[0].inputHash || r.resultHash !== rows[0].resultHash) ||
    rows.some((r) => !r.awarded || r.status !== 'half_time' || !r.penaltyExecution)
  )
    throw Error('Heap configuration changed the complete canonical contract');
  writeFileSync(
    'docs/performance/PR183-closure-ci-heap.json',
    JSON.stringify(
      {
        schema: 'mfl-pr183-ci-heap-v1',
        sourceHash: pr183SourceHash(),
        runtime: process.version,
        rows,
        completeCanonicalResultsEqual: true,
        scope:
          'Identical complete legacy penalty-half contract under default V8 young-generation heap and a 64MiB semi-space. All canonical steps, physics, assertions and test timeouts remain unchanged; extra CI memory headroom reduces GC overhead. The probe has a diagnostic 180s limit, not a replacement for the original 90s test.',
      },
      null,
      2,
    ) + '\n',
  );
}
