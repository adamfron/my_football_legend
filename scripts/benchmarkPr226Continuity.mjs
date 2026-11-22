import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import process from 'node:process';
import { createTrial, editions, scenes } from './benchmarkPr221Reception.mjs';
import { createPr224LimbScene, createPr224PassScene, selectPr224Body } from './pr224Scenarios.ts';
import { defaultBodyMorphology } from '../src/core/matchSimulation/bodyMorphology.ts';
import { projectArticulatedBody } from '../src/core/matchSimulation/articulatedBody.ts';
import {
  fullBodySkeletonSchema,
  projectFullBodySkeleton,
  withFullBodySkeleton,
} from '../src/core/matchSimulation/fullBodySkeleton.ts';
import { reanchorArticulatedSpawn } from '../src/core/matchSimulation/articulatedGait.ts';
import {
  captureReplaySnapshot,
  replaySnapshotSchema,
} from '../src/core/matchSimulation/matchReplay.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { captureReceptionStep } from '../src/core/matchSimulation/receptionTrace.ts';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const dynamic = process.argv.includes('--pr227');
const reload = (value) => tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(value)));
const stamp = (state) => hash(JSON.stringify(reload(state)));
const source = (path) => {
  const bytes = readFileSync(path);
  return { path, sha256: hash(bytes), data: JSON.parse(gunzipSync(bytes)) };
};
const ccd = source('docs/performance/pr224-ccd-checkpoints.json.gz');
const paired = source('docs/performance/pr224-full-match-checkpoints.json.gz');
const nativeA = source('docs/performance/pr224-native-a-halt.json.gz');
const kneeThigh = source('docs/performance/pr226-knee-thigh-checkpoint.json.gz');
const cases = [
  ...ccd.data.cases.map(({ name, state }) => ({ name: 'ccd-' + name, input: state, ticks: 1 })),
  ...paired.data.cases.map(({ name, before, actor }) => ({
    name: 'native-' + name,
    input: before,
    actor,
    ticks: 1,
  })),
  {
    name: 'opposing-41:56',
    input: paired.data.remaining.before,
    actor: 'footballer_pro_1_4',
    ticks: 26,
  },
  {
    name: 'support-transfer-71:58',
    input: nativeA.data.before,
    actor: 'footballer_pro_9_7',
    ticks: 26,
  },
  {
    name: 'opposing-knee-thigh-52:57',
    input: kneeThigh.data,
    actor: 'footballer_pro_1_23',
    ticks: 26,
  },
];

for (const name of ['ordinary', 'advance', 'miss']) {
  const { selected, actorId } = createPr224PassScene(name);
  cases.push({ name: 'pass-' + name, input: selected, actor: actorId, ticks: 40 });
}
for (const name of [
  'early-lateral',
  'pressure',
  'early-pressure',
  'unreachable',
  'stronger-pressure',
]) {
  const { input, receiver } = createTrial(
    scenes.find((s) => s.id === (name === 'stronger-pressure' ? 'pressure' : name)),
    'pr219-a',
    60,
  );
  input.experimentalReceptionPreparation = editions.C;
  if (name === 'stronger-pressure') {
    input.players = input.players.map((p) =>
      p.position.x === 40.4 && p.position.y === 34.55
        ? reanchorArticulatedSpawn({
            ...p,
            position: { ...p.position, y: p.position.y + 0.21 },
            velocity: { x: 0, y: -5.4 },
          })
        : p,
    );
  }
  cases.push({ name, input, actor: receiver, ticks: 64 });
}
for (const name of ['default', 'asymmetry', 'aligned', 'proportions', 'feet']) {
  const input = createPr224LimbScene('right', 'recovering');
  input.ball.spin = { x: 8, y: -15, z: 40 };
  const actor = input.playerMovementIntent.actorId;
  const morphology = defaultBodyMorphology();
  if (name === 'asymmetry') morphology.left.thigh += 0.01;
  if (name === 'aligned') {
    morphology.left.kneeAlignment = 0.1;
    morphology.right.kneeAlignment = -0.1;
  }
  if (name === 'proportions') {
    morphology.left.thigh -= 0.013;
    morphology.right.thigh -= 0.013;
    morphology.left.shank += 0.013;
    morphology.right.shank += 0.013;
  }
  if (name === 'feet') {
    morphology.left.footLength = 0.12;
    morphology.left.footWidth = 0.05;
    morphology.right.footLength = 0.18;
    morphology.right.footWidth = 0.08;
  }
  cases.push({
    name: 'shin-' + name,
    input,
    actor,
    ticks: 12,
    morphologies: { [actor]: morphology },
  });
  if (['asymmetry', 'aligned', 'proportions'].includes(name))
    cases.push({
      name: 'shin-' + name + '-geometry-relative',
      input: createPr224LimbScene('right'),
      actor,
      ticks: 12,
      morphologies: { [actor]: morphology },
      relativeFixture: true,
    });
}

