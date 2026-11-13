/* global structuredClone */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { checkPr218Source, ROOT } from './pr218Evidence.mjs';
import { hash, write } from './pr199Evidence.mjs';
import { withArticulatedBody } from '../src/core/matchSimulation/articulatedGait.ts';
import { projectArticulatedBody } from '../src/core/matchSimulation/articulatedBody.ts';
import { stepTacticalMatch, startSecondHalf } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  projectPlayerAgency,
  applyPlayerDecision,
} from '../src/core/matchSimulation/playerDecision.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import {
  projectMatchVisiblePlayers,
  substitutionEntryBodies,
} from '../src/core/matchSimulation/substitutions.ts';

const source = checkPr218Source({ current: true });
const options = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const full = options.has('full');
const version = options.get('version') ?? 'v1';
assert.match(version, /^[a-z0-9-]+$/);
const read = (path) =>
  JSON.parse(
    path.endsWith('.gz') ? gunzipSync(fs.readFileSync(path)) : fs.readFileSync(path, 'utf8'),
  );
const gates = read(`${ROOT}/summary-v3.json`);
assert.equal(gates.source, source.fingerprint);
assert.equal(gates.passed, 60);
assert.equal(gates.failed.length, 0);
assert.equal(gates.regressions.length, 26);
assert.ok(gates.regressions.every((r) => !r.halt && !r.exception));
const browser = read(`${ROOT}/browser-stance-v2/report.json`);
assert.equal(browser.source, source.fingerprint);
assert.equal(browser.viewports.length, 2);
assert.ok(browser.viewports.every((v) => v.errors.length === 0));
const audit = read(`${ROOT}/landmark-audit-stance-v2.json`);
assert.equal(audit.source, source.fingerprint);
assert.equal(audit.rows.length, 9);
assert.ok(audit.rows.every((r) => r.canonical.every((p) => p.error < 1e-10)));
const digest = (path) => createHash('sha256').update(fs.readFileSync(path)).digest('hex');
if (options.has('check')) {
  const index = read(`${ROOT}/stance-v2-gates.json`);
  assert.equal(index.source, source.fingerprint);
  for (const item of Object.values(index.artifacts)) assert.equal(digest(item.path), item.sha256);
  for (const kind of ['smoke', 'full']) {
    const run = read(index.artifacts[kind].path);
    assert.equal(run.source, source.fingerprint);
    assert.equal(run.edition, 'stance-foot-dev-v2');
    assert.equal(run.reason, kind === 'smoke' ? 'duration' : 'full_time');
    assert.equal(run.metrics.invalidPoses, 0);
    assert.equal(run.metrics.maximumSupportDrift, 0);
    assert.ok(run.metrics.maximumComposedSupportDrift < 1e-10);
    assert.ok(run.metrics.contacts > 0 && run.metrics.supportTransitions > 0);
    assert.equal(run.terminal.safetyHalt, undefined);
    tacticalMatchStateSchema.parse(run.terminal);
    if (kind === 'smoke') assert.ok(run.terminal.time - run.initial.time >= 120 - 1e-7);
    else assert.equal(run.terminal.status, 'full_time');
  }
  process.stdout.write(
    'PR218: all six physical gates and complete-match receipts are source-bound and valid\n',
  );
  process.exit(0);
}
const smokeVersion = options.get('smoke-version') ?? version;
assert.match(smokeVersion, /^[a-z0-9-]+$/);
if (full) {
  const smoke = read(`${ROOT}/smoke-stance-v2-${smokeVersion}.json.gz`);
  assert.equal(smoke.source, source.fingerprint);
  assert.equal(smoke.reason, 'duration');
  assert.ok(smoke.terminal.time - smoke.initial.time >= 120 - 1e-7);
  assert.equal(smoke.metrics.maximumSupportDrift, 0);
  assert.ok(smoke.metrics.maximumComposedSupportDrift < 1e-10);
  assert.equal(smoke.metrics.invalidPoses, 0);
  assert.ok(smoke.metrics.contacts > 0 && smoke.metrics.supportTransitions > 0);
}
const fixture = read('docs/performance/pr217/session-input.json.gz');
const reload = (s) => tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s)));
let state = reload(withArticulatedBody(structuredClone(fixture.initial)));
assert.equal(state.players.length, 22);
assert.equal(state.experimentalArticulatedBody, 'stance-foot-dev-v2');
const initial = reload(state);
const limit = full ? 10000 : 120;
const name = full ? 'full' : 'smoke';
const rawPath = `${ROOT}/${name}-stance-v2-${version}.json.gz`;
assert.equal(fs.existsSync(rawPath), false, 'Keep each attempted trajectory immutable');
const began = performance.now(),
  cpu = process.cpuUsage();
