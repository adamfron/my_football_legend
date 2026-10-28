import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { continueRelease } from './pr198Laboratory.mjs';
import { createFreshReleases } from './pr201Fixtures.mjs';
import { observedMotorBall, observedFlight } from '../src/core/matchSimulation/liveBallFlight.ts';
import { projectLiveReceptionTarget } from '../src/core/matchSimulation/passReception.ts';
import {
  canReconsiderDecision,
  canReleaseControlledAction,
} from '../src/core/matchSimulation/decisionReadiness.ts';
import {
  interpretCanonicalOutcome,
  outcomeContractSchema,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { identity, read, finish, options } from './pr201Evidence.mjs';
const mode = options.get('mode') ?? 'frozen';
const version = options.get('version') ?? 'v1';
const frozen = read('docs/performance/pr198/releases-v1.json.gz').result.rows;
const changed = new Set(
  read('docs/performance/pr198/summary.json')
    .receiverPairs.filter((r) => r.lostTouch || r.gainedTouch)
    .map((r) => r.ballHash),
);
const fresh = ['fresh200', 'fresh201', 'attributes', 'negative'].includes(mode)
  ? createFreshReleases(mode === 'fresh200' ? 200 : 201)
  : null;
let selected =
  fresh?.entries ??
  (mode.startsWith('diagnosis') ? frozen.filter((e) => changed.has(e.ballHash)) : frozen);
if (mode === 'diagnosis-regressions') {
  const keys = new Set();
  for (const corpus of ['frozen', 'fresh200', 'fresh201']) {
    const rows = read(`docs/performance/pr201/receivers-${corpus}-v1.json.gz`).result.rows;
    for (let i = 0; i < rows.length; i += 2) {
      const [before, after] = rows.slice(i, i + 2);
      if (
        before.outcome.directReceiverTouch &&
        before.outcome.teamPossessionAtOneSecond &&
        !(after.outcome.directReceiverTouch && after.outcome.teamPossessionAtOneSecond)
      )
        keys.add(before.releaseHash);
    }
  }
  const all = [...frozen, ...createFreshReleases(200).entries, ...createFreshReleases(201).entries];
  selected = all.filter((e) => keys.has(e.releaseHash));
  // Positive controls chosen by corpus order, not by a new intervention result.
  const retained = read('docs/performance/pr201/receivers-frozen-v1.json.gz')
    .result.rows.filter(
      (r) =>
        r.variant === 'bounded' &&
        r.outcome.directReceiverTouch &&
        r.outcome.teamPossessionAtOneSecond,
    )
    .slice(0, 2);
  selected.push(...frozen.filter((e) => retained.some((r) => r.releaseHash === e.releaseHash)));
}
if (['attributes', 'negative'].includes(mode)) {
  const bases = selected.filter(
    (e) =>
      e.skill === 55 && e.sample === 0 && e.factor === 'unpressured' && e.family !== 'long_ground',
  );
  selected = bases.flatMap((e) =>
    (mode === 'attributes'
      ? [
          'gameReading',
          'concentration',
          'agility',
          'pace',
          'firstTouch',
          'technique',
          'acquisition_angle',
        ].flatMap((group) => [20, 80].map((level) => ({ group, level })))
      : ['unreachable', 'screen', 'facing_away'].map((group) => ({ group, level: 0 }))
    ).map(({ group, level }) => {
      const copy = globalThis.structuredClone(e),
        p = copy.state.players.find((p) => p.id === e.contract.receiverId);
      if (mode === 'attributes') {
        if (group === 'acquisition_angle')
          p.facingAngle =
            Math.atan2(copy.state.ball.x - p.position.x, copy.state.ball.y - p.position.y) +
            (level === 20 ? Math.PI : 0);
        else p.profile.attributes[group] = level;
      } else if (group === 'unreachable') {
        p.position = { x: 104, y: 66 };
        p.target = { ...p.position };
        p.neutralAnchor = { ...p.position };
        p.velocity = { x: 0, y: 0 };
      } else if (group === 'facing_away')
        p.facingAngle =
          Math.atan2(copy.state.ball.x - p.position.x, copy.state.ball.y - p.position.y) + Math.PI;
      else {
        const screen = copy.state.players.find(
          (q) => q.team !== p.team && q.slot.position !== 'goalkeeper',
        );
        screen.position = {
          x: p.position.x + (copy.state.ball.x - p.position.x) * 0.35,
          y: p.position.y + (copy.state.ball.y - p.position.y) * 0.35,
        };
        screen.target = { ...screen.position };
        screen.neutralAnchor = { ...screen.position };
        screen.velocity = { x: 0, y: 0 };
      }
      return { ...copy, group, level };
    }),
  );
}
if (options.has('limit')) selected = selected.slice(0, Number(options.get('limit')));
const variants =
  mode === 'diagnosis-initial'
    ? ['bounded', 'position_only', 'motor_clock', 'both']
    : mode === 'diagnosis-fallback'
      ? ['bounded', 'hold_no_information', 'hold_no_plan', 'position_no_plan']
      : ['bounded', 'recovery'];
const source = identity(),
  start = performance.now(),
  cpu = process.cpuUsage(),
  rows = [];
const flags = {
  experimentalDefensiveReception: true,
  experimentalHeightAwarePassing: true,
  experimentalReceiverAnticipation: true,
  experimentalReceiverSynchronisation: false,
  experimentalCanonicalArrival: false,
  experimentalBoundedBallFlightBelief: true,
};
for (const e of selected)
  for (const variant of variants) {
    const sensory = [],
      motor = [],
      actions = [],
      samples = [],
      decisionOpportunities = [];
    let firstSight = null,
      firstMotion = null,
      receiverAbsentAt = null;
    globalThis.__mflPr199Lab = {
      receptionMovementContactTarget: ([s, p], original) => {
        if (p.id !== e.contract.receiverId || s.receptionPreparation?.actorId !== p.id)
          return original(s, p);
        if (['motor_clock', 'both'].includes(variant)) {
          p.ballMotorObservation = observedMotorBall(s, p);
          const point = projectLiveReceptionTarget(s, p);
          if (point) return point;
        }
        const target = original(s, p),
          f = observedFlight(s, p);
        if (target) return target;
        if (
          ['position_only', 'both'].includes(variant) &&
          f &&
          !f.hasVelocityEstimate &&
          (f.observationAge ?? 9) <= 0.5
        )
          return { x: f.position.x, y: f.position.y };
        if (variant === 'hold_no_information' && !f) return { ...p.position };
        if (variant === 'hold_no_plan') return { ...p.position };
        if (variant === 'position_no_plan')
          return f ? { x: f.position.x, y: f.position.y } : { ...p.position };
        return target;
      },
      integrateCanonicalMovement: ([p, input], original) => {
        if (p.id === e.contract.receiverId && mode.startsWith('diagnosis'))
          motor.push({
            position: p.position,
            velocity: p.velocity,
            facing: p.facingAngle,
            plant: p.plantBalance ?? null,
            input,
            observation: p.ballMotorObservation ?? null,
          });
        return original(p, input);
      },
    };
    const result = continueRelease(
      e,
      { ...flags, ...(variant === 'recovery' ? { boundedReceiverRecovery: 'hold-local-v1' } : {}) },
      undefined,
      (before, s, sample) => {
        samples.push(sample);
        const p = s.players.find((p) => p.id === e.contract.receiverId);
        if (!p) {
          receiverAbsentAt ??= s.time;
          return;
        }
        const sensor = s.liveBallFlightRuntime?.sensors[p.id];
        if (firstSight === null && sensor?.belief?.lastObservation)
          firstSight = sensor.belief.lastObservation.at;
        if (firstMotion === null && sensor?.belief?.motionEvidenceAt != null)
          firstMotion = sensor.belief.motionEvidenceAt;
        if (
          s.ball.ownerId === p.id &&
          canReconsiderDecision(s, p) &&
          canReleaseControlledAction(s, p)
        )
          decisionOpportunities.push(s.time);
        if (before.decisionIndex !== s.decisionIndex && s.currentAction?.actorId === p.id)
          actions.push({
            at: s.time,
            action: s.currentAction,
            pass:
              s.lastPassDiagnostic?.passerId === p.id &&
              s.lastPassDiagnostic?.passId !== before.lastPassDiagnostic?.passId
                ? s.lastPassDiagnostic
                : null,
          });
        if (
          mode.startsWith('diagnosis') &&
          (sensory.length === 0 ||
            Math.round((s.time - e.state.time) * 40) % 4 === 1 ||
            sample.contacts.length)
        )
          sensory.push({
            at: s.time,
            optical: sensor?.optical ?? null,
            belief: sensor?.belief ?? null,
            preparation: s.receptionPreparation ?? null,
            position: p.position,
            velocity: p.velocity,
            facing: p.facingAngle,
            ball: sample.ball,
            contacts: sample.contacts,
          });
      },
    );
    delete globalThis.__mflPr199Lab;
    const controlAt = result.outcome.receiverControlAt;
    const firstDecisionOpportunity =
      controlAt === null
        ? null
        : (decisionOpportunities.find((at) => at >= controlAt - 1e-8) ?? null);
    const next = controlAt === null ? null : (actions.find((a) => a.at > controlAt + 1e-8) ?? null);
    let nextPass = null;
    if (next?.pass) {
      const pass = next.pass;
      const contract = outcomeContractSchema.parse({
        ...e.contract,
        actorId: e.contract.receiverId,
        receiverId: pass.intendedReceiverId,
        requestedAt: pass.releasedAt,
        releasedAt: pass.releasedAt,
        horizonAt: pass.releasedAt + 8,
        passId: pass.passId,
      });
      nextPass = interpretCanonicalOutcome(
        contract,
        samples.filter((s) => s.at >= pass.releasedAt - 1e-8),
      );
    }
    rows.push({
      family: e.family,
      skill: e.skill,
      sample: e.sample,
      factor: e.factor ?? null,
      variant,
      group: e.group ?? null,
      level: e.level ?? null,
      seed: e.seed,
      releaseHash: e.releaseHash,
      ballHash: e.ballHash,
      changed: changed.has(e.ballHash),
      startHash: result.startHash,
      finalHash: result.finalHash,
      samplesHash: result.samplesHash,
      outcome: result.outcome,
      diagnostic: result.diagnostic,
      firstSight,
      firstMotion,
      firstDecisionOpportunity,
      receiverAbsentAt,
      nextAction: next,
      nextPass,
      ...(mode.startsWith('diagnosis') ? { sensory, motor, frames: result.frames } : {}),
    });
    if (rows.length % 30 === 0) console.log('PR201 receiver', mode, rows.length);
  }
const summarize = (list) => ({
  trials: list.length,
  touch: list.filter((r) => r.outcome.directReceiverTouch).length,
  control: list.filter((r) => r.outcome.directReceiverTouch && r.outcome.receiverControl).length,
  retained: list.filter((r) => r.outcome.directReceiverTouch && r.outcome.teamPossessionAtOneSecond)
    .length,
  allReceiverControl: list.filter((r) => r.outcome.receiverControl).length,
  deflectedReceiverTouch: list.filter((r) => r.outcome.deflectedReceiverTouch).length,
  uninterruptedRetention: list.filter((r) => r.outcome.uninterruptedRetention).length,
  censored: list.filter((r) => r.outcome.censored).length,
  defensiveControl: list.filter((r) => r.outcome.defensiveControlAt !== null).length,
  nextDecisionOpportunity: list.filter((r) => r.firstDecisionOpportunity !== null).length,
  nextAction: list.filter((r) => r.nextAction !== null).length,
  nextPasses: list.filter((r) => r.nextPass).length,
  nextPassDirectControl: list.filter(
    (r) => r.nextPass?.directReceiverTouch && r.nextPass?.receiverControl,
  ).length,
  nextPassCensored: list.filter((r) => r.nextPass?.censored).length,
});
const summary = Object.fromEntries(
  variants.map((v) => [v, summarize(rows.filter((r) => r.variant === v))]),
);
const result = {
  schema: 'pr201-receivers-v1',
  source,
  mode,
  summary,
  rejected: fresh?.rejected ?? [],
  rows,
  qualification:
    'Development only. Same actual launch in each pair. Original-delivery-v3 unchanged; direct control/retention require direct touch. Further actions have only the remaining original eight-second observation window; their censoring is explicit.',
};
finish(`receivers-${mode}-${version}.json.gz`, result, {
  wallSeconds: (performance.now() - start) / 1000,
  cpu: process.cpuUsage(cpu),
  peakRSSKiB: process.resourceUsage().maxRSS,
  node: process.version,
  platform: process.platform,
  cpuModel: cpus()[0]?.model,
});
console.log('PR201 receiver complete', mode, summary);
