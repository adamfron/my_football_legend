/* global structuredClone */
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { createFootballLabProfile } from './footballLabProfile.ts';
import { inventoryFootballAttributes } from './footballLabAttributeCoverage.ts';
import { createFootballDrillCatalog } from '../src/core/matchSimulation/footballLabCatalog.ts';
import {
  runFootballSkillTrial,
  makeLabState,
  footballSkillTrialConfigSchema,
} from '../src/core/matchSimulation/footballPerformanceLab.ts';
import {
  runFootContactTrial,
  runFeintTrial,
  runJumpTrial,
  runHoopTrial,
  runRepeatedSprintTrial,
  runPhysicalContest,
  runGoalkeeperTrial,
} from '../src/core/matchSimulation/extendedPhysicalLab.ts';

const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v))
    .digest('hex');
const files = readdirSync('src', { recursive: true })
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort();
const sourceSha256 = sha(
  files.map((p) => `${p}\0${readFileSync(`src/${p}`, 'utf8').replaceAll('\r\n', '\n')}`).join('\0'),
);
const harnessSha256 = sha(readFileSync(new URL(import.meta.url)));
const historical = JSON.parse(readFileSync('docs/performance/PR185-baseline.json'));
for (const f of historical.historical)
  if (sha(readFileSync(f.path)) !== f.sha256) throw Error(`Historical receipt changed: ${f.path}`);
const provenance = {
  sourceSha256,
  harnessSha256,
  baseCommit: historical.mergedPr184,
  stepSeconds: 0.025,
  units: {
    time: 's',
    distance: 'm',
    velocity: 'm/s',
    spin: 'rad/s',
    mass: 'kg',
    positiveKineticWork: 'J',
  },
  interpretation:
    'Custom MFL engineering protocols, development evidence; no population or match calibration claim. Distinct starting states are separate from repeated seeds.',
};
const out = 'docs/performance',
  traces = `${out}/pr185-traces`;
mkdirSync(traces, { recursive: true });
const profile = createFootballLabProfile(),
  catalog = createFootballDrillCatalog();
const card = (attributes = {}, body = {}) => ({
  ...structuredClone(profile),
  ...body,
  attributes: { ...profile.attributes, ...attributes },
});
const groups = [],
  measured = {},
  pairedMetricComparisons = [];
let total = 0;
const before = performance.now(),
  cpu = process.cpuUsage();
