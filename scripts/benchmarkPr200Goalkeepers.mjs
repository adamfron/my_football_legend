import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry.ts';
import { sampleCanonicalOutcome } from '../src/core/matchSimulation/canonicalOutcome.ts';
import {
  ROOT as PR200_ROOT,
  hash,
  read,
  write,
  identity as pr200Identity,
} from './pr200Evidence.mjs';
import { createFlightCatalogue } from './pr199FlightLab.mjs';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const pr201 = args.has('pr201');
const { ROOT, identity } = pr201
  ? await import('./pr201Evidence.mjs')
  : { ROOT: PR200_ROOT, identity: pr200Identity };
const version = args.get('version') ?? 'v2';
if (!/^v[0-9]+$/.test(version)) throw Error('Invalid keeper evidence version');
const source = identity(),
  start = performance.now(),
  cpu = process.cpuUsage(),
  rows = [];
const rotations = createFlightCatalogue().filter((e) => e.family === 'rotation');
const scenarios = [
  'clear',
  'high_early',
  'too_late',
  'wall_initial',
  'teammate_screen',
  'facing_away',
  'rotating_free_kick',
];
for (const sample of [0, 1])
  for (const scenario of scenarios)
    for (const ability of [30, 60, 90]) {
      // Same ordinary release geometry/seed as PR199 V7's clean-shot arms. Screens here
      // are actual bodies, so a blocked shot is retained and never called a keeper failure.
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
      let keeper = f.state.players.find(
        (p) => p.team === 'away' && p.slot.position === 'goalkeeper',
      );
      for (const key of [
        'agility',
        'reflexes',
        'handling',
        'positioning',
        'gameReading',
        'concentration',
      ])
        keeper.profile.attributes[key] = ability;
      if (scenario === 'facing_away') keeper.facingAngle += Math.PI;
      if (['wall_initial', 'teammate_screen'].includes(scenario)) {
        const screen = f.state.players.find((p) => p.team === 'away' && p.id !== keeper.id);
        screen.position = { x: keeper.position.x - 3, y: keeper.position.y };
        screen.target = { ...screen.position };
        screen.neutralAnchor = { ...screen.position };
        screen.velocity = { x: 0, y: scenario === 'teammate_screen' ? 4 : 0 };
      }
      f.state.ball = {
        ...playerContactGeometry(shooter).rightFoot,
        height: 0.11,
        velocity: { x: 0, y: 0, z: 0 },
        ownerId: shooter.id,
      };
      f.state.currentPressure = 0;
      const initial =
        scenario === 'rotating_free_kick'
          ? globalThis.structuredClone(rotations[sample].state)
          : resolveMatchAction(
              f.state,
              {
                type: 'shot',
                actorId: shooter.id,
                intent: 'placed',
                contact: 'settled',
                goalTarget: {
                  horizontal: sample ? -0.4 : 0.4,
                  vertical: scenario === 'high_early' ? 0.75 : 0.35,
                },
                target: { x: 105, y: sample ? 32.536 : 35.464 },
              },
              'autonomous_npc',
            );
      keeper = initial.players.find((p) => p.team === 'away' && p.slot.position === 'goalkeeper');
      if (scenario === 'rotating_free_kick')
        for (const key of [
          'agility',
          'reflexes',
          'handling',
          'positioning',
          'gameReading',
          'concentration',
        ])
          keeper.profile.attributes[key] = ability;
      if (!initial.ball.shot) throw Error('Keeper lab requires actual release');
      for (const bounded of pr201 ? [false, true, 'recovery'] : [false, true]) {
        let s = globalThis.structuredClone(initial);
        if (bounded) {
          s.experimentalBoundedBallFlightBelief = true;
          s.experimentalReceiverAnticipation = true;
          if (bounded === 'recovery') s.boundedReceiverRecovery = 'hold-local-v1';
        }
        const begin = s.time,
          contacts = [];
        let firstSight = null,
          firstMotion = null,
          firstMovement = null;
        for (let tick = 0; tick < 160; tick++) {
          const before = s;
          s = step(s, 0.025);
          const witnesses = sampleCanonicalOutcome(before, s, 'original-delivery-v3').contacts;
          contacts.push(
            ...(pr201
              ? witnesses.map((c) => ({
                  ...c,
                  keeperAction: s.lastShot?.goalkeeperAction ?? null,
                  nativeContact:
                    s.lastBallContact?.playerId === keeper.id ? s.lastBallContact : null,
                }))
              : witnesses),
          );
          const k = s.players.find((p) => p.id === keeper.id),
            belief = s.liveBallFlightRuntime?.sensors[keeper.id]?.belief;
          if (belief?.lastObservation && firstSight === null)
            firstSight = belief.lastObservation.at - begin;
          if (
            belief?.motionEvidenceAt !== null &&
            belief?.motionEvidenceAt !== undefined &&
            firstMotion === null
          )
            firstMotion = belief.motionEvidenceAt - begin;
          if (
            firstMovement === null &&
            Math.hypot(k.velocity.x - keeper.velocity.x, k.velocity.y - keeper.velocity.y) > 0.1
          )
            firstMovement = s.time - begin;
          if (
            (s.lastShot?.shotId === initial.ball.shot.shotId && s.lastShot.outcome) ||
            s.postGoal ||
            (s.restart && s.restart.phase !== 'release')
          )
            break;
        }
        const shot = s.lastShot?.shotId === initial.ball.shot.shotId ? s.lastShot : null;
        rows.push({
          scenario,
          sample,
          ability,
          bounded,
          initialHash: hash(initial),
          launchHash: hash(initial.ball),
          finalHash: hash(s),
          ...(pr201
            ? { withoutRecoveryHash: hash({ ...s, boundedReceiverRecovery: undefined }) }
            : {}),
          firstSight,
          firstMotion,
          firstMovement,
          keeperContact: contacts.some((c) => c.actorId === keeper.id),
          contacts,
          outcome: shot?.outcome ?? null,
          keeperAction: shot?.goalkeeperAction ?? null,
          finalPosition: s.players.find((p) => p.id === keeper.id).position,
        });
      }
    }
