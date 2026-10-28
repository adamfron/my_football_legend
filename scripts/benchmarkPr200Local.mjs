import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { continueRelease } from './pr198Laboratory.mjs';
import { familyFixture } from './pr198Fixtures.mjs';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import {
  sampleCanonicalOutcome,
  outcomeContractSchema,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { angleForVector } from '../src/core/matchSimulation/playerOrientation.ts';
import { deriveMovementCapability } from '../src/core/matchSimulation/locomotion.ts';
import { ROOT, hash, read, write, identity } from './pr200Evidence.mjs';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const mode = args.get('mode') ?? 'frozen',
  version = args.get('version') ?? 'v1';
const source = identity(),
  start = performance.now(),
  cpu = process.cpuUsage();
const frozen = read('docs/performance/pr198/releases-v1.json.gz').result.rows;
const changed = new Set(
  read('docs/performance/pr198/summary.json')
    .receiverPairs.filter((r) => r.lostTouch || r.gainedTouch)
    .map((r) => r.ballHash),
);
const rejected = [];
const fresh = () => {
  const entries = [];
  for (const family of ['short_ground', 'long_ground', 'long_lofted', 'moving_lead', 'cross_field'])
    for (const skill of [25, 55, 85])
      for (const sample of [0, 1])
        for (const factor of ['unpressured', 'immediate_pressure', 'late_reacquisition']) {
          const f = familyFixture(family, skill, sample);
          f.state.seed = `pr200-fresh-${family}-${skill}-${sample}`;
          const r = f.state.players.find((p) => p.id === f.receiverId);
          r.facingAngle += sample ? 0.7 : -0.45;
          r.velocity = { x: sample ? 1.5 : -2, y: sample ? -1.5 : 2 };
          if (factor === 'late_reacquisition') r.facingAngle += Math.PI;
          if (factor === 'unpressured')
            for (const p of f.state.players.filter(
              (p) => p.team !== r.team && p.slot.position !== 'goalkeeper',
            )) {
              p.position = { x: 20 + p.slotIndex, y: sample ? 4 : 64 };
              p.target = { ...p.position };
              p.neutralAnchor = { ...p.position };
            }
          if (factor === 'immediate_pressure') {
            const p = f.state.players.find(
              (p) => p.team !== r.team && p.slot.position !== 'goalkeeper',
            );
            p.position = { x: r.position.x + 1.2, y: r.position.y };
            p.target = { ...p.position };
            p.neutralAnchor = { ...p.position };
          }
          const s = resolveMatchAction(
            globalThis.structuredClone(f.state),
            f.action,
            'autonomous_npc',
          );
          const pass = s.lastPassDiagnostic;
          if (!pass || pass.passId === f.state.lastPassDiagnostic?.passId) {
            rejected.push({ family, skill, sample, inputHash: hash(f.state) });
            continue;
          }
          const actor = f.state.players.find((p) => p.id === f.actorId);
          const contract = outcomeContractSchema.parse({
            version: 'original-delivery-v3',
            actorId: f.actorId,
            receiverId: f.receiverId,
            teamIds: f.state.players.filter((p) => p.team === actor.team).map((p) => p.id),
            opponentIds: f.state.players.filter((p) => p.team !== actor.team).map((p) => p.id),
            requestedAt: f.state.time,
            releasedAt: pass.releasedAt,
            horizonAt: pass.releasedAt + 8,
            passId: pass.passId,
            shotId: null,
            previousShotId: null,
            information: 'privileged_engineering_observer',
            conditionalOnRelease: true,
          });
          entries.push({
            family,
            skill,
            sample,
            factor,
            seed: s.seed,
            releaseHash: hash(s),
            ballHash: hash(s.ball),
            receiverHash: hash(s.players.find((p) => p.id === f.receiverId)),
            contract,
            state: s,
            releaseSample: sampleCanonicalOutcome(f.state, s, 'original-delivery-v3'),
          });
        }
  return entries;
};
const selected =
  mode === 'fresh'
    ? fresh()
    : mode === 'changed' || mode === 'bounded-diagnosis'
      ? frozen.filter((e) => changed.has(e.ballHash))
      : frozen;
const variants =
  mode === 'bounded-diagnosis'
    ? ['R', 'bounded', 'bounded_fresh', 'bounded_sprint', 'bounded_fresh_sprint']
    : mode === 'frozen'
      ? ['R', 'S', 'incoming_facing', 'bounded', 'bounded_no_defence']
      : ['R', 'S', 'incoming_facing', 'legacy_speed', 'bounded'];
const rows = [];
for (const e of selected)
  for (const variant of variants) {
    globalThis.__mflPr199Lab = {
      ...(variant.includes('fresh')
        ? {
            observeReceptionBall: ([s, actor], original) => {
              const observed = original(s, actor);
              return {
                ...observed,
                at: s.time,
                nextAt: s.time,
                ball: {
                  position: { x: s.ball.x, y: s.ball.y, z: s.ball.height ?? 0.11 },
                  velocity: { ...s.ball.velocity, z: s.ball.velocity?.z ?? 0 },
                  spin: { x: 0, y: 0, z: 0 },
                  owner: s.ball.ownerId ?? null,
                },
              };
            },
          }
        : {}),
      ...(variant.includes('sprint')
        ? {
            integrateCanonicalMovement: ([body, input], original) =>
              original(
                body,
                body.id === e.contract.receiverId
                  ? { ...input, targetSpeed: deriveMovementCapability(body).maximumSprintSpeed }
                  : input,
              ),
          }
        : {}),
      ...(variant === 'incoming_facing'
        ? { receptionPlanFacing: (input) => angleForVector({ x: -input[2].x, y: -input[2].y }) }
        : {}),
      ...(variant === 'legacy_speed'
        ? {
            projectLocomotion: (input, original) =>
              input[1].id === e.contract.receiverId
                ? original(
                    { ...input[0], experimentalReceiverSynchronisation: false },
                    ...input.slice(1),
                  )
                : original(...input),
          }
        : {}),
    };
    const flags = {
      experimentalDefensiveReception: variant !== 'bounded_no_defence',
      experimentalHeightAwarePassing: true,
      experimentalReceiverAnticipation: true,
      experimentalReceiverSynchronisation: variant !== 'R' && !variant.startsWith('bounded'),
      experimentalCanonicalArrival: false,
      ...(variant.startsWith('bounded') ? { experimentalBoundedBallFlightBelief: true } : {}),
    };
    const result = continueRelease(e, flags);
    delete globalThis.__mflPr199Lab;
    if (mode === 'frozen' && ['R', 'S'].includes(variant)) {
      const old = read(
        `docs/performance/pr198/receptions-${variant === 'R' ? 'combined-v1' : 'synchronized-v2'}.json.gz`,
      ).result.rows.find((r) => r.ballHash === e.ballHash);
      if (old.finalHash !== result.finalHash || hash(old.outcome) !== hash(result.outcome))
        throw Error('Historical current-kernel baseline drift');
    }
    const frames = result.frames;
    rows.push({
      family: e.family,
      skill: e.skill,
      sample: e.sample,
      ...(e.factor ? { factor: e.factor } : {}),
      seed: e.seed,
      variant,
      changed: changed.has(e.ballHash),
      flags,
      releaseHash: e.releaseHash,
      ballHash: e.ballHash,
      startHash: result.startHash,
      finalHash: result.finalHash,
      samplesHash: result.samplesHash,
      outcome: result.outcome,
      diagnostic: result.diagnostic,
      surfaceAccessWithoutTouch: frames.filter((f) => f.footAccessible && !f.contacts.length)
        .length,
      noObservationFrames: frames.filter((f) => !f.observation?.ball).length,
      planReviewFrames: frames.filter((f) => f.meeting?.plannedAt === f.at).length,
      ...(mode === 'changed' ? { frames } : {}),
    });
    if (rows.length % 50 === 0) console.log('PR200 local', mode, rows.length);
  }
const summarize = (list) => ({
  trials: list.length,
  touch: list.filter((r) => r.outcome.directReceiverTouch).length,
  control: list.filter((r) => r.outcome.directReceiverTouch && r.outcome.receiverControl).length,
  retained: list.filter((r) => r.outcome.directReceiverTouch && r.outcome.teamPossessionAtOneSecond)
    .length,
  censored: list.filter((r) => r.outcome.censored).length,
});
const summary = Object.fromEntries(
  variants.map((v) => [
    v,
    {
      all: summarize(rows.filter((r) => r.variant === v)),
      changed: summarize(rows.filter((r) => r.variant === v && r.changed)),
    },
  ]),
);
const result = {
  schema: 'pr200-local-v1',
  source,
  mode,
  summary,
  rejected,
  rows,
  qualification:
    'Actual canonical 40Hz continuations; a finite surface-access frame without contact is not proof of a physically feasible controlled alternative. Motor ablations are diagnostic and not installed globally.',
};
if (args.has('check')) {
  const { source: _old, ...old } = read(args.get('check')).result;
  const { source: _new, ...actual } = result;
  void _old;
  void _new;
  if (hash(old) !== hash(actual)) throw Error('PR200 local replay drift');
} else
  write(`${ROOT}/local-${mode}-${version}.json.gz`, {
    result,
    costs: {
      wallSeconds: (performance.now() - start) / 1000,
      cpu: process.cpuUsage(cpu),
      peakRSSKiB: process.resourceUsage().maxRSS,
    },
  });
console.log('PR200 local complete', mode, summary);
