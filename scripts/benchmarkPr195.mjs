import { summariseTrial } from './pr195Outcomes.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import {
  createCalibrationFixture,
  runCalibrationTrial,
  calibrationConfigSchema,
  captureCalibrationSnapshot,
} from '../src/core/matchSimulation/assumptionCalibration.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { digest, sourceFingerprint } from './pr195SourceInventory.mjs';
import { defenderArrivalTrials } from './pr195DefenderArrival.mjs';

const root = 'docs/performance/pr195',
  check = process.argv.includes('--check'),
  smoke = process.argv.includes('--smoke');
const protocolPath = `${root}/pilot-protocol.json`,
  output = `${root}/pilot-v1.json.gz`;
const protocol = {
  schema: 'mfl-pr195-pilot-protocol-v1',
  classification: 'controlled development; not independent validation or real-football calibration',
  scenarios: calibrationConfigSchema.shape.scenario.options,
  matchups: [
    [20, 20],
    [40, 40],
    [60, 60],
    [80, 80],
    [100, 100],
    [40, 80],
    [80, 40],
  ],
  seeds: ['pr195-development-0', 'pr195-development-1'],
  mirrors: [false, true],
  seconds: 6,
  events: {
    completion:
      'intended receiver physically touches original pass episode before opponent control/restart; not delivery proximity',
    retained:
      'receiver controls original episode AND own team owns the ball one second later; endpoint censored if unavailable',
    shot: 'goal from requested released shotId before episode outcome, not a later team goal',
    defensive:
      'separate fixed-target 0.8m proximity, finite-foot access, executed disruption, defender control; no inference of contact from ETA',
  },
  information:
    'bounded scene retained; legacy forecasts explicitly privileged; hidden opponent ratings never passed into bounded scene',
  selection:
    'one experimentally requested action, possibly rejected, followed by autonomous canonical 40Hz football',
};
if (!smoke) {
  mkdirSync(root, { recursive: true });
  if (existsSync(protocolPath)) {
    if (digest(JSON.parse(readFileSync(protocolPath))) !== digest(protocol))
      throw Error('Frozen protocol differs; use a new version');
  } else writeFileSync(protocolPath, JSON.stringify(protocol, null, 2) + '\n', { flag: 'wx' });
  if (!check && existsSync(output)) throw Error('Preserve recorded pilot; use --check');
}
const source = sourceFingerprint(),
  previous = check ? JSON.parse(gunzipSync(readFileSync(output))) : null;
if (check && digest(source) !== previous.sourceHash) throw Error('Pilot source differs');
const rows = [],
  configs = [];
for (const scenario of smoke
  ? ['safe_pass', 'blocked_shot', 'infeasible_contact']
  : protocol.scenarios)
  for (const [attacker, defender] of smoke ? [[60, 60]] : protocol.matchups)
    for (const seed of smoke ? [protocol.seeds[0]] : protocol.seeds)
      for (const mirror of smoke ? [false] : protocol.mirrors)
        configs.push({ scenario, attacker, defender, seed, mirror, seconds: protocol.seconds });
const started = performance.now(),
  cpu = process.cpuUsage();
