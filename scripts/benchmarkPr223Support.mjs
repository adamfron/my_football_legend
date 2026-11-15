import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
  advanceArticulatedStance,
  reanchorArticulatedSpawn,
} from '../src/core/matchSimulation/articulatedGait.ts';
import { projectArticulatedBody } from '../src/core/matchSimulation/articulatedBody.ts';
import {
  ballBodyClearance,
  supportContinuousBodyContacts,
} from '../src/core/matchSimulation/ballContactResolution.ts';
import { BALL_RADIUS } from '../src/core/matchSimulation/ballFlight.ts';
import { BALL_PHYSICS, integrateBallFlight } from '../src/core/matchSimulation/ballPhysics.ts';
import { FOOT_CONTACT_PHYSICS } from '../src/core/matchSimulation/footContact.ts';
import { deriveLowerBodyGeometry } from '../src/core/matchSimulation/lowerBodyGeometry.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { captureReceptionStep } from '../src/core/matchSimulation/receptionTrace.ts';
import { createTrial, editions, scenes } from './benchmarkPr221Reception.mjs';
import { matchInput, matchSeeds, observe } from './benchmarkPr222Reception.mjs';

const baseline = '6faedb7b935a3c81169d5b8753640fcc2d160527';
const archived = 'b1eb83755e85d85cb5efc14f0399134158825da6';
const historicFile = 'docs/performance/pr222/reception.json.gz';
const output = 'docs/performance/pr223/post-impact.json.gz';
const smokeOutput = 'docs/performance/pr223/smoke.json.gz';
const scene = scenes.find(({ id }) => id === 'pressure');
const { input, receiver } = createTrial(scene, 'pr219-a', 60);
const challenger = input.players.find(
  (p) =>
    p.team !== input.players.find((q) => q.id === receiver).team &&
    p.position.x === 40.4 &&
    p.position.y === 34.55,
).id;
const dt = 0.025;
const { mass, inertia } = FOOT_CONTACT_PHYSICS;
const candidate = { experimentalPostImpactStance: 'parked-stance-remainder-dev-v1' };
const hash = (data) => createHash('sha256').update(data).digest('hex');
const digest = (value) => hash(JSON.stringify(value));
const reload = (state) => tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(state)));
const sortedDigest = (value) =>
  hash(
    JSON.stringify(value, (_key, entry) =>
      entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.fromEntries(
            Object.keys(entry)
              .sort()
              .map((key) => [key, entry[key]]),
          )
        : entry,
    ),
  );
const zero = { x: 0, y: 0, z: 0 };
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: (a.z ?? 0) + (b.z ?? 0) });
const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a) => Math.hypot(a.x, a.y, a.z);
const normalized = (a) => scale(a, 1 / length(a));
const energy = (v, m = mass) => 0.5 * m * dot(v, v);
const close = (a, b, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) <= tolerance, [a, b].join(' vs '));

function pose(p) {
  const lower = deriveLowerBodyGeometry(p);
  const limb = ({ hip, knee, ankle, foot, kneeFlexion, thighLength, shinLength }) => ({
    hip,
    knee,
    ankle,
    foot,
    kneeFlexion,
    thighLength,
    shinLength,
  });
  return {
    root: p.position,
    velocity: p.velocity,
    facing: p.facingAngle,
    target: { x: p.target.x, y: p.target.y },
    stance: p.articulatedStance,
    lowerBodyPose: p.lowerBodyPose,
    balance: p.plantBalance,
    joints: { left: limb(lower.left), right: limb(lower.right) },
  };
}

