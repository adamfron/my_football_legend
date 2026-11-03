import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { checkPr216Source, ROOT } from './pr216Evidence.mjs';
import { hash, write } from './pr199Evidence.mjs';
import {
  stepTacticalMatchAfterDecisionProbe,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { effectiveHolisticRecipe, observeHolisticActivation } from './holisticDevelopment.ts';
const source = checkPr216Source();
const frozen = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr214/holistic-input-ci-v1.json.gz')),
);
const version =
  process.argv.find((x) => x.startsWith('--version='))?.split('=')[1] ?? 'p1-final-v1';
assert.match(version, /^[a-z0-9-]+$/);
const smoke = process.argv.includes('--smoke');
const reload = (s) => tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s)));
for (const arm of smoke ? ['initial'] : ['initial', 'baseline']) {
  const begin = performance.now(),
    cpu = process.cpuUsage();
  const original = reload(frozen[arm]);
  assert.equal(hash(original), frozen[arm === 'initial' ? 'initialHash' : 'baselineHash']);
  // This optional, read-only observer is the sole addition to the frozen input.
  let s = reload(arm === 'initial' ? { ...original, executionWitnesses: {} } : original);
  const initial = reload(s),
    checkpoints = [],
    events = [],
    window = [],
    minutes = [];
  if (arm === 'initial') assert.deepEqual(effectiveHolisticRecipe(s), frozen.recipe);
  let reason = 'tick_cap',
    previousMinute = s,
    ballTransport = 0,
    lastProgress = s.time,
    progressBall = { x: s.ball.x, y: s.ball.y },
    unchanged = 0;
  const identities = new Set();
  const checkpoint = () => {
    let a = s,
      b = reload(s);
    for (let i = 0; i < 8; i++) {
      a = stepTacticalMatchAfterDecisionProbe(a, 0.025);
      b = stepTacticalMatchAfterDecisionProbe(b, 0.025);
      assert.deepEqual(reload(a), reload(b), 'native saved continuation');
    }
    checkpoints.push({
      state: reload(s),
      hash: hash(s),
      activation: observeHolisticActivation(initial, s),
    });
  };
  checkpoint();
  for (let tick = 0; tick < (smoke ? 24000 : 288000); tick++) {
    if (s.status === 'half_time') {
      checkpoint();
      s = startSecondHalf(s);
      events.push({ kind: 'half_time', at: s.time });
    }
    if (s.status === 'full_time' || s.status === 'abandoned') {
      reason = s.status;
      break;
    }
    const prior = s;
    s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
    if (s === prior) unchanged++;
    else unchanged = 0;
    ballTransport += Math.hypot(s.ball.x - prior.ball.x, s.ball.y - prior.ball.y);
    if (
      s.decisionIndex !== prior.decisionIndex ||
      s.lastGroundContact?.at !== prior.lastGroundContact?.at ||
      Math.hypot(s.ball.x - progressBall.x, s.ball.y - progressBall.y) > 0.5
    ) {
      lastProgress = s.time;
      progressBall = { x: s.ball.x, y: s.ball.y };
    }
    for (const [kind, event] of [
      ['foot', s.lastGroundContact],
      ['challenge', s.lastChallenge],
      ['strike', s.lastStrikeResolution],
      ['law', s.restart],
      ['shot', s.lastShot],
      [
        'body',
        s.multiBodyResolutions?.find(
          (c) => c.unresolved || c.impulses.some((i) => i.kind === 'impact'),
        ),
      ],
    ]) {
      if (!event) continue;
      const key = `${kind}:${event.id ?? event.at ?? event.shotId ?? JSON.stringify(event)}`;
      if (!identities.has(key)) {
        identities.add(key);
        events.push({ kind, event });
      }
    }
    window.push({
      at: s.time,
      ball: s.ball,
      players: s.players.map((p) => ({
        id: p.id,
        position: p.position,
        velocity: p.velocity,
        pose: p.lowerBodyPose,
      })),
      contacts: s.multiBodyResolutions,
      scenario: s.scenario,
      restart: s.restart?.phase,
    });
    if (window.length > 80) window.shift();
    if ((tick + 1) % 2400 === 0) {
      reload(s);
      checkpoint();
      minutes.push({
        from: previousMinute.time,
        to: s.time,
        decisions: s.decisionIndex - previousMinute.decisionIndex,
        ballTransport,
        contacts:
          (s.executionWitnesses?.['controlled-reception']?.executed ?? 0) -
          (previousMinute.executionWitnesses?.['controlled-reception']?.executed ?? 0),
        witnesses: s.executionWitnesses,
      });
      previousMinute = s;
      ballTransport = 0;
      console.log('PR216 match', arm, Math.round(s.time), s.status, s.decisionIndex);
    }
    if (s.executionWitnesses?.unresolved) {
      reason = `unresolved:${s.executionWitnesses.unresolved.source}`;
      break;
    }
    if (unchanged > 160) {
      reason = 'unchanged_state';
      break;
    }
    if (s.pendingPlayerDecision || s.shotAgencyRequest) {
      reason = 'unexpected_human_decision';
      break;
    }
    if (s.time - lastProgress > 120) {
      reason = 'action_starvation';
      break;
    }
    if (smoke && tick === 23999) reason = 'smoke_complete';
  }
  checkpoint();
  const summary = {
    source: source.fingerprint,
    arm,
    frozenInputHash: hash(original),
    observedInputHash: hash(initial),
    observerOnlyAddition: arm === 'initial',
    seconds: s.time,
    status: s.status,
    reason,
    decisions: s.decisionIndex - initial.decisionIndex,
    witnesses: s.executionWitnesses,
    minutes: minutes.map((m) => ({ ...m, witnesses: undefined })),
    wallSeconds: (performance.now() - begin) / 1000,
    cpu: process.cpuUsage(cpu),
    peakRSSKiB: process.resourceUsage().maxRSS,
    fullMatch: s.status === 'full_time',
    promotion: 'RETAIN_EXPERIMENTAL',
  };
  write(`${ROOT}/match-${smoke ? 'smoke' : 'attempt'}-${arm}-${version}.json.gz`, {
    source: source.fingerprint,
    initial,
    terminal: reload(s),
    checkpoints,
    events,
    window,
    summary,
  });
  write(`${ROOT}/match-${smoke ? 'smoke' : 'attempt'}-${arm}-${version}-summary.json`, summary);
  console.log(JSON.stringify(summary));
  if (smoke) assert.equal(reason, 'smoke_complete');
}