for (const [index, config] of configs.entries()) {
  const f = createCalibrationFixture(config),
    result = runCalibrationTrial(f.state, f.action, f.receiverId, f.defenderId, config.seconds);
  const row = {
    config,
    action: f.action,
    actorId: f.actorId,
    receiverId: f.receiverId,
    defenderId: f.defenderId,
    inputHash: digest(f.state),
    finalHash: digest(result.final),
    scene: result.snapshot.scene,
    candidates: result.snapshot.candidates,
    decision: result.snapshot.decision,
    boundedDecisions: result.snapshot.boundedDecisions,
    canonicalShots: result.snapshot.canonicalShots,
    policyRankings: result.snapshot.policyRankings,
    truthForecast: result.truthForecast,
    summary: summariseTrial(result, f.receiverId, f.defenderId),
    outputHash: digest(result),
    observationHash: digest(result.observations),
    traceHash: digest(result.traces),
    // Keep all transition witnesses and 0.25s spatial samples; exact complete
    // output hashes above are checked by canonical replay. No duplicate state streams.
    observations: result.observations.filter(
      (o, i, xs) =>
        i < 2 ||
        i === xs.length - 1 ||
        i % 10 === 1 ||
        (i > 0 &&
          digest([
            o.ownerId,
            o.lastTouchPlayerId,
            o.groundContact,
            o.flightContact,
            o.restart,
            o.shotOutcome,
            o.receiverActive,
            o.defenderActive,
          ]) !==
            digest([
              xs[i - 1].ownerId,
              xs[i - 1].lastTouchPlayerId,
              xs[i - 1].groundContact,
              xs[i - 1].flightContact,
              xs[i - 1].restart,
              xs[i - 1].shotOutcome,
              xs[i - 1].receiverActive,
              xs[i - 1].defenderActive,
            ])),
    ),
    traces: result.traces.map((trace) => {
      const reduced = { ...trace };
      delete reduced.scene;
      delete reduced.candidates;
      return reduced;
    }),
  };
  if (
    index === 0 ||
    (['moving_defender', 'incoming_difficult', 'infeasible_contact'].includes(config.scenario) &&
      config.attacker === 60 &&
      config.defender === 60 &&
      !config.mirror &&
      config.seed === protocol.seeds[0])
  ) {
    const twin = runCalibrationTrial(
      f.state,
      f.action,
      f.receiverId,
      f.defenderId,
      config.seconds,
      (o) => {
        o.ownerId = 'mutated';
        o.ball.x = -999;
      },
    );
    row.repeatAndMutatingObserverNeutral =
      digest(twin.final) === row.finalHash &&
      digest(twin.observations) === digest(result.observations);
    if (!row.repeatAndMutatingObserverNeutral) throw Error('Observer/repeat drift');
  }
  if (check && digest(row) !== digest(previous.rows[index]))
    throw Error(`Pilot replay drift ${index}`);
  rows.push(row);
  if (index % 28 === 0 || smoke)
    console.log(index + 1, '/', configs.length, config.scenario, JSON.stringify(row.summary));
}
// Genuine canonical tick states from an autonomous continuation, paired alternatives from the exact same snapshot.
const captures = [];
for (const name of smoke ? [] : ['safe_pass', 'moving_defender']) {
  const f = createCalibrationFixture({
    scenario: name,
    seed: 'pr195-live-capture',
    attacker: 60,
    defender: 80,
  });
  let state = f.state;
  for (let tick = 0; tick < 80; tick++) state = step(state, 0.025);
  const owner = state.ball.ownerId;
  if (!owner) {
    captures.push({ name, status: 'no_owner_at_capture', state });
    continue;
  }
  const snapshot = captureCalibrationSnapshot(state, owner),
    selected = snapshot.candidates.find((c) => c.id === snapshot.decision.selectedCandidateId);
  const alternatives = [
    selected,
    snapshot.candidates.find((c) => c.action.type === 'hold'),
    snapshot.candidates.find((c) => c.feasible && c.action.type === 'pass'),
    snapshot.candidates.find((c) => c.feasible && c.action.type === 'shot'),
    ...snapshot.candidates.filter((c) => c.feasible),
  ]
    .filter((c, i, xs) => c && xs.findIndex((x) => x?.id === c.id) === i)
    .slice(0, 4);
  const trials = alternatives.map((c) => {
    const r = runCalibrationTrial(state, c.action, f.receiverId, f.defenderId, 3);
    return {
      candidateId: c.id,
      isPolicySelection: c.id === selected?.id,
      selection: 'forced_experiment',
      inputHash: digest(state),
      finalHash: digest(r.final),
      summary: summariseTrial(r, f.receiverId, f.defenderId),
    };
  });
  captures.push({
    name,
    status: 'captured_canonical_tick',
    snapshot,
    selectedAction: selected?.action ?? null,
    trials,
  });
}
if (check && digest(captures) !== digest(previous.captures))
  throw Error('Counterfactual capture drift');
const defenderArrivals = smoke ? [] : defenderArrivalTrials();
if (check && digest(defenderArrivals) !== digest(previous.defenderArrivals))
  throw Error('Defender arrival drift');
if (digest(sourceFingerprint()) !== digest(source))
  throw Error('Source changed during measurement');
if (!check && !smoke)
  writeFileSync(
    output,
    gzipSync(
      JSON.stringify({
        schema: 'mfl-pr195-pilot-v1',
        source,
        sourceHash: digest(source),
        protocolHash: digest(protocol),
        rows,
        captures,
        defenderArrivals,
        performance: {
          wallMs: performance.now() - started,
          cpu: process.cpuUsage(cpu),
          peakRss: process.resourceUsage().maxRSS,
          classification: 'concurrent development host; not a full-match speed benchmark',
        },
      }),
    ),
    { flag: 'wx' },
  );
console.log(
  'PR195',
  check ? 'replay PASS' : smoke ? 'smoke PASS' : 'recorded',
  rows.length,
  'trials',
  captures.length,
  'live captures',
);