function mechanics(events) {
  const contact = events.find(
    (e) =>
      e.source === 'pendingStrikeInterval.contactRace' &&
      e.actorId === receiver &&
      e.detail.kind === 'foot',
  );
  const impacts = events
    .filter((e) => e.source === 'pendingStrikeInterval.resolveMultiBodyContact')
    .flatMap((e) =>
      e.detail.contacts.filter((c) => c.kind === 'impact' && c.participants.includes(receiver)),
    );
  const impact = impacts.find((c) => c.participants.includes(challenger));
  if (!impact || !contact || impact.at < contact.at) return { impacts };
  const rebase = events.find(
    (e) =>
      e.actorId === receiver &&
      e.at === impact.at &&
      e.source === 'pendingStrikeInterval.rebasePlayer',
  )?.detail;
  const support = events.find(
    (e) =>
      e.actorId === receiver &&
      e.at === impact.at &&
      e.source === 'pendingStrikeInterval.committedSupport' &&
      e.detail.surfaces.length,
  )?.detail;
  if (!rebase || !support) return { impacts };
  const nominalFoot = deriveLowerBodyGeometry({ ...rebase.end, articulatedStance: undefined });
  const startPose = pose(rebase.before),
    endPose = pose(rebase.end);
  const jointRates = Object.fromEntries(
    ['left', 'right'].map((foot) => {
      const a = startPose.joints[foot],
        b = endPose.joints[foot];
      return [
        foot,
        {
          kneeFlexionRadiansPerSecond: (b.kneeFlexion - a.kneeFlexion) / support.seconds,
          hipVelocity: scale(sub(b.hip, a.hip), 1 / support.seconds),
          kneeVelocity: scale(sub(b.knee, a.knee), 1 / support.seconds),
          ankleVelocity: scale(sub(b.ankle, a.ankle), 1 / support.seconds),
        },
      ];
    }),
  );
  return {
    impacts,
    at: impact.at,
    seconds: support.seconds,
    segmentOrigin: pose(rebase.segmentOrigin),
    before: startPose,
    after: pose(rebase.after),
    nominalEnd: pose(rebase.nominalEnd),
    end: endPose,
    rootTravel: sub(endPose.root, startPose.root),
    rightTravel: sub(endPose.stance.right, startPose.stance.right),
    leftTravel: sub(endPose.stance.left, startPose.stance.left),
    jointRates,
    activeFoot: rebase.activeFoot ?? null,
    recovery: rebase.recovery ?? [],
    parkedRemainder: rebase.parkedRemainder,
    nominalAfterRebase: { left: nominalFoot.left.foot, right: nominalFoot.right.foot },
    rebaseWithRestClock: advanceArticulatedStance(
      {
        ...rebase.after,
        articulatedStance: { ...rebase.after.articulatedStance, elapsed: 0 },
      },
      rebase.end,
      rebase.seconds,
      rebase.activeFoot,
    ),
    support,
  };
}

function account({ seconds, ball, freeFlight, withSupport, surfaces }) {
  assert.equal(surfaces.length, 1);
  const surface = surfaces[0];
  const surfaceVelocity = scale(sub(surface.centre, surface.previousCentre), 1 / seconds);
  const projection = sub(withSupport.position, freeFlight.position);
  const normal = normalized(projection);
  const relativeIn = dot(sub(freeFlight.velocity, surfaceVelocity), normal);
  const relativeOut = dot(sub(withSupport.velocity, surfaceVelocity), normal);
  const impulse = scale(sub(withSupport.velocity, freeFlight.velocity), mass);
  const j = dot(impulse, normal);
  const work = dot(impulse, surfaceVelocity);
  const dissipated = -0.5 * j * relativeIn;
  const before = energy(ball.velocity);
  const flight = energy(freeFlight.velocity);
  const after = energy(withSupport.velocity);
  const potential = mass * BALL_PHYSICS.gravity * projection.z;
  close(length(sub(impulse, scale(normal, j))), 0);
  close(relativeOut, 0);
  close(after - flight, work - dissipated);
  return {
    startClearance: ballBodyClearance(ball.position, {
      ...surface,
      centre: surface.previousCentre,
    }),
    freeEndClearance: ballBodyClearance(freeFlight.position, surface),
    supportedEndClearance: ballBodyClearance(withSupport.position, surface),
    normal,
    surfaceVelocity,
    relativeIn,
    relativeOut,
    projection,
    impulse,
    j,
    tangentImpulse: sub(impulse, scale(normal, j)),
    translational: { before, flight, after },
    rotational: {
      before: energy(ball.spin ?? zero, inertia),
      after: energy(withSupport.spin ?? zero, inertia),
    },
    work,
    dissipated,
    potentialFromProjection: potential,
    kineticResidual: after - flight - work + dissipated,
  };
}

