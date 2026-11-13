import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { gunzipSync, gzipSync } from 'node:zlib';
import { observedFlight } from '../src/core/matchSimulation/liveBallFlight.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { withRankingObserver } from '../src/core/matchSimulation/decisionObservation.ts';
import { releaseContactReadiness } from '../src/core/matchSimulation/decisionReadiness.ts';
import { stepTacticalMatch, startSecondHalf } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  applyPlayerDecision,
  projectPlayerAgency,
} from '../src/core/matchSimulation/playerDecision.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { canonicalStrikeFoot } from '../src/core/matchSimulation/pendingStrike.ts';
import { projectArticulatedBody } from '../src/core/matchSimulation/articulatedBody.ts';
import {
  temporalFootPath,
  ZERO_TEMPORAL_ERROR,
} from '../src/core/matchSimulation/temporalFootStrike.ts';

const baselinePath = 'docs/performance/pr218/full-stance-v2-attempt-6.json.gz';
const bytes = readFileSync(baselinePath);
const baseline = JSON.parse(gunzipSync(bytes));
const options = new Map(process.argv.slice(2).map((option) => option.slice(2).split('=')));
const limit = Number(options.get('seconds') ?? 5701);
const version = options.get('version') ?? 'baseline';
assert.match(version, /^[a-z0-9-]+$/);
assert.ok(Number.isFinite(limit) && limit > 0);
const tick = 0.025;
const expected = new Map(baseline.strikes.map((strike) => [strike.id, strike]));
const reload = (state) => tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(state)));
let state = reload(baseline.initial);
if (options.has('observed')) {
  state = reload({ ...state, experimentalObservedStrikePreparation: 'observed-low-pass-dev-v1' });
}
const trials = new Map();
const passingLanes = [];
const passResults = new Map();
const began = performance.now();
const cpu = process.cpuUsage();
let steps = 0;
let menus = 0;
let invalidBody;

const sample = (s, pending) => {
  const actor = s.players.find((player) => player.id === pending.actorId);
  assert.ok(actor, pending.id);
  const boot = canonicalStrikeFoot(pending, actor, actor, pending.plan.foot, s.time, tick, 0);
  const nominal = canonicalStrikeFoot(
    {
      ...pending,
      path: temporalFootPath(pending.plan, ZERO_TEMPORAL_ERROR, pending.path.duration),
    },
    actor,
    actor,
    pending.plan.foot,
    s.time,
    tick,
    0,
  );
  const { x, y, height, velocity, spin, ownerId, lastTouchPlayerId } = s.ball;
  return {
    at: s.time,
    ball: { x, y, z: height ?? 0.11, velocity, spin, ownerId, lastTouchPlayerId },
    observed: observedFlight(s, actor),
    position: actor.position,
    velocity: actor.velocity,
    facing: actor.facingAngle,
    stance: actor.articulatedStance,
    boot,
    nominal,
    interference: (s.playerBodyContacts ?? []).filter(
      (impact) => impact.at > s.time - tick - 1e-8 && impact.participants.includes(actor.id),
    ),
  };
};

