import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { gzipSync, gunzipSync } from 'node:zlib';
import { withArticulatedBody } from '../src/core/matchSimulation/articulatedGait.ts';
import { captureReceptionStep } from '../src/core/matchSimulation/receptionTrace.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { createTrial, editions, scenes } from './benchmarkPr221Reception.mjs';

const dt = 0.025;
const epsilon = 1e-8;
const nativePath = 'docs/performance/pr217/session-input.json.gz';
const receiptPath = 'docs/performance/pr222/reception.json.gz';
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const physicalDigest = (value) =>
  createHash('sha256')
    .update(
      JSON.stringify(value, (_key, entry) =>
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? Object.fromEntries(
              Object.keys(entry)
                .sort()
                .map((key) => [key, entry[key]]),
            )
          : entry,
      ),
    )
    .digest('hex');
const reload = (state) => tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(state)));
const metres = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const nativeFile = readFileSync(nativePath);
const native = JSON.parse(gunzipSync(nativeFile)).initial;

const truthBody = (player) => ({
  id: player.id,
  team: player.team,
  position: player.position,
  velocity: player.velocity,
  facing: player.facingAngle,
  // Some movement callers pass a BallState as an XY target. Its extra fields
  // disappear at native serialization and never enter locomotion.
  target: { x: player.target.x, y: player.target.y },
  stance: player.articulatedStance,
  pose: player.lowerBodyPose,
  plantBalance: player.plantBalance,
});

const changes = (before, after) => {
  const fields = [
    'lastGroundContact',
    'lastBallContact',
    'lastStrikeResolution',
    'lastPassDiagnostic',
    'lastChallenge',
    'lastPossessionLoss',
    'pendingPossessionLoss',
    'lastBallRecovery',
    'lastShot',
  ];
  const facts = {};
  for (const field of fields)
    if (after[field] && JSON.stringify(after[field]) !== JSON.stringify(before[field]))
      facts[field] = after[field];
  if (
    after.currentAction &&
    (before.decisionIndex !== after.decisionIndex ||
      JSON.stringify(before.currentAction) !== JSON.stringify(after.currentAction))
  )
    facts.action = { index: after.decisionIndex, ...after.currentAction };
  if (after.pendingStrike && before.pendingStrike?.id !== after.pendingStrike.id)
    facts.strikeCommitment = after.pendingStrike;
  return facts;
};

const openPlayRelease = (before, after, facts) => {
  const pass = facts.lastPassDiagnostic;
  if (
    !pass ||
    before.lastPassDiagnostic?.passId === pass.passId ||
    before.restart ||
    after.restart ||
    before.scenario !== 'open_play'
  )
    return undefined;
  return {
    pass,
    strike: facts.lastStrikeResolution?.id === pass.passId ? facts.lastStrikeResolution : undefined,
  };
};

const sample = (state, facts, events, actorIds) => ({
  at: state.time,
  truth: {
    ball: state.ball,
    possessionTeam: state.possessionTeam,
    ownershipStartedAt: state.ballOwnershipStartedAt,
    bodies: state.players.filter((p) => actorIds.has(p.id)).map(truthBody),
  },
  policy: {
    actionCooldown: state.actionCooldown,
    carrierIntent: state.ballCarrierIntent,
    challenge: state.defensiveChallenge,
    preparation: state.onBallPreparation,
    controlledContact: state.controlledBallContact,
    passPreparation: state.receptionPreparation,
    restart: state.restart?.phase,
  },
  facts,
  events: events.filter(
    (event) =>
      actorIds.has(event.actorId) ||
      event.source === 'pendingStrikeInterval.contactRace' ||
      event.detail.participants?.some((id) => actorIds.has(id)),
  ),
});

const actorsFor = (state, passer, receiver) => {
  const receiverBody = state.players.find((p) => p.id === receiver);
  const closest = state.players
    .filter((p) => p.team !== receiverBody.team)
    .sort(
      (a, b) =>
        metres(a.position, receiverBody.position) - metres(b.position, receiverBody.position) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 2);
  return new Set([passer, receiver, ...closest.map((p) => p.id)]);
};