// Resample one committed physical surface history. This calls the live contact
// and flight kernels and deliberately holds body events and the boot chord fixed.
function repartition({ ball, seconds, environment, surfaces }, parts) {
  const steps = [];
  let integrated = ball;
  for (let i = 0; i < parts; i++) {
    const candidates = surfaces.map((surface) => {
      const delta = sub(surface.centre, surface.previousCentre);
      return {
        ...surface,
        previousCentre: add(surface.previousCentre, scale(delta, i / parts)),
        centre: add(surface.previousCentre, scale(delta, (i + 1) / parts)),
      };
    });
    const flight = integrateBallFlight(integrated, seconds / parts, environment);
    integrated = {
      ...flight,
      ...supportContinuousBodyContacts(
        flight.position,
        flight.velocity,
        candidates,
        seconds / parts,
      ),
    };
    steps.push({ flight, integrated });
  }
  return {
    parts,
    position: integrated.position,
    velocity: integrated.velocity,
    speed: length(integrated.velocity),
    supportCorrections: steps.filter(
      (s) => length(sub(s.integrated.position, s.flight.position)) > 1e-8,
    ).length,
    velocityResponses: steps.filter(
      (s) => length(sub(s.integrated.velocity, s.flight.velocity)) > 1e-8,
    ).length,
    firstEnd: steps[0].integrated,
  };
}

function run(initial, ticks = 64) {
  const rows = [];
  const events = [];
  let state = reload(initial);
  const source = digest(state);
  for (let i = 0; i < ticks; i++) {
    const before = state;
    const stepped = captureReceptionStep(() => stepTacticalMatch(before, dt), {
      mechanics: i < 24,
    });
    state = stepped.state;
    assert.deepEqual(state, stepTacticalMatch(before, dt), 'observer is neutral');
    // Round-trip the two sides of the body/contact tick as well as the remaining prefix.
    if (i < 24)
      assert.equal(
        sortedDigest(reload(stepTacticalMatch(reload(before), dt))),
        sortedDigest(reload(state)),
      );
    assert.equal(state.safetyHalt, undefined);
    const ground =
      state.lastGroundContact !== before.lastGroundContact ? state.lastGroundContact : undefined;
    const strike =
      state.lastStrikeResolution !== before.lastStrikeResolution
        ? state.lastStrikeResolution
        : undefined;
    const action = state.decisionIndex !== before.decisionIndex ? state.currentAction : undefined;
    rows.push({
      at: state.time,
      owner: state.ball.ownerId ?? null,
      hash: digest(state),
      serialized: i === 23 ? digest(reload(state)) : undefined,
      ground,
      strike,
      action,
      loss: state.pendingPossessionLoss,
      phase: state.ball.travelKind ?? (state.ball.ownerId ? 'owned' : 'loose'),
    });
    events.push(...stepped.events);
  }
  const timeline = rows
    .filter((row, i) => row.owner !== (rows[i - 1]?.owner ?? null))
    .map(({ at, owner, ground, loss }) => ({ at, owner, eventAt: ground?.at ?? loss?.at ?? null }));
  const first = rows.find(
    (r) => r.ground?.actorId === receiver && r.ground.retained && r.ground.executed,
  )?.ground;
  const control = rows.find((r) => r.owner === receiver && r.at >= (first?.at ?? Infinity));
  const loss = control && rows.find((r) => r.at > control.at && r.owner !== receiver);
  const milestone = first && rows.find((r) => r.at >= first.at + 0.6);
  const second =
    first &&
    rows.find(
      (r) =>
        r.at > control?.at &&
        r.at <= (loss?.at ?? Infinity) &&
        r.ground?.actorId === receiver &&
        r.ground.executed &&
        r.ground.retained,
    )?.ground;
  const release =
    first &&
    rows.find(
      (r) =>
        r.at > first.at &&
        r.at <= (loss?.at ?? Infinity) &&
        r.strike?.actorId === receiver &&
        r.strike.outcome === 'contact',
    )?.strike;
  const selection =
    control &&
    rows.find(
      (r) =>
        r.at >= control.at &&
        r.at <= (loss?.at ?? Infinity) &&
        r.action?.actorId === receiver &&
        ['carry', 'pass', 'shot'].includes(r.action.type),
    );
  const reach = events.filter(
    (e) => e.actorId === receiver && e.source === 'ballContactGeometry.advanceControlledBall',
  );
  const failedReach = reach.find((e) => !e.detail.reachable && e.at >= (first?.at ?? Infinity));
  const dueReachFailure = reach.find(
    (e) =>
      !e.detail.reachable &&
      e.at >= Math.max(e.detail.motorReadyAt, e.detail.nextContact?.earliestAt ?? Infinity),
  );
  const secondIntersection =
    second &&
    events.find(
      (e) =>
        e.source === 'pendingStrikeInterval.contactRace' &&
        e.actorId === receiver &&
        Math.abs(e.at - second.at) < 1e-8,
    );
  const intents = events.filter(
    (e) =>
      e.actorId === receiver &&
      e.source === 'matchSimulation.integrateCanonicalMovement' &&
      e.at >= (first?.at ?? Infinity),
  );
  return {
    source,
    prefix: rows.slice(0, 24).map((r) => r.hash),
    prefixTerminal: rows[23].serialized,
    terminal: digest(reload(state)),
    normalizedTerminal: sortedDigest(reload(state)),
    control: control && { at: first.at, first, terminalOwner: state.ball.ownerId ?? null },
    loss: loss && {
      at: loss.at,
      cause: loss.loss?.cause ?? null,
      owner: loss.owner,
      winningContact:
        loss.owner !== null && loss.ground?.actorId === loss.owner ? loss.ground : null,
    },
    sampledContinuous600: milestone && control ? !loss || loss.at > milestone.at : null,
    atControl600: milestone && { at: milestone.at, owner: milestone.owner, phase: milestone.phase },
    second: second ?? null,
    secondIntersection: secondIntersection?.detail.hit ?? null,
    release: release && { at: release.at, id: release.id },
    selection: selection && { at: selection.at, action: selection.action },
    firstReacquisition: loss
      ? (timeline.find((row) => row.at > loss.at && row.owner === receiver)?.at ?? null)
      : null,
    sampledOwnershipTransitions: timeline,
    failedReach: failedReach && { at: failedReach.at, nextContact: failedReach.detail.nextContact },
    dueReachFailure: dueReachFailure && {
      at: dueReachFailure.at,
      nextContact: dueReachFailure.detail.nextContact,
    },
    movement: intents.length
      ? [
          intents[0],
          ...intents.filter((e, i) => i > 0 && e.detail.reason !== intents[i - 1].detail.reason),
        ]
      : [],
    mechanics: mechanics(events),
  };
}

