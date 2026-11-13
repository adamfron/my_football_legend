/* global structuredClone */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { createPr214Scene } from './pr214Scenarios.ts';
import {
  withArticulatedBody,
  initializeArticulatedPlayer,
  withoutArticulatedBody,
} from '../src/core/matchSimulation/articulatedGait.ts';
import { stepArticulatedGaitPrototype } from './pr216GaitPrototype.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { deriveLowerBodyGeometry } from '../src/core/matchSimulation/lowerBodyGeometry.ts';
import { projectArticulatedBody } from '../src/core/matchSimulation/articulatedBody.ts';
import { recordPr218Source, checkPr218Source } from './pr218Evidence.mjs';

const root = process.argv.includes('--check')
  ? '.benchmark-artifacts/pr218'
  : 'docs/performance/pr218';
mkdirSync(root, { recursive: true });
const hash = (x) =>
  createHash('sha256')
    .update(typeof x === 'string' ? x : JSON.stringify(x))
    .digest('hex');
const source = process.argv.includes('--check')
  ? checkPr218Source({ current: true })
  : recordPr218Source();
const save = (name, data) =>
  writeFileSync(`${root}/${name}.json.gz`, gzipSync(JSON.stringify(data)));
const initial = createPr214Scene('pair-reference').initial;
const seedPlayer = initial.players[0];
const scenes = [];
const controls = {
  idle: () => ({ speed: 0, dx: 0, dy: 0, facing: 0 }),
  walk: () => ({ speed: 1.5, dx: 0, dy: 40, facing: 0 }),
  jog: () => ({ speed: 3.5, dx: 0, dy: 40, facing: 0 }),
  sprint: () => ({ speed: 9, dx: 0, dy: 40, facing: 0 }),
  accelerate: (t) => ({ speed: t < 1 ? 1.5 : 9, dx: 0, dy: 40, facing: 0 }),
  brake: (t) => ({ speed: t < 1.5 ? 7 : 0, dx: 0, dy: 40, facing: 0 }),
  turn90: (t) => ({
    speed: 5,
    dx: t < 1.5 ? 0 : 40,
    dy: t < 1.5 ? 40 : 0,
    facing: t < 1.5 ? 0 : Math.PI / 2,
  }),
  reverse: (t) => ({ speed: 5, dx: 0, dy: t < 1.5 ? 40 : -40, facing: t < 1.5 ? 0 : Math.PI }),
  sidestep: () => ({ speed: 3, dx: 40, dy: 0, facing: 0 }),
  backpedal: () => ({ speed: 3, dx: 0, dy: -40, facing: 0 }),
};
const begin = performance.now(),
  cpu = process.cpuUsage();