const summarize = (frames, receiver, sceneStart, release, witnessedContact) => {
  const receiverTeam = frames[0]?.truth.bodies.find((p) => p.id === receiver)?.team;
  const flightStart = release ?? sceneStart;
  const delivery = frames.filter((f) => f.at >= flightStart - epsilon);
  const ground = delivery.flatMap((f) => {
    const c = f.facts.lastGroundContact;
    return c && c.at > flightStart + epsilon && c.executed ? [c] : [];
  });
  const first = witnessedContact ?? ground.find((c) => c.actorId === receiver);
  const contactFrame = first && delivery.find((f) => f.at >= first.at - epsilon);
  const firstControl = contactFrame?.truth.ball.ownerId === receiver ? contactFrame : undefined;
  const loss = firstControl
    ? delivery.find((f) => f.at > firstControl.at && f.truth.ball.ownerId !== receiver)
    : undefined;
  const second = firstControl
    ? ground.find(
        (c) =>
          c.actorId === receiver &&
          c.at > first.at + epsilon &&
          c.retained &&
          c.at <= (loss?.at ?? Infinity),
      )
    : undefined;
  const selections = firstControl
    ? delivery.filter(
        (f) =>
          f.at >= firstControl.at - epsilon &&
          f.at <= (loss?.at ?? Infinity) &&
          f.facts.action?.actorId === receiver &&
          ['carry', 'pass', 'shot'].includes(f.facts.action.type),
      )
    : [];
  const executedRelease = delivery.find(
    (f) =>
      f.at <= (loss?.at ?? Infinity) &&
      selections.some(
        (selection) =>
          f.at >= selection.at - epsilon &&
          (selection.facts.action.type === 'pass'
            ? f.facts.lastStrikeResolution?.actorId === receiver &&
              f.facts.lastStrikeResolution.outcome === 'contact' &&
              f.facts.lastStrikeResolution.id === f.facts.lastPassDiagnostic?.passId
            : selection.facts.action.type === 'shot' &&
              f.facts.lastShot?.shooterId === receiver &&
              f.truth.ball.lastTouchPlayerId === receiver &&
              f.truth.ball.travelKind === 'shot'),
      ),
  );
  const selected = selections[0];
  const carry = selections.find((f) => f.facts.action.type === 'carry');
  const executionAt = Math.min(
    carry && second?.at >= carry.at - epsilon ? second.at : Infinity,
    executedRelease?.facts.lastStrikeResolution?.at ?? executedRelease?.at ?? Infinity,
  );
  const ownerAt = (at) => {
    const frame = frames.find((f) => f.at >= at - epsilon);
    if (!frame) return null;
    const ball = frame.truth.ball;
    return {
      sampledAt: frame.at,
      owner: ball.ownerId ?? null,
      receiver: ball.ownerId === receiver,
      team: Boolean(ball.ownerId) && frame.truth.possessionTeam === receiverTeam,
      phase: frame.policy.restart ?? (ball.ownerId ? 'owned' : (ball.travelKind ?? 'loose')),
    };
  };
  const preparation = frames
    .flatMap((f) => f.events)
    .filter(
      (e) =>
        e.actorId === receiver &&
        e.at >= flightStart - epsilon &&
        e.at < (first?.at ?? Infinity) &&
        e.detail.plan &&
        'outcome' in e.detail,
    );
  const firstOptical = delivery
    .flatMap((f) => f.events)
    .find(
      (e) => e.actorId === receiver && e.at >= flightStart - epsilon && e.detail.sensor?.optical,
    );
  const firstAcquired = delivery
    .flatMap((f) => f.events)
    .find(
      (e) =>
        e.actorId === receiver &&
        e.at >= flightStart - epsilon &&
        e.detail.sensor?.belief?.lastObservation?.at === e.at,
    );
  return {
    firstOpticalAt: firstOptical?.at ?? null,
    firstAcquiredAt: firstAcquired?.at ?? null,
    firstPlanReviewAt: preparation[0]?.at ?? null,
    firstGroundContactAt: first?.at ?? null,
    firstGroundActor: ground[0]?.actorId ?? null,
    directReceiverFirst: witnessedContact ? null : Boolean(first && first === ground[0]),
    preparedContact: first?.preparedReception ?? null,
    retainedFirstContact: first?.retained ?? null,
    firstControlAt: firstControl?.truth.ownershipStartedAt ?? firstControl?.at ?? null,
    atScene600: ownerAt(sceneStart + 0.6),
    atControl600: firstControl
      ? ownerAt((firstControl.truth.ownershipStartedAt ?? firstControl.at) + 0.6)
      : null,
    secondContactAt: second?.at ?? null,
    intent: selected ? { at: selected.at, ...selected.facts.action } : null,
    nextActionAt: Number.isFinite(executionAt) ? executionAt : null,
    firstControlEnded: loss
      ? { sampledAt: loss.at, facts: loss.facts, owner: loss.truth.ball.ownerId ?? null }
      : null,
    end: ownerAt(frames.at(-1)?.at),
  };
};