const original = JSON.parse(gunzipSync(readFileSync(historicFile)));
const arms = Object.fromEntries(
  Object.entries(editions).map(([arm, edition]) => {
    const row = run({ ...input, experimentalReceptionPreparation: edition });
    for (const ticks of [24, 64]) {
      const prior = original.laboratory.find((r) => r.id === 'pressure' && r.ticks === ticks).arms[
        arm
      ];
      assert.equal(row.source, prior.initial);
      assert.equal(ticks === 24 ? row.prefixTerminal : row.terminal, prior.terminal);
      assert.deepEqual(row.prefix, prior.hashes.slice(0, 24));
      if (ticks === 64) assert.equal(row.normalizedTerminal, prior.terminalCanonical);
    }
    return [arm, row];
  }),
);
const witness = arms.C.mechanics;
const paired = run({ ...input, experimentalReceptionPreparation: editions.C, ...candidate });
assert.deepEqual(paired.control?.first, arms.C.control?.first);
assert.deepEqual(paired.mechanics.impacts[0], witness.impacts[0]);
assert.equal(paired.mechanics.parkedRemainder, true);
assert.deepEqual(paired.mechanics.rightTravel, zero);
assert.deepEqual(paired.mechanics.leftTravel, zero);
assert.deepEqual(paired.mechanics.rootTravel, witness.rootTravel);
assert.deepEqual(paired.mechanics.support.withSupport, paired.mechanics.support.freeFlight);
assert.equal(paired.loss?.owner, challenger);
assert.equal(paired.second, null);
const { support } = witness;
const repartitions = [1, 2, 4, 8, 16, 32, 64, 128].map((n) => repartition(support, n));
close(length(sub(repartitions[0].velocity, support.withSupport.velocity)), 0);

