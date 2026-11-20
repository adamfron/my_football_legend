import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import os from 'node:os';
import { matchInput } from './benchmarkPr222Reception.mjs';
import { editions } from './benchmarkPr221Reception.mjs';
import { selectPr224Body } from './pr224Scenarios.ts';
import { withArticulatedBody } from '../src/core/matchSimulation/articulatedGait.ts';
import {
  withFullBodySkeleton,
  projectFullBodySkeleton,
  fullBodySkeletonSchema,
} from '../src/core/matchSimulation/fullBodySkeleton.ts';
import { projectArticulatedBody } from '../src/core/matchSimulation/articulatedBody.ts';
import { stepTacticalMatch, startSecondHalf } from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { captureReceptionStep } from '../src/core/matchSimulation/receptionTrace.ts';
import { classifyContactEpisodes } from './pr225ContactEpisodes.mjs';

const [fixture, arm] = process.argv.slice(2);
assert.ok(['paired', 'native-a', 'independent'].includes(fixture));
assert.ok(['D', 'E'].includes(arm));
const sourcePath = `docs/performance/${fixture === 'paired' ? 'pr224-full-match-paired' : fixture === 'native-a' ? 'pr224-full-match-pr222-native-a' : 'pr224-full-match-independent'}.json`;
const receipt = JSON.parse(readFileSync(sourcePath)),
  expected = (receipt.comparison ?? receipt)[arm];
const native = (s) => tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s)));
const rawHash = (s) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const sporting = (s) => {
  const { experimentalFullBodySkeleton: _edition, ...rest } = s;
  void _edition;
  return rest;
};
const archived =
  fixture === 'independent'
    ? JSON.parse(gunzipSync(readFileSync('docs/performance/pr214/holistic-input-ci-v1.json.gz')))
        .initial
    : undefined;
const input = native({
  ...(archived
    ? withArticulatedBody(archived)
    : matchInput(fixture === 'native-a' ? 'pr222-native-a' : 'lab-mw3xhr6o')),
  playerAgencyEnabled: false,
  experimentalPostImpactStance: 'parked-stance-remainder-dev-v1',
  experimentalReceptionPreparation: editions.C,
});
const initial = native(arm === 'E' ? selectPr224Body(input) : input);
assert.equal(rawHash(initial), expected.initialHash, 'Archived kickoff identity changed');
const summaryPrecision = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, v) =>
      key === 'at' && typeof v === 'number' ? Number(v.toFixed(3)) : v,
    ),
  );
const validateAndSave = (result) => {
  assert.equal(
    result.sourceSha256,
    createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),
  );
  assert.equal(result.initialHash, expected.initialHash);
  assert.equal(
    result.terminalHash,
    expected.terminalHash,
    'Physical terminal hash differs from the archived match',
  );
  assert.equal(result.invalid, 0);
  const f = expected.final;
  assert.deepEqual(summaryPrecision(result.final), {
    at: f.at,
    status: f.status,
    score: f.score,
    ticks: f.ticks,
    decisions: f.decisions,
    passReleases: f.passReleases ?? f.releases,
    retainedBootContacts: f.retainedBootContacts,
    bodyImpactTimes: f.bodyImpactTimes,
    shinContacts: f.shinContacts ?? f.legContacts,
    ownerChanges: f.ownerChanges ?? f.changesOfOwner,
    restarts: f.restarts,
  });
  // PR224's human-readable receipts round clock fields to milliseconds.
  // Exact, unrounded physical terminal hashes above remain the strict gate.
  assert.deepEqual(summaryPrecision(result.goals), expected.goals);
  assert.deepEqual(summaryPrecision(result.periods), expected.periods);
  const { episodes, ...contactSummary } = result.contacts;
  const episodePath = `docs/performance/pr225-contact-episodes-${fixture}-${arm}.json.gz`;
  const episodeBytes = gzipSync(JSON.stringify(episodes));
  writeFileSync(episodePath, episodeBytes);
  const published = {
    ...result,
    contacts: {
      ...contactSummary,
      episodeArchive: {
        path: episodePath,
        sha256: createHash('sha256').update(episodeBytes).digest('hex'),
      },
    },
  };
  writeFileSync(
    `docs/performance/pr225-full-${fixture}-${arm}.json`,
    JSON.stringify(published, null, 2) + '\n',
  );
};
if (process.argv.includes('--validate-only')) {
  validateAndSave(
    JSON.parse(readFileSync(`.benchmark-artifacts/pr225-full/${fixture}-${arm}-result.json`)),
  );
  process.stdout.write(`Validated archived ${fixture}/${arm} terminal hash and report precision\n`);
  process.exit(0);
}
os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL);
let state = withFullBodySkeleton(initial),
  ticks = 0,
  minute = -1,
  ownerChanges = 0,
  invalid = 0,
  poses = 0,
  compositionMs = 0;