const row = (id, input, result) => ({ id, input, result });
const compact = (r) => {
  if (r.contact)
    return {
      available: r.contact.available,
      reason: r.contact.unavailableReason,
      surface: r.contact.executed,
      quality: r.contact.quality,
      velocity: r.contact.outgoingVelocity,
      spin: r.contact.outgoingSpin,
      impulse: r.contact.impulse,
      retained: r.contact.retained,
    };
  if (r.repetitions)
    return {
      bestSeconds: r.bestSeconds,
      meanSeconds: r.meanSeconds,
      repetitions: r.repetitions.map((x) => ({
        repetition: x.repetition,
        status: x.status,
        seconds: x.seconds,
        workJoules: x.positiveKineticWorkJoules,
        brakingSeconds: x.brakingSeconds,
        readiness: x.fitnessAfter.burstReadiness,
        capacity: x.fitnessAfter.longTermCapacity,
        afterRest: x.afterRest.burstReadiness,
        touches: x.touches,
        lostControl: x.lostControl,
      })),
    };
  if (r.jump)
    return {
      takeoffSeconds: r.takeoffSeconds,
      verticalVelocity: r.jump.takeoffVelocity,
      jumpHeight: r.jump.maximumHeight,
      headerExecuted: r.headerExecuted,
      headerVelocity: r.headerVelocity,
      maximumHeadingReach: r.maximumHeadingReach,
      contactSeconds: r.contactSeconds,
      contactHeight: r.contactHeight,
      landingSeconds: r.jump.landingAt,
      readySeconds: r.jump.elapsed,
    };
  if (r.contacts && 'completedMove' in r)
    return {
      elapsedSeconds: r.samples.at(-1)?.at ?? 0,
      completedMove: r.completedMove,
      escaped: r.escaped,
      failure: r.failure,
      defenderCommitment: r.defenderCommitment,
      challengeOutcomes: r.challengeOutcomes,
      contacts: r.contacts.slice(0, 2).map((c) => ({
        at: c.at,
        surface: c.executed,
        foot: c.foot,
        velocity: c.outgoingVelocity,
        spin: c.outgoingSpin,
        quality: c.quality,
      })),
    };
  if ('rimContact' in r)
    return {
      hit: r.hit,
      rimContact: r.rimContact,
      crossing: r.crossing,
      maximumHeight: r.maximumHeight,
      lateralCurvature: r.lateralCurvature,
      predictionError: r.predictionError,
    };
  if ('reactionDelay' in r)
    return {
      outcome: r.outcome,
      handling: r.handling,
      reactionDelay: r.reactionDelay,
      firstMovementSeconds: r.firstMovementSeconds,
      claimReason: r.claimReason,
      releaseVelocity: r.releaseVelocity,
      releaseSpin: r.releaseSpin,
      releasePoint: r.releasePoint,
      distributionError: r.distributionError,
      secondBallOutcome: r.secondBallOutcome,
      finalKeeper: r.samples.at(-1)?.keeper ?? null,
    };
  if ('access' in r)
    return {
      access: r.access,
      body: r.body,
      outcome: r.outcome,
      minimumBalance: Math.min(...r.samples.map((s) => s.balance)),
    };
  return {
    ...(r.hoopOutcome ?? {}),
    status: r.status,
    failure: r.failure,
    finishSeconds: r.finishSeconds,
    metrics: r.metrics,
    decisions: r.decisions,
  };
};
const save = (name, rows) => {
  const archive = `${traces}/${name}.json.gz`,
    data = Buffer.from(JSON.stringify(rows));
  writeFileSync(archive, gzipSync(data));
  const distinct = new Set(
    rows.map((r) => {
      const { seed, ...input } = r.input;
      void seed;
      return sha(input);
    }),
  ).size;
  const startingState = (r) => {
    if ('access' in r.result) {
      const { seed, ...state } = r.input.state;
      void seed;
      return state;
    }
    const c = r.input.config;
    if (r.result.contact)
      return {
        player: r.input.player,
        velocity: c.velocity,
        spin: c.spin,
        offset: c.offset,
        height: c.height,
        facingAngle: c.facingAngle,
        bodyVelocity: c.bodyVelocity,
        balance: c.balance,
        preparationSeconds: c.preparationSeconds,
        pressure: c.pressure,
      };
    if (r.result.metrics)
      return { state: makeLabState(r.input.player, c, 'initial-state'), objects: c.objects };
    if (r.result.jump)
      return {
        player: r.input.player,
        approachSpeed: c.approachSpeed,
        afterTurn: c.afterTurn,
        ballHeight: c.ballHeight,
        ballArrivalSeconds: c.ballArrivalSeconds,
      };
    if (r.result.repetitions)
      return {
        player: r.input.player,
        ball: c.ball,
        fitness: r.result.repetitions[0].fitnessBefore,
      };
    if ('completedMove' in r.result)
      return {
        player: r.input.player,
        defender: c.defender,
        separation: c.separation,
        initialOffset: c.initialOffset,
      };
    if ('reactionDelay' in r.result)
      return {
        player: r.input.player,
        exercise: ['throw', 'kick'].includes(c.exercise)
          ? 'held_ball'
          : ['angle', 'one_on_one'].includes(c.exercise)
            ? 'ground_carrier'
            : c.exercise,
        ...(!['throw', 'kick', 'angle', 'one_on_one'].includes(c.exercise)
          ? {
              velocity: {
                x: c.speed,
                y: (c.lateral * c.speed) / c.distance,
                z: c.exercise === 'high' ? 4.5 : 0,
              },
              height: c.height,
              distance: c.distance,
              interference: c.interference,
            }
          : {}),
      };
    return r.input;
  };
  const startingStates = new Set(rows.map((r) => sha(startingState(r)))).size;
  const receipt = {
    ...provenance,
    trials: rows.length,
    distinctInputProfiles: distinct,
    physicallyDifferentStartingStates: startingStates,
    archive,
    archiveSha256: sha(readFileSync(archive)),
    rows: rows.map((r) => ({
      id: r.id,
      inputSha256: sha(r.input),
      resultSha256: sha(r.result),
      factors: r.input,
      measured: compact(r.result),
    })),
  };
  writeFileSync(`${out}/PR185-${name}.json`, JSON.stringify(receipt) + '\n');
  groups.push({ name, trials: rows.length, distinct });
  total += rows.length;
  console.log(name, rows.length, 'trials', distinct, 'distinct input profiles');
};
const skill = (id, p, seed = 'paired') => {
  const c = structuredClone(catalog.find((c) => c.id === id));
  return runFootballSkillTrial(c, p, `pr185:${id}:${seed}`);
};
const note = (attribute, context, low, high) => {
  pairedMetricComparisons.push({ attribute, context, low, high });
  measured[attribute] ??= { drills: [], intended: true, effect: false };
  measured[attribute].drills.push(context);
  measured[attribute].effect ||= JSON.stringify(low) !== JSON.stringify(high);
};