const observe = (input, ticks, { lab, roundTrip = false, reference } = {}) => {
  let state = input;
  const hashes = [];
  const motion = [];
  const rows = [];
  const releases = [];
  const plans = [];
  const decisions = [];
  let planTicks = 0;
  let invalid = 0;
  for (let tick = 0; tick < ticks && !state.safetyHalt; tick++) {
    const before = state;
    const step = () => stepTacticalMatch(roundTrip ? reload(before) : before, dt);
    const observed =
      reference && !roundTrip ? captureReceptionStep(step) : { state: step(), events: [] };
    state = observed.state;
    assert.ok(state.time > before.time || state.safetyHalt, 'canonical clock stalled');
    invalid += Number(
      state.players.length !== (lab ? input.players.length : 22) ||
        state.players.some(
          (p) => ![p.position.x, p.position.y, p.facingAngle].every(Number.isFinite),
        ),
    );
    hashes.push(digest(state));
    if (reference && !roundTrip)
      assert.equal(hashes[tick], reference.hashes[tick], 'observer parity');
    motion.push(
      physicalDigest([
        state.ball,
        state.players.map(truthBody),
        state.currentAction,
        state.pendingStrike?.id,
      ]),
    );
    const facts = changes(before, state);
    const release = openPlayRelease(before, state, facts);
    if (release) releases.push({ tick, ...release });
    const currentPlans = state.activePerceptionRuntime?.plans ?? {};
    planTicks += Number(Object.keys(currentPlans).length > 0);
    if (!reference || roundTrip) continue;
    if (facts.action || facts.strikeCommitment || facts.lastStrikeResolution)
      decisions.push({
        at: state.time,
        action: facts.action,
        commitment: facts.strikeCommitment,
        resolution: facts.lastStrikeResolution,
      });
    plans.push(
      ...observed.events.filter(
        (e) =>
          (e.source === 'preReceptionPlanning.advancePreReceptionPlans' &&
            (e.detail.plan || e.detail.previousReview !== undefined)) ||
          (e.source === 'matchSimulation.integrateCanonicalMovement' && e.detail.earlyTarget) ||
          (e.source === 'matchSimulation.changePossession' && e.detail.committedPlan),
      ),
    );
    rows.push({ state, facts, events: observed.events });
  }
  if (!reference) return { hashes, motion };
  if (roundTrip) return { motion, terminal: physicalDigest(reload(state)) };
  assert.equal(hashes.length, reference.hashes.length, 'observer clock parity');
  const episodes = releases.map(({ tick, pass, strike }) => {
    const initial = rows[tick].state;
    const receiver = pass.intendedReceiverId;
    const ids = actorsFor(initial, pass.passerId, receiver);
    const sceneStart = Math.max(input.time, (strike?.selectedAt ?? pass.releasedAt) - 0.5);
    const start = rows.findIndex((r) => r.state.time >= sceneStart - epsilon);
    // Stop crediting the input after an unrelated new pass. Keep the replacement
    // tick for event-order evidence and for a receiver's genuine intentional release.
    const next = releases.find((r) => r.tick > tick);
    const end = Math.min(rows.length, tick + 141, next ? next.tick + 1 : Infinity);
    const frames = rows
      .slice(start, end)
      .map(({ state, facts, events }) => sample(state, facts, events, ids));
    return {
      sceneStart,
      pass,
      strike,
      endReason: end === rows.length ? 'run_end' : end === next?.tick + 1 ? 'next_pass' : 'window',
      nearestAtRelease: [...ids].slice(2).map((id) => ({
        id,
        distance: metres(
          initial.players.find((p) => p.id === receiver).position,
          initial.players.find((p) => p.id === id).position,
        ),
      })),
      ...summarize(frames, receiver, sceneStart, pass.releasedAt),
      frames,
    };
  });
  const labFrames =
    lab &&
    rows.map(({ state, facts, events }) =>
      sample(state, facts, events, actorsFor(input, input.ball.lastTouchPlayerId, lab)),
    );
  const preparedWindows = lab
    ? []
    : rows.flatMap(({ facts }, tick) => {
        const touch = facts.lastGroundContact;
        if (!touch?.executed || !touch.preparedReception) return [];
        const firstTick = Math.max(0, tick - 128);
        const actorIds = actorsFor(rows[tick].state, touch.actorId, touch.actorId);
        const incoming = rows[tick].events.find(
          (e) =>
            e.source === 'pendingStrikeInterval.contactRace' &&
            e.actorId === touch.actorId &&
            Math.abs(e.at - touch.at) < epsilon,
        );
        if (incoming?.detail.ball.lastTouchPlayerId)
          actorIds.add(incoming.detail.ball.lastTouchPlayerId);
        const frames = rows
          .slice(firstTick, tick + 61)
          .map(({ state, facts, events }) => sample(state, facts, events, actorIds));
        return [
          {
            touch,
            incoming: incoming?.detail.ball,
            ...summarize(frames, touch.actorId, frames[0].at, undefined, touch),
            frames,
          },
        ];
      });
  return {
    seconds: state.time - input.time,
    terminal: digest(reload(state)),
    terminalCanonical: physicalDigest(reload(state)),
    hashes,
    motion,
    invalid,
    halt: state.safetyHalt ?? null,
    planTicks,
    preparedContacts: rows.flatMap(({ facts }) =>
      facts.lastGroundContact?.executed && facts.lastGroundContact.preparedReception
        ? [facts.lastGroundContact]
        : [],
    ),
    plans,
    decisions,
    episodes,
    preparedWindows,
    lab: labFrames && { ...summarize(labFrames, lab, input.time), frames: labFrames },
  };
};