const summary = Object.fromEntries(
  scenarios.map((scene) => [
    scene,
    Object.fromEntries(
      (pr201 ? [false, true, 'recovery'] : [false, true]).map((b) => {
        const list = rows.filter((r) => r.scenario === scene && r.bounded === b);
        return [
          b === 'recovery' ? 'recovery' : b ? 'bounded' : 'legacy',
          {
            attempts: list.length,
            contacts: list.filter((r) => r.keeperContact).length,
            catches: list.filter((r) => r.keeperAction === 'catch').length,
            parries: list.filter((r) => ['parry', 'parry_away'].includes(r.keeperAction)).length,
            goals: list.filter((r) => r.outcome === 'goal').length,
            noSight: b ? list.filter((r) => r.firstSight === null).length : null,
          },
        ];
      }),
    ),
  ]),
);
const result = {
  schema: pr201 ? 'pr201-live-keeper-v1' : 'pr200-live-keeper-v1',
  source,
  rows,
  summary,
  limitations: [
    'Actual physical screens may block or deflect before any keeper opportunity',
    'V7 reference geometry is diagnostic, not a real-world save-rate target',
    'Base positioning can precede optical motion/reaction; movement onset is not reactive save onset',
  ],
};
if (args.has('check')) {
  const { source: _old, ...old } = read(args.get('check')).result;
  const { source: _new, ...actual } = result;
  void _old;
  void _new;
  if (hash(old) !== hash(actual)) throw Error('Keeper replay drift');
} else
  write(`${ROOT}/goalkeepers-${version}.json.gz`, {
    result,
    costs: {
      wallSeconds: (performance.now() - start) / 1000,
      cpu: process.cpuUsage(cpu),
      peakRSSKiB: process.resourceUsage().maxRSS,
    },
  });
console.log(pr201 ? 'PR201 keeper live' : 'PR200 keeper live', summary);