{
  const rows = [];
  for (const surface of ['inside', 'outside', 'instep', 'sole', 'cushion', 'protection'])
    for (const foot of ['left', 'right'])
      for (const facingAngle of [0, Math.PI / 2, Math.PI])
        for (const weakFootProficiency of [20, 100]) {
          const config = { surface, foot, facingAngle, desiredVelocity: { x: 5, y: 1, z: 0 } },
            p = card({}, { weakFootProficiency });
          const r = runFootContactTrial(config, p, 'pr185-contact');
          rows.push(row(`${surface}-${foot}-${facingAngle}-${weakFootProficiency}`, r.input, r));
        }
  save('foot-contact-techniques', rows);
  for (const a of ['technique', 'dribbling', 'firstTouch', 'agility']) {
    const config = {
      surface: 'outside',
      velocity: { x: 8, y: 3, z: 0 },
      desiredVelocity: { x: 4, y: -2, z: 0 },
      pressure: 0.6,
    };
    note(
      a,
      'foot-surface-control',
      compact(runFootContactTrial(config, card({ [a]: 20 }), 'attribute')),
      compact(runFootContactTrial(config, card({ [a]: 100 }), 'attribute')),
    );
  }
}
{
  const rows = [];
  for (const spacing of [2, 4, 6])
    for (const dribbling of [20, 60, 100])
      for (const pace of [40, 90]) {
        const p = card({ dribbling, pace }),
          r = skill(`slalom-${spacing}-unrestricted`, p);
        rows.push(row(`${spacing}-${dribbling}-${pace}`, r.input, r));
      }
  for (const pace of [25, 95])
    for (const dribbling of [25, 95]) {
      const p = card({ pace, dribbling }),
        r = runFeintTrial({ defender: 'none' }, p, 'pr185-burst');
      rows.push(row(`burst-${pace}-${dribbling}`, r.input, r));
    }
  save('dribbling-mechanics', rows);
}
{
  const rows = [];
  for (const dominantFoot of ['left', 'right'])
    for (const foot of ['dominant', 'weak', 'unrestricted'])
      for (const mirror of [false, true])
        for (const movingStart of [0, 2]) {
          const c = structuredClone(catalog.find((c) => c.id === `slalom-2-${foot}`));
          c.movingStart = movingStart;
          if (mirror) {
            c.route = c.route.map((p) => ({ ...p, y: 68 - p.y }));
            c.objects = c.objects.map((o) => ({
              ...o,
              position: { ...o.position, y: 68 - o.position.y },
            }));
          }
          const p = card({}, { dominantFoot });
          const r = runFootballSkillTrial(c, p, 'pr185-mirror');
          rows.push(row(`${dominantFoot}-${foot}-${mirror}-${movingStart}`, r.input, r));
        }
  save('mirrored-slalom', rows);
}
{
  const rows = [];
  for (const agility of [20, 60, 100])
    for (const pace of [30, 90])
      for (const turn of ['505-left', '505-right', 'out-back-left', 'out-back-right']) {
        const r = skill(turn, card({ agility, pace }));
        rows.push(row(`${turn}-${agility}-${pace}`, r.input, r));
      }
  save('balance-and-turns', rows);
}
{
  const rows = [];
  for (const move of ['inside_outside', 'outside_inside', 'sole_redirect', 'elastico'])
    for (const defender of ['none', 'commit', 'delay', 'fast', 'wrong_facing', 'cover'])
      for (const skill of [25, 60, 95])
        for (let seed = 0; seed < 3; seed++) {
          const p = card({ technique: skill, dribbling: skill, agility: skill }),
            r = runFeintTrial({ move, defender }, p, `pr185-feint:${seed}`);
          rows.push(row(`${move}-${defender}-${skill}-${seed}`, r.input, r));
        }
  for (const defender of ['commit', 'delay', 'cover'])
    for (const dribbling of [20, 100])
      for (let seed = 0; seed < 30; seed++) {
        const r = runFeintTrial(
          { move: 'elastico', defender },
          card({ dribbling }),
          `pr185-isolated-dribbling:${seed}`,
        );
        rows.push(row(`isolated-dribbling-${defender}-${dribbling}-${seed}`, r.input, r));
      }
  save('elastico-feint', rows);
}
{
  const rows = [];
  for (const speed of [6, 18, 26])
    for (const omega of [0, 5, 15, 30, 45, 60])
      for (const axis of ['top', 'back', 'side', 'combined'])
        for (const surface of ['inside', 'instep', 'sole', 'cushion'])
          for (const preparationSeconds of [0.01, 0.3]) {
            const spin =
              axis === 'top'
                ? { x: 0, y: omega, z: 0 }
                : axis === 'back'
                  ? { x: 0, y: -omega, z: 0 }
                  : axis === 'side'
                    ? { x: 0, y: 0, z: omega }
                    : { x: omega / Math.sqrt(3), y: omega / Math.sqrt(3), z: omega / Math.sqrt(3) };
            const config = {
              surface,
              velocity: { x: speed, y: 0, z: 0 },
              spin,
              preparationSeconds,
            };
            const r = runFootContactTrial(config, profile, 'pr185-spin');
            rows.push(
              row(`${speed}-${omega}-${axis}-${surface}-${preparationSeconds}`, r.input, r),
            );
          }
  for (const spin of [0, 60]) {
    const r = skill(`receive-18-spin-${spin}`, profile);
    rows.push(row(`reception-v-recovery-${spin}`, r.input, r));
  }
  save('spin-reception', rows);
}
{
  const rows = [];
  for (const speed of [14, 18, 24])
    for (const elevation of [0.15, 0.35, 0.6])
      for (const omega of [0, 15, 30, 60])
        for (const axis of ['back', 'side', 'combined'])
          for (const geometry of ['near', 'offset', 'tilted']) {
            const config = {
              hoop: {
                id: 'hoop',
                kind: 'hoop',
                position: {
                  x: geometry === 'near' ? 10 : 15,
                  y: geometry === 'offset' ? 35 : 34,
                  z: geometry === 'tilted' ? 2.4 : 1.6,
                },
                normal: geometry === 'tilted' ? { x: 1, y: 0, z: 0.3 } : { x: 1, y: 0, z: 0 },
                innerDiameter: geometry === 'near' ? 2 : 1.4,
                rimRadius: 0.04,
                direction: 'positive',
              },
              ball: {
                position: { x: 0, y: 34, z: 0.3 },
                velocity: { x: speed * Math.cos(elevation), y: 0, z: speed * Math.sin(elevation) },
                spin:
                  axis === 'back'
                    ? { x: 0, y: -omega, z: 0 }
                    : axis === 'side'
                      ? { x: 0, y: 0, z: omega }
                      : { x: 0, y: -omega / Math.sqrt(2), z: omega / Math.sqrt(2) },
              },
            };
            const r = runHoopTrial(config);
            rows.push(
              row(
                `launcher-${speed}-${elevation}-${omega}-${axis}-${geometry}`,
                { ...r.input, mode: 'prescribed_launcher' },
                r,
              ),
            );
          }
  for (const surface of ['inside', 'outside', 'instep'])
    for (const ability of [25, 90])
      for (const foot of ['left', 'right']) {
        const p = card({ technique: ability, dribbling: ability }),
          contact = runFootContactTrial(
            {
              surface,
              foot,
              velocity: { x: 0, y: 0, z: 0 },
              desiredVelocity: { x: 20, y: 0, z: 5 },
            },
            p,
            'pr185-hoop-kick',
          );
        const r = runHoopTrial({
          hoop: {
            id: 'hoop',
            kind: 'hoop',
            position: { x: 30, y: 34, z: 1.6 },
            normal: { x: 1, y: 0, z: 0 },
            innerDiameter: 2,
            rimRadius: 0.04,
            direction: 'positive',
          },
          ball: {
            position: contact.contact.point,
            velocity: contact.contact.outgoingVelocity,
            spin: contact.contact.outgoingSpin,
          },
        });
        rows.push(
          row(
            `kick-${surface}-${ability}-${foot}`,
            { mode: 'prescribed_kick', contactInput: contact.input, hoop: r.input.hoop },
            { ...r, sourceContact: contact.contact },
          ),
        );
      }
  for (const technique of ['placed', 'driven', 'chip'])
    for (const ability of [25, 90])
      for (const foot of ['dominant', 'weak'])
        for (const height of [0.5, 3.2])
          for (let seed = 0; seed < 3; seed++) {
            const c = structuredClone(
              catalog.find((c) => c.id === `shot-stationary-${technique}-${foot}`),
            );
            c.objects = [
              {
                id: 'hoop',
                kind: 'hoop',
                position: { x: 100, y: 34, z: height },
                normal: { x: 1, y: 0, z: 0 },
                innerDiameter: 2,
                rimRadius: 0.04,
                direction: 'positive',
              },
            ];
            c.targetId = 'hoop';
            const r = runFootballSkillTrial(
              c,
              card({ technique: ability, finishing: ability }),
              `pr185-canonical-hoop:${seed}`,
            );
            const rimContact = r.contacts.some((c) => c.kind === 'hoop');
            rows.push(
              row(`canonical-kick-${technique}-${ability}-${foot}-${height}-${seed}`, r.input, {
                ...r,
                hoopOutcome: {
                  hit:
                    !rimContact &&
                    r.events.some((e) => e.kind === 'ball_plane' && e.values.hit === true),
                  rimContact,
                },
              }),
            );
          }
  save('hoop-trajectories', rows);
}
{
  const rows = [];
  for (const metres of ['10', '20', '20+20'])
    for (const restSeconds of [0, 2, 10, 30])
      for (const ball of [false, true])
        for (const stamina of [20, 90]) {
          const p = card({ pace: 90, stamina }),
            r = runRepeatedSprintTrial({ metres, restSeconds, ball }, p, 'pr185-rsa');
          rows.push(row(`${metres}-${restSeconds}-${ball}-${stamina}`, r.input, r));
        }
  save('repeated-sprints', rows);
  note(
    'stamina',
    'six-real-accelerations',
    compact(rows.find((r) => r.id === '20-0-false-20').result),
    compact(rows.find((r) => r.id === '20-0-false-90').result),
  );
}
{
  const rows = [];
  for (const heightCm of [165, 195])
    for (const weightKg of [60, 90])
      for (const jumping of [25, 90])
        for (const strength of [25, 90])
          for (const variant of ['standing', 'arms', 'approach', 'after_turn']) {
            const p = card({ jumping, strength }, { heightCm, weightKg }),
              r = runJumpTrial(
                {
                  armAssistance: variant === 'arms',
                  approachSpeed: variant === 'approach' || variant === 'after_turn' ? 4 : 0,
                  afterTurn: variant === 'after_turn',
                },
                p,
                'pr185-jump',
              );
            rows.push(row(`${heightCm}-${weightKg}-${jumping}-${strength}-${variant}`, r.input, r));
          }
  save('jumping-and-heading', rows);
  for (const a of ['jumping', 'strength', 'agility', 'heading'])
    note(
      a,
      'vertical-impulse-and-recovery',
      compact(runJumpTrial({}, card({ [a]: 20 }), 'jump')),
      compact(runJumpTrial({}, card({ [a]: 100 }), 'jump')),
    );
}
{
  const rows = [];
  for (const technique of ['standing', 'committed', 'slide', 'tactical'])
    for (const angle of ['front', 'side', 'behind', 'shield'])
      for (const weightKg of [60, 95])
        for (const strength of [25, 90])
          for (let seed = 0; seed < 6; seed++) {
            const p = card({ strength }, { weightKg }),
              s = makeLabState(
                p,
                footballSkillTrialConfigSchema.parse({ id: 'contest', drill: 'sprint' }),
                `pr185-contest:${seed}`,
              );
            s.ball = { ...s.ball, x: 20.4, y: 34 };
            const d = structuredClone(s.players[0]);
            d.id = 'defender';
            d.profile = {
              ...d.profile,
              id: d.id,
              weightKg: 75,
              attributes: { ...d.profile.attributes, strength: 60, tackling: 60 },
            };
            d.team = 'away';
            d.position =
              angle === 'front'
                ? { x: 21, y: 34 }
                : angle === 'side'
                  ? { x: 20.3, y: 35 }
                  : angle === 'behind'
                    ? { x: 19, y: 34 }
                    : { x: 19.1, y: 34 };
            d.velocity = {
              x: angle === 'behind' || angle === 'shield' ? 3 : angle === 'front' ? -2 : 0,
              y: angle === 'side' ? -2 : 0,
            };
            d.facingAngle = angle === 'front' ? -Math.PI / 2 : Math.PI / 2;
            s.players.push(d);
            s.ballCarrierIntent = {
              actorId: p.id,
              type: 'carry',
              target: { x: 24, y: 34 },
              startedAt: 0,
              expiresAt: 4,
              estimatedArrival: 1,
              startPosition: { x: 20, y: 34 },
              closestPointReached: { x: 20, y: 34 },
              humanSelected: false,
              executionMode: angle === 'shield' ? 'shield' : 'controlled',
            };
            const r = runPhysicalContest(s, d.id, p.id, technique);
            rows.push(
              row(
                `${technique}-${angle}-${weightKg}-${strength}-${seed}`,
                { state: s, defenderId: d.id, carrierId: p.id, technique },
                r,
              ),
            );
          }
  for (const attribute of ['tackling', 'strength', 'agility', 'gameReading', 'composure']) {
    const effects = { 20: [], 100: [] };
    for (const band of [20, 100])
      for (let seed = 0; seed < 6; seed++) {
        const s = structuredClone(rows.find((r) => r.id === 'standing-front-60-25-0').input.state);
        s.seed = `pr185-challenge-sensitivity:${seed}`;
        s.players.find((p) => p.id === 'defender').profile.attributes[attribute] = band;
        const r = runPhysicalContest(s, 'defender', s.ball.ownerId, 'standing');
        effects[band].push(compact(r));
        rows.push(
          row(
            `sensitivity-${attribute}-${band}-${seed}`,
            { state: s, defenderId: 'defender', carrierId: s.ball.ownerId, technique: 'standing' },
            r,
          ),
        );
      }
    note(attribute, 'standing-challenge', effects[20], effects[100]);
  }
  for (const technique of ['committed', 'slide', 'tactical'])
    for (let seed = 0; seed < 8; seed++) {
      const s = structuredClone(rows[0].input.state);
      s.seed = `pr185-late-challenge:${seed}`;
      const actor = s.players[0],
        defender = s.players[1];
      actor.position = { x: 92, y: 34 };
      actor.velocity = { x: 3, y: 0 };
      s.ball = { ...s.ball, x: 92.4, y: 34 };
      s.ballCarrierIntent.target = { x: 104, y: 34 };
      defender.position = { x: 91.1, y: 34 };
      defender.velocity = { x: 6, y: 0 };
      defender.facingAngle = Math.PI / 2;
      const r = runPhysicalContest(s, defender.id, actor.id, technique);
      rows.push(
        row(
          `late-${technique}-${seed}`,
          { state: s, defenderId: defender.id, carrierId: actor.id, technique },
          r,
        ),
      );
    }
  save('contact-and-shielding', rows);
}
{
  const rows = [],
    distribution = [];
  for (const exercise of [
    'reaction',
    'low',
    'high',
    'angle',
    'one_on_one',
    'cross',
    'parry_recovery',
    'throw',
    'kick',
  ])
    for (const ability of [20, 60, 100])
      for (const lateral of [0, 2.7])
        for (const speed of [12, 26])
          for (let seed = 0; seed < 3; seed++) {
            const p = card({
              reflexes: ability,
              handling: ability,
              oneOnOnes: ability,
              goalkeeperSweeping: ability,
              goalkeeperKicking: ability,
              goalkeeperThrowing: ability,
            });
            const r = runGoalkeeperTrial(
              {
                exercise,
                lateral,
                speed,
                height: exercise === 'low' ? 0.11 : exercise === 'high' ? 1.4 : 0.35,
                interference: exercise === 'cross' && seed === 2,
              },
              p,
              `pr185-keeper:${seed}`,
            );
            (exercise === 'throw' || exercise === 'kick' ? distribution : rows).push(
              row(`${exercise}-${ability}-${lateral}-${speed}-${seed}`, r.input, r),
            );
          }
  save('goalkeeper-reactions', rows);
  save('goalkeeper-distribution', distribution);
  for (const attribute of [
    'reflexes',
    'handling',
    'oneOnOnes',
    'goalkeeperSweeping',
    'goalkeeperKicking',
    'goalkeeperThrowing',
    'gameReading',
    'composure',
  ]) {
    const exercise =
      attribute === 'goalkeeperThrowing'
        ? 'throw'
        : attribute === 'goalkeeperKicking'
          ? 'kick'
          : attribute === 'goalkeeperSweeping'
            ? 'cross'
            : attribute === 'oneOnOnes' || attribute === 'gameReading'
              ? 'one_on_one'
              : 'reaction';
    const low = runGoalkeeperTrial({ exercise }, card({ [attribute]: 20 }), 'paired-attribute'),
      high = runGoalkeeperTrial({ exercise }, card({ [attribute]: 100 }), 'paired-attribute');
    note(attribute, `keeper-${exercise}`, compact(low), compact(high));
  }
}
{
  const rows = [];
  for (const id of [
    'pass-10-dominant-ground',
    'wall-receive-turn',
    'shot-stationary-placed-dominant',
  ])
    for (let i = 0; i < 10; i++) {
      const c = structuredClone(catalog.find((c) => c.id === id));
      c.mode = 'autonomous';
      const r = runFootballSkillTrial(c, profile, `pr185-autonomous:${i}`);
      rows.push(row(`${id}-${i}`, r.input, r));
    }
  save('autonomous-experiments', rows);
}
{
  const rows = [];
  for (const [attribute, id] of [
    ['passing', 'pass-30-dominant-ground'],
    ['finishing', 'shot-stationary-placed-dominant'],
  ]) {
    const values = { 20: [], 100: [] };
    for (const band of [20, 100])
      for (let seed = 0; seed < 30; seed++) {
        const r = skill(id, card({ [attribute]: band }), `sensitivity:${seed}`);
        values[band].push(r.metrics.targetErrorMetres);
        rows.push(row(`${attribute}-${band}-${seed}`, r.input, r));
      }
    note(attribute, id, values[20], values[100]);
  }
  for (const pace of [20, 100]) {
    const r = runFeintTrial({ defender: 'none' }, card({ pace }), 'pr185-isolated-pace');
    rows.push(row(`pace-${pace}`, r.input, r));
  }
  note(
    'pace',
    'physical-burst-recovery',
    compact(rows.find((r) => r.id === 'pace-20').result),
    compact(rows.find((r) => r.id === 'pace-100').result),
  );
  save('attribute-sensitivity', rows);
}
const elapsed = performance.now() - before,
  cost = process.cpuUsage(cpu);
writeFileSync(
  `${out}/PR185-performance.json`,
  JSON.stringify({
    ...provenance,
    groups,
    totalTrials: total,
    wallMilliseconds: elapsed,
    cpuMicroseconds: cost,
    rssBytes: process.memoryUsage().rss,
    scope:
      'Serial isolated trials including real canonical keeper ticks and gzip writing. Full-match cost is recorded separately.',
  }) + '\n',
);
writeFileSync(
  `${out}/PR185-attribute-coverage.json`,
  JSON.stringify({
    ...provenance,
    ...inventoryFootballAttributes(measured),
    pairedMetricComparisons,
    parameterOutsideSchema: {
      weakFootProficiency: 'Direct tested effect on contact quality and outgoing velocity',
    },
    limitations:
      'Effect flags refer only to the measured metric and protocol; grouped keeper band sweeps are not causal attribution. Single-attribute controls are separate. Heading timing, tackling sensitivity, decision-only and career traits need further targeted coverage.',
  }) + '\n',
);
console.log('TOTAL', total, 'wall', elapsed.toFixed(0), 'ms');