const releases = new Set(),
  controlled = new Set(),
  impacts = new Set(),
  restarts = new Set(),
  defenderWins = new Set();
const contacts = [],
  separations = [],
  jointResponses = [],
  goals = [],
  periods = [];
const began = performance.now();
mkdirSync('.benchmark-artifacts/pr225-full', { recursive: true });
const pointGap = (p, a, b) => {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
    v = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };
  const t = Math.max(
    0,
    Math.min(
      1,
      (v.x * d.x + v.y * d.y + v.z * d.z) / Math.max(1e-20, d.x * d.x + d.y * d.y + d.z * d.z),
    ),
  );
  return Math.hypot(v.x - d.x * t, v.y - d.y * t, v.z - d.z * t);
};
while (ticks < 400000 && !['full_time', 'abandoned'].includes(state.status)) {
  if (state.status === 'half_time') {
    periods.push({ status: state.status, at: state.time, score: state.score });
    state = startSecondHalf(state);
  }
  const before = state;
  const observed = captureReceptionStep(() => stepTacticalMatch(state, 0.025), { mechanics: true });
  state = observed.state;
  assert.ok(!state.safetyHalt, JSON.stringify(state.safetyHalt));
  assert.ok(state.time > before.time);
  ticks++;
  if (state.ball.ownerId !== before.ball.ownerId) ownerChanges++;
  if (state.score.home !== before.score.home || state.score.away !== before.score.away)
    goals.push({ at: state.time, score: state.score });
  if (state.lastPassDiagnostic?.releasedAt !== undefined)
    releases.add(state.lastPassDiagnostic.releasedAt);
  if (state.lastGroundContact?.executed && state.lastGroundContact.retained)
    controlled.add(state.lastGroundContact.at);
  for (const c of state.playerBodyContacts ?? [])
    if (c.kind === 'impact' && c.at > before.time) impacts.add(c.at);
  for (const c of state.lastLimbContacts ?? [])
    if (c.at > before.time)
      contacts.push({
        at: c.at,
        actorId: c.playerId,
        surface: `${c.leg.foot}_${c.leg.region}`,
        kind: 'limb',
        intended: false,
      });
  for (const event of observed.events) {
    if (event.source === 'pendingStrikeInterval.opposingShinContacts')
      jointResponses.push(event.at);
    if (
      event.source === 'pendingStrikeInterval.contactRace' &&
      ['strike', 'challenge', 'foot', 'passive_foot'].includes(event.detail.kind)
    )
      contacts.push({
        at: event.at,
        actorId: event.actorId,
        surface: `${event.detail.key.slice(event.actorId.length + 1)}_boot`,
        kind: 'boot',
        intended: ['strike', 'challenge', 'foot'].includes(event.detail.kind),
      });
  }
  if (
    state.lastBallContact?.kind === 'defender' &&
    !state.lastBallContact.leg &&
    state.lastBallContact.at > before.time &&
    !observed.events.some(
      (e) =>
        e.source === 'pendingStrikeInterval.contactRace' &&
        e.actorId === state.lastBallContact.playerId &&
        Math.abs(e.at - state.lastBallContact.at) < 1e-9,
    )
  )
    contacts.push({
      at: state.lastBallContact.at,
      actorId: state.lastBallContact.playerId,
      surface: 'torso',
      kind: 'torso',
      intended: false,
    });
  if (state.lastChallenge?.outcome === 'clean_win') defenderWins.add(state.lastChallenge.id);
  if (state.restart?.awardId) restarts.add(state.restart.awardId);
  // A conservative certificate: the ball is outside every lower-body capsule,
  // boot and the planar torso cylinder at this actual endpoint. The broad torso
  // bound deliberately undercounts independent encounters during aerial overlap.
  let clear = true;
  const ball = { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? 0.11 };
  const sample = ticks % 40 === 0;
  for (const p of state.players) {
    if (!sample && Math.hypot(p.position.x - ball.x, p.position.y - ball.y) > 2) continue;
    const body = projectArticulatedBody(state, p);
    if (!body) {
      if (sample) invalid++;
      clear = false;
      continue;
    }
    if (sample) {
      const at = performance.now();
      fullBodySkeletonSchema.parse(projectFullBodySkeleton(state, p, body));
      compositionMs += performance.now() - at;
      poses++;
    }
    if (Math.hypot(p.position.x - ball.x, p.position.y - ball.y) <= 0.45 + 1e-7) clear = false;
    for (const side of ['left', 'right'])
      if (pointGap(ball, body.geometry[side].foot, body.geometry[side].foot) <= 0.145 + 1e-7)
        clear = false;
    for (const c of body.geometry.capsules)
      if (pointGap(ball, c.from, c.to) <= c.radius + 0.11 + 1e-7) clear = false;
  }
  if (clear) separations.push(state.time);
  if (Math.floor(state.time / 60) !== minute) {
    minute = Math.floor(state.time / 60);
    const progress = {
      fixture,
      arm,
      ticks,
      at: state.time,
      score: state.score,
      passes: releases.size,
      shinEvents: contacts.filter((c) => c.kind === 'limb').length,
      wallSeconds: (performance.now() - began) / 1000,
    };
    process.stdout.write(JSON.stringify(progress) + '\n');
    writeFileSync(
      `.benchmark-artifacts/pr225-full/${fixture}-${arm}-progress.json`,
      JSON.stringify(progress),
    );
  }
}
const result = {
  fixture,
  arm,
  sourcePath,
  sourceSha256: createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),
  initialHash: rawHash(initial),
  terminalHash: rawHash(sporting(state)),
  expectedTerminalHash: expected.terminalHash,
  final: {
    at: state.time,
    status: state.status,
    score: state.score,
    ticks,
    decisions: state.decisionIndex,
    passReleases: releases.size,
    retainedBootContacts: controlled.size,
    bodyImpactTimes: impacts.size,
    shinContacts: contacts.filter((c) => c.kind === 'limb').length,
    ownerChanges,
    restarts: restarts.size,
  },
  goals,
  periods,
  poses,
  invalid,
  confirmedDefenderWins: defenderWins.size,
  contacts: classifyContactEpisodes(contacts, separations, jointResponses),
  cost: {
    wallSeconds: (performance.now() - began) / 1000,
    compositionAndValidationMs: compositionMs / poses,
    heapMiB: process.memoryUsage().heapUsed / 2 ** 20,
  },
};
writeFileSync(
  `.benchmark-artifacts/pr225-full/${fixture}-${arm}-result.json`,
  JSON.stringify(result, null, 2) + '\n',
);
validateAndSave(result);
process.stdout.write(
  JSON.stringify({ ...result, contacts: { ...result.contacts, episodes: undefined } }) + '\n',
);