function run({ input, actor, ticks, morphologies, relativeFixture }, arm) {
  const selected = selectPr224Body(input);
  if (arm === 'D') delete selected.experimentalComposedLegContact;
  if (arm === 'F' || arm === 'G')
    selected.experimentalComposedLegContact = 'composed-leg-impulse-dev-v2';
  if (arm === 'G') selected.experimentalDynamicBalance = 'dynamic-balance-dev-v1';
  let state = reload(withFullBodySkeleton(selected, morphologies));
  if (relativeFixture) {
    const authored = state.players.find((p) => p.id === actor);
    const target = projectArticulatedBody(state, authored).geometry.right;
    const lowShin = (axis) => target.ankle[axis] + 0.37 * (target.knee[axis] - target.ankle[axis]);
    // Set up the same approach relative to authored geometry before the match starts.
    state.ball = {
      ...state.ball,
      x: lowShin('x') + 0.19,
      y: lowShin('y'),
      height: lowShin('z'),
      velocity: { x: -8, y: 0, z: 0 },
    };
  }
  let reloaded = reload(state);
  const initial = stamp(state);
  const entry = {
    ball: state.ball,
    action: state.currentAction,
    motor: state.pendingStrike,
    receiving: state.receptionPreparation,
    players: state.players
      .filter((player) => player.id === actor)
      .map((player) => ({
        id: player.id,
        position: player.position,
        velocity: player.velocity,
        stance: player.articulatedStance,
      })),
  };
  const sequence = [],
    work = [],
    ownership = [],
    snapshots = [];
  const search = { calls: 0, samples: 0, exhausted: 0 };
  for (let i = 0; i < ticks && !state.safetyHalt; i++) {
    const before = state;
    const observed = captureReceptionStep(() => stepTacticalMatch(before, 0.025), {
      mechanics: true,
      contactWork: true,
    });
    state = observed.state;
    reloaded = stepTacticalMatch(reload(reloaded), 0.025);
    assert.equal(stamp(state), stamp(reloaded), 'native reload and observer parity');
    ownership.push({ time: state.time, owner: state.ball.ownerId ?? null });
    for (const event of observed.events) {
      if (event.source.endsWith('composedLegSearch')) {
        search.calls++;
        search.samples += event.detail.geometrySamples;
        search.exhausted += Number(event.detail.reason === 'budget');
      }
      if (event.source.endsWith('composedLimbWork')) work.push(event);
      if (
        event.source.endsWith('committedSupport') ||
        event.source.endsWith('resolveMultiBodyContact') ||
        event.source.endsWith('contactRace') ||
        event.source.endsWith('advanceControlledBall') ||
        (event.actorId === actor && event.source.startsWith('preReceptionPlanning.'))
      )
        sequence.push(event);
    }
    const changed = (key) => JSON.stringify(before[key]) !== JSON.stringify(state[key]);
    const contact =
      changed('lastGroundContact') && state.lastGroundContact?.executed
        ? state.lastGroundContact
        : undefined;
    const row = {
      action: changed('currentAction') ? state.currentAction : undefined,
      motor: changed('pendingStrike') ? state.pendingStrike : undefined,
      contact,
      strike: changed('lastStrikeResolution') ? state.lastStrikeResolution : undefined,
      challenge: changed('lastChallenge') ? state.lastChallenge : undefined,
      release:
        state.lastPassDiagnostic?.releasedAt >= before.time - 1e-9 &&
        state.lastPassDiagnostic.passId !== before.lastPassDiagnostic?.passId
          ? state.lastPassDiagnostic
          : undefined,
      loss: changed('pendingPossessionLoss') ? state.pendingPossessionLoss : undefined,
    };
    if (Object.values(row).some(Boolean)) sequence.push({ at: state.time, ...row });
    if (contact || i === 0 || i === ticks - 1 || state.safetyHalt) {
      const player = state.players.find((p) => p.id === actor);
      const body = player && projectArticulatedBody(state, player);
      if (player && body)
        fullBodySkeletonSchema.parse(projectFullBodySkeleton(state, player, body));
      const replay = replaySnapshotSchema.parse(
        JSON.parse(JSON.stringify(captureReplaySnapshot(state, 0, before, true))),
      );
      assert.deepEqual(
        replay.limbContacts ?? [],
        state.lastLimbContacts?.filter((c) => c.at > before.time) ?? [],
      );
      snapshots.push({
        time: state.time,
        ball: state.ball,
        actorPosition: player?.position,
        actorVelocity: player?.velocity,
        stance: player?.articulatedStance,
        poseAvailable: player ? Boolean(body) : null,
        bytes: Buffer.byteLength(JSON.stringify(replay)),
      });
    }
  }
  const contacts = sequence
    .filter((event) => event.contact && event.contact.actorId === actor)
    .map((event) => event.contact);
  const first = contacts[0],
    second = contacts.slice(1).find((c) => c.retained);
  const after600ms = first && ownership.find(({ time }) => time >= first.at + 0.6);
  const ownerAtScene600 = ownership.find(({ time }) => time >= input.time + 0.6 - 1e-9);
  const final = {
    time: state.time,
    owner: state.ball.ownerId ?? null,
    halt: state.safetyHalt ?? null,
    first: first
      ? { at: first.at, retained: first.retained, surface: first.surfaceContact?.executed }
      : null,
    second: second?.at ?? null,
    ownerAtScene600: ownerAtScene600 ?? null,
    afterFirst600: after600ms ?? null,
    releases: sequence
      .filter(({ release }) => release?.releasedAt !== undefined)
      .map(({ release }) => ({ at: release.releasedAt, actor: release.passerId })),
    cleanWins: sequence
      .filter(({ challenge }) => challenge?.outcome === 'clean_win')
      .map(({ challenge }) => challenge.actorId),
    impacts: sequence.filter(({ source }) => source?.endsWith('resolveMultiBodyContact')).length,
    legEvents: work.length,
    joint: work.filter(({ detail }) => detail.solver.startsWith('opposing_')).length,
    maximumWorkResidual: Math.max(
      0,
      ...work.map(({ detail }) => Math.abs(detail.account.residual)),
    ),
  };
  return {
    initial,
    entry,
    terminal: stamp(state),
    final,
    snapshots,
    work,
    search,
    sequence,
    ownership,
  };
}

