import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createPr211Scene, tracePr211 } from './pr211Scenarios.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { ROOT, hash, write, read, checkPr211Source, recordPr211Source } from './pr211Evidence.mjs';
const check = process.argv.includes('--check');
const json = (value) => JSON.parse(JSON.stringify(value));
const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, stable(value[k])]),
        )
      : value;
if (process.argv.includes('--record-source')) recordPr211Source();
const source = checkPr211Source();
const start = performance.now(),
  cpu = process.cpuUsage();
const cases = [
  ...[
    'ordinary',
    'crossing',
    'miss',
    'advance',
    'brake',
    'turn',
    'defender-first',
    'defender-late',
    'teammate-first',
    'touchline',
    'goal-line',
    'goal-post',
    'penetration',
    'weak-foot',
    'hurried',
  ].map((name) => ({ name, timing: 0 })),
  ...[-0.01, 0, 0.01].map((timing) => ({ name: 'timing', timing })),
  { name: 'ordinary', timing: undefined },
];
const rows = cases.map(({ name, timing }) => {
  const f = createPr211Scene(name, timing),
    r = tracePr211(f.selected);
  const saves = [0, 2, 3].map((ticks) => {
    const checkpoint = tracePr211(f.selected, ticks).state;
    const restored = tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(checkpoint)));
    const a = tracePr211(checkpoint),
      b = tracePr211(restored);
    assert.deepEqual(json(b.frames), json(a.frames));
    const aState = tacticalMatchStateSchema.parse(a.state),
      bState = tacticalMatchStateSchema.parse(b.state);
    assert.deepEqual(json(bState), json(aState));
    return {
      ticks,
      phase: checkpoint.pendingStrike?.phase ?? null,
      bytes: Buffer.byteLength(JSON.stringify(checkpoint)),
      equal: true,
      terminalHash: hash(stable(json(aState))),
      restoredTerminalHash: hash(stable(json(bState))),
      randomIdentityEqual:
        a.state.seed === b.state.seed && a.state.decisionIndex === b.state.decisionIndex,
    };
  });
  assert.equal(r.state.pendingStrike, undefined, `${name}: orphaned strike`);
  return {
    name,
    timing: timing ?? 'sampled',
    initial: f.initial,
    selected: f.selected,
    frames: r.frames,
    resolution: r.state.lastStrikeResolution,
    terminalHash: hash(JSON.stringify(r.state)),
    saves,
    selectedBytes: Buffer.byteLength(JSON.stringify(f.selected)),
    pendingBytes: Buffer.byteLength(JSON.stringify(f.selected.pendingStrike)),
    physicalContact: r.state.lastStrikeResolution?.outcome === 'contact',
    tacticalOutcome: {
      ownerId: r.state.ball.ownerId ?? null,
      scenario: r.state.scenario,
      passResult: r.state.lastPassDiagnostic?.finalResult ?? null,
    },
  };
});
const legacy = [];
for (const name of ['ordinary', 'miss', 'advance', 'defender-first', 'touchline']) {
  const f = createPr211Scene(name, 0),
    initial = globalThis.structuredClone(f.initial);
  delete initial.experimentalPendingStrike;
  const selected = resolveMatchAction(initial, f.action, 'human_selected'),
    r = tracePr211(selected);
  legacy.push({
    name,
    initial,
    selectedBall: selected.ball,
    frames: r.frames,
    terminalHash: hash(JSON.stringify(r.state)),
  });
}
const result = JSON.parse(
  JSON.stringify({
    version: 'pr211-canonical-v1',
    rows,
    legacy,
    totals: rows.reduce(
      (a, r) => ({
        ...a,
        [r.resolution?.outcome ?? 'unresolved']:
          (a[r.resolution?.outcome ?? 'unresolved'] ?? 0) + 1,
      }),
      {},
    ),
  }),
);
const usage = process.cpuUsage(cpu);
const measurement = {
  wallSeconds: (performance.now() - start) / 1000,
  cpuSeconds: (usage.user + usage.system) / 1e6,
  peakRSSKiB: process.resourceUsage().maxRSS,
  node: process.version,
  platform: process.platform,
};
const path = `${ROOT}/canonical-final-v4.json.gz`;
if (check) {
  const saved = read(path);
  assert.equal(saved.source, source.fingerprint);
  assert.deepEqual(result, saved.result, 'PR211 canonical result drift');
  assert.equal(hash(saved.result), saved.resultHash);
} else write(path, { source: source.fingerprint, resultHash: hash(result), result, measurement });
// Matched bounded development scenes: setup is outside the measured continuation.
const costs = [];
for (const temporal of [false, true]) {
  const inputs = Array.from({ length: 32 }, () => createPr211Scene('ordinary', 0));
  const scenes = inputs.map((f) => {
    if (temporal) return f.selected;
    delete f.initial.experimentalPendingStrike;
    return resolveMatchAction(f.initial, f.action, 'human_selected');
  });
  const clock = performance.now(),
    startCpu = process.cpuUsage();
  for (const s of scenes) {
    let current = s;
    for (let i = 0; i < 5; i++) current = stepTacticalMatch(current, 0.025);
  }
  const cpuDelta = process.cpuUsage(startCpu);
  costs.push({
    temporal,
    scenes: scenes.length,
    ticks: 5,
    wallSeconds: (performance.now() - clock) / 1000,
    cpuSeconds: (cpuDelta.user + cpuDelta.system) / 1e6,
    peakRSSKiB: process.resourceUsage().maxRSS,
    selectedBytes: Buffer.byteLength(JSON.stringify(scenes[0])),
  });
}
if (!check && !existsSync(`${ROOT}/cost-final-v4.json`))
  write(`${ROOT}/cost-final-v4.json`, { source: source.fingerprint, costs });
console.log(
  JSON.stringify({
    check,
    source: source.fingerprint,
    cases: rows.length,
    totals: result.totals,
    replayCheckpoints: rows.length * 3,
    legacy: legacy.length,
    measurement,
    costs,
  }),
);
