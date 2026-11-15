import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';
import { createTrial, editions, scenes } from './benchmarkPr221Reception.mjs';
import { matchInput, matchSeeds } from './benchmarkPr222Reception.mjs';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { selectPr224Body, createPr224LimbScene, createPr224PassScene } from './pr224Scenarios.ts';
import { projectArticulatedBody } from '../src/core/matchSimulation/articulatedBody.ts';
import { captureReplaySnapshot } from '../src/core/matchSimulation/matchReplay.ts';

const dt = 0.025;
const roundTrip = (state) => tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(state)));
const digest = (data) =>
  createHash('sha256')
    .update(
      JSON.stringify(data, (_key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((key) => [key, value[key]]),
            )
          : value,
      ),
    )
    .digest('hex');

const path = 'docs/performance/pr224-body.json';
const check = process.argv.includes('--check');
const extended = process.argv.includes('--extended');

const run = (input, ticks, compareReload) => {
  let state = roundTrip(input),
    reloaded = compareReload ? roundTrip(state) : undefined;
  const leg = [],
    body = new Set(),
    feet = new Set(),
    releases = new Set(),
    plans = new Set(),
    controlled = new Set(),
    restarts = new Set(),
    keepers = new Set();
  const impactByPlayer = new Map();
  const postImpactPlants = [];
  let ownership = 0,
    invalid = 0,
    transfer = 0,
    elapsed = 0,
    completed = 0;
  let lastOwner = state.ball.ownerId;
  const peak = { heap: process.memoryUsage().heapUsed, boneError: 0, rootStep: 0, bootStep: 0 };
  const clock = performance.now();
  for (let i = 0; i < ticks; i++) {
    const previous = state;
    const began = performance.now();
    state = stepTacticalMatch(state, dt);
    elapsed += performance.now() - began;
    if (reloaded) {
      reloaded = stepTacticalMatch(reloaded, dt);
      assert.equal(digest(roundTrip(state)), digest(roundTrip(reloaded)), `native tick ${i}`);
      if (i % 8 === 0) reloaded = roundTrip(reloaded);
    }
    if (state.safetyHalt) break;
    completed++;
    const contact = state.lastBallContact;
    const newLegContacts = state.lastLimbContacts?.filter((c) => c.at > previous.time);
    if (newLegContacts?.length) {
      const replay = captureReplaySnapshot(state, 0, previous);
      assert.deepEqual(replay.limbContacts, newLegContacts);
      leg.push(...newLegContacts);
    }
    if (contact?.kind === 'goalkeeper') keepers.add(contact.at);
    for (const c of state.playerBodyContacts ?? []) {
      if (c.kind !== 'impact' || body.has(c.at)) continue;
      body.add(c.at);
      for (const id of c.participants) impactByPlayer.set(id, c.at);
    }
    if (state.lastGroundContact?.executed) {
      feet.add(state.lastGroundContact.at);
      if (state.lastGroundContact.retained) controlled.add(state.lastGroundContact.at);
    }
    if (state.lastPassDiagnostic?.releasedAt !== undefined)
      releases.add(state.lastPassDiagnostic.releasedAt);
    if (state.pendingStrike?.id) plans.add(state.pendingStrike.id);
    if (state.restart?.awardId) restarts.add(state.restart.awardId);
    if (state.ball.ownerId !== lastOwner) ownership++;
    lastOwner = state.ball.ownerId;
    for (const player of state.players) {
      const old = previous.players.find((p) => p.id === player.id);
      const pose = projectArticulatedBody(state, player);
      if (!pose) {
        invalid++;
        continue;
      }
      if (!old) continue;
      peak.rootStep = Math.max(
        peak.rootStep,
        Math.hypot(player.position.x - old.position.x, player.position.y - old.position.y),
      );
      const before = projectArticulatedBody(previous, old);
      if (!before) continue;
      if (pose.support && pose.support !== before.support) {
        transfer++;
        const contact = impactByPlayer.get(player.id);
        if (contact !== undefined && contact <= previous.time) {
          postImpactPlants.push({
            actorId: player.id,
            impactAt: contact,
            plantedAt: state.time,
            foot: pose.support,
            point: pose.geometry[pose.support].foot,
          });
          impactByPlayer.delete(player.id);
        }
      }
      for (const side of ['left', 'right']) {
        const limb = pose.geometry[side];
        for (const [a, b, length] of [
          [limb.hip, limb.knee, limb.thighLength],
          [limb.knee, limb.ankle, limb.shinLength],
        ]) {
          peak.boneError = Math.max(
            peak.boneError,
            Math.abs(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - length),
          );
        }
        const boot = before.geometry[side].foot;
        peak.bootStep = Math.max(
          peak.bootStep,
          Math.hypot(limb.foot.x - boot.x, limb.foot.y - boot.y, limb.foot.z - boot.z),
        );
      }
    }
    if (i % 40 === 0) peak.heap = Math.max(peak.heap, process.memoryUsage().heapUsed);
  }
  const sport = {
    completed,
    decisionIndex: state.decisionIndex,
    plans: plans.size,
    releases: releases.size,
    feet: feet.size,
    controlled: controlled.size,
    body: body.size,
    ownership,
    restarts: restarts.size,
    keepers: keepers.size,
    invalid,
    transfer,
    postImpactPlants,
    leg,
    halt: state.safetyHalt ?? null,
    hash: digest(state),
    lastStrike: state.lastStrikeResolution?.outcome ?? null,
    boneError: peak.boneError,
    rootStep: peak.rootStep,
    bootStep: peak.bootStep,
  };
  return {
    sport,
    cost: { motorMs: elapsed, runnerMs: performance.now() - clock, heapMiB: peak.heap / 2 ** 20 },
  };
};

const rows = {};
const pair = (name, input, ticks, compareReload) => {
  const D = run(input, ticks, compareReload);
  const E = run(selectPr224Body(input), ticks, compareReload);
  rows[name] = { D: D.sport, E: E.sport };
  process.stdout.write(JSON.stringify({ name, D, E }) + '\n');
};
const baseline = (state) => ({
  ...state,
  experimentalPostImpactStance: 'parked-stance-remainder-dev-v1',
  experimentalReceptionPreparation: editions.C,
});
for (const foot of ['left', 'right']) {
  pair(`shin-${foot}`, createPr224LimbScene(foot), 16, true);
  pair(`recovering-${foot}`, createPr224LimbScene(foot, 'recovering'), 16, true);
}
pair('limb-miss', createPr224LimbScene('right', 'miss'), 4, true);
for (const scene of ['ordinary', 'weak-foot', 'miss', 'advance', 'turn'])
  pair(`pass-${scene}`, createPr224PassScene(scene).selected, 32, true);
const pressure = scenes.find(({ id }) => id === 'pressure');
pair('pr223-pressure', baseline(createTrial(pressure, 'pr219-a', 60).input), 64, true);
const lateralImpact = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr218/full-stance-v2-attempt-1.json.gz')),
).failureWindow.find((state) => state.time > 1783.09);
pair(
  'pr218-lateral-impact',
  {
    ...lateralImpact,
    experimentalPostImpactStance: 'parked-stance-remainder-dev-v1',
  },
  40,
  true,
);
for (const seed of matchSeeds)
  pair(seed, baseline(matchInput(seed)), extended ? 4800 : 1200, false);

const evidence = { version: 'composed-leg-contact-dev-v1', dt, rows };
if (check) assert.deepEqual(evidence, JSON.parse(readFileSync(path, 'utf8')));
if (process.argv.includes('--record'))
  writeFileSync(path, JSON.stringify(evidence, null, 2) + '\n');
