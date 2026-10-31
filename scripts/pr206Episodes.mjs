import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { createProspectiveFixture } from '../src/core/matchSimulation/prospectivePlayLaboratory.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { advanceActivePerception } from '../src/core/matchSimulation/activePerception.ts';
import { advanceLiveBallFlight } from '../src/core/matchSimulation/liveBallFlight.ts';
import { advanceReceivingPositions } from '../src/core/matchSimulation/receivingPositions.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import {
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
  outcomeContractSchema,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { hash } from './pr199Evidence.mjs';

export const episodeConfigSchema = z.object({
  seed: z.string(),
  geometry: z.number().int().min(0).max(2).default(0),
  reading: z.number().default(85),
  touch: z.number().default(55),
  scenario: z
    .enum(['open', 'late', 'unseen_ball', 'unseen_C', 'marked', 'wrong', 'withdrawn', 'ablation'])
    .default('open'),
  duration: z.number().positive().default(7),
  controlledB: z.boolean().default(false),
  family: z
    .enum(['support', 'long_ground', 'fast_ground', 'descending', 'moving', 'lateral', 'pressure'])
    .default('support'),
});
export const fixture = (input) => {
  const config = episodeConfigSchema.parse(input),
    f = createProspectiveFixture({ seed: config.seed, reading: config.reading });
  f.state.prospectiveMovement = 'observed-ball-contact-dev-v1';
  delete f.state.integrationProfile;
  f.c.profile.attributes.firstTouch = config.touch;
  // Independent spatial inputs, not repeated frames; retain full roster/attributes.
  const [dx, dy] = [
    [0, 0],
    [-3, -2],
    [2, 3],
  ][config.geometry];
  for (const p of [f.a, f.b, f.c, f.opponent])
    for (const key of ['position', 'target', 'anchor', 'neutralAnchor'])
      p[key] = { x: p[key].x + dx, y: p[key].y + dy };
  f.state.ball.x += dx;
  f.state.ball.y += dy;
  if (config.geometry === 2) {
    f.b.position.y -= 2;
    f.b.target = { ...f.b.position };
    f.b.anchor = { ...f.b.position };
    f.b.neutralAnchor = { ...f.b.position };
  }
  if (config.family === 'long_ground')
    for (const p of [f.c, f.opponent])
      for (const key of ['position', 'target', 'anchor', 'neutralAnchor'])
        p[key] = { x: p[key].x + 8, y: p[key].y };
  if (config.family === 'moving') f.c.velocity = { x: 2, y: -1 };
  if (config.family === 'pressure') {
    f.opponent.position = { x: f.c.position.x + 5, y: f.c.position.y - 2 };
    f.opponent.target = { ...f.c.position };
    f.opponent.anchor = { ...f.opponent.position };
    f.opponent.neutralAnchor = { ...f.opponent.position };
  }
  if (config.scenario === 'marked')
    f.opponent.position = { x: f.c.position.x + 4, y: f.c.position.y - 4 };
  const alternative = f.state.players.find(
    (p) =>
      p.team === f.a.team &&
      ![f.a.id, f.b.id, f.c.id].includes(p.id) &&
      p.slot.position !== 'goalkeeper',
  );
  if (config.scenario === 'wrong')
    for (const key of ['position', 'target', 'anchor', 'neutralAnchor'])
      alternative[key] = { x: f.a.position.x + 6, y: f.a.position.y + 8 };
  return { ...f, config, alternative };
};

export const body = (p) => ({
  position: p.position,
  velocity: p.velocity,
  facing: p.facingAngle,
  target: p.target,
  plantBalance: p.plantBalance ?? null,
});
export const makeContract = (before, after, receiverId, horizonAt) =>
  outcomeContractSchema.parse({
    version: 'original-delivery-v3',
    actorId: after.lastPassDiagnostic.passerId,
    receiverId,
    teamIds: before.players.filter((p) => p.team === before.possessionTeam).map((p) => p.id),
    opponentIds: before.players.filter((p) => p.team !== before.possessionTeam).map((p) => p.id),
    requestedAt: before.time,
    releasedAt: after.lastPassDiagnostic.releasedAt,
    horizonAt,
    passId: after.lastPassDiagnostic.passId,
    shotId: null,
    information: 'privileged_engineering_observer',
    conditionalOnRelease: true,
  });

