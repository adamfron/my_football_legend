import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Buffer } from 'node:buffer';
import { createProspectiveFixture } from '../src/core/matchSimulation/prospectivePlayLaboratory.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { advanceActivePerception } from '../src/core/matchSimulation/activePerception.ts';
import { advanceLiveBallFlight } from '../src/core/matchSimulation/liveBallFlight.ts';
import {
  advanceReceivingPositions,
  evaluateProspectivePosition,
  receivingPositionTarget,
} from '../src/core/matchSimulation/receivingPositions.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { distance, distanceToSegment } from '../src/core/matchSimulation/matchSpace.ts';
import {
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
  outcomeContractSchema,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { observeBoundedScene } from '../src/core/matchSimulation/boundedPerception.ts';
import { updateSituation } from '../src/core/matchSimulation/situationalAwareness.ts';
import {
  fitContactRegion,
  residualInsideRegion,
} from '../src/core/matchSimulation/contactUncertainty.ts';
import { read as readEvidence, FINAL_VERSION } from './pr203Evidence.mjs';
import { source } from './pr199Evidence.mjs';
const hash = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const mode = args.get('mode') ?? 'support',
  version = args.get('version') ?? FINAL_VERSION;
assert.match(version, /^[a-z0-9-]+$/);
const root = 'docs/performance/pr204';
const profiles = ['prospective-play-v1', 'two-pass-continuity-dev-v1'];
const started = performance.now(),
  cpu = process.cpuUsage();
const rows = [],
  armCosts = [];
const fObserve = (s) =>
  advanceReceivingPositions(advanceActivePerception(advanceLiveBallFlight(s)));
if (mode === 'support') {
  for (const sample of [0, 1, 2])
    for (const reading of [20, 85])
      for (const scenario of [
        'available',
        'pressure',
        'alternative',
        'interception',
        'delayed',
        'unseen_support',
        'marked',
        'deflection',
      ])
        for (const profile of profiles) {
          const armStart = performance.now(),
            armCpu = process.cpuUsage();
          const f = createProspectiveFixture({ seed: `pr203-${sample}`, reading, profile: 'prospective-play-v1' });
          if (profile === 'two-pass-continuity-dev-v1') {
            f.state.prospectiveMovement = profile;
            delete f.state.integrationProfile;
          }
          let s = fObserve(f.state);
          const start = s.time,
            origin = { ...f.c.position },
            initialHash = hash(s),
            frames = [],
            decisions = [],
            passes = [],
            samples = [],
            continuations = [];
          let request = null,
            contract = null,
            releaseAt = null,
            startedAt = null,
            withdrawnAt = null,
            recognisedAt = null,
            firstBControl = null,
            cSeenByB = false,
            candidateMenus = 0,
            cSelectedByB = false,
            cReleasedByB = false,
            availabilitySeconds = 0,
            costMetres = 0,
            previous = origin,
            intervened = false;
          const requestAt = scenario === 'delayed' ? 2.5 : 0.9;
          withBoundedObserver(
            (t) => {
              if (t.actorId === f.b.id && t.stage === 'decision') {
                candidateMenus += Number(t.candidates !== undefined);
                cSeenByB ||= Boolean(
                  t.candidates?.some(
                    (c) => c.action.type === 'pass' && c.action.receiverId === f.c.id,
                  ),
                );
                cSelectedByB ||= t.action?.type === 'pass' && t.action.receiverId === f.c.id;
                decisions.push({
                  at: t.at,
                  actorId: t.actorId,
                  candidatesForC:
                    t.candidates
                      ?.filter((c) => c.action.type === 'pass' && c.action.receiverId === f.c.id)
                      .map((c) => ({
                        id: c.id,
                        feasible: c.feasible,
                        readyAt: c.readyAt,
                        risk: c.risk,
                      })) ?? null,
                  action: t.action ?? null,
                });
              }
            },
            () => {
              for (let i = 0; i < 280; i++) {
                let before = s;
                if (!request && s.time - start >= requestAt - 1e-7) {
                  const b = s.players.find((p) => p.id === f.b.id);
                  const target =
                    scenario === 'alternative'
                      ? s.players.find(
                          (p) =>
                            p.team === f.a.team &&
                            ![f.a.id, f.b.id, f.c.id].includes(p.id) &&
                            p.slot.position !== 'goalkeeper',
                        )
                      : b;
                  const action = {
                    type: 'pass',
                    actorId: f.a.id,
                    receiverId: target.id,
                    target: { ...target.position },
                    intent: 'support',
                    delivery: 'ground',
                  };
                  request = { at: s.time, action, source: 'explicit-development-intervention' };
                  const after = resolveMatchAction(s, action, 'autonomous_npc');
                  if (after.lastPassDiagnostic?.passId !== s.lastPassDiagnostic?.passId) {
                    samples.length = 0;
                    releaseAt = after.lastPassDiagnostic.releasedAt;
                    contract = outcomeContractSchema.parse({
                      version: 'original-delivery-v3',
                      actorId: f.a.id,
                      receiverId: target.id,
                      teamIds: s.players.filter((p) => p.team === f.a.team).map((p) => p.id),
                      opponentIds: s.players.filter((p) => p.team !== f.a.team).map((p) => p.id),
                      requestedAt: s.time,
                      releasedAt: releaseAt,
                      horizonAt: start + 7,
                      passId: after.lastPassDiagnostic.passId,
                      shotId: null,
                      information: 'privileged_engineering_observer',
                      conditionalOnRelease: true,
                    });
                    samples.push(sampleCanonicalOutcome(s, after, 'original-delivery-v3'));
                  }
                  s = after;
                  before = s;
                }
                if (!intervened && s.time - start >= 1.2) {
                  intervened = true;
                  const b = s.players.find((p) => p.id === f.b.id),
                    c = s.players.find((p) => p.id === f.c.id),
                    foe = s.players.find((p) => p.id === f.opponent.id);
                  if (scenario === 'pressure') {
                    foe.position = { x: b.position.x + 0.6, y: b.position.y + 0.2 };
                    foe.target = { ...foe.position };
                  }
                  if (scenario === 'marked') {
                    foe.position = { x: c.position.x + 0.6, y: c.position.y + 0.2 };
                    foe.target = { ...foe.position };
                  }
                  if (scenario === 'unseen_support') b.facingAngle += Math.PI;
                  if (scenario === 'interception' && !s.ball.ownerId) {
                    foe.position = { x: s.ball.x + 0.3, y: s.ball.y };
                    foe.target = { ...foe.position };
                  }
                  // Exogenous physical disturbance, not a credited canonical deflection.
                  if (scenario === 'deflection' && !s.ball.ownerId)
                    s.ball = { ...s.ball, velocity: { x: -5, y: 9, z: 1 } };
                }
                s = step(s, 0.025);
                const sampleFact = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
                samples.push(sampleFact);
                for (const episode of continuations) episode.samples.push(sampleFact);
                const c = s.players.find((p) => p.id === f.c.id),
                  b = s.players.find((p) => p.id === f.b.id);
                if (!c || !b) break;
                costMetres += distance(c.position, previous);
                previous = { ...c.position };
                const job = s.activePerceptionRuntime?.positions[f.c.id],
                  liveTarget = receivingPositionTarget(s, c);
                if (job?.prospective) recognisedAt ??= job.prospective.recognisedAt;
                if (liveTarget && distance(c.position, origin) > 0.15) startedAt ??= s.time;
                if (job?.prospective?.status === 'withdrawn') withdrawnAt ??= s.time;
                if (s.ball.ownerId === f.b.id) {
                  firstBControl ??= s.time;
                  const foes = s.players.filter((p) => p.team !== b.team);
                  const lane = Math.min(
                    ...foes.map((p) => distanceToSegment(p.position, b.position, c.position)),
                  );
                  if (
                    distance(b.position, c.position) < 25 &&
                    lane > 2 &&
                    Math.min(...foes.map((p) => distance(p.position, c.position))) > 2
                  )
                    availabilitySeconds += 0.025;
                }
                if (s.lastPassDiagnostic?.passId !== before.lastPassDiagnostic?.passId) {
                  passes.push({
                    at: s.time,
                    passId: s.lastPassDiagnostic.passId,
                    actorId: s.lastPassDiagnostic.passerId,
                    receiverId:
                      s.lastPassDiagnostic.receiverId ??
                      s.lastPassDiagnostic.intendedReceiverId ??
                      null,
                  });
                  cReleasedByB ||=
                    s.lastPassDiagnostic.passerId === f.b.id &&
                    (s.lastPassDiagnostic.receiverId ?? s.lastPassDiagnostic.intendedReceiverId) ===
                      f.c.id;
                  if (
                    s.lastPassDiagnostic.passerId === f.b.id &&
                    s.lastPassDiagnostic.intendedReceiverId === f.c.id
                  )
                    continuations.push({
                      contract: outcomeContractSchema.parse({
                        version: 'original-delivery-v3',
                        actorId: f.b.id,
                        receiverId: f.c.id,
                        teamIds: s.players.filter((p) => p.team === f.b.team).map((p) => p.id),
                        opponentIds: s.players.filter((p) => p.team !== f.b.team).map((p) => p.id),
                        requestedAt: s.time,
                        releasedAt: s.lastPassDiagnostic.releasedAt,
                        horizonAt: start + 7,
                        passId: s.lastPassDiagnostic.passId,
                        shotId: null,
                        information: 'privileged_engineering_observer',
                        conditionalOnRelease: true,
                      }),
                      samples: [sampleFact],
                    });
                }
                if (i % 8 === 0 || sampleFact.contacts.length)
                  frames.push({
                    at: s.time,
                    position: { ...c.position },
                    velocity: { ...c.velocity },
                    target: { ...c.target },
                    facing: c.facingAngle,
                    receptionActorId: s.receptionPreparation?.actorId ?? null,
                    ownerId: s.ball.ownerId ?? null,
                    job: job ?? null,
                    contacts: sampleFact.contacts,
                    preparedOptions:
                      s.activePerceptionRuntime?.plans[f.c.id]?.options.map((o) => ({
                        id: o.id,
                        kind: o.kind,
                      })) ?? [],
                    shapeSpread: Math.max(
                      ...s.players
                        .filter((p) => p.team === c.team)
                        .map((p) => distance(p.position, p.neutralAnchor)),
                    ),
                  });
                if (s.restart || s.postGoal) break;
              }
            },
          );
          const outcome = contract ? interpretCanonicalOutcome(contract, samples) : null;
          rows.push({
            sample,
            reading,
            scenario,
            profile,
            initialHash,
            finalHash: hash(s),
            request,
            releaseAt,
            recognisedAt,
            startedAt,
            movementLeadSeconds:
              startedAt !== null && releaseAt !== null ? releaseAt - startedAt : null,
            withdrawnAt,
            costMetres,
            availabilitySeconds,
            firstBControl,
            cSeenByB: candidateMenus ? cSeenByB : null,
            candidateMenus,
            cSelectedByB,
            cReleasedByB,
            outcome,
            nextOutcomes: continuations.map((e) =>
              interpretCanonicalOutcome(e.contract, e.samples),
            ),
            passes,
            decisions,
            frames,
          });
          armCosts.push({
            sample,
            reading,
            scenario,
            profile,
            wallSeconds: (performance.now() - armStart) / 1000,
            cpu: process.cpuUsage(armCpu),
            runtimeBytes: Buffer.byteLength(JSON.stringify(s.activePerceptionRuntime ?? null)),
            saveBytes: Buffer.byteLength(JSON.stringify(s)),
          });
        }
} else if (mode === 'awareness') {
  for (const reading of [20, 85]) {
    const f = createProspectiveFixture({ seed: 'pr203-awareness', reading }),
      s = fObserve(f.state),
      old = s.activePerceptionRuntime.memory[f.c.id].situation,
      scene = observeBoundedScene(s, f.c);
    const remembered = updateSituation(
      { ...scene, at: s.time + 0.7, ball: null, visible: [] },
      old,
    );
    assert.equal(remembered.ball.evidenceAt, old.ball.evidenceAt);
    assert.ok(remembered.ball.uncertainty > old.ball.uncertainty);
    const other = globalThis.structuredClone(s);
    other.ball = {
      ...other.ball,
      x: 100,
      y: 65,
      velocity: { x: 90, y: -60, z: 40 },
      spin: { x: 40, y: 50, z: 60 },
      target: { x: 3, y: 4 },
      ownerId: f.opponent.id,
    };
    assert.deepEqual(
      evaluateProspectivePosition(s, f.c),
      evaluateProspectivePosition(
        other,
        other.players.find((p) => p.id === f.c.id),
      ),
    );
    const direct = updateSituation(
      {
        ...scene,
        at: s.time + 1,
        ball: {
          position: f.opponent.position,
          height: 0.11,
          velocity: { x: 0, y: 0, z: 0 },
          observedAt: s.time + 1,
        },
        visible: [
          {
            ...scene.visible[0],
            id: f.opponent.id,
            team: f.opponent.team,
            position: f.opponent.position,
          },
        ],
      },
      remembered,
    );
    let physical = globalThis.structuredClone(s);
    const physicalFrames = [];
    for (let tick = 0; tick < 48; tick++) {
      if (tick === 12) {
        const c = physical.players.find((p) => p.id === f.c.id);
        c.facingAngle = Math.PI / 2;
        physical.activePerceptionRuntime.memory[f.c.id].gaze = c.facingAngle;
      }
      physical = step(physical, 0.025);
      if (tick % 4 === 0)
        physicalFrames.push({
          at: physical.time,
          situation: physical.activePerceptionRuntime?.memory[f.c.id]?.situation ?? null,
          position: physical.players.find((p) => p.id === f.c.id)?.position ?? null,
        });
    }
    rows.push({
      reading,
      direct: old,
      remembered,
      changed: direct,
      expired: updateSituation({ ...scene, at: s.time + 3.1, ball: null, visible: [] }, remembered),
      hiddenStateA: hash(s.ball),
      hiddenStateB: hash(other.ball),
      sameDecision: hash(evaluateProspectivePosition(s, f.c)),
      physicalFinalHash: hash(physical),
      physicalFrames,
    });
  }
} else if (mode === 'roles') {
  for (const role of ['striker', 'left_winger', 'central_midfielder', 'center_back'])
    for (const profile of profiles) {
      const f = createProspectiveFixture({ seed: `pr203-role-${role}`, role, profile });
      let s = fObserve(f.state);
      const initial = hash(s),
        origin = { ...f.c.position },
        initialJob = s.activePerceptionRuntime?.positions[f.c.id] ?? null;
      for (let i = 0; i < 80; i++) s = step(s, 0.025);
      rows.push({
        role,
        profile,
        initialHash: initial,
        finalHash: hash(s),
        origin,
        position: s.players.find((p) => p.id === f.c.id).position,
        initialJob,
        finalJob: s.activePerceptionRuntime?.positions[f.c.id] ?? null,
      });
    }
} else if (mode === 'reception') {
  const { continueRelease } = await import('./pr198Laboratory.mjs');
  const frozen = JSON.parse(gunzipSync(readFileSync('docs/performance/pr198/releases-v1.json.gz')))
    .result.rows;
  const { withIntegrationProfile } = await import(
    '../src/core/matchSimulation/integrationProfile.ts'
  );
  for (const entry of frozen.filter((e) =>
    ['long_ground', 'long_lofted', 'cross_field'].includes(e.family),
  ))
    for (const profile of [...profiles, 'historical-pr201-local']) {
      const forecasts = [];
      let forecast = null;
      const result = continueRelease(
        entry,
        {},
        (s) =>
          Object.assign(
            s,
            profile === 'historical-pr201-local'
              ? {
                  experimentalDefensiveReception: true,
                  experimentalHeightAwarePassing: true,
                  experimentalReceiverAnticipation: true,
                  experimentalReceiverSynchronisation: false,
                  experimentalCanonicalArrival: false,
                  experimentalBoundedBallFlightBelief: true,
                  boundedReceiverRecovery: 'hold-local-v1',
                }
              : withIntegrationProfile(s, profile),
          ),
        (before, after, sample) => {
          const plan = before.activePerceptionRuntime?.plans[entry.contract.receiverId];
          if (
            !forecast &&
            plan &&
            plan.expectedContactAt - before.time >= 0.5 &&
            plan.expectedContactAt - before.time <= 1.5
          )
            forecast = globalThis.structuredClone(plan);
          if (sample.contacts.some((c) => c.actorId === entry.contract.receiverId) && forecast)
            forecasts.push({ at: sample.at, ball: sample.ball, forecast });
        },
      );
      const contact = forecasts[0],
        direct = result.outcome.directReceiverTouch;
      let residual = null;
      if (contact && direct) {
        const dx = contact.ball.x - contact.forecast.expectedPoint.x,
          dy = contact.ball.y - contact.forecast.expectedPoint.y,
          v = contact.forecast.incomingVelocity,
          d = Math.hypot(v.x, v.y);
        if (d > 0.1)
          residual = {
            stratum: `${entry.family}:0.5-1.5s:observed-incoming`,
            along: (dx * v.x + dy * v.y) / d,
            across: (-dx * v.y + dy * v.x) / d,
            seconds: contact.at - contact.forecast.expectedContactAt,
          };
      }
      rows.push({
        family: entry.family,
        skill: entry.skill,
        sample: entry.sample,
        factor: entry.factor,
        profile,
        initialHash: result.startHash,
        finalHash: result.finalHash,
        outcome: result.outcome,
        firstForecast: forecast,
        residual,
        actualContacts: forecasts.length,
      });
    }
} else throw Error('Unknown PR203 mode');
const fits = [];
if (mode === 'reception')
  for (const stratum of new Set(
    rows
      .filter((r) => r.residual && r.profile === 'prospective-play-v1')
      .map((r) => r.residual.stratum),
  )) {
    const data = rows
        .filter((r) => r.profile === 'prospective-play-v1' && r.residual?.stratum === stratum)
        .map((r) => r.residual),
      split = Math.ceil(data.length * 0.6),
      fit = fitContactRegion(data.slice(0, split)),
      holdout = data.slice(split);
    fits.push({
      stratum,
      trainCount: split,
      holdoutCount: holdout.length,
      fit: fit ?? null,
      level: 1,
      holdoutCovered: fit ? holdout.filter((r) => residualInsideRegion(fit, r, 1)).length : null,
      limitation: 'conditional on observed direct contact; no calibrated predictive probability',
    });
  }
const sourceIdentity = args.has('check')
  ? readEvidence(`${root}/${mode}-${version}.json.gz`).result.source
  : { method: 'full normalized source manifest', manifest: source() };
const result = {
  edition: 'pr204-continuity-development-v1',
  mode,
  rows,
  fits,
  source: sourceIdentity,
  classification: 'development; independent confirmation sealed',
};
const costs = {
  wallSeconds: (performance.now() - started) / 1000,
  cpu: process.cpuUsage(cpu),
  peakRSSKiB: process.resourceUsage().maxRSS,
  node: process.version,
  platform: process.platform,
  serializedResultBytes: Buffer.byteLength(JSON.stringify(result)),
  arms: armCosts,
};
const path = `${root}/${mode}-${version}.json.gz`;
if (args.has('check')) {
  const saved = JSON.parse(gunzipSync(readFileSync(path))).result;
  // Bind football results separately from source inventory additions.
  const { source: _old, ...expected } = saved,
    { source: _new, ...actual } = result;
  void _old;
  void _new;
  assert.equal(hash(actual), hash(expected), 'PR203 exact result/state drift');
} else {
  mkdirSync(root, { recursive: true });
  assert.ok(!existsSync(path), 'Refuse evidence overwrite');
  writeFileSync(path, gzipSync(JSON.stringify({ result, costs }) + '\n', { level: 9 }), {
    flag: 'wx',
  });
}
console.log(
  'PR204',
  mode,
  rows.length,
  hash(result),
  JSON.stringify({ wallSeconds: costs.wallSeconds, cpu: costs.cpu, peakRSSKiB: costs.peakRSSKiB }),
);