while (
  state.time < limit &&
  !state.safetyHalt &&
  !['full_time', 'abandoned'].includes(state.status)
) {
  if (state.status === 'half_time') state = startSecondHalf(state);
  const { opportunity } = projectPlayerAgency(state);
  if (opportunity) {
    const option =
      opportunity.options.find(
        (entry) => entry.kind === 'action' && entry.action.type === 'pass',
      ) ?? opportunity.options[0];
    const next = applyPlayerDecision(state, opportunity, option.id);
    assert.notEqual(next, state);
    state = next;
    menus++;
  }
  const previous = state;
  state = withBoundedObserver(
    options.has('lanes')
      ? (trace) => {
          if (trace.stage !== 'decision' || !trace.scene || !trace.candidates) return;
          const selected = trace.decision?.selectedCandidateId;
          const passes = trace.candidates.flatMap((candidate) => {
            const action = candidate.action;
            if (action.type !== 'pass') return [];
            return [
              {
                id: candidate.id,
                receiver: action.receiverId,
                slot: previous.players.find((player) => player.id === action.receiverId)?.slot
                  .position,
                target: action.target,
                risk: candidate.risk,
                confidence: candidate.confidence,
                laneMargin: candidate.opportunity?.laneMargin,
                feasible: candidate.feasible,
                readyAt: candidate.readyAt,
                selected: candidate.id === selected,
              },
            ];
          });
          if (passes.length)
            passingLanes.push({
              actor: trace.actorId,
              at: trace.at,
              episode: previous.ballEpisode,
              ready: trace.scene.contactReady,
              selected: trace.action?.type,
              passes,
            });
        }
      : undefined,
    () =>
      withRankingObserver(
        options.has('lanes')
          ? (snapshot, actorId, ranked) => {
              const actor = snapshot.players.find((player) => player.id === actorId);
              if (!actor) return;
              const passes = ranked.flatMap(({ action, canonicalScore }, rank) => {
                if (action.type !== 'pass') return [];
                const receiver = snapshot.players.find((player) => player.id === action.receiverId);
                return [
                  {
                    receiver: receiver?.id,
                    slot: receiver?.slot.position,
                    target: action.target,
                    score: canonicalScore,
                    readiness: action.deliveryPlan?.receiverReadiness,
                    feasible: action.deliveryPlan?.feasible,
                    selected: rank === 0,
                  },
                ];
              });
              if (passes.length)
                passingLanes.push({
                  actor: actorId,
                  at: snapshot.time,
                  episode: snapshot.ballEpisode,
                  ready: releaseContactReadiness(snapshot, actor),
                  selected: ranked[0]?.action.type,
                  passes,
                });
            }
          : undefined,
        () => stepTacticalMatch(state, tick),
      ),
  );
  steps++;
  assert.notEqual(state, previous);
  if (options.has('validate-poses')) {
    invalidBody = state.players.find((player) => !projectArticulatedBody(state, player))?.id;
    if (invalidBody) break;
  }
  const collect = (snapshot, pending) => {
    if (!pending) return;
    if (!trials.has(pending.id)) {
      const actor = snapshot.players.find((player) => player.id === pending.actorId);
      trials.set(pending.id, { pending, attributes: actor?.profile.attributes, frames: [] });
    }
    const { frames } = trials.get(pending.id);
    if (frames.at(-1)?.at !== snapshot.time) frames.push(sample(snapshot, pending));
  };
  collect(previous, previous.pendingStrike);
  collect(state, state.pendingStrike ?? previous.pendingStrike);
  const result = state.lastStrikeResolution;
  if (result && result !== previous.lastStrikeResolution) {
    const record = trials.get(result.id) ?? { frames: [] };
    record.result = result;
    trials.set(result.id, record);
  }
  if (
    options.has('lanes') &&
    state.lastResolvedPass &&
    state.lastResolvedPass !== previous.lastResolvedPass
  )
    passResults.set(state.lastResolvedPass.passId, state.lastResolvedPass);
  if (Math.floor(state.time / 600) > Math.floor(previous.time / 600))
    process.stdout.write(`${version}: ${Math.round(state.time)}s, ${trials.size} attempts\n`);
}
const records = [...trials.values()];
const matched = records.filter(({ result }) => {
  const reference = result && expected.get(result.id);
  return (
    reference &&
    result.outcome === reference.outcome &&
    result.reason === reference.reason &&
    Math.abs(result.at - reference.at) < 1e-7
  );
}).length;
const summary = {
  reference: {
    fingerprint: baseline.source,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  },
  version,
  edition: state.experimentalObservedStrikePreparation ?? state.experimentalArticulatedBody,
  seed: state.seed,
  time: state.time,
  status: state.status,
  safetyHalt: state.safetyHalt,
  invalidBody,
  score: state.score,
  steps,
  menus,
  attempts: records.length,
  withFrames: records.filter((record) => record.frames.length).length,
  matched,
  outcomes: Object.fromEntries(
    Object.entries(Object.groupBy(records, (record) => record.result?.outcome ?? 'pending')).map(
      ([outcome, attempts]) => [outcome, attempts.length],
    ),
  ),
  wallSeconds: (performance.now() - began) / 1000,
  cpu: process.cpuUsage(cpu),
  maxRSSKiB: process.resourceUsage().maxRSS,
};
mkdirSync('.benchmark-artifacts/pr219', { recursive: true });
writeFileSync(
  `.benchmark-artifacts/pr219/${version}.json.gz`,
  gzipSync(
    JSON.stringify({ summary, records, passingLanes, passResults: [...passResults.values()] }),
  ),
  { flag: 'wx' },
);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
