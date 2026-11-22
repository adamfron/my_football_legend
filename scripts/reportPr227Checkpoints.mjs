import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { gunzipSync, gzipSync } from 'node:zlib';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { captureReceptionStep } from '../src/core/matchSimulation/receptionTrace.ts';
import { FOOT_CONTACT_PHYSICS } from '../src/core/matchSimulation/footContact.ts';
import { projectArticulatedBody } from '../src/core/matchSimulation/articulatedBody.ts';
import {
  composedContactSurface,
  composedLegGap,
} from '../src/core/matchSimulation/composedLegContact.ts';
import { stepPairCompression } from './pr227Compliance.ts';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readNative = (name) => {
  const path = `docs/performance/pr226-${name}-checkpoint.json.gz`;
  const bytes = readFileSync(path);
  const state = tacticalMatchStateSchema.parse(JSON.parse(gunzipSync(bytes)));
  return { state, source: { path, sha256: hash(bytes) } };
};
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const trace = (input) => {
  const observed = captureReceptionStep(() => stepTacticalMatch(input, 0.025), {
    mechanics: true,
    contactWork: true,
  });
  const find = (suffix) => observed.events.filter((event) => event.source.endsWith(suffix));
  const race = find('intervalRace').map(({ detail: d }) => ({
    elapsed: d.elapsed,
    next: d.event?.kind ?? 'clear',
    startsIn: d.event?.at,
    actor: d.event?.playerId,
    ball: d.ball,
    footSupports: d.feet,
    bodySupports: d.bodySupports,
  }));
  const work = find('composedLimbWork').map(({ detail, actorId }) => ({ actorId, ...detail }));
  const searches = find('composedLegSearch');
  const attemptedLoads = find('rebasePlayer').flatMap(({ actorId, detail }) => {
    const load = detail.after.articulatedStance?.dynamicBalance?.lastLoad;
    if (load?.source !== 'ball') return [];
    return [
      {
        actorId,
        load,
        rootBefore: detail.before.position,
        rootAfter: detail.end.position,
        velocityBefore: detail.before.velocity,
        velocityAfter: detail.after.velocity,
        support: detail.end.articulatedStance?.support,
      },
    ];
  });
  const support = find('committedSupport').map(({ at, detail }) => ({
    at,
    duration: detail.seconds,
    free: detail.freeFlight.position,
    supported: detail.withSupport.position,
    surfaces: detail.surfaces,
  }));
  const result = {
    time: observed.state.time,
    halt: observed.state.safetyHalt ?? null,
    owner: observed.state.ball.ownerId ?? null,
    ball: observed.state.ball,
    refereeChanged: JSON.stringify(observed.state.discipline) !== JSON.stringify(input.discipline),
    calls: searches.length,
    samples: searches.reduce((n, e) => n + e.detail.geometrySamples, 0),
    race,
    work,
    attemptedLoads,
    support,
  };
  if (!input.experimentalDynamicBalance) return result;
  const end = observed.state;
  const ball = { x: end.ball.x, y: end.ball.y, z: end.ball.height ?? 0.11 };
  const rebases = find('rebasePlayer');
  const resolvedPairs = work.filter((entry) => entry.solver === 'opposing_limbs');
  const separation = end.safetyHalt
    ? []
    : resolvedPairs.flatMap((entry) =>
        entry.account.surfaces.map((surface) => {
          const player = end.players.find((p) => p.id === surface.actorId);
          const proxy = composedContactSurface(surface.leg);
          const body = projectArticulatedBody(end, player);
          const rebase = rebases.find(
            ({ actorId, at }) =>
              actorId === surface.actorId && Math.abs(at - (input.time + entry.atInTick)) <= 1e-10,
          )?.detail;
          const swingYield = rebase?.swingYield;
          const unyielded =
            swingYield &&
            projectArticulatedBody(end, {
              ...player,
              articulatedStance: {
                ...player.articulatedStance,
                [swingYield.foot]: rebase.nominalEnd.articulatedStance[swingYield.foot],
              },
            });
          return {
            actorId: surface.actorId,
            proxy,
            endpointGap: body && composedLegGap(body.geometry, proxy, ball),
            ...(swingYield
              ? {
                  swingYield,
                  unyieldedEndpointGap:
                    unyielded && composedLegGap(unyielded.geometry, proxy, ball),
                }
              : {}),
          };
        }),
      );
  let continuation = end;
  for (let i = 0; i < 12 && !continuation.safetyHalt; i++)
    continuation = stepTacticalMatch(continuation, 0.025);
  return {
    ...result,
    maxSamplesPerSearch: Math.max(0, ...searches.map(({ detail }) => detail.geometrySamples)),
    separation,
    continuation: {
      time: continuation.time,
      halt: continuation.safetyHalt ?? null,
      owner: continuation.ball.ownerId ?? null,
    },
  };
};

