import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import {
  createPr215LooseScene,
  createPr215ReceptionBlocker,
  createPr215PassiveSupportScene,
} from './pr215Scenarios.ts';
import { advancePendingStrikeInterval } from '../src/core/matchSimulation/pendingStrikeInterval.ts';
import { runPr215Clinch } from './pr215Clinch.ts';
import { createPr214Scene } from './pr214Scenarios.ts';
import { createKickFixture } from '../src/core/matchSimulation/physicalKickLaboratory.ts';
import {
  holisticRecipe,
  withHolisticDevelopment,
  observeHolisticActivation,
} from './holisticDevelopment.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import {
  projectPlayerDecisionOpportunity,
  applyPlayerDecision,
} from '../src/core/matchSimulation/playerDecision.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { withIntegrationProfile } from '../src/core/matchSimulation/integrationProfile.ts';
import {
  PerformanceProfiler,
  withPerformanceProfiler,
} from '../src/core/matchSimulation/performanceProfiling.ts';
import { ROOT, recordPr215Source, checkPr215Source } from './pr215Evidence.mjs';
import { hash, write } from './pr199Evidence.mjs';
const { structuredClone } = globalThis;
const check = process.argv.includes('--check');
const version = process.argv.find((p) => p.startsWith('--version='))?.split('=')[1] ?? 'final-v7';
assert.match(version, /^[a-z0-9-]+$/);
if (process.argv.includes('--record-source')) recordPr215Source();
const binding = checkPr215Source();
const source = { base: binding.base, fingerprint: binding.fingerprint, archive: binding.archive };
const json = (x) => JSON.parse(JSON.stringify(x));
const reload = (s) => tacticalMatchStateSchema.parse(json(s));
const frame = (s) =>
  json({
    time: s.time,
    ball: s.ball,
    pending: s.pendingStrike,
    strike: s.lastStrikeResolution,
    contact: s.lastGroundContact,
    challenge: s.lastChallenge,
    clusters: s.multiBodyResolutions,
    bodyContacts: s.playerBodyContacts,
    continuousPlayers: s.continuousPlayerContacts,
    continuousFeet: s.continuousFootContacts,
    decisionIndex: s.decisionIndex,
    laws: s.lastRestartAward,
    witnesses: s.executionWitnesses,
    players: s.players.map((p) => ({
      id: p.id,
      position: p.position,
      velocity: p.velocity,
      plantBalance: p.plantBalance,
    })),
  });
const begun = performance.now(),
  cpu = process.cpuUsage();
const trace = (initial, ticks, stopOnUnresolved = false) => {
  let state = initial;
  const frames = [frame(state)],
    activation = [];
  for (let i = 0; i < ticks; i++) {
    const before = state;
    state = stepTacticalMatch(state, 0.025);
    tacticalMatchStateSchema.parse(state);
    frames.push(frame(state));
    activation.push(observeHolisticActivation(before, state));
    if (stopOnUnresolved && state.executionWitnesses?.unresolved) break;
  }
  return { state, frames, activation };
};
const initialCases = [
  ['ordinary-loose-three', createPr215LooseScene(), 8, false],
  ['reception-carry-blocker', createPr215ReceptionBlocker(), 8, true],
];
for (const name of [
  'line-four',
  'body-pass-third',
  'pass-body-third',
  'body-pass-challenge',
  'ball-touchline',
]) {
  const f = createPr214Scene(name);
  const s = withHolisticDevelopment(f.initial);
  // A real persisted prepared action is retained as a schema-validated checkpoint,
  // exactly as in the original PR214 combined-configuration continuation.
  if (f.initial.pendingStrike) s.pendingStrike = structuredClone(f.initial.pendingStrike);
  if (f.initial.defensiveChallenge)
    s.defensiveChallenge = structuredClone(f.initial.defensiveChallenge);
  initialCases.push([name, reload(s), 12, false]);
}
const rows = initialCases.map(([name, initial, ticks, stop]) => {
  const a = trace(initial, ticks, stop),
    b = trace(reload(initial), ticks, stop);
  assert.deepEqual(a.frames, b.frames, `${name}: initial saved continuation`);
  const checkpoints = [];
  for (const index of [0, Math.min(1, a.frames.length - 1), a.frames.length - 1]) {
    const checkpoint = trace(initial, index).state;
    const native = trace(checkpoint, 8),
      saved = trace(reload(checkpoint), 8);
    assert.deepEqual(native.frames, saved.frames, `${name}: checkpoint ${index}`);
    checkpoints.push({
      index,
      bytes: Buffer.byteLength(JSON.stringify(reload(checkpoint))),
      terminal: hash(saved.frames.at(-1)),
    });
  }
  const silent = structuredClone(initial);
  delete silent.executionWitnesses;
  const physical = (frames) =>
    frames.map(({ witnesses: _w, ...f }) => {
      void _w;
      return f;
    });
  assert.deepEqual(
    physical(trace(silent, ticks).frames),
    physical(trace(initial, ticks).frames),
    `${name}: instrumentation changed physics`,
  );
  return {
    name,
    initial: reload(initial),
    frames: a.frames,
    terminal: reload(a.state),
    activation: a.activation,
    checkpoints,
  };
});
assert.ok(rows[0].frames.some((f) => f.bodyContacts?.some((c) => c.kind === 'impact')));
const blocker = rows[1].terminal;
assert.equal(
  blocker.executionWitnesses.unresolved.source,
  'controlled_reception_remainder_not_migrated',
);
assert.ok(blocker.ball.ownerId && blocker.lastGroundContact.surfaceContact.available);
assert.equal(blocker.executionWitnesses['fallback-carry'], undefined);
const sf = createKickFixture({ seed: 'pr215-human', family: 'shot', metres: 20 });
const human = withHolisticDevelopment(sf.state);
human.playerAgencyEnabled = true;
human.controlledFootballerId = sf.actor.id;
const opportunity = projectPlayerDecisionOpportunity(human);
assert.ok(opportunity);
assert.deepEqual(stepTacticalMatch(human, 0.025), human);
const chosen = opportunity.options.find((o) => o.kind === 'action' && o.action.type === 'shot');
assert.ok(chosen);
const decision = applyPlayerDecision(human, opportunity, chosen.id);
assert.equal(decision.latestActionSource, 'human_selected');
assert.ok(decision.lastKickExecution);
const pf = createKickFixture({ seed: 'pr215-single-release' });
const pass = withHolisticDevelopment(pf.state);
pass.ball.lastTouchPlayerId = pf.actor.id;
const pending = resolveMatchAction(pass, pf.action, 'human_selected');
assert.ok(pending.pendingStrike);
assert.equal(pending.lastKickExecution, undefined);
assert.deepEqual(pending.ball, pass.ball);
const clinch = runPr215Clinch();
assert.ok(clinch.minimumThirdTorsoSeparation > clinch.torsoDiameter);
assert.equal(clinch.retained.length, 2);
assert.equal(clinch.afterEscape.length, 0);
const passiveFixture = createPr215PassiveSupportScene();
let passive = passiveFixture.initial;
const passiveFrames = [frame(passive)];
const passiveStep = (s) =>
  advancePendingStrikeInterval(s, { ...s, time: s.time + 0.025 }, 0.025, {
    ordinary: true,
    boundary: (q) => q,
    control: (q) => q,
    body: (q) => q,
  });
