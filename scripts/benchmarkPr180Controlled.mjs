import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import console from 'node:console';
import { assessFirstTouch } from '../src/core/matchSimulation/firstTouch.ts';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry.ts';
import {
  findFirstBallContact,
  resolveBallRebound,
} from '../src/core/matchSimulation/ballFlight.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { createHash } from 'node:crypto';
import { resolveReceptionOutcome } from '../src/core/matchSimulation/passReception.ts';
import { derivePassLaunchPlan } from '../src/core/matchSimulation/passLaunchPlan.ts';
import {
  deriveAerialLaunchPlan,
  integrateBallFlight,
  projectFutureBallTrajectory,
} from '../src/core/matchSimulation/ballPhysics.ts';
import { derivePassDifficulty } from '../src/core/matchSimulation/passExecution.ts';
import { evaluateStateValueAction } from '../src/core/matchSimulation/decisionStateValue.ts';
import {
  rankAvailableActionsForAI,
  chooseIncomingShotAction,
} from '../src/core/matchSimulation/matchActions.ts';
import { enumerateCarryChoices } from '../src/core/matchSimulation/carryOpportunity.ts';
import { enumerateCanonicalShootingOptions } from '../src/core/matchSimulation/shootingOptions.ts';
import { resolveCanonicalShot } from '../src/core/matchSimulation/shotResolver.ts';
import { pr172SourceHash } from './pr172Evidence.ts';
const dir = 'docs/performance/pr180-evidence';
mkdirSync(dir, { recursive: true });
const seed = JSON.parse(gunzipSync(readFileSync(`${dir}/development.json.gz`)))[0].state;
const base = globalThis.structuredClone(seed);
base.time = 10;
base.scenario = 'open_play';
delete base.restart;
for (const [i, p] of base.players.entries()) {
  p.position = { x: p.team === 'home' ? 8 : 95, y: 2 + i * 2 };
  p.target = { ...p.position };
  p.velocity = { x: 0, y: 0 };
}
const actor = base.players.find((p) => p.team === 'home' && p.slot.position !== 'goalkeeper'),
  receiver = base.players.find((p) => p.team === actor.team && p.id !== actor.id),
  passer = base.players.find(
    (p) => p.team === actor.team && p.id !== actor.id && p.id !== receiver.id,
  );
actor.position = { x: 50, y: 34 };
receiver.position = { x: 65, y: 34 };
receiver.target = { ...receiver.position };
passer.position = { x: 35, y: 34 };
const rows = [],
  started = performance.now();
for (const speed of [3, 7, 12, 18, 24])
  for (const orientation of [
    'aligned',
    'moderate',
    'severe',
    'behind',
    'accelerating',
    'stationary',
    'decelerating',
  ])
    for (const skill of [25, 60, 95])
      for (const foot of ['strong', 'weak'])
        for (const pressure of [14, 4, 1.5, 0.5])
          for (const intention of ['cushion', 'directional', 'short', 'long', 'shot', 'carry']) {
            const s = globalThis.structuredClone(base),
              a = s.players.find((p) => p.id === actor.id),
              r = s.players.find((p) => p.id === receiver.id),
              d = s.players.find((p) => p.team !== a.team);
            for (const k of Object.keys(a.profile.attributes)) a.profile.attributes[k] = skill;
            a.profile.dominantFoot = 'right';
            a.profile.weakFootProficiency = 35;
            a.facingAngle =
              orientation === 'aligned'
                ? -Math.PI / 2
                : orientation === 'moderate'
                  ? 0
                  : orientation === 'severe'
                    ? Math.PI / 2
                    : orientation === 'behind'
                      ? -Math.PI / 2
                      : -Math.PI / 2;
            a.velocity = {
              x: orientation === 'accelerating' ? 7 : orientation === 'decelerating' ? -4 : 0,
              y: 0,
            };
            d.position = { x: 50 + pressure, y: 34 };
            const geometry = playerContactGeometry(a);
            const footPoint = foot === 'weak' ? geometry.leftFoot : geometry.rightFoot;
            s.ball = {
              ...footPoint,
              height: 0.11,
              velocity: { x: orientation === 'behind' ? -speed : speed, y: 0, z: 0 },
              travelKind: 'pass',
              lastTouchPlayerId: passer.id,
            };
            const target =
              intention === 'long'
                ? { x: 100, y: 50 }
                : intention === 'shot'
                  ? { x: 105, y: 34 }
                  : intention === 'directional' || intention === 'carry'
                    ? { x: 54, y: 37 }
                    : { x: 35, y: 34 };
            const mode =
              intention === 'short' || intention === 'long'
                ? 'pass'
                : intention === 'shot'
                  ? 'shot'
                  : intention === 'carry'
                    ? 'directional'
                    : intention;
            const contact = assessFirstTouch(s, a, s.ball, target, mode, 0.4),
              reception = resolveReceptionOutcome(s, a, s.ball);
            const uncertainty =
              mode === 'pass'
                ? derivePassDifficulty(s, a, target, 'support', 'ground', { firstTime: true })
                    .uncertaintyMetres
                : null;
            rows.push({
              speed,
              orientation,
              skill,
              foot,
              pressure,
              intention,
              contact,
              reception: reception.kind,
              uncertainty,
            });
            r.position = target;
          }
