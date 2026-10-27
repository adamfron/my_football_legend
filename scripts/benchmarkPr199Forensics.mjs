import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { read, hash, finish, identity, options } from './pr199Evidence.mjs';
import { continueRelease } from './pr198Laboratory.mjs';
import { planBallOrientedMovement } from '../src/core/matchSimulation/ballOrientedMovement.ts';
import { playerFootGeometry } from '../src/core/matchSimulation/footContact.ts';
import { deriveMovementCapability } from '../src/core/matchSimulation/locomotion.ts';
import { angleForVector } from '../src/core/matchSimulation/playerOrientation.ts';
const start = performance.now(),
  cpu = process.cpuUsage(),
  source = identity();
const frozen = read('docs/performance/pr198/releases-v1.json.gz').result.rows;
const prior = read('docs/performance/pr198/summary.json');
const mode = options.get('mode') ?? 'changed';
const variants =
  mode === 'baseline'
    ? ['R', 'S']
    : mode === 'uncertainty'
      ? ['S', 'uncertainty_zero', 'uncertainty_double']
      : [
          'R',
          'S',
          'spatial_legacy',
          'time_legacy',
          'facing_incoming',
          'speed_legacy',
          'brake_earlier',
          'no_commitment',
          'accurate_fresh',
          'observation_gap',
          'authority_clock',
          'continuation_clock',
        ];
const selected =
  mode === 'baseline'
    ? frozen
    : frozen.filter((e) =>
        prior.receiverPairs.some(
          (r) => r.ballHash === e.ballHash && (r.lostTouch || r.gainedTouch),
        ),
      );
