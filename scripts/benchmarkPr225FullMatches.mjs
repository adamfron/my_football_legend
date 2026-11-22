import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
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
import { GROUNDED_RECOVERY_BALANCE } from '../src/core/matchSimulation/dynamicBalanceState.ts';
import { stepTacticalMatch, startSecondHalf } from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { captureReceptionStep } from '../src/core/matchSimulation/receptionTrace.ts';
import { captureReplaySnapshot } from '../src/core/matchSimulation/matchReplay.ts';
import {
  PerformanceProfiler,
  withPerformanceProfiler,
} from '../src/core/matchSimulation/performanceProfiling.ts';
import { classifyContactEpisodes } from './pr225ContactEpisodes.mjs';

const [fixture, arm] = process.argv.slice(2);
const dynamic = process.argv.includes('--pr227');
const groundedRecovery = process.argv.includes('--grounded-recovery');
const research = dynamic || process.argv.includes('--pr226');
const untraced = process.argv.includes('--untraced');
const finalCandidate = process.argv.includes('--final-candidate');
const profile =
  dynamic && process.argv.includes('--profile')
    ? new PerformanceProfiler({ enabled: true })
    : undefined;
const duration = process.argv.find((arg) => arg.startsWith('--seconds='))?.split('=')[1];
const seconds = duration === undefined ? Infinity : Number(duration);
assert.ok(['paired', 'native-a', 'independent'].includes(fixture));
assert.ok((dynamic ? ['F', 'G'] : research ? ['D', 'E', 'F'] : ['D', 'E']).includes(arm));
assert.ok(duration === undefined || (research && Number.isFinite(seconds) && seconds > 0));
assert.ok(!untraced || (research && duration !== undefined));
assert.ok(!finalCandidate || (research && arm === 'F' && duration === undefined));
assert.ok(!groundedRecovery || (dynamic && arm === 'G'));
const folder = dynamic
  ? '.benchmark-artifacts/pr227'
  : research
    ? '.benchmark-artifacts/pr226'
    : '.benchmark-artifacts/pr225-full';
const basename = `${fixture}-${arm}${groundedRecovery ? '-grounded-recovery' : ''}${finalCandidate ? '-final' : ''}${duration ? '-' + duration + 's' : ''}${untraced ? '-untraced' : ''}${profile ? '-profiled' : ''}`;
const sourcePath = `docs/performance/${fixture === 'paired' ? 'pr224-full-match-paired' : fixture === 'native-a' ? 'pr224-full-match-pr222-native-a' : 'pr224-full-match-independent'}.json`;
const receipt = JSON.parse(readFileSync(sourcePath)),
  expected = (receipt.comparison ?? receipt)[arm === 'F' || arm === 'G' ? 'E' : arm];
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
const initial = native(arm === 'D' ? input : selectPr224Body(input));
assert.equal(rawHash(initial), expected.initialHash, 'Archived kickoff identity changed');
const summaryPrecision = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, v) =>
      key === 'at' && typeof v === 'number' ? Number(v.toFixed(3)) : v,
    ),
  );