writeFileSync(
  `${dir}/first-touch-matrix.json.gz`,
  gzipSync(
    JSON.stringify({
      schema: 'mfl-pr180-first-touch-matrix-v1',
      sourceHash: pr172SourceHash(),
      count: rows.length,
      wallMs: performance.now() - started,
      scope:
        'deterministic local contact experiments; input labels are experimental, not empirical population speeds',
      rows,
    }),
  ),
);
const trajectories = [];
for (const [name, speed, elevation, metres, spin] of [
  ['slow-ground', 5, 0, 3],
  ['firm-ground', 15, 0, 20],
  ['long-ground', 27, 0, 60],
  ['driven-diagonal', 25, 0, 45],
  ['lofted-diagonal', 25, 0.45, 45],
  ['soft-lob', 12, 0.7, 12],
  ['driven-cross', 24, 0.15, 25],
  ['lofted-cross', 22, 0.48, 30],
  ['deflected', 14, 0.28, 20],
  ['spinning', 24, 0.4, 35, { x: 0, y: 0, z: 90 }],
  ['bouncing-grass', 18, 0.35, 30],
]) {
  const diagonal = name.includes('diagonal'),
    angle = diagonal ? 0.55 : 0;
  let v = {
    x: speed * Math.cos(elevation) * Math.cos(angle),
    y: speed * Math.cos(elevation) * Math.sin(angle),
    z: speed * Math.sin(elevation),
  };
  let deflection;
  if (name === 'deflected') {
    const hit = findFirstBallContact({
      previous: { x: 20, y: 20, z: 0.11 },
      next: { x: 21, y: 20, z: 0.11 },
      attackingTeam: actor,
      candidates: [
        {
          kind: 'defender',
          playerId: 'physical-block',
          centre: { x: 21, y: 20.3, z: 0.11 },
          radius: 0.4,
        },
      ],
    });
    const incoming = { x: 24, y: 0, z: 0 };
    deflection = {
      hit,
      incoming,
      response: resolveBallRebound('defender', incoming, actor, undefined, {
        surfaceNormal: hit.surfaceNormal,
        surfaceVelocity: { x: -1, y: 0.5, z: 0 },
      }),
    };
    v = deflection.response.velocity;
  }
  const original = {
    position: { x: 20, y: 20, z: 0.11 },
    velocity: v,
    airborne: elevation > 0,
    bounceCount: 0,
    ...(spin ? { spin } : {}),
  };
  const samples = projectFutureBallTrajectory(original, 8, 0.025),
    target = { x: 20 + metres * Math.cos(angle), y: 20 + metres * Math.sin(angle) };
  const arrival = samples.reduce((a, b) =>
    Math.hypot(b.ball.position.x - target.x, b.ball.position.y - target.y) <
    Math.hypot(a.ball.position.x - target.x, a.ball.position.y - target.y)
      ? b
      : a,
  );
  let live = original;
  for (let i = 0; i < samples.length; i++) live = integrateBallFlight(live, 0.025);
  const final = samples.at(-1).ball;
  if (JSON.stringify(live) !== JSON.stringify(final))
    throw Error('forecast/live integration mismatch');
  const s = {
    ...base,
    time: 10 + arrival.at,
    ball: {
      x: arrival.ball.position.x,
      y: arrival.ball.position.y,
      height: arrival.ball.position.z,
      velocity: arrival.ball.velocity,
      spin: arrival.ball.spin,
    },
  };
  const body = {
    ...actor,
    position: { x: arrival.ball.position.x, y: arrival.ball.position.y },
    facingAngle: -Math.PI / 2,
  };
  trajectories.push({
    name,
    ...(deflection ? { deflection } : {}),
    launch: v,
    distance: Math.hypot(final.position.x - 20, final.position.y - 20),
    arrivalTime: arrival.at,
    arrivalSpeed: Math.hypot(...Object.values(arrival.ball.velocity)),
    arrivalHeight: arrival.ball.position.z,
    spin: arrival.ball.spin ?? null,
    bounceCount: final.bounceCount,
    arrivalBounces: arrival.ball.bounceCount,
    final: final.position,
    targetMiss: Math.hypot(arrival.ball.position.x - target.x, arrival.ball.position.y - target.y),
    receiver: assessFirstTouch(
      s,
      body,
      s.ball,
      { x: body.position.x + 10, y: body.position.y },
      'cushion',
      0.5,
    ),
    forecastEqualsLive: true,
  });
}
// Actual canonical launch planners, including goalkeeper/lofted deliveries.
const plans = [];
base.ball = { ...actor.position, ownerId: actor.id, height: 0.11 };
for (const metres of [5, 15, 35, 55])
  for (const delivery of ['ground', 'lofted']) {
    receiver.position = { x: 50 + metres, y: 34 };
    plans.push({
      metres,
      delivery,
      plan: derivePassLaunchPlan(base, actor, receiver, receiver.position, 'direct', delivery),
    });
  }