for (const heightCm of [165, 180, 195])
  for (const surface of ['firm-grass-dev-v1', 'reduced-grip-dev-v1'])
    for (const [name, command] of Object.entries(controls)) {
      let p = initializeArticulatedPlayer(
        {
          ...seedPlayer,
          profile: {
            ...seedPlayer.profile,
            heightCm,
            weightKg: heightCm === 165 ? 60 : heightCm === 195 ? 92 : 75,
          },
          position: { x: 40, y: 30 },
          facingAngle: 0,
          velocity: { x: 0, y: 0 },
          lowerBodyPose: undefined,
        },
        surface,
      );
      const input = structuredClone(p),
        samples = [];
      let maximumAnchorDrift = 0,
        supportChanges = 0,
        maximumAcceleration = 0,
        totalWork = 0,
        blocker;
      for (let i = 0; i < 400; i++) {
        const c = command(i * 0.025),
          before = p;
        try {
          const result = stepArticulatedGaitPrototype(
            p,
            { x: p.position.x + c.dx, y: p.position.y + c.dy },
            c.speed,
            0.025,
            c.facing,
          );
          p = result.player;
          if (
            before.articulatedStance.support === p.articulatedStance.support &&
            p.articulatedStance.support
          ) {
            const f = p.articulatedStance.support;
            maximumAnchorDrift = Math.max(
              maximumAnchorDrift,
              Math.hypot(
                p.articulatedStance[f].x - before.articulatedStance[f].x,
                p.articulatedStance[f].y - before.articulatedStance[f].y,
              ),
            );
          } else supportChanges++;
          maximumAcceleration = Math.max(
            maximumAcceleration,
            Math.hypot(p.velocity.x - before.velocity.x, p.velocity.y - before.velocity.y) / 0.025,
          );
          totalWork += result.work;
          if (i % 8 === 0)
            samples.push({
              at: (i + 1) * 0.025,
              position: p.position,
              velocity: p.velocity,
              stance: p.articulatedStance,
              pelvis: result.geometry.pelvis,
              motor: result.motor,
            });
        } catch (error) {
          blocker = { at: (i + 1) * 0.025, reason: error.message, before, command: c };
          break;
        }
      }
      assert.equal(maximumAnchorDrift, 0);
      scenes.push({
        name,
        heightCm,
        surface,
        input,
        terminal: p,
        samples,
        maximumAnchorDrift,
        supportChanges,
        maximumAcceleration,
        totalWork,
        blocker: blocker ?? null,
      });
    }

const read = (name) =>
  JSON.parse(gunzipSync(readFileSync(`docs/performance/pr217/${name}.json.gz`)));
const native = [
  ['04-55', read('incident-before-handoff').initial],
  ['blocked-throw', read('checkpoint-original').initial],
  ['body-reference', initial],
  ...read('solver-blockers-v1').cases.map((c) => [c.name, c.initial]),
  ...read('solver-authority-and-entry-v1').cases.map((c) => [c.name, c.initial]),
  ['restart-reentry', read('solver-restart-return-v1').initial],
  [
    'full-v2-lateral-impact',
    JSON.parse(
      gunzipSync(readFileSync('docs/performance/pr218/full-stance-v2-attempt-1.json.gz')),
    ).failureWindow.find((s) => s.time > 1783.09),
  ],
];
native.push([
  'full-v2-action-support',
  JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr218/full-stance-v2-attempt-2.json.gz')),
  ).failureWindow.find((s) => s.time > 315.89),
]);
native.push([
  'full-v2-substitution-transport',
  JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr218/full-stance-v2-attempt-3.json.gz')),
  ).failureWindow.find((s) => s.time > 2674.02),
]);
const regressions = [];
native.push([
  'full-v2-joint-limited-miss',
  JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr218/full-stance-v2-attempt-5.json.gz')),
  ).failureWindow.find((s) => s.time > 4426.46),
]);
for (const [name, input] of native)
  for (const enabled of [false, true]) {
    const disabled = withoutArticulatedBody(input);
    let state = tacticalMatchStateSchema.parse(
      JSON.parse(JSON.stringify(enabled ? withArticulatedBody(structuredClone(input)) : disabled)),
    );
    let reload = tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(state)));
    let exception;
    const inputHash = hash(state),
      nativeInput = structuredClone(state),
      events = [],
      impacts = [],
      supportEvents = [];
    const durationTicks = name === 'blocked-throw' ? 1600 : 80;
    for (let i = 0; i < durationTicks; i++) {
      const previous = state;
      try {
        state = stepTacticalMatch(state, 0.025);
        reload = stepTacticalMatch(reload, 0.025);
      } catch (error) {
        exception = error.message;
        break;
      }
      assert.deepEqual(
        tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(state))),
        tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(reload))),
      );
      if (
        state.lastGroundContact?.at >= input.time &&
        state.lastGroundContact !== previous.lastGroundContact
      )
        events.push(state.lastGroundContact);
      for (const impact of state.playerBodyContacts ?? [])
        if (impact.at >= input.time && !impacts.some((v) => hash(v) === hash(impact)))
          impacts.push(impact);
      for (const player of state.players) {
        const before = previous.players.find((p) => p.id === player.id)?.articulatedStance;
        if (before && before.support !== player.articulatedStance?.support)
          supportEvents.push({
            at: state.time,
            id: player.id,
            from: before.support,
            to: player.articulatedStance?.support,
          });
      }
      if (state.safetyHalt) break;
    }
    regressions.push({
      name,
      enabled,
      inputHash,
      time: state.time,
      halt: state.safetyHalt ?? null,
      exception: exception ?? null,
      contacts: events,
      impacts,
      supportEvents,
      nativeInput,
      terminal: state,
      terminalHash: hash(state),
    });
  }
