import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { readPr192Evidence } from './readPr192Evidence.mjs';
import { performance } from 'node:perf_hooks';
import { runFirstTouchLab } from '../src/core/matchSimulation/firstTouchLaboratory.ts';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const out = args.get('output') ?? 'docs/performance/pr192/laboratory-v3.json';
const check = args.has('check');
if (!check && existsSync(out)) throw Error('Refusing to overwrite ' + out);
const baseline = readPr192Evidence('docs/performance/pr192/reconstructed-pr191.json');
const hash = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const rows = [];
const started = performance.now(),
  cpu = process.cpuUsage();
const run = (config, player, seed, kind) => {
  const result = runFirstTouchLab(config, player, seed);
  const repeat = runFirstTouchLab(config, player, seed, (s) => {
    s.ball.x = 999;
    if (s.movement) s.movement.movementTarget.x = 999;
  });
  if (hash(result) !== hash(repeat)) throw Error('Observer or determinism ' + config.id);
  const row = {
    kind,
    id: config.id,
    seed,
    input: result.input,
    inputHash: hash(result.input),
    resultHash: hash(result),
    status: result.status,
    reason: result.reason,
    metrics: result.metrics,
    contacts: result.contacts,
    samples: result.samples,
    observerNeutral: true,
  };
  rows.push(row);
  console.log(
    kind,
    config.id,
    config.defenderRating ?? '',
    result.status,
    result.metrics.finalSeparation.toFixed(3),
    result.reason,
  );
  return result;
};
for (const row of baseline.rows)
  run(
    { ...row.input.config, movementModel: 'ball_oriented' },
    row.input.player,
    row.seed,
    'reconstructed-original',
  );
const base = baseline.rows.find((r) => r.input.config.id === 'direction_45');
for (const [attacker, defender] of [
  [40, 40],
  [80, 80],
  [40, 80],
  [80, 40],
])
  for (const mirrored of [false, true])
    for (const approach of ['front', 'behind']) {
      const player = globalThis.structuredClone(base.input.player);
      for (const key of Object.keys(player.attributes)) player.attributes[key] = attacker;
      let config = {
        ...globalThis.structuredClone(base.input.config),
        id: `duel-${attacker}-${defender}-${mirrored}-${approach}`,
        movementModel: 'ball_oriented',
        defender: 'active',
        defenderRating: defender,
        defenderReaction: approach === 'behind' ? 0.4 : 0.12,
        defenderPosition: approach === 'front' ? { x: 22, y: 36 } : { x: 17, y: 36 },
        defenderVelocity: approach === 'front' ? { x: -2, y: -1 } : { x: 2, y: 0 },
      };
      if (mirrored) {
        config.position.y = 68 - config.position.y;
        config.target.y = 68 - config.target.y;
        config.launcher.position.y = 68 - config.launcher.position.y;
        config.launcher.velocity.y *= -1;
        config.defenderPosition.y = 68 - config.defenderPosition.y;
        config.defenderVelocity.y *= -1;
        config.foot = 'left';
        player.dominantFoot = 'left';
      }
      run(config, player, 'pr192:paired:' + approach + ':' + mirrored, 'relative-duel');
    }
for (const [id, changes] of [
  ['slow-ball', { desiredSpeed: 1.8 }],
  ['fast-knock', { desiredSpeed: 8 }],
  ['spin', { launcher: { ...base.input.config.launcher, spin: { x: 0, y: 0, z: 70 } } }],
  [
    'side-bounce',
    {
      launcher: {
        ...base.input.config.launcher,
        position: { x: 16, y: 33, z: 0.6 },
        velocity: { x: 7, y: 2, z: -3 },
      },
    },
  ],
  ['overshoot', { bodyVelocity: { x: -5, y: 0 } }],
  ['wrong-approach', { bodyVelocity: { x: 0, y: -4 }, facingAngle: Math.PI }],
  ['two-defenders', { defender: 'active', secondDefenderPosition: { x: 24, y: 37 } }],
  ['teammate-opportunity', { teammatePosition: { x: 22, y: 36 } }],
  ['leave', { leaveForTeammate: true, teammatePosition: { x: 18, y: 36 } }],
  [
    'near-line',
    {
      position: { x: 20, y: 0.5 },
      target: { x: 26, y: 0.2 },
      launcher: { ...base.input.config.launcher, position: { x: 16, y: 0.5, z: 0.11 } },
    },
  ],
])
  run(
    {
      ...globalThis.structuredClone(base.input.config),
      ...changes,
      id,
      movementModel: 'ball_oriented',
    },
    base.input.player,
    'pr192:adversarial:' + id,
    'adversarial',
  );
const release = {
  ...globalThis.structuredClone(base.input.config),
  id: 'intentional-pass',
  family: 'one_touch',
  objective: 'pass',
  surface: 'inside',
  target: { x: 27, y: 34 },
  desiredSpeed: 9,
  movementModel: 'ball_oriented',
};
run(release, base.input.player, 'pr192:intentional-pass', 'release');
const manifest = readdirSync('src/core', { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts'))
  .sort()
  .map((p) => ({
    path: 'src/core/' + p,
    sha256: hash(readFileSync('src/core/' + p, 'utf8').replaceAll('\r\n', '\n')),
  }));
const receipt = {
  schema: 'mfl-pr192-laboratory-v1',
  baseline: baseline.baseline,
  provenance:
    'Paired development with a neutral canonical profile. The matching Adam Krawczyk reconstruction is recorded separately in reconstructed-human.json; original browser exports remain unavailable.',
  sourceHash: hash(manifest),
  manifest,
  rows,
};
if (check) {
  const old = readPr192Evidence(out);
  if (hash(receipt) !== hash(old)) throw Error('Current-source evidence drift');
} else writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
console.log(
  JSON.stringify({
    rows: rows.length,
    elapsedMs: performance.now() - started,
    cpu: process.cpuUsage(cpu),
    maxRSS: process.resourceUsage().maxRSS,
  }),
);