const approaches = [
  { id: 'lighter', dy: -0.11, velocity: { x: 0, y: -1.6 } },
  { id: 'lighter-late', dy: -0.08, velocity: { x: 0, y: -2 } },
  { id: 'stronger', dy: 0.21, velocity: { x: 0, y: -5.4 } },
  { id: 'earlier', dy: -0.09, velocity: { x: 0, y: -3 } },
  { id: 'other-side', x: 40.4, y: 33.45, facingAngle: 0, velocity: { x: 0, y: 3 } },
  { id: 'delayed-approach', x: 40.05, velocity: { x: 0, y: -3 } },
  { id: 'wide-approach', x: 38.7, velocity: { x: 0, y: -3 } },
  { id: 'no-impact', x: 35, velocity: { x: 0, y: -3 } },
];
const counterfactuals = approaches.map(({ id, x, y, dy, velocity, facingAngle }) => {
  const alternate = {
    ...input,
    players: input.players.map((p) =>
      p.id !== challenger
        ? p
        : reanchorArticulatedSpawn({
            ...p,
            facingAngle: facingAngle ?? p.facingAngle,
            velocity,
            position: { x: x ?? p.position.x, y: y ?? p.position.y + (dy ?? 0) },
          }),
    ),
  };
  const scene = { ...alternate, experimentalReceptionPreparation: editions.C };
  return {
    id,
    defender: { x, y, dy, velocity, facingAngle },
    baseline: run(scene),
    candidate: run({ ...scene, ...candidate }),
  };
});
const stronger = counterfactuals.find((r) => r.id === 'stronger');
assert.deepEqual(stronger.baseline.mechanics.impacts[0], stronger.candidate.mechanics.impacts[0]);
assert.equal(stronger.candidate.second?.surfaceContact?.available, true);
assert.equal(stronger.candidate.secondIntersection?.foot.reachable, true);
assert.equal(stronger.candidate.sampledContinuous600, true);
assert.equal(stronger.baseline.second, null);

const { rebaseWithRestClock } = witness;
const phaseOnly = support.surfaces.map((s) => ({ ...s, centre: rebaseWithRestClock.right }));
const phaseOnlyFlight = supportContinuousBodyContacts(
  support.freeFlight.position,
  support.freeFlight.velocity,
  phaseOnly,
  support.seconds,
);
const fileHashes = Object.fromEntries(
  [
    'src/core/matchSimulation/articulatedGait.ts',
    'src/core/matchSimulation/pendingStrikeInterval.ts',
    'src/core/matchSimulation/ballContactResolution.ts',
    'src/core/matchSimulation/matchState.ts',
    'scripts/benchmarkPr222Reception.mjs',
    'scripts/benchmarkPr223Support.mjs',
  ].map((path) => [path, hash(readFileSync(path, 'utf8').replaceAll('\r\n', '\n'))]),
);
const receipt = {
  version: 1,
  baseline,
  archived,
  archivedReceiptSha256: hash(readFileSync(historicFile)),
  seed: 'pr219-a',
  firstTouch: 60,
  start: input.time,
  dt,
  receiver,
  challenger,
  fileHashes,
  arms,
  candidate: paired,
  accounting: account(support),
  repartitions,
  counterfactuals,
  phaseOnly: {
    footTravel: sub(rebaseWithRestClock.right, witness.before.stance.right),
    ...phaseOnlyFlight,
  },
};

const publish = (path, value) => {
  const json = JSON.stringify(value);
  if (process.argv.includes('--record')) writeFileSync(path, gzipSync(json));
  else if (process.argv.includes('--check'))
    assert.deepEqual(JSON.parse(json), JSON.parse(gunzipSync(readFileSync(path))));
  else process.stdout.write(JSON.stringify(value, null, 2) + '\n');
};
publish(output, receipt);