const poses = [];
for (const name of ['pair-reference', 'body-pass-third', 'pass-body-third', 'stationary-duel']) {
  const state = withArticulatedBody(createPr214Scene(name).initial);
  for (const p of state.players.slice(0, 3)) {
    const body = projectArticulatedBody(state, p);
    poses.push({ name, playerId: p.id, body: body ?? null, physical: deriveLowerBodyGeometry(p) });
  }
}
save('laboratory-v3', { source, scenes, regressions, poses });
writeFileSync(`${root}/source.json`, JSON.stringify(source, null, 2) + '\n');
const summary = {
  source: source.fingerprint,
  scenes: scenes.length,
  passed: scenes.filter((s) => !s.blocker).length,
  failed: scenes
    .filter((s) => s.blocker)
    .map((s) => ({
      name: s.name,
      heightCm: s.heightCm,
      surface: s.surface,
      at: s.blocker.at,
      reason: s.blocker.reason,
    })),
  regressions: regressions.map((r) => ({
    name: r.name,
    enabled: r.enabled,
    inputHash: r.inputHash,
    time: r.time,
    halt: r.halt,
    exception: r.exception,
    contacts: r.contacts.length,
    bodyContacts: r.impacts.length,
    supportTransitions: r.supportEvents.length,
    terminalHash: r.terminalHash,
  })),
  performance: {
    wallMs: performance.now() - begin,
    cpu: process.cpuUsage(cpu),
    maxRssKiB: process.resourceUsage().maxRSS,
  },
  fullMatch: 'NOT_RUN_PENDING_MANDATORY_GATES',
};
writeFileSync(`${root}/summary-v3.json`, JSON.stringify(summary, null, 2) + '\n');
assert.equal(summary.passed, 60, 'Every prescribed movement must remain anatomically reachable');
assert.equal(summary.failed.length, 0, 'No gait gate may be waived');
assert.ok(
  regressions.every((r) => !r.halt),
  'Both editions must pass every native continuation',
);
assert.ok(
  regressions.every((r) => !r.exception),
  'An explicit physical halt must not become a runtime exception',
);
assert.ok(
  regressions.filter((r) => !r.enabled).every((r) => !r.halt),
  'Maintained PR217 local continuations must remain live',
);
assert.ok(
  regressions.find((r) => r.enabled && r.name === '04-55').contacts.length > 0,
  'Selected edition must execute a real canonical ball contact',
);
assert.ok(
  regressions.some((r) => r.enabled && r.supportEvents.length > 0 && r.impacts.length > 0),
  'Selected support must share actual upright impacts',
);
execFileSync(
  'git',
  [
    'diff',
    '--exit-code',
    source.base,
    '--',
    'package.json',
    'package-lock.json',
    ...Array.from({ length: 23 }, (_, i) => `docs/performance/pr${195 + i}`),
  ],
  { stdio: 'inherit', windowsHide: true },
);
process.stdout.write(
  JSON.stringify(
    {
      scenes: summary.scenes,
      passed: summary.passed,
      failed: summary.failed,
      regressions: regressions.map((r) => ({
        name: r.name,
        enabled: r.enabled,
        time: r.time,
        halt: r.halt?.reason,
        exception: r.exception,
      })),
      performance: summary.performance,
    },
    null,
    2,
  ) + '\n',
);