const paired = (initial, ticks, lab) => {
  const arms = Object.fromEntries(
    Object.entries(editions).map(([arm, edition]) => {
      const input = reload({ ...initial, experimentalReceptionPreparation: edition });
      const reference = observe(input, ticks, { lab });
      const receipt = observe(input, ticks, { lab, reference });
      let roundTrip = null;
      if (arm === 'C') {
        const replay = observe(input, ticks, { lab, reference, roundTrip: true });
        const firstDifferent = replay.motion.findIndex(
          (hash, tick) => hash !== reference.motion[tick],
        );
        roundTrip = {
          firstDifferentTick:
            firstDifferent === -1
              ? replay.motion.length === reference.motion.length
                ? null
                : Math.min(replay.motion.length, reference.motion.length) + 1
              : firstDifferent + 1,
          sameTerminal: replay.terminal === receipt.terminalCanonical,
          terminal: replay.terminal,
        };
      }
      assert.equal(receipt.invalid, 0);
      return [arm, { initial: digest(input), roundTrip, ...receipt }];
    }),
  );
  const divergence = (a, b) => {
    const index = arms[a].motion.findIndex((hash, tick) => hash !== arms[b].motion[tick]);
    return index === -1 ? null : { tick: index + 1, nominalAt: initial.time + (index + 1) * dt };
  };
  return {
    inputWithoutSelector: digest(reload(initial)),
    firstPhysicalOrActionDivergence: { AB: divergence('A', 'B'), BC: divergence('B', 'C') },
    arms,
  };
};