for (let i = 0; i < 4; i++) {
  const next = passiveStep(passive);
  assert.deepEqual(frame(next), frame(passiveStep(reload(passive))));
  assert.ok(next.ball.continuousBodyContacts.includes(passiveFixture.actorId));
  passive = next;
  passiveFrames.push(frame(passive));
}
assert.equal(passive.executionWitnesses['ball-body-contact'].executed, 1);
assert.equal(passive.ball.ownerId, undefined);
const result = {
  source,
  recipe: holisticRecipe(),
  rows,
  clinch,
  passiveSupport: {
    initial: reload(passiveFixture.initial),
    frames: passiveFrames,
    terminal: reload(passive),
    scope:
      'four stationary-body shared intervals, one passive impact then persistent support; four saved continuations',
  },
  human: { initial: reload(human), opportunity, selected: chosen.id, terminal: reload(decision) },
  singleRelease: { initial: reload(pass), pending: reload(pending) },
  readiness: 'LIMITED_UI / BLOCKED_FOR_HOLISTIC_MATCH',
  blocker: 'controlled_reception_remainder_not_migrated',
  smoke:
    'NOT_RUN: carry/delivery single-authority gate fails; browser startup is separate UI evidence',
  fullMatch:
    'NOT_RUN: mandatory local gate failed; frozen PR214 paired input and baseline unchanged',
};
const costArm = (mode) => {
  const s = createPr215LooseScene();
  const initial =
    mode === 'ordinary' ? withIntegrationProfile(s, 'realism-candidate-v1', 'state-value-v1') : s;
  if (mode === 'holistic-without-witnesses') delete initial.executionWitnesses;
  const profiler = new PerformanceProfiler({ enabled: true, sampleEveryTicks: 1 });
  const started = performance.now(),
    cpuBefore = process.cpuUsage();
  let bytes = 0;
  for (let sample = 0; sample < 32; sample++) {
    let state = structuredClone(initial);
    for (let i = 0; i < 8; i++) {
      profiler.beginTick(i);
      state = withPerformanceProfiler(profiler, () => stepTacticalMatch(state, 0.025));
    }
    bytes = Math.max(bytes, Buffer.byteLength(JSON.stringify(state)));
  }
  return {
    mode,
    ticks: 256,
    wallSeconds: (performance.now() - started) / 1000,
    cpu: process.cpuUsage(cpuBefore),
    maximumCheckpointBytes: bytes,
    spans: profiler.snapshot(),
  };
};
const costs = {
  node: process.version,
  platform: process.platform,
  wallSeconds: (performance.now() - begun) / 1000,
  cpu: process.cpuUsage(cpu),
  peakRSSKiB: process.resourceUsage().maxRSS,
  matched: ['ordinary', 'holistic-without-witnesses', 'holistic'].map(costArm),
  scope:
    '32 matched local inputs x 8 ticks/arm; inclusive sampled spans; descriptive single ordered sample, no speedup claim; browser/render/export measured separately',
};
if (check) {
  const receipt = JSON.parse(gunzipSync(readFileSync(`${ROOT}/canonical-${version}.json.gz`)));
  assert.deepEqual(json(result), receipt.result);
  console.log(
    'PR215 exact-source ordinary contacts, clinch, human choice and saved continuations PASS',
  );
} else {
  write(`${ROOT}/canonical-${version}.json.gz`, { result, costs });
  write(`${ROOT}/summary-${version}.json`, {
    source,
    recipe: result.recipe,
    readiness: result.readiness,
    blocker: result.blocker,
    smoke: result.smoke,
    fullMatch: result.fullMatch,
    rows: rows.map((r) => ({
      name: r.name,
      frames: r.frames.length,
      checkpoints: r.checkpoints,
      witnesses: r.terminal.executionWitnesses,
    })),
    clinch: {
      height: clinch.initial.position.z,
      groundMaximumSeparation: clinch.groundTwoSurfaceMaximumSeparation,
      thirdTorsoSeparation: clinch.minimumThirdTorsoSeparation,
      retained: clinch.retained,
      escaped: clinch.afterEscape,
      outgoing: clinch.outgoing,
    },
    costs,
  });
}