const cases = ['late-shin-pinch', 'ground-graze', 'knee-thigh'].map((name) => {
  const { state, source } = readNative(name);
  const F = trace(state);
  const G = trace({ ...state, experimentalDynamicBalance: 'dynamic-balance-dev-v1' });
  const involved = new Set(F.work.flatMap((entry) => entry.account.surfaces.map((s) => s.actorId)));
  return {
    name,
    source,
    time: state.time,
    ball: state.ball,
    nextAction: state.currentAction,
    movement: state.players
      .filter((p) => involved.has(p.id))
      .map((p) => ({
        id: p.id,
        position: p.position,
        velocity: p.velocity,
        stance: p.articulatedStance,
        movementMode: p.movementMode,
        intent: p.locomotionReason,
        targetSpeed: p.targetSpeed,
      })),
    F,
    G,
  };
});

const joint = cases[2].F.work.find((e) => e.solver === 'opposing_limbs');
assert.ok(joint);
const [a, b] = joint.account.surfaces;
const { state: kneeThigh } = readNative('knee-thigh');
const inverseMass = (surface) =>
  1 / kneeThigh.players.find((p) => p.id === surface.actorId).profile.weightKg;
const inverseBall = 1 / FOOT_CONTACT_PHYSICS.mass;
const mobility = {
  a: inverseBall + inverseMass(a),
  b: inverseBall + inverseMass(b),
  cross: inverseBall * dot(a.normal, b.normal),
};
const compliance = [10000, 20000, 40000].map((stiffness) => {
  const material = { stiffness, damping: 30, maximumDepth: 0.025 };
  let sample = { depth: [0, 0], closure: [-a.incomingNormal, -b.incomingNormal] };
  let maximumDepth = 0,
    maximumStored = 0,
    dissipation = 0,
    kineticChange = 0,
    supported = true;
  for (let i = 0; i < 40 && supported; i++) {
    sample = stepPairCompression(sample, mobility, 0.001, material);
    maximumDepth = Math.max(maximumDepth, ...sample.depth);
    maximumStored = Math.max(maximumStored, sample.stored);
    dissipation += sample.dissipated;
    kineticChange += sample.kineticChange;
    supported = sample.supported;
  }
  return {
    material,
    maximumDepth,
    maximumStored,
    dissipation,
    supported,
    residual: kineticChange + sample.stored + dissipation,
    final: sample,
  };
});

const original = JSON.parse(gunzipSync(readFileSync('docs/performance/pr227-checkpoints.json.gz')));
assert.equal(
  hash(JSON.stringify(cases.map(({ F }) => F))),
  hash(JSON.stringify(original.cases.map(({ F }) => F))),
  'Original F work and contact traces changed',
);
const archive = 'docs/performance/pr227-contact-refinement.json.gz';
const serialized = JSON.stringify({ cases, compliance });
if (process.argv.includes('--record')) writeFileSync(archive, gzipSync(serialized));
else if (process.argv.includes('--check'))
  assert.equal(gunzipSync(readFileSync(archive)).toString(), serialized);
else process.stdout.write(serialized + '\n');
