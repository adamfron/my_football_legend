import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  projectGoalkeeperIntervention,
  GOALKEEPER_PHYSICS,
} from '../src/core/matchSimulation/goalkeeperIntervention.ts';
import { sampleCanonicalOutcome } from '../src/core/matchSimulation/canonicalOutcome.ts';
import {
  createFlightCatalogue,
  createSensor,
  sampleSensor,
  physicalBall,
  predictFlightBelief,
  cueFor,
} from './pr199FlightLab.mjs';
import { hash, identity, finish, options } from './pr199Evidence.mjs';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry.ts';
import { angleForVector } from '../src/core/matchSimulation/playerOrientation.ts';
const source = identity(),
  start = performance.now(),
  cpu = process.cpuUsage();
const rotations = createFlightCatalogue().filter((e) => e.family === 'rotation');
const scenarios = [
  'clear',
  'wall_initial',
  'visible_then_wall',
  'moving_crowd',
  'leg_gap',
  'teammate_screen',
  'late_deflection',
  'high_early',
  'too_late',
  'tracking_failure',
];
const rows = [];
const version = options.get('version') ?? 'v1';
const run = (initial, scenario, config) => {
  let s = globalThis.structuredClone(initial);
  const keeper = s.players.find((p) => p.team === 'away' && p.slot.position === 'goalkeeper');
  if (config.attribute === 'allKeeper')
    for (const key of Object.keys(keeper.profile.attributes))
      keeper.profile.attributes[key] = config.level;
  else if (config.attribute) keeper.profile.attributes[config.attribute] = config.level;
  const initialAt = s.time,
    initialKeeper = globalThis.structuredClone(keeper),
    initialHash = hash(s),
    launchHash = hash(s.ball);
  const sensor = createSensor(
      keeper,
      s.seed,
      config.cues ? { ...config.cue, at: initialAt } : undefined,
    ),
    frames = [],
    contacts = [];
  let lastProjection,
    reactionAt = null,
    firstDirection = null,
    corrections = 0,
    lastDirection = 0;
  if (!config.native)
    globalThis.__mflPr199Lab = {
      projectGoalkeeperIntervention: ([state, maxSeconds], original) => {
        const estimated = predictFlightBelief(sensor.belief, state.time);
        if (!estimated?.hasVelocityEstimate || !state.ball.shot) {
          lastProjection = undefined;
          return undefined;
        }
        const evidenceStart =
          sensor.firstSight ?? (config.cues && sensor.belief?.cue?.preparing ? initialAt : null);
        if (evidenceStart === null) return undefined;
        const sinceSighting = Math.max(0, state.time - evidenceStart);
        const surrogate = {
          ...state,
          ball: {
            ...state.ball,
            x: estimated.position.x,
            y: estimated.position.y,
            height: estimated.position.z,
            velocity: estimated.velocity,
            spin: { x: 0, y: 0, z: 0 },
            flightTime: sinceSighting,
            shot: {
              ...state.ball.shot,
              distance: Math.abs(initialKeeper.position.x - estimated.position.x),
              blockingDefenders: 2,
            },
          },
        };
        const projection = original(surrogate, Math.min(2.4, maxSeconds ?? 2.4));
        if (!projection) {
          lastProjection = undefined;
          return undefined;
        }
        // Canonical movement compares delay with physical flight age. Offset the delay
        // so a hidden release cannot consume the keeper's unstarted reaction clock.
        const elapsedBeforeSighting = Math.max(0, (state.ball.flightTime ?? 0) - sinceSighting);
        lastProjection = {
          ...projection,
          reactionDelay: projection.reactionDelay + elapsedBeforeSighting,
          ballTotalFlightTime: state.ball.flightTime ?? 0,
        };
        return lastProjection;
      },
      ...(['v3', 'v4', 'v5', 'v6', 'v7'].includes(version)
        ? {
            integrateCanonicalMovement: (input, original) => {
              const [body, motor] = input;
              if (body.id !== keeper.id) return original(...input);
              const ready = lastProjection?.reachable && lastProjection.reactionRemaining <= 1e-8;
              const estimated = predictFlightBelief(sensor.belief, s.time);
              return original(body, {
                ...motor,
                target: ready ? lastProjection.contactPoint : initialKeeper.position,
                targetSpeed: ready
                  ? GOALKEEPER_PHYSICS.baseMaximumSpeed +
                    body.profile.attributes.agility * GOALKEEPER_PHYSICS.agilityMaximumSpeed
                  : 0,
                desiredFacingAngle: estimated?.hasVelocityEstimate
                  ? angleForVector({
                      x: estimated.position.x - body.position.x,
                      y: estimated.position.y - body.position.y,
                    })
                  : initialKeeper.facingAngle,
              });
            },
          }
        : {}),
    };
  try {
    for (let tick = 0; tick < 160; tick++) {
      const p = s.players.find((p) => p.id === keeper.id),
        relative = s.time - initialAt;
      if (p) {
        const midpoint =
          version === 'v7'
            ? {
                x: (initialKeeper.position.x + initial.ball.x) / 2,
                y: (initialKeeper.position.y + initial.ball.y) / 2,
              }
            : { x: (p.position.x + s.ball.x) / 2, y: (p.position.y + s.ball.y) / 2 };
        let occluders = [];
        if (scenario === 'wall_initial')
          occluders = [
            {
              centre: { x: initialKeeper.position.x - 6, y: initialKeeper.position.y },
              radius: 0.9,
              bottom: 0,
              top: 1.8,
            },
          ];
        if (scenario === 'wall_initial' && version === 'v7') {
          const wallIds = Object.entries(initial.restart?.roles ?? {})
            .filter(([, r]) => r.key.includes('wall'))
            .map(([id]) => id);
          occluders = s.players
            .filter((p) => wallIds.includes(p.id))
            .map((p) => ({
              centre: p.position,
              radius: 0.28,
              bottom: p.verticalJump?.height ?? 0,
              top: (p.verticalJump?.height ?? 0) + p.profile.heightCm / 100,
            }));
        }
        if (scenario === 'visible_then_wall')
          occluders = [
            {
              centre: {
                ...midpoint,
                y: midpoint.y + (0.2 - relative) * (version === 'v7' ? 7.5 : 12),
              },
              radius: 0.45,
              bottom: 0,
              top: 1.8,
            },
          ];
        if (scenario === 'moving_crowd')
          occluders = [-1, 1].map((sign) => ({
            centre: { ...midpoint, y: midpoint.y + sign * (relative - 0.3) * 6 },
            radius: 0.35,
            bottom: 0,
            top: 1.8,
          }));
        if (scenario === 'leg_gap')
          occluders = [
            {
              centre:
                version === 'v7'
                  ? { x: initial.ball.x + 2, y: initial.ball.y }
                  : { x: initialKeeper.position.x - 0.7, y: initialKeeper.position.y },
              radius: 0.28,
              bottom: 0.55,
              top: 1.8,
            },
          ];
        if (scenario === 'teammate_screen')
          occluders = [
            {
              centre: {
                x: initialKeeper.position.x - 3,
                y: initialKeeper.position.y + (relative - 0.2) * 7,
              },
              radius: 0.35,
              bottom: 0,
              top: 1.8,
            },
          ];
        const offered =
          scenario === 'too_late'
            ? relative >= 0.8
            : scenario === 'tracking_failure'
              ? relative < 0.15
              : scenario === 'late_deflection'
                ? relative < 0.1 || relative >= 0.45
                : true;
        sampleSensor(sensor, p, physicalBall(s.ball), s.time, offered, occluders);
      }
      const before = s;
      s = step(s, 0.025);
      const sample = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
      contacts.push(...sample.contacts);
      const after = s.players.find((p) => p.id === keeper.id);
      if (after) {
        const delta = after.velocity.y - initialKeeper.velocity.y;
        const direction = Math.abs(delta) > 0.1 ? Math.sign(delta) : 0;
        if (
          (version === 'v7'
            ? Math.hypot(after.velocity.x - initialKeeper.velocity.x, delta) > 0.1
            : direction) &&
          reactionAt === null
        ) {
          reactionAt = s.time - initialAt;
          firstDirection =
            version === 'v7'
              ? { x: after.velocity.x - initialKeeper.velocity.x, y: delta }
              : direction;
        }
        if (lastDirection && direction && direction !== lastDirection) corrections++;
        if (direction) lastDirection = direction;
        if (tick % 2 === 0 || sample.contacts.length)
          frames.push({
            at: s.time - initialAt,
            firstSight: sensor.firstSight === null ? null : sensor.firstSight - initialAt,
            evidenceAt: sensor.belief?.evidenceAt ?? null,
            age: sensor.belief ? s.time - sensor.belief.evidenceAt : null,
            uncertainty: predictFlightBelief(sensor.belief, s.time)?.uncertainty ?? null,
            ball: sample.ball,
            velocity: sample.velocity,
            keeper: {
              position: after.position,
              velocity: after.velocity,
              facing: after.facingAngle,
            },
            projection: lastProjection
              ? {
                  point: lastProjection.contactPoint,
                  reactionDelay: lastProjection.reactionDelay,
                  remaining: lastProjection.reactionRemaining,
                  reachable: lastProjection.reachable,
                  availableReach: lastProjection.availableReach,
                  required: lastProjection.requiredDisplacement,
                }
              : null,
            contact: s.lastBallContact ?? null,
            shot: s.lastShot?.shotId === initial.ball.shot?.shotId ? s.lastShot : null,
          });
      }
      if (
        (s.lastShot?.shotId === initial.ball.shot?.shotId && s.lastShot.outcome) ||
        s.postGoal ||
        (s.restart && s.restart.phase !== 'release')
      )
        break;
    }
  } finally {
    delete globalThis.__mflPr199Lab;
  }
  const shot = s.lastShot?.shotId === initial.ball.shot?.shotId ? s.lastShot : null;
  return {
    inputHash: initialHash,
    cueOffered: sensor.cueOffered,
    cueAcquired: sensor.cueAcquired,
    launchHash,
    keeperInitialHash: hash(initialKeeper),
    finalHash: hash(s),
    firstSight: sensor.firstSight === null ? null : sensor.firstSight - initialAt,
    offeredSeconds: sensor.offered,
    attendedSeconds: sensor.attended,
    observations: sensor.belief?.observations ?? 0,
    acquiredExposure: sensor.belief?.acquiredExposure ?? 0,
    reactionAt,
    firstDirection,
    corrections,
    correctionDefinition:
      'Nonzero lateral velocity sign reversals; complete movement vectors retained separately.',
    contacts,
    keeperContact: contacts.some((c) => c.actorId === keeper.id),
    outcome: shot?.outcome ?? null,
    keeperAction: shot?.goalkeeperAction ?? null,
    goal: shot?.outcome === 'goal',
    catch: shot?.goalkeeperAction === 'catch',
    parry: ['parry', 'parry_away'].includes(shot?.goalkeeperAction),
    unsuccessful: ['failed_save', 'no_chance'].includes(shot?.goalkeeperAction),
    finalPosition: s.players.find((p) => p.id === keeper.id)?.position ?? null,
    saveSurface: {
      canonicalReach: GOALKEEPER_PHYSICS.contactReachMetres,
      centreHeight: GOALKEEPER_PHYSICS.contactCentreHeight,
      limitation: 'Existing spherical/capsule intervention envelope; no new diving/hand anatomy',
    },
    frames,
    acquisitions: sensor.acquired,
  };
};
for (const sample of [0, 1])
  for (const scenario of scenarios) {
    let initial = rotations[sample].state;
    let cue = rotations[sample].cue;
    if (['late_deflection', 'too_late', 'leg_gap'].includes(scenario)) {
      const f = createCalibrationFixture({
        scenario: scenario === 'late_deflection' ? 'blocked_shot' : 'good_shot',
        attacker: 80,
        defender: 60,
        seed: `pr199-shot-${sample}`,
        mirror: sample === 1,
      });
      initial = resolveMatchAction(f.state, f.action, 'autonomous_npc');
    }
    if (version !== 'v1' && scenario !== 'wall_initial' && scenario !== 'late_deflection') {
      // A preregistered second apparatus separates visual screens from actual physical
      // blocks. Keep the original miss/block-heavy v1 cohort intact and report both.
      const f = createCalibrationFixture({
        scenario: 'good_shot',
        attacker: 80,
        defender: 60,
        seed: `pr199-clean-shot-${sample}`,
        mirror: sample === 1,
      });
      const shooter = f.state.players.find((p) => p.id === f.actorId);
      shooter.position = { x: scenario === 'too_late' ? 92 : 82, y: 34 };
      shooter.target = { ...shooter.position };
      shooter.facingAngle = Math.PI / 2;
      for (const p of f.state.players)
        if (p.id !== shooter.id && p.slot.position !== 'goalkeeper') {
          p.position = { x: 55 + p.slotIndex * 0.5, y: p.team === 'home' ? 5 : 63 };
          p.target = { ...p.position };
          p.anchor = { ...p.position };
          p.neutralAnchor = { ...p.position };
          p.velocity = { x: 0, y: 0 };
        }
      f.state.ball = {
        ...playerContactGeometry(shooter).rightFoot,
        height: 0.11,
        velocity: { x: 0, y: 0, z: 0 },
        ownerId: shooter.id,
      };
      f.state.currentPressure = 0;
      f.action = {
        type: 'shot',
        actorId: shooter.id,
        intent: 'placed',
        contact: 'settled',
        goalTarget: {
          horizontal: sample ? -0.4 : 0.4,
          vertical: scenario === 'high_early' ? 0.75 : 0.35,
        },
        target: { x: 105, y: sample ? 32.536 : 35.464 },
      };
      cue = cueFor(f.state, f.actorId);
      initial = resolveMatchAction(f.state, f.action, 'autonomous_npc');
    }
    if (!initial.ball.shot) throw Error('Keeper laboratory requires an actual released shot');
    const configs = [
      { attribute: null, level: 60, native: true },
      { attribute: null, level: 60, native: false },
      ...[20, 80].map((level) => ({ attribute: 'allKeeper', level, native: false })),
      ...(['clear', 'wall_initial'].includes(scenario)
        ? [
            'gameReading',
            'concentration',
            'agility',
            'reflexes',
            'handling',
            'positioning',
          ].flatMap((attribute) =>
            [20, 40, 60, 80, 100].map((level) => ({ attribute, level, native: false })),
          )
        : []),
      ...(['v4', 'v5', 'v6', 'v7'].includes(version) && ['clear', 'wall_initial'].includes(scenario)
        ? [{ attribute: null, level: 60, native: false, cues: true, cue }]
        : []),
    ];
    for (const config of configs)
      rows.push({ scenario, sample, config, ...run(initial, scenario, config) });
    // Installing a passive visibility observer cannot change native full-view behaviour.
    if (scenario === 'clear') {
      const base = rows.findLast(
        (r) => r.scenario === scenario && r.sample === sample && r.config.native,
      );
      const repeat = run(initial, scenario, { native: true });
      if (base.finalHash !== repeat.finalHash) throw Error('Native keeper observer drift');
    }
    console.log('PR199 keepers', sample, scenario, rows.length);
  }