const matchSeeds = [native.seed, 'pr222-native-a'];
const matches = (process.argv.includes('--lab-only') ? [] : matchSeeds).map((seed) => {
  const input = reload({ ...withArticulatedBody(native), seed, playerAgencyEnabled: false });
  const result = paired(input, 1200);
  process.stdout.write(JSON.stringify({ seed, ...compact(result) }) + '\n');
  return { seed, ...result };
});

function compact(result) {
  return {
    divergence: result.firstPhysicalOrActionDivergence,
    arms: Object.fromEntries(
      Object.entries(result.arms).map(([arm, row]) => [
        arm,
        {
          planTicks: row.planTicks,
          prepared: row.preparedContacts.length,
          halt: row.halt?.reason,
          roundTrip: row.roundTrip,
          releases: row.episodes.map((episode) => ({
            at: episode.pass.releasedAt,
            id: episode.pass.passId,
            passer: episode.pass.passerId,
            receiver: episode.pass.intendedReceiverId,
            actual: Boolean(episode.strike?.contact),
            optical: episode.firstOpticalAt,
            plan: episode.firstPlanReviewAt,
            contact: episode.firstGroundContactAt,
            control: episode.firstControlAt,
            second: episode.secondContactAt,
            action: episode.nextActionAt,
          })),
          lab: row.lab && { ...row.lab, frames: undefined },
        },
      ]),
    ),
  };
}

const labCases = [
  ['pressure', 24],
  ['pressure', 64],
  ['early-pressure', 64],
  ['early-lateral', 64],
];
const laboratory = labCases.map(([id, ticks]) => {
  const seed = 'pr219-a';
  const firstTouch = 60;
  const { input, receiver } = createTrial(
    scenes.find((scene) => scene.id === id),
    seed,
    firstTouch,
  );
  const result = paired(input, ticks, receiver);
  if (id === 'pressure')
    for (const { lab } of Object.values(result.arms)) {
      assert.equal(lab.retainedFirstContact, true);
      assert.equal(lab.secondContactAt, null);
      assert.equal(lab.atScene600?.receiver, false);
      assert.equal(lab.atControl600?.receiver ?? null, ticks === 24 ? null : false);
      assert.equal(lab.firstControlEnded?.facts.pendingPossessionLoss?.cause, 'failed_control');
    }
  if (id === 'early-lateral') assert.ok(result.arms.C.lab.secondContactAt);
  assert.equal(result.arms.C.roundTrip.firstDifferentTick, null, id + ' reload trajectory');
  assert.ok(result.arms.C.roundTrip.sameTerminal, id + ' reload terminal');
  process.stdout.write(JSON.stringify({ id, ticks, ...compact(result) }) + '\n');
  return { id, seed, firstTouch, ticks, receiver, ...result };
});
const receipt = {
  version: 1,
  dt,
  nativeInput: { path: nativePath, sha256: createHash('sha256').update(nativeFile).digest('hex') },
  matchTicks: 1200,
  matches,
  laboratory,
};
if (process.argv.includes('--check')) {
  assert.equal(digest(receipt), digest(JSON.parse(gunzipSync(readFileSync(receiptPath)))));
} else {
  const folder =
    process.argv.includes('--record') && !process.argv.includes('--lab-only')
      ? 'docs/performance/pr222'
      : '.benchmark-artifacts/pr222';
  mkdirSync(folder, { recursive: true });
  writeFileSync(folder + '/reception.json.gz', gzipSync(JSON.stringify(receipt)));
}
