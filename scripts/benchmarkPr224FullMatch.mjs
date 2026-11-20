import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { gzipSync, gunzipSync } from 'node:zlib';
import { editions } from './benchmarkPr221Reception.mjs';
import { matchInput, matchSeeds } from './benchmarkPr222Reception.mjs';
import { selectPr224Body } from './pr224Scenarios.ts';
import { startSecondHalf, stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { withArticulatedBody } from '../src/core/matchSimulation/articulatedGait.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { captureReceptionStep } from '../src/core/matchSimulation/receptionTrace.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { seed: { type: 'string' }, input: { type: 'string' }, resume: { type: 'boolean' } },
});
const [arm, label, checkpoint] = positionals;
assert.ok(positionals.length <= 3);
assert.ok(arm === 'D' || arm === 'E', 'Select D or E');
assert.match(label, /^[a-z0-9-]+$/);
assert.ok(!values.resume || checkpoint, '--resume needs a checkpoint');
const replay = checkpoint && !values.resume;
const saved = checkpoint ? JSON.parse(gunzipSync(readFileSync(checkpoint))) : undefined;
const beforeHalt = saved?.before ?? saved?.remaining?.before;
if (saved) assert.ok(beforeHalt, 'The receipt has no pre-halt state');
const inputPath = values.input ?? saved?.inputPath;
assert.ok(!inputPath || !values.seed, '--input preserves the archived seed');
const archived = inputPath
  ? tacticalMatchStateSchema.parse(JSON.parse(gunzipSync(readFileSync(inputPath))).initial)
  : undefined;
if (archived) {
  assert.equal(archived.time, 0);
  assert.equal(archived.status, 'first_half');
  assert.equal(archived.scenario, 'kick_off');
}
const seed = archived?.seed ?? values.seed ?? beforeHalt?.seed ?? matchSeeds[0];
if (!archived) assert.ok(matchSeeds.includes(seed), `Unknown match seed: ${seed}`);
if (beforeHalt) assert.equal(beforeHalt.seed, seed);
const parent = join('.benchmark-artifacts', 'pr224-full');
const root = join(parent, label + '-' + arm);
mkdirSync(parent, { recursive: true });
mkdirSync(root); // Each run has a separate, immutable label.
const write = (name, value) => writeFileSync(join(root, name), gzipSync(JSON.stringify(value)));
const hash = (state) => createHash('sha256').update(JSON.stringify(state)).digest('hex');
const dt = 0.025;
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
  windowsHide: true,
}).trim();
const reload = (state) => tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(state)));
const input = reload({
  ...(archived ? withArticulatedBody(archived) : matchInput(seed)),
  playerAgencyEnabled: false,
  experimentalPostImpactStance: 'parked-stance-remainder-dev-v1',
  experimentalReceptionPreparation: editions.C,
});
assert.equal(input.players.length, 22);
const initial = reload(beforeHalt ?? (arm === 'E' ? selectPr224Body(input) : input));
assert.equal(Boolean(initial.experimentalComposedLegContact), arm === 'E');
assert.equal(initial.playerAgencyEnabled, false);
const source = {
  revision,
  engineDigest: hash(
    [
      'pendingStrikeInterval.ts',
      'composedLegCurvature.ts',
      'composedLegContact.ts',
      'ballContactResolution.ts',
    ].map((file) =>
      readFileSync(join('src', 'core', 'matchSimulation', file), 'utf8').replaceAll('\r\n', '\n'),
    ),
  ),
  arm,
  seed: initial.seed,
  inputHash: hash(input),
  initialHash: hash(initial),
  inputPath,
  checkpoint,
};
const began = performance.now();
const minutes = [],
  periods = [],
  limbs = [],
  goals = [];
const releases = new Set(),
  controlled = new Set(),
  impacts = new Set(),
  restarts = new Set();
let state = initial,
  before = state,
  ticks = 0,
  ownerChanges = 0;
let minute = Math.floor(state.time / 60),
  reason = 'tick_budget',
  exception;
const summary = () => ({
  ...source,
  ticks,
  at: state.time,
  status: state.status,
  score: state.score,
  ball: { x: state.ball.x, y: state.ball.y },
  decisionIndex: state.decisionIndex,
  passes: releases.size,
  controlled: controlled.size,
  bodyImpacts: impacts.size,
  limbContacts: limbs.length,
  ownershipChanges: ownerChanges,
  restarts: restarts.size,
  wallSeconds: (performance.now() - began) / 1000,
});
const progress = () => {
  const row = summary();
  minutes.push(row);
  process.stdout.write(JSON.stringify(row) + '\n');
  write('latest.json.gz', { ...row, before: state });
};
const observe = () => {
  if (state.ball.ownerId !== before.ball.ownerId) ownerChanges++;
  if (state.score.home !== before.score.home || state.score.away !== before.score.away)
    goals.push({ at: state.time, score: state.score });
  const pass = state.lastPassDiagnostic;
  if (pass?.releasedAt !== undefined && pass.releasedAt >= initial.time)
    releases.add(pass.releasedAt);
  const contact = state.lastGroundContact;
  if (contact?.executed && contact.retained && contact.at >= initial.time)
    controlled.add(contact.at);
  for (const c of state.playerBodyContacts ?? [])
    if (c.kind === 'impact' && c.at > before.time) impacts.add(c.at);
  for (const c of state.lastLimbContacts ?? [])
    if (c.at > before.time) limbs.push({ id: c.playerId, at: c.at, leg: c.leg?.region });
  if (state.restart?.awardId) restarts.add(state.restart.awardId);
};
try {
  for (; ticks < (replay ? 1 : 400000); ticks++) {
    if (state.safetyHalt) {
      reason = 'safety_halt';
      break;
    }
    if (state.status === 'half_time') {
      periods.push({ status: state.status, at: state.time, score: state.score });
      state = startSecondHalf(state);
    }
    if (state.status === 'full_time' || state.status === 'abandoned') {
      reason = state.status;
      break;
    }
    before = state;
    if (replay) {
      const result = captureReceptionStep(() => stepTacticalMatch(state, dt), { mechanics: true });
      write('trace.json.gz', result.events);
      state = result.state;
    } else state = stepTacticalMatch(state, dt);
    if (state.safetyHalt) {
      reason = 'safety_halt';
      break;
    }
    if (state === before) {
      reason = 'clock_stalled';
      break;
    }
    observe();
    if (Math.floor(state.time / 60) !== minute || state.status === 'half_time') {
      minute = Math.floor(state.time / 60);
      progress();
    }
  }
} catch (error) {
  exception = { message: error.message, stack: error.stack };
  reason = 'exception';
}
if (replay && reason === 'tick_budget') reason = 'tick_replayed';
const result = {
  ...summary(),
  reason,
  exception,
  halt: state.safetyHalt ?? null,
  periods,
  goals,
  minutes,
  limbs,
  terminalHash: hash(state),
};
write('result.json.gz', result);
if (reason !== 'full_time' && reason !== 'tick_replayed')
  write('halt.json.gz', { ...result, before, state });
process.stdout.write(JSON.stringify({ ...result, minutes: undefined, limbs: undefined }) + '\n');
if (reason !== 'full_time' && reason !== 'tick_replayed') process.exitCode = 1;