finish(
  `goalkeepers-${version}.json.gz`,
  {
    schema: 'pr199-goalkeeper-occlusion-v1',
    source,
    version,
    method:
      'Real executor shots including physically released free kicks. Information-only moving finite 3D laboratory screens never block or retarget the real ball. Shared sensory belief, actual sighting reaction anchor, unknown spin, canonical movement/CCD/contact/catch/parry. Native controller is retained as an explicitly omniscient baseline.',
    limitations: [
      'Cylinder screens approximate bodies; bottom=0.55 is a declared trunk opening, not simulated articulated legs.',
      'Moving screen paths are prescribed laboratory occluders, not autonomous wall construction.',
      'The new inference remains laboratory-only; full-view performance may regress and is not promoted.',
      'Direction/reaction metrics can include inherited tactical movement; projection start and actual movement are retained separately.',
    ],
    motorIsolation: ['v3', 'v4', 'v5', 'v6', 'v7'].includes(version)
      ? 'Lab-only goalkeeper motor input consumes only the inferred forecast and its actual-sighting reaction gate. Canonical body/contact integration remains unchanged. This removes the inherited full-world tactical target/facing confound exposed by v2; no live correction is made.'
      : 'Inherited tactical target/facing consumers remain an explicit confound.',
    rows,
    summary: {
      attempts: rows.length,
      contacts: rows.filter((r) => r.keeperContact).length,
      catches: rows.filter((r) => r.catch).length,
      parries: rows.filter((r) => r.parry).length,
      goals: rows.filter((r) => r.goal).length,
      noSight: rows.filter((r) => r.firstSight === null).length,
    },
  },
  {
    milliseconds: performance.now() - start,
    cpu: process.cpuUsage(cpu),
    maxRSSKiB: process.resourceUsage().maxRSS,
  },
);
void projectGoalkeeperIntervention;
console.log('PR199 keeper trials', rows.length);