const rows = [];
for (const entry of selected)
  for (const variant of variants) {
    let lastPlan, currentState, lastObservation, lastLocomotion;
    const observationCalls = [],
      planCalls = [],
      authorityCalls = [];
    globalThis.__mflPr199Lab = {
      uncertaintyScale:
        variant === 'uncertainty_zero' ? 0 : variant === 'uncertainty_double' ? 2 : 1,
      observeReceptionBall: ([s, actor], original) => {
        currentState = s;
        let value = original(s, actor);
        if (variant === 'accurate_fresh')
          value = {
            at: s.time,
            nextAt: s.time,
            ball: {
              position: { x: s.ball.x, y: s.ball.y, z: s.ball.height ?? 0.11 },
              velocity: { ...s.ball.velocity, z: s.ball.velocity?.z ?? 0 },
              spin: { x: 0, y: 0, z: 0 },
              owner: s.ball.ownerId ?? null,
            },
            others: value.others,
          };
        if (variant === 'observation_gap' && lastObservation && s.time - lastObservation.at < 0.4)
          value = lastObservation;
        if (variant === 'observation_gap') lastObservation = value;
        observationCalls.push({
          at: s.time,
          acquiredAt: value.at,
          nextAt: value.nextAt,
          ball: value.ball,
        });
        return value;
      },
      planSynchronizedReception: (input, original) => {
        const [actor, observation, now, readyAt] = input;
        const plan = original(
          ...(variant === 'no_commitment' ? [...input.slice(0, 4), undefined] : input),
        );
        const legacy = planBallOrientedMovement(
          actor,
          observation,
          now,
          actor.target,
          'receive',
          readyAt,
        );
        if (plan.status === 'contact_planned') {
          if (variant === 'spatial_legacy' && legacy.nextContact) {
            plan.contactPoint = legacy.nextContact;
            plan.movementTarget = legacy.movementTarget;
          }
          if (variant === 'time_legacy' && legacy.contactSeconds !== null)
            plan.contactAt = now + legacy.contactSeconds;
        }
        lastPlan = plan;
        planCalls.push({ at: now, readyAt, legacy, plan });
        return plan;
      },
      receptionPlanFacing: (input, original) =>
        variant === 'facing_incoming'
          ? angleForVector({ x: -input[2].x, y: -input[2].y })
          : original(...input),
      projectLocomotion: (input, original) => {
        const [s, player, target] = input;
        if (player.id !== entry.contract.receiverId) return original(...input);
        let result = original(...input);
        if (variant === 'speed_legacy')
          result = original(
            { ...s, experimentalReceiverSynchronisation: false },
            ...input.slice(1),
          );
        if (variant === 'brake_earlier' && target) {
          const d = Math.hypot(target.x - player.position.x, target.y - player.position.y);
          result = {
            ...result,
            targetSpeed: Math.min(
              result.targetSpeed,
              Math.sqrt(deriveMovementCapability(player).acceleration * d),
            ),
          };
        }
        lastLocomotion = { at: s.time, ...result };
        return result;
      },
      authoritativeMovementTarget: (input, original) => {
        const [s, player] = input;
        if (player.id !== entry.contract.receiverId) return original(...input);
        const corrected =
          variant === 'authority_clock' &&
          lastPlan?.contactAt !== null &&
          lastPlan?.contactAt !== undefined &&
          s.receptionPreparation
            ? {
                ...s,
                receptionPreparation: {
                  ...s.receptionPreparation,
                  expectedArrivalTime: lastPlan.contactAt,
                },
              }
            : s;
        const target = original(corrected, ...input.slice(1));
        authorityCalls.push({
          at: s.time,
          target,
          oldExpiresAt: s.receptionPreparation?.expectedArrivalTime + 1,
          localContactAt: lastPlan?.contactAt ?? null,
        });
        return target;
      },
      preparedContinuation: (input, original) => {
        const [s] = input;
        return original(
          variant === 'continuation_clock' && lastPlan?.contactAt != null && s.receptionPreparation
            ? {
                ...s,
                receptionPreparation: {
                  ...s.receptionPreparation,
                  expectedArrivalTime: lastPlan.contactAt,
                },
              }
            : s,
          ...input.slice(1),
        );
      },
    };
    const traces = [];
    const result = continueRelease(
      entry,
      {
        experimentalDefensiveReception: true,
        experimentalHeightAwarePassing: true,
        experimentalReceiverAnticipation: true,
        experimentalReceiverSynchronisation: variant !== 'R',
        experimentalCanonicalArrival: false,
      },
      undefined,
      mode === 'baseline'
        ? undefined
        : (before, s, sample) => {
            const actor = s.players.find((p) => p.id === entry.contract.receiverId);
            if (!actor) return;
            const feet = playerFootGeometry(actor);
            traces.push({
              at: s.time,
              ball: sample.ball,
              velocity: sample.velocity,
              observation: actor.ballMotorObservation ?? null,
              observationAge: actor.ballMotorObservation
                ? s.time - actor.ballMotorObservation.at
                : null,
              localPlan: lastPlan ?? null,
              locomotion: lastLocomotion ?? null,
              objective: actor.target,
              position: actor.position,
              velocityBody: actor.velocity,
              facing: actor.facingAngle,
              plantBalance: actor.plantBalance ?? null,
              feet,
              finiteFootAccess:
                (s.ball.height ?? 0) <= 0.65 &&
                Math.min(
                  Math.hypot(feet.leftFoot.x - s.ball.x, feet.leftFoot.y - s.ball.y),
                  Math.hypot(feet.rightFoot.x - s.ball.x, feet.rightFoot.y - s.ball.y),
                ) <= feet.footReach,
              preparation: s.receptionPreparation ?? null,
              spatialMovement: actor.spatialMovement ?? null,
              human: s.playerMovementIntent ?? null,
              challenge: s.defensiveChallenge ?? null,
              combination: s.combinationIntent ?? null,
              contacts: sample.contacts,
              actualReception:
                s.lastReceptionOutcome?.receiverId === actor.id ? s.lastReceptionOutcome : null,
              initialMomentum: entry.state.players.find((p) => p.id === actor.id).velocity,
              facingChange:
                actor.facingAngle - before.players.find((p) => p.id === actor.id).facingAngle,
            });
          },
    );
    delete globalThis.__mflPr199Lab;
    void currentState;
    if (mode === 'baseline') {
      const old = read(
        `docs/performance/pr198/receptions-${variant === 'R' ? 'combined-v1' : 'synchronized-v2'}.json.gz`,
      ).result.rows.find((r) => r.ballHash === entry.ballHash);
      if (old.finalHash !== result.finalHash || hash(old.outcome) !== hash(result.outcome))
        throw Error('PR198 reproduction failure');
    }
    rows.push({
      family: entry.family,
      skill: entry.skill,
      sample: entry.sample,
      seed: entry.seed,
      variant,
      releaseHash: entry.releaseHash,
      ballHash: entry.ballHash,
      receiverHash: entry.receiverHash,
      outcome: result.outcome,
      finalHash: result.finalHash,
      samplesHash: result.samplesHash,
      ...(mode === 'baseline' ? {} : { traces, observationCalls, planCalls, authorityCalls }),
    });
    if (rows.length % 12 === 0) console.log('PR199 forensic', mode, rows.length);
  }
const summary = Object.fromEntries(
  variants.map((variant) => {
    const list = rows.filter((r) => r.variant === variant);
    return [
      variant,
      {
        n: list.length,
        touch: list.filter((r) => r.outcome.directReceiverTouch).length,
        control: list.filter((r) => r.outcome.directReceiverTouch && r.outcome.receiverControl)
          .length,
        retained: list.filter(
          (r) => r.outcome.directReceiverTouch && r.outcome.teamPossessionAtOneSecond,
        ).length,
      },
    ];
  }),
);
finish(
  `forensics-${mode}-v1.json.gz`,
  {
    schema: 'pr199-forensics-v1',
    source,
    mode,
    method:
      'Laboratory-only function hooks. Same canonical released ball and body integrator. Accurate-fresh is explicitly privileged engineering negative control. No live feature changes.',
    variants,
    rows,
    summary,
  },
  {
    milliseconds: performance.now() - start,
    cpu: process.cpuUsage(cpu),
    maxRSSKiB: process.resourceUsage().maxRSS,
  },
);
console.log(summary);
