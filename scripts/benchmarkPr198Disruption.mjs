import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import {
  resolveMatchAction,
  rankAvailableActionsForAI,
} from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { observeBoundedScene } from '../src/core/matchSimulation/boundedPerception.ts';
import {
  constructBoundedCandidates,
  runBoundedPolicy,
} from '../src/core/matchSimulation/boundedDecision.ts';
import {
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
  outcomeContractSchema,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import {
  createDisruptionLedger,
  observeDisruption,
  sampleDisruptionFrame,
  disruptionLedgerSchema,
} from '../src/core/matchSimulation/disruptionLedger.ts';
import { evaluateReceivingPosition } from '../src/core/matchSimulation/receivingPositions.ts';
import { evaluateStrategicClearance } from '../src/core/matchSimulation/strategicClearance.ts';
import { hash, args, finish, sourceIdentity } from './pr198Evidence.mjs';
const options = args(),
  identity = sourceIdentity(),
  start = performance.now(),
  cpu = process.cpuUsage(),
  rows = [];
const scenes = [
  'shot_protected',
  'shot_support',
  'shot_challenged',
  'pressured_diagonal',
  'pressured_short',
  'clearance_emergency',
  'carry_corridor',
  'carry_challenged',
  'carry_exposed',
  'carry_counterattack',
];
const policies = [
  'state-value-v1',
  'phase-role-hybrid-v1',
  'opportunity-driven-v1',
  'hierarchical-intent-v1',
  'contextual-judgment-v1',
];
for (const scenario of scenes)
  for (const skill of [40, 80])
    for (const sample of [0, 1]) {
      const f = createCalibrationFixture({
        scenario: scenario.startsWith('shot') ? 'rebound' : 'safe_pass',
        attacker: skill,
        defender: 60,
        seed: 'pr198-disruption-development-0',
        mirror: sample === 1,
      });
      const initial = f.state;
      Object.assign(initial, {
        experimentalBallRecovery: true,
        experimentalRestartPreparation: true,
        experimentalStrategicClearances: true,
        experimentalActivePerception: true,
        experimentalTransitionIntelligence: true,
        experimentalReceivingPositions: true,
        experimentalDefensiveReception: true,
        experimentalHeightAwarePassing: true,
        experimentalReceiverAnticipation: true,
        experimentalReceiverSynchronisation: true,
        experimentalObservedLoftedPasses: true,
      });
      let actor = initial.players.find((p) => p.id === f.actorId);
      const receiver = initial.players.find((p) => p.id === f.receiverId),
        defender = initial.players.find((p) => p.id === f.defenderId);
      const mirrorY = (y) => (sample ? 68 - y : y);
      const place = (p, x, y) => {
        p.position = { x, y: mirrorY(y) };
        p.velocity = { x: 0, y: 0 };
        p.target = { ...p.position };
        p.anchor = { ...p.position };
        p.neutralAnchor = { ...p.position };
      };
      if (scenario.startsWith('shot')) {
        if (scenario === 'shot_support') place(receiver, 96, 29);
        if (scenario === 'shot_challenged') place(defender, actor.position.x + 1.2, 34);
      } else if (scenario.startsWith('pressured')) {
        place(actor, 25, 34);
        place(
          receiver,
          scenario === 'pressured_short' ? 32 : 55,
          scenario === 'pressured_short' ? 34 : 57,
        );
        place(defender, 31, 35);
        const support = initial.players.find(
          (p) =>
            p.team === actor.team &&
            p.id !== actor.id &&
            p.id !== receiver.id &&
            p.slot.position !== 'goalkeeper',
        );
        place(support, 32, 34);
      } else {
        actor = initial.players.find((p) => p.team === 'home' && p.slot.position === 'center_back');
        place(
          actor,
          ['clearance_emergency', 'carry_counterattack'].includes(scenario) ? 18 : 35,
          34,
        );
        place(receiver, 45, 47);
        place(
          defender,
          scenario === 'clearance_emergency'
            ? 18.75
            : scenario === 'carry_counterattack'
              ? 20
              : scenario === 'carry_challenged'
                ? 38
                : 60,
          34,
        );
        if (scenario === 'carry_exposed' || scenario === 'carry_counterattack')
          for (const p of initial.players.filter(
            (p) => p.team === actor.team && p.id !== actor.id && p.slot.position !== 'goalkeeper',
          ))
            place(p, 55 + (p.position.x % 3), p.position.y);
      }
      const opponentOwns = scenario === 'clearance_emergency';
      initial.ball = {
        x: actor.position.x + 0.35,
        y: actor.position.y,
        height: 0.11,
        velocity: { x: 0, y: 0, z: 0 },
        ownerId: opponentOwns ? defender.id : actor.id,
        lastTouchPlayerId: opponentOwns ? defender.id : actor.id,
      };
      initial.possessionTeam = opponentOwns ? defender.team : actor.team;
      initial.onBallPreparation = {
        actorId: opponentOwns ? defender.id : actor.id,
        gainedAt: initial.time - 2,
        readyAt: initial.time - 1,
        kind: 'immediate_control',
        incomingSpeed: 0,
      };
      const scene = observeBoundedScene(initial, actor),
        candidates = constructBoundedCandidates(scene);
      const choices = policies.map((policy) => {
        if (policy === 'state-value-v1' || policy === 'phase-role-hybrid-v1')
          return {
            policy,
            information: 'full_world',
            ranking: rankAvailableActionsForAI({ ...initial, decisionPolicy: policy }, actor.id),
          };
        return {
          policy,
          information: 'bounded',
          decision: runBoundedPolicy(policy, { scene, candidates }),
        };
      });
      const pass = (target = receiver.position, delivery = 'ground', receiverId = receiver.id) => ({
        type: 'pass',
        actorId: actor.id,
        receiverId,
        target: { ...target },
        intent: delivery === 'lofted' ? 'direct' : 'support',
        delivery,
      });
      let actions;
      if (scenario.startsWith('shot'))
        actions = [
          { label: 'hold', action: { type: 'hold', actorId: actor.id } },
          { label: 'safe_pass_request', action: pass() },
          {
            label: 'shot_request',
            action: {
              type: 'shot',
              actorId: actor.id,
              intent: 'driven',
              target: { x: 105, y: mirrorY(33) },
              contact: 'settled',
            },
          },
        ];
      else if (scenario.startsWith('pressured')) {
        const short = initial.players.find(
          (p) =>
            p.team === actor.team &&
            p.id !== actor.id &&
            p.id !== receiver.id &&
            p.slot.position !== 'goalkeeper',
        );
        actions = [
          { label: 'short_under_pressure', action: pass(short.position, 'ground', short.id) },
          { label: 'diagonal_ground', action: pass() },
          { label: 'contested_loft', action: pass(receiver.position, 'lofted') },
          { label: 'distant_exit_request', action: pass({ x: 75, y: sample ? 0 : 68 }, 'lofted') },
        ];
      } else if (opponentOwns) {
        actions = [
          { label: 'control_challenge', kind: 'control', target: { x: 18, y: 34 } },
          { label: 'short_clearance', kind: 'into_play', target: { x: 30, y: 34 } },
          { label: 'long_clearance', kind: 'into_play', target: { x: 65, y: 34 } },
          {
            label: 'distant_throw_request',
            kind: 'touchline',
            target: { x: 65, y: sample ? 69 : -1 },
          },
        ].map((a) => ({
          ...a,
          action: {
            type: 'challenge',
            actorId: actor.id,
            opponentId: defender.id,
            technique: 'standing',
            clearance: {
              kind: a.kind,
              target: {
                x: a.target.x,
                y:
                  scenario === 'clearance_emergency' && a.kind !== 'touchline'
                    ? mirrorY(a.target.y)
                    : a.target.y,
              },
            },
          },
        }));
      } else
        actions = [
          { label: 'hold', action: { type: 'hold', actorId: actor.id } },
          { label: 'pass', action: pass() },
          {
            label: 'advance_carry',
            action: {
              type: 'carry',
              actorId: actor.id,
              target: { x: actor.position.x + 10, y: actor.position.y },
              movementMode: 'carry',
            },
          },
        ];
      for (const alternative of actions) {
        let s = resolveMatchAction(
          globalThis.structuredClone(initial),
          globalThis.structuredClone(alternative.action),
          'autonomous_npc',
        );
        const released =
          s.lastPassDiagnostic?.passId !== initial.lastPassDiagnostic?.passId
            ? s.lastPassDiagnostic
            : null;
        const shot = s.ball.shot?.shotId !== initial.ball.shot?.shotId ? s.ball.shot?.shotId : null;
        const contract = outcomeContractSchema.parse({
          version: 'original-delivery-v3',
          actorId: actor.id,
          receiverId: alternative.action.type === 'pass' ? alternative.action.receiverId : null,
          teamIds: initial.players.filter((p) => p.team === actor.team).map((p) => p.id),
          opponentIds: initial.players.filter((p) => p.team !== actor.team).map((p) => p.id),
          requestedAt: initial.time,
          horizonAt: initial.time + 8,
          releasedAt: released || shot ? initial.time : null,
          passId: released?.passId ?? null,
          shotId: shot ?? null,
          information: 'privileged_engineering_observer',
          conditionalOnRelease: true,
        });
        const ledger = createDisruptionLedger(initial),
          samples = [sampleCanonicalOutcome(initial, s, 'original-delivery-v3')];
        const actorPath = [];
        const releaseHash = hash(s),
          observedShots = [];
        for (let tick = 0; tick < (scenario === 'carry_counterattack' ? 480 : 320); tick++) {
          const before = s;
          s = step(s, 0.025);
          const sample = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
          samples.push(sample);
          if (tick % 10 === 0 || sample.contacts.length) {
            const body = s.players.find((p) => p.id === actor.id);
            if (body)
              actorPath.push({
                at: s.time,
                position: body.position,
                velocity: body.velocity,
                facing: body.facingAngle,
                target: body.target,
                carrierIntent:
                  s.ballCarrierIntent?.actorId === actor.id ? s.ballCarrierIntent : null,
              });
          }
          observeDisruption(
            ledger,
            initial,
            before,
            s,
            actor.team,
            alternative.action.type === 'pass' ? alternative.action.receiverId : undefined,
            sample,
          );
          if (s.lastShot?.shotId !== before.lastShot?.shotId && s.lastShot)
            observedShots.push(s.lastShot);
          if (s.postGoal || ['half_time', 'full_time', 'abandoned'].includes(s.status)) break;
        }
        rows.push({
          scenario,
          skill,
          sample,
          label: alternative.label,
          classification: 'forced_experiment; ordinary canonical request then autonomous teams',
          action: alternative.action,
          inputHash: hash(initial),
          seed: initial.seed,
          actorRole: actor.slot.position,
          scene,
          candidates,
          choices,
          roleProtection: evaluateReceivingPosition(initial, actor) ?? null,
          strategicPrediction: evaluateStrategicClearance(scene) ?? null,
          releaseHash,
          outcome: interpretCanonicalOutcome(contract, samples),
          ledger: disruptionLedgerSchema.parse(ledger),
          finalShape: sampleDisruptionFrame(initial, s, actor.team),
          shots: observedShots,
          score: s.score,
          finalHash: hash(s),
          samplesHash: hash(samples),
          lastChallenge: s.lastChallenge ?? null,
          actorPath,
        });
      }
      console.log('disruption', scenario, skill, sample, rows.length);
    }
finish(
  `docs/performance/pr198/disruption-${options.get('version') ?? 'v1'}.json.gz`,
  {
    schema: 'pr198-paired-disruption-labs-v1',
    source: identity,
    rows,
    method:
      'Paired initial states and mirrors; requested alternative once, ordinary physical execution, then autonomous continuation. Shape displacement is descriptive; paired differences investigate causality, no post-hoc causal label. Threat proxy is the existing heuristic, not calibrated V. Opponent shots, actual contacts, ownership and legal restarts are measured separately.',
    available: [
      'finite foot/body deflection',
      'keeper catch/parry and physical rebound',
      'loose-ball contest and actual next controllable action',
      'restart type/location',
      'positional threat proxy',
      'defender displacement/orientation',
      'rest-defence cover',
      'opponent shot witness',
    ],
    missing: [
      'calibrated consequence probabilities and comparable territorial V',
      'independent observed opponent-counterfactual intention',
      'controlled-only second-contact availability intervention',
      'separate articulated aerial/emergency lofted-clearance motor repertoire',
    ],
  },
  {
    milliseconds: performance.now() - start,
    cpu: process.cpuUsage(cpu),
    maxRSSKiB: process.resourceUsage().maxRSS,
  },
);
console.log('disruption completed', rows.length);