const aerial = deriveAerialLaunchPlan({ x: 20, y: 20 }, { x: 65, y: 50 }, 'long_pass', {
  ability: 90,
  maximumSpeed: 30,
});
const shots = [];
actor.position = { x: 85, y: 34 };
actor.facingAngle = Math.PI / 2;
base.ball = { ...actor.position, ownerId: actor.id, height: 0.11 };
for (const facing of [0, Math.PI / 2])
  for (const intent of ['placed', 'driven', 'chip'])
    for (const horizontal of [-0.65, 0.65]) {
      actor.facingAngle = facing;
      const shot = resolveCanonicalShot(base, {
        type: 'shot',
        actorId: actor.id,
        target: { x: 105, y: 34 },
        goalTarget: { horizontal, vertical: 0.5 },
        intent,
      });
      shots.push({
        facing,
        intent,
        horizontal,
        velocity: shot.launchVelocity,
        spin: shot.launchSpin,
        classification: shot.classification,
      });
    }
writeFileSync(
  'docs/performance/PR180-ball-dynamics.json',
  JSON.stringify(
    {
      sourceHash: pr172SourceHash(),
      trajectories,
      plans,
      aerial,
      shots,
      spinLimitation:
        'Ordinary open-play strikes intentionally use the historical zero-spin regime. Existing free-kick controlled_curl/power_bend/dipping tests demonstrate Magnus propagation; no ordinary-shot spin distribution is inferred from five sparse manual fragments.',
    },
    null,
    2,
  ) + '\n',
);
const frozen = [];
for (const policy of [
  'legacy-pr176',
  'state-value-v1',
  'role-value-v1',
  'role-intent-v1',
  'phase-role-hybrid-v1',
]) {
  const path = `${dir}/manual-closest-${policy}-frozen.json.gz`;
  for (const [index, f] of JSON.parse(gunzipSync(readFileSync(path))).entries()) {
    const s = f.state,
      a = s.players.find((p) => p.id === f.actorId),
      options = [
        { type: 'hold', actorId: a.id },
        ...enumerateCarryChoices(s, a),
        ...f.ranking.map((r) => r.action),
        ...enumerateCanonicalShootingOptions(s, a.id),
      ];
    const alternatives = options.map((action) => ({
      action,
      evaluation: evaluateStateValueAction(s, a, action),
    }));
    frozen.push({
      policy,
      index,
      at: s.time,
      actorId: a.id,
      before: { control: f.control, ranking: f.ranking },
      after: {
        alternatives,
        ranking: rankAvailableActionsForAI(s, a.id),
        selected: chooseIncomingShotAction(s, a.id),
      },
    });
  }
}
writeFileSync(
  `${dir}/frozen-decisions.json.gz`,
  gzipSync(
    JSON.stringify({
      sourceHash: pr172SourceHash(),
      scope:
        'Original untouched PR179 decision states, counterfactual current ranking; historical trajectories need not remain identical',
      states: frozen,
    }),
  ),
);
console.log(
  JSON.stringify({
    matrix: rows.length,
    trajectories: trajectories.length,
    shots: shots.length,
    frozen: frozen.length,
  }),
);
const clusterInput = readFileSync(
  'docs/performance/pr177-evidence/loose-contact-loop-input.json.gz',
);
const clusters = [];
for (const policy of [
  'legacy-pr176',
  'state-value-v1',
  'role-value-v1',
  'role-intent-v1',
  'phase-role-hybrid-v1',
]) {
  let s = JSON.parse(gunzipSync(clusterInput));
  const initial = globalThis.structuredClone(s);
  s.decisionPolicy = policy;
  const ids = new Set(s.statistics?.observedContactIds ?? []);
  let firstOwner;
  for (let i = 0; i < 200; i++) {
    s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
    if (!firstOwner && s.ball.ownerId) firstOwner = { at: s.time, actorId: s.ball.ownerId };
  }
  clusters.push({
    policy,
    firstOwner,
    displacement: Math.hypot(s.ball.x - initial.ball.x, s.ball.y - initial.ball.y),
    contactIds: (s.statistics?.observedContactIds ?? []).filter((id) => !ids.has(id)).length,
    finalHash: createHash('sha256').update(JSON.stringify(s)).digest('hex'),
  });
}
writeFileSync(
  'docs/performance/PR180-contact-regressions.json',
  JSON.stringify(
    {
      sourceHash: pr172SourceHash(),
      scope:
        'Unmodified actual historical PR177 overlap-loop state, five seconds of canonical movement. No interval between two contacts is alone labelled a defect.',
      inputSha256: createHash('sha256').update(clusterInput).digest('hex'),
      clusters,
    },
    null,
    2,
  ) + '\n',
);