if (process.argv.includes('--smoke')) {
  const trajectories = matchSeeds.map((seed) => {
    const initial = reload({
      ...matchInput(seed),
      experimentalReceptionPreparation: editions.C,
      ...candidate,
    });
    const ticks = original.matchTicks;
    const archivedMatch = original.matches.find((match) => match.seed === seed);
    const reference = observe(initial, ticks);
    const audit = {
      parkedRemainders: 0,
      bodyImpacts: 0,
      badChronology: 0,
      invalidBodies: 0,
      maxPlantedDrift: 0,
      minLatchedBallClearance: null,
    };
    const observed = observe(initial, ticks, {
      reference,
      mechanics: true,
      audit: (before, state, events) => {
        const physical = events.filter((e) =>
          [
            'pendingStrikeInterval.contactRace',
            'pendingStrikeInterval.resolveMultiBodyContact',
            'pendingStrikeInterval.committedSupport',
            'pendingStrikeInterval.rebasePlayer',
          ].includes(e.source),
        );
        audit.badChronology += physical.filter(
          (e, i) =>
            e.at < before.time - 1e-8 ||
            e.at > state.time + 1e-8 ||
            e.at < (physical[i - 1]?.at ?? -Infinity) - 1e-8,
        ).length;
        audit.parkedRemainders += physical.filter((e) => e.detail.parkedRemainder).length;
        audit.bodyImpacts += physical
          .flatMap((e) => e.detail.contacts ?? [])
          .filter((c) => c.kind === 'impact').length;
        for (const p of state.players) {
          const body = projectArticulatedBody(state, p);
          if (!body) {
            audit.invalidBodies++;
            continue;
          }
          const last = before.players.find((q) => q.id === p.id)?.articulatedStance;
          if (
            last?.support &&
            last.support === body.support &&
            p.articulatedStance.elapsed >= last.elapsed
          )
            audit.maxPlantedDrift = Math.max(
              audit.maxPlantedDrift,
              length(sub(last[last.support], p.articulatedStance[last.support])),
            );
          for (const { foot } of (state.continuousFootContacts ?? []).filter(
            (c) => c.actorId === p.id,
          )) {
            const gap = ballBodyClearance(
              { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? BALL_RADIUS },
              { centre: body.geometry[foot].foot, radius: body.bootRadius },
            );
            audit.minLatchedBallClearance = Math.min(
              audit.minLatchedBallClearance ?? Infinity,
              gap,
            );
          }
        }
      },
    });
    const replay = observe(initial, ticks, { reference, roundTrip: true });
    const firstDifference = (a, b) => {
      const index = a.findIndex((value, tick) => value !== b[tick]);
      return index === -1 && a.length !== b.length
        ? Math.min(a.length, b.length) + 1
        : index + 1 || null;
    };
    const summary = (row) => ({
      terminal: row.terminal,
      normalizedTerminal: row.terminalCanonical,
      halt: row.halt,
      invalid: row.invalid,
      planTicks: row.planTicks,
      preparedContacts: row.preparedContacts.map(({ actorId, at, region, preparedReception }) => ({
        actorId,
        at,
        region,
        preparedReception,
      })),
      preparedRecovery: row.preparedWindows.map((r) => ({
        actor: r.touch.actorId,
        at: r.touch.at,
        second: r.secondContactAt,
        executed: r.nextActionAt,
      })),
      continuation: row.episodes
        .filter((e) => e.firstGroundContactAt)
        .map((e) => ({
          receiver: e.pass.intendedReceiverId,
          release: e.pass.releasedAt,
          first: e.firstGroundContactAt,
          control: e.firstControlAt,
          second: e.secondContactAt,
          executed: e.nextActionAt,
        })),
    });
    return {
      seed,
      ticks,
      input: digest(initial),
      audit,
      historical: Object.fromEntries(
        Object.entries(archivedMatch.arms).map(([arm, row]) => [arm, summary(row)]),
      ),
      candidate: summary(observed),
      firstDifferentFromC: firstDifference(archivedMatch.arms.C.motion, observed.motion),
      reload: {
        firstDifferent: firstDifference(observed.motion, replay.motion),
        terminal: replay.terminal,
        sameTerminal: observed.terminalCanonical === replay.terminal,
      },
    };
  });
  publish(smokeOutput, { version: 1, baseline, archived, fileHashes, trajectories });
}