const results = cases.map((scene) => ({
  name: scene.name,
  actor: scene.actor,
  arms: Object.fromEntries(
    (dynamic ? ['E', 'F', 'G'] : ['D', 'E', 'F']).map((arm) => [arm, run(scene, arm)]),
  ),
}));
if (dynamic) {
  const archived = JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr227-continuity.json.gz')),
  );
  const historical = (scenarios) =>
    hash(JSON.stringify(scenarios.map(({ name, arms }) => [name, arms.F])));
  assert.equal(
    historical(results),
    historical(archived.scenarios),
    'Original F continuity traces changed',
  );
}
const comparison = (name) => results.find((entry) => entry.name === name).arms;
const pinch = comparison('opposing-41:56');
assert.equal(pinch.E.final.joint, 1);
assert.equal(pinch.F.final.joint, 1);
assert.equal(comparison('support-transfer-71:58').F.final.joint, 1);
assert.ok(pinch.E.final.second && pinch.F.final.second);
assert.equal(pinch.E.final.afterFirst600.owner, null);
assert.equal(pinch.F.final.afterFirst600.owner, 'footballer_pro_1_4');
assert.equal(comparison('pressure').F.final.afterFirst600.owner, 'geometry:opponent:1');
assert.equal(comparison('unreachable').F.final.first, null);
assert.equal(comparison('pass-miss').F.final.releases.length, 0);
assert.ok(comparison('pass-advance').F.final.releases.length);
assert.deepEqual(
  comparison('shin-default').F.work.map(({ detail }) => detail.account),
  comparison('shin-feet').F.work.map(({ detail }) => detail.account),
);
for (const { arms } of results) {
  assert.equal(arms.F.final.halt, null);
  assert.ok(arms.F.final.maximumWorkResidual < 1e-9);
}
for (const { name, arms } of results) {
  process.stdout.write(
    JSON.stringify({
      name,
      ...Object.fromEntries(Object.entries(arms).map(([arm, result]) => [arm, result.final])),
    }) + '\n',
  );
}
const output = process.argv.includes('--record')
  ? 'docs/performance'
  : dynamic
    ? '.benchmark-artifacts/pr227'
    : '.benchmark-artifacts/pr226';
mkdirSync(output, { recursive: true });
writeFileSync(
  output + (dynamic ? '/pr227-refined-continuity.json.gz' : '/pr226-continuity.json.gz'),
  gzipSync(
    JSON.stringify({
      sources: [ccd, paired, nativeA, kneeThigh].map(({ path, sha256 }) => ({ path, sha256 })),
      scenarios: results,
    }),
  ),
);