const validateArchive = (result) => {
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
};
const validateAndSave = (result) => {
  validateArchive(result);
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
let state = withFullBodySkeleton(
    arm === 'F' || arm === 'G'
      ? {
          ...initial,
          experimentalComposedLegContact: 'composed-leg-impulse-dev-v2',
          ...(arm === 'G'
            ? {
                experimentalDynamicBalance: groundedRecovery
                  ? GROUNDED_RECOVERY_BALANCE
                  : 'dynamic-balance-dev-v1',
              }
            : {}),
        }
      : initial,
  ),
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
const researchTicks = [],
  work = [];
const sampledSupport = { peakFeet: 0, sampleCount: 0, steps: 0, slipping: 0, lost: 0 };
let peakHeapMiB = 0;
const search = { calls: 0, samples: 0, maxSamples: 0, milliseconds: 0, exhausted: 0 };
const cleanWinDetails = new Map();
let pendingWin = [];
const began = performance.now();
mkdirSync(folder, { recursive: true });
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
while (
  ticks < 400000 &&
  ticks < Math.round(seconds / 0.025) &&
  !state.safetyHalt &&
  !['full_time', 'abandoned'].includes(state.status)
) {
  if (state.status === 'half_time') {
    periods.push({ status: state.status, at: state.time, score: state.score });
    state = startSecondHalf(state);
  }
  const before = state;
  const tickBegan = research ? performance.now() : 0;
  const step = () => stepTacticalMatch(state, 0.025);
  if (profile) profile.beginTick(ticks);
  const runStep = profile ? () => withPerformanceProfiler(profile, step) : step;
  const observed = untraced
    ? { state: runStep(), events: [] }
    : captureReceptionStep(runStep, {
        mechanics: true,
        contactWork: research,
      });
  if (research) researchTicks.push(performance.now() - tickBegan);
  state = observed.state;
  if (research && state.safetyHalt) {
    // Preserve the input to a censored comparison so it can be replayed exactly.
    writeFileSync(`${folder}/${basename}-halt.json.gz`, gzipSync(JSON.stringify(before)));
    work.push(...observed.events);
    break;
  }
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
    if (event.source.endsWith('composedLegSearch')) {
      search.calls++;
      search.samples += event.detail.geometrySamples;
      search.maxSamples = Math.max(search.maxSamples, event.detail.geometrySamples);
      search.milliseconds += event.detail.milliseconds;
      search.exhausted += Number(event.detail.reason === 'budget');
    }
    if (research && event.source.endsWith('composedLimbWork'))
      work.push({ ...event, tick: ticks, exit: { owner: state.ball.ownerId, ball: state.ball } });
    if (
      event.source === 'pendingStrikeInterval.opposingShinContacts' ||
      event.source === 'pendingStrikeInterval.opposingLegContacts'
    )
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
  const win = state.lastChallenge;
  if (win?.outcome === 'clean_win') {
    defenderWins.add(win.id);
    if (research && !cleanWinDetails.has(win.id)) {
      const detail = {
        challenge: win,
        immediateOwner: state.ball.ownerId ?? null,
        ownershipChanges: [],
      };
      cleanWinDetails.set(win.id, detail);
      pendingWin.push(detail);
    }
  }
  if (research && pendingWin.length) {
    for (const detail of pendingWin) {
      if (state.ball.ownerId !== before.ball.ownerId)
        detail.ownershipChanges.push({ at: state.time, owner: state.ball.ownerId ?? null });
      if (state.time >= detail.challenge.at + 0.6) detail.owner600 = state.ball.ownerId ?? null;
    }
    pendingWin = pendingWin.filter((detail) => detail.owner600 === undefined);
  }
  if (state.restart?.awardId) restarts.add(state.restart.awardId);
  // A conservative certificate: the ball is outside every lower-body capsule,
  // boot and the planar torso cylinder at this actual endpoint. The broad torso
  // bound deliberately undercounts independent encounters during aerial overlap.
  let clear = true;
  const ball = { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? 0.11 };
  const sample = ticks % 40 === 0;
  if (research && sample)
    peakHeapMiB = Math.max(peakHeapMiB, process.memoryUsage().heapUsed / 2 ** 20);
  if (arm === 'G' && sample) {
    sampledSupport.sampleCount++;
    const balance = state.players.map((p) => p.articulatedStance?.dynamicBalance);
    sampledSupport.peakFeet = Math.max(
      sampledSupport.peakFeet,
      balance.filter((s) => s?.support).length,
    );
    sampledSupport.steps += balance.filter((s) => s?.phase === 'stepping').length;
    sampledSupport.slipping += balance.filter((s) => s?.support?.slip).length;
    sampledSupport.lost += balance.filter((s) => s?.phase === 'lost').length;
  }
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
    writeFileSync(`${folder}/${basename}-progress.json`, JSON.stringify(progress));
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
if (research) {
  const timings = researchTicks.toSorted((a, b) => a - b);
  const quantile = (p) => timings[Math.floor((timings.length - 1) * p)];
  Object.assign(result.cost, {
    traced: !untraced,
    meanTickMs: timings.reduce((sum, n) => sum + n, 0) / timings.length,
    p95TickMs: quantile(0.95),
    p99TickMs: quantile(0.99),
    peakSampledHeapMiB: peakHeapMiB,
    terminalNativeBytes: Buffer.byteLength(JSON.stringify(state)),
    replaySnapshotBytes: Buffer.byteLength(
      JSON.stringify(captureReplaySnapshot(state, 0, undefined, true)),
    ),
    composedLegSearch: untraced ? undefined : search,
  });
  result.safetyHalt = state.safetyHalt ?? null;
  result.workEvents = work.length;
  result.cleanWins = [...cleanWinDetails.values()];
  if (arm === 'G') result.sampledSupport = sampledSupport;
  if (profile) result.profile = profile.snapshot();
  if (!dynamic && arm !== 'F' && seconds === Infinity) validateArchive(result);
  writeFileSync(`${folder}/${basename}-work.json.gz`, gzipSync(JSON.stringify(work)));
}
writeFileSync(`${folder}/${basename}-result.json`, JSON.stringify(result, null, 2) + '\n');
if (!research) validateAndSave(result);
process.stdout.write(
  JSON.stringify({ ...result, contacts: { ...result.contacts, episodes: undefined } }) + '\n',
);