let reason = 'duration',
  exception,
  ticks = 0,
  lastProgress = state.time,
  progressBall = state.ball;
const history = [],
  checkpoints = [],
  decisions = [],
  periods = [],
  restarts = [],
  minutes = [],
  contactExamples = [];
const strikes = new Map(),
  passes = new Map(),
  impactIds = new Set();
const metrics = {
  contacts: 0,
  bodyImpacts: 0,
  bodyUnresolved: 0,
  supportTransitions: 0,
  supportSamples: 0,
  maximumSupportDrift: 0,
  maximumComposedSupportDrift: 0,
  maximumBaseSwingSpeed: 0,
  invalidPoses: 0,
  jointLimitedFootFrames: 0,
  maximumSpeed: 0,
};
let lastMinute = state.time;
const physicalBodies = (s) => [
  ...new Map(
    [...projectMatchVisiblePlayers(s), ...substitutionEntryBodies(s)].map((p) => [p.id, p]),
  ).values(),
];
let previousBodies = new Map(
  physicalBodies(state).map((p) => [p.id, projectArticulatedBody(state, p)]),
);
const snapshot = (label) => {
  let a = state,
    b = reload(state);
  for (let i = 0; i < 8; i++) {
    a = stepTacticalMatch(a, 0.025);
    b = stepTacticalMatch(b, 0.025);
    assert.deepEqual(reload(a), reload(b), `${label}: native eight-tick reload identity`);
  }
  checkpoints.push({ at: state.time, label, hash: hash(reload(state)) });
};
snapshot('initial');
try {
  for (; ticks < 400000 && state.time < initial.time + limit - 1e-8; ticks++) {
    if (state.safetyHalt) {
      reason = `halt:${state.safetyHalt.reason}`;
      break;
    }
    if (state.status === 'half_time') {
      periods.push({ status: state.status, at: state.time });
      snapshot('half-time');
      state = startSecondHalf(state);
      // Halftime handovers can contain legal off-clock physical transport. This
      // is a new observed interval, not a 25ms planted-foot displacement.
      previousBodies = new Map(
        physicalBodies(state).map((p) => [p.id, projectArticulatedBody(state, p)]),
      );
    }
    if (['full_time', 'abandoned'].includes(state.status)) {
      reason = state.status;
      break;
    }
    const agency = projectPlayerAgency(state);
    if (agency.opportunity) {
      // The unchanged PR217 test-menu driver, explicitly logged; the engine still
      // owns physical execution and can miss, lose possession or reject a strike.
      const option =
        agency.opportunity.options.find((o) => o.kind === 'action' && o.action.type === 'pass') ??
        agency.opportunity.options[0];
      decisions.push({ at: state.time, opportunity: agency.opportunity.kind, option });
      state = applyPlayerDecision(state, agency.opportunity, option.id);
    }
    const previous = state;
    history.push(state);
    if (history.length > 80) history.shift();
    state = stepTacticalMatch(state, 0.025);
    if (state === previous) {
      reason = 'unchanged';
      break;
    }
    if (
      state.decisionIndex !== previous.decisionIndex ||
      Math.hypot(state.ball.x - progressBall.x, state.ball.y - progressBall.y) > 0.5
    ) {
      lastProgress = state.time;
      progressBall = state.ball;
    }
    if (state.time - lastProgress > 120) {
      reason = 'action_starvation';
      break;
    }
    const nextBodies = new Map();
    const previousPhysical = new Map(physicalBodies(previous).map((p) => [p.id, p]));
    for (const p of physicalBodies(state)) {
      const old = previousPhysical.get(p.id);
      const a = old?.articulatedStance,
        b = p.articulatedStance;
      const body = projectArticulatedBody(state, p);
      nextBodies.set(p.id, body);
      if (body?.jointLimits)
        metrics.jointLimitedFootFrames +=
          Number(body.jointLimits.left) + Number(body.jointLimits.right);
      if (!body) {
        metrics.invalidPoses++;
        reason = `invalid_composed_body:${p.id}`;
      }
      if (a && b) {
        if (a.support !== b.support) metrics.supportTransitions++;
        else if (b.support) {
          metrics.supportSamples++;
          const f = b.support;
          const drift = Math.hypot(b[f].x - a[f].x, b[f].y - a[f].y, b[f].z - a[f].z);
          metrics.maximumSupportDrift = Math.max(metrics.maximumSupportDrift, drift);
          if (drift > 1e-10) reason = `support_drift:${p.id}`;
          const priorBody = previousBodies.get(p.id);
          if (body && priorBody) {
            const x = body.geometry[f].foot,
              y = priorBody.geometry[f].foot;
            const actual = Math.hypot(x.x - y.x, x.y - y.y, x.z - y.z);
            metrics.maximumComposedSupportDrift = Math.max(
              metrics.maximumComposedSupportDrift,
              actual,
            );
            if (actual > 1e-10) reason = `composed_support_drift:${p.id}`;
          }
        }
        for (const f of ['left', 'right'])
          metrics.maximumBaseSwingSpeed = Math.max(
            metrics.maximumBaseSwingSpeed,
            Math.hypot(b[f].x - a[f].x, b[f].y - a[f].y, b[f].z - a[f].z) / 0.025,
          );
      }
      metrics.maximumSpeed = Math.max(metrics.maximumSpeed, Math.hypot(p.velocity.x, p.velocity.y));
    }
    previousBodies = nextBodies;
    for (const c of state.playerBodyContacts ?? []) {
      const key = `${c.at}:${c.kind}:${c.participants.join(':')}`;
      if (c.at < initial.time || impactIds.has(key)) continue;
      impactIds.add(key);
      if (c.kind === 'impact') metrics.bodyImpacts++;
      if (c.kind === 'unresolved') metrics.bodyUnresolved++;
    }
    if (
      state.lastGroundContact &&
      state.lastGroundContact !== previous.lastGroundContact &&
      state.lastGroundContact.at >= initial.time
    ) {
      metrics.contacts++;
      if (contactExamples.length < 16) contactExamples.push(state.lastGroundContact);
    }
    if (state.pendingStrike && !strikes.has(state.pendingStrike.id)) {
      strikes.set(state.pendingStrike.id, {
        id: state.pendingStrike.id,
        actorId: state.pendingStrike.actorId,
        selectedAt: state.pendingStrike.selectedAt,
        outcome: 'unresolved',
      });
      if (checkpoints.filter((c) => c.label === 'pending-contact').length < 3)
        snapshot('pending-contact');
    }
    if (state.lastStrikeResolution?.at >= initial.time)
      strikes.set(state.lastStrikeResolution.id, state.lastStrikeResolution);
    for (const p of [state.lastPassDiagnostic, state.lastResolvedPass].filter(Boolean))
      passes.set(p.passId, p);
    const restart = state.restart;
    const stage = restart
      ? `${restart.awardId}:${restart.retrieval?.stage ?? 'not_started'}:${restart.phase}`
      : 'open_play';
    if (restarts.at(-1)?.stage !== stage)
      restarts.push({ at: state.time, stage, takerId: restart?.takerId });
    if (Math.floor(state.time / 60) !== Math.floor(lastMinute / 60)) {
      snapshot('minute');
      minutes.push({
        at: state.time,
        status: state.status,
        score: state.score,
        metrics: { ...metrics },
        statistics: state.statistics,
      });
      lastMinute = state.time;
      process.stdout.write(
        JSON.stringify({ name, version, at: state.time, status: state.status, metrics }) + '\n',
      );
    }
    if (reason !== 'duration') break;
  }
} catch (error) {
  exception = { name: error.name, message: error.message, stack: error.stack };
  reason = 'exception';
}
if (ticks >= 400000) reason = 'tick_budget';
if (['full_time', 'abandoned'].includes(state.status)) reason = state.status;
if (state.safetyHalt) reason = `halt:${state.safetyHalt.reason}`;
snapshot('terminal');
const strikeResults = [...strikes.values()];
const result = {
  source: source.fingerprint,
  edition: state.experimentalArticulatedBody,
  name,
  version,
  initial,
  terminal: reload(state),
  initialHash: hash(initial),
  terminalHash: hash(reload(state)),
  reason,
  exception,
  ticks,
  metrics,
  physicalActions: {
    attempts: strikeResults.length,
    outcomes: strikeResults.reduce((a, s) => ((a[s.outcome] = (a[s.outcome] ?? 0) + 1), a), {}),
    standingChallenges:
      (state.executionWitnesses?.['standing-challenge']?.executed ?? 0) -
      (initial.executionWitnesses?.['standing-challenge']?.executed ?? 0),
    receptions: [...passes.values()].reduce(
      (a, p) => ((a[p.finalResult ?? 'pending'] = (a[p.finalResult ?? 'pending'] ?? 0) + 1), a),
      {},
    ),
  },
  strikes: strikeResults,
  passes: [...passes.values()],
  contactExamples,
  decisions,
  periods,
  restarts,
  minutes,
  checkpoints,
  wallSeconds: (performance.now() - began) / 1000,
  cpu: process.cpuUsage(cpu),
  maxRSSKiB: process.resourceUsage().maxRSS,
  ...(reason !== 'duration' && reason !== 'full_time' ? { failureWindow: history } : {}),
};
write(rawPath, result);
const summary = {
  ...result,
  initial: undefined,
  terminal: undefined,
  failureWindow: undefined,
  strikes: undefined,
  passes: undefined,
  contactExamples: undefined,
  decisions: decisions.length,
  checkpoints: checkpoints.length,
  minutes: undefined,
};
write(`${ROOT}/${name}-stance-v2-summary-${version}.json`, summary);
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
assert.equal(
  reason,
  full ? 'full_time' : 'duration',
  'Every failed complete trajectory remains a failed receipt',
);
assert.equal(metrics.invalidPoses, 0);
assert.equal(metrics.maximumSupportDrift, 0);
assert.ok(metrics.maximumComposedSupportDrift < 1e-10);
assert.ok(metrics.contacts > 0 && metrics.supportTransitions > 0);
assert.ok(state.time - initial.time >= limit - 1e-7 || (full && state.status === 'full_time'));
if (full) {
  const indexPath = `${ROOT}/stance-v2-gates.json`;
  if (fs.existsSync(indexPath)) {
    const old = read(indexPath),
      archive = `${ROOT}/stance-v2-gates-${old.source}.json`;
    if (!fs.existsSync(archive)) write(archive, old);
  }
  const paths = {
    smoke: `${ROOT}/smoke-stance-v2-${smokeVersion}.json.gz`,
    full: rawPath,
    laboratory: `${ROOT}/summary-v3.json`,
    browser: `${ROOT}/browser-stance-v2/report.json`,
    landmarks: `${ROOT}/landmark-audit-stance-v2.json`,
  };
  fs.writeFileSync(
    indexPath,
    JSON.stringify(
      {
        schema: 'pr218-stance-v2-gates-v1',
        source: source.fingerprint,
        edition: 'stance-foot-dev-v2',
        gates: [1, 2, 3, 4, 5, 6],
        completeMatch: 'full_time',
        artifacts: Object.fromEntries(
          Object.entries(paths).map(([key, path]) => [key, { path, sha256: digest(path) }]),
        ),
      },
      null,
      2,
    ) + '\n',
  );
}