export function runEpisode(input, { retainStates = false, onTick } = {}) {
  const f = fixture(input),
    { config } = f,
    start = f.state.time;
  globalThis.__pr204MovementTrace = { actorId: f.c.id, records: [] };
  globalThis.__pr206Deprivation =
    config.scenario === 'ablation'
      ? { noSupportId: f.c.id }
      : config.scenario === 'unseen_C'
        ? { observerId: f.b.id, unseenId: f.c.id }
        : undefined;
  if (config.scenario === 'unseen_ball')
    globalThis.__pr204VisionGate = { actorId: f.c.id, until: start + config.duration + 1 };
  let s = advanceReceivingPositions(advanceActivePerception(advanceLiveBallFlight(f.state)));
  const initialHash = hash(s),
    initialBody = body(f.c),
    states = new Map(),
    frames = [],
    commands = [],
    decisions = [],
    passes = [],
    requests = [],
    events = [],
    episodes = [];
  const clocks = {
    firstObservation: s.liveBallFlightRuntime?.sensors[f.c.id]?.optical?.at ?? null,
    intention: null,
    scheduledRecognition: null,
    recognition: null,
    command: null,
    physicalOnset: null,
    aRelease: null,
    bContact: null,
    bControl: null,
    bDecision: null,
    bRelease: null,
    cContact: null,
    cControl: null,
    withdrawal: null,
  };
  let witness = null,
    requested = false;
  globalThis.__pr206Command = (t) => {
    if (t.actorId === f.c.id) witness = t;
  };
  const record = () => {
    const p = s.players.find((p) => p.id === f.c.id),
      sensor = s.liveBallFlightRuntime?.sensors[p.id],
      memory = s.activePerceptionRuntime?.memory[p.id],
      job = s.activePerceptionRuntime?.positions[p.id];
    if (clocks.firstObservation === null && sensor?.optical)
      clocks.firstObservation = sensor.optical.at;
    if (job?.prospective && job.prospective.status !== 'withdrawn') {
      clocks.intention ??= job.prospective.createdAt;
      clocks.scheduledRecognition ??= job.prospective.recognisedAt;
      if (s.time + 1e-8 >= job.prospective.recognisedAt) clocks.recognition ??= s.time;
    }
    if (job?.prospective?.status === 'withdrawn') clocks.withdrawal ??= s.time;
    const frame = {
      at: s.time,
      ...body(p),
      sensor: sensor ?? null,
      situation: memory?.situation ?? null,
      job: job ?? null,
      plan: s.activePerceptionRuntime?.plans[p.id] ?? null,
      ball: s.ball,
    };
    frames.push(frame);
    if (retainStates) states.set(Math.round((s.time - start) * 40), globalThis.structuredClone(s));
  };
  record();
  try {
    withBoundedObserver(
      (t) => {
        if (t.stage !== 'decision' || ![f.b.id, f.c.id].includes(t.actorId)) return;
        decisions.push(t);
        if (t.actorId === f.b.id) clocks.bDecision ??= t.at;
      },
      () => {
        for (let tick = 0; tick < Math.round(config.duration * 40); tick++) {
          if (
            !requested &&
            s.time - start >=
              (config.scenario === 'late' ? 0.15 : config.scenario === 'withdrawn' ? 2.5 : 0.9) -
                1e-7
          ) {
            requested = true;
            const predicted =
              s.activePerceptionRuntime?.positions[f.c.id]?.prospective?.intermediaryId;
            const recipient =
              config.scenario === 'wrong'
                ? predicted === f.b.id
                  ? f.alternative.id
                  : f.b.id
                : f.b.id;
            const receiver = s.players.find((p) => p.id === recipient);
            requests.push({
              at: s.time,
              predictedIntermediary: predicted ?? null,
              receiverId: receiver.id,
            });
            if (config.scenario === 'wrong')
              assert.notEqual(
                receiver.id,
                predicted,
                'Wrong-recipient control must actually contradict the intention',
              );
            const before = s;
            s = resolveMatchAction(
              s,
              {
                type: 'pass',
                actorId: f.a.id,
                receiverId: receiver.id,
                target: { ...receiver.position },
                intent: 'support',
                delivery: 'ground',
              },
              'human_selected',
            );
            if (s.lastPassDiagnostic?.passId !== before.lastPassDiagnostic?.passId) {
              clocks.aRelease = s.lastPassDiagnostic.releasedAt;
              passes.push({ at: s.time, diagnostic: s.lastPassDiagnostic, ball: s.ball });
              episodes.push({
                contract: makeContract(before, s, receiver.id, start + config.duration),
                samples: [sampleCanonicalOutcome(before, s, 'original-delivery-v3')],
              });
            }
            if (config.controlledB) s = { ...s, controlledFootballerId: f.b.id };
          }
          const before = s;
          witness = null;
          s = step(s, 0.025);
          const movements = globalThis.__pr204MovementTrace.records.splice(0);
          const movement = movements[0];
          if (witness && movement) {
            commands.push({ ...witness, ...movement });
            if (witness.prospectiveMotor) {
              clocks.command ??= witness.at;
              if (
                distance(movement.velocityBefore, movement.velocityAfter) > 1e-9 ||
                Math.abs(movement.facingAfter - movement.facingBefore) > 1e-9
              )
                clocks.physicalOnset ??= s.time;
            }
          }
          const fact = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
          for (const ep of episodes) ep.samples.push(fact);
          if (fact.contacts.length) {
            events.push({
              at: s.time,
              contacts: fact.contacts,
              ground: s.lastGroundContact ?? null,
              body: s.lastBallContact ?? null,
              beforeBall: before.ball,
              ball: s.ball,
              preContactC: body(before.players.find((p) => p.id === f.c.id)),
              continuous: before.continuousBodyContacts ?? [],
            });
            if (fact.contacts.some((c) => c.actorId === f.b.id)) clocks.bContact ??= s.time;
            if (fact.contacts.some((c) => c.actorId === f.c.id)) clocks.cContact ??= s.time;
          }
          if (s.ball.ownerId === f.b.id) clocks.bControl ??= s.time;
          if (s.ball.ownerId === f.c.id) clocks.cControl ??= s.time;
          if (s.lastPassDiagnostic?.passId !== before.lastPassDiagnostic?.passId) {
            passes.push({ at: s.time, diagnostic: s.lastPassDiagnostic, ball: s.ball });
            if (s.lastPassDiagnostic?.passerId === f.a.id)
              clocks.aRelease ??= s.lastPassDiagnostic.releasedAt;
            if (s.lastPassDiagnostic?.passerId === f.b.id) {
              clocks.bRelease ??= s.lastPassDiagnostic.releasedAt;
              episodes.push({
                contract: makeContract(
                  before,
                  s,
                  s.lastPassDiagnostic.intendedReceiverId,
                  start + config.duration,
                ),
                samples: [fact],
              });
            }
          }
          record();
          onTick?.({ before, state: s, f, tick });
          if (s.restart || s.postGoal) break;
        }
      },
    );
  } finally {
    delete globalThis.__pr206Command;
    delete globalThis.__pr204MovementTrace;
    delete globalThis.__pr204VisionGate;
    delete globalThis.__pr206Deprivation;
  }
  const qualifies =
    clocks.aRelease !== null &&
    clocks.recognition !== null &&
    clocks.command !== null &&
    clocks.physicalOnset !== null &&
    clocks.aRelease - clocks.recognition >= 0.05 - 1e-7 &&
    clocks.aRelease - clocks.command >= 0.05 - 1e-7 &&
    clocks.physicalOnset <= clocks.aRelease;
  assert.ok(!qualifies || clocks.firstObservation <= clocks.intention);
  const row = {
    config,
    ids: { a: f.a.id, b: f.b.id, c: f.c.id },
    initialHash,
    initialBody,
    clocks,
    qualifies,
    frames,
    commands,
    decisions,
    passes,
    requests,
    events,
    outcomes: episodes.map((e) => ({
      contract: e.contract,
      outcome: interpretCanonicalOutcome(e.contract, e.samples),
    })),
    finalHash: hash(s),
    saveBytes: Buffer.byteLength(JSON.stringify(s)),
  };
  return { row, states, final: s, f };
}
