import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { observeBoundedScene } from '../src/core/matchSimulation/boundedPerception.ts';
import { constructBoundedCandidates } from '../src/core/matchSimulation/boundedDecision.ts';
import { rankAvailableActionsForAI } from '../src/core/matchSimulation/matchActions.ts';
import { sampleCanonicalOutcome } from '../src/core/matchSimulation/canonicalOutcome.ts';
import { hash, sourceIdentity, argumentsMap, finish } from './pr197Evidence.mjs';
const args = argumentsMap(),
  version = args.get('version') ?? 'v1',
  identity = sourceIdentity(),
  start = performance.now(),
  rows = [];
const variants = [
  'open_corridor',
  'closed_corridor',
  'unseen_runner',
  'stale_runner',
  'anticipating_defender',
  'delayed_pass',
  'poor_delivery',
  'slow_runner',
  'offside',
  'poor_first_touch',
  'keeper_first',
];
for (const policy of [
  'state-value-v1',
  'phase-role-hybrid-v1',
  'opportunity-driven-v1',
  'hierarchical-intent-v1',
  'contextual-judgment-v1',
])
  for (const variant of variants)
    for (const sample of [0, 1]) {
      const f = createCalibrationFixture({
        scenario: 'long_pass',
        attacker: 80,
        defender: 60,
        seed: `pr197-autonomous-${sample}`,
      });
      let s = f.state;
      s.decisionPolicy = policy;
      Object.assign(s, {
        experimentalBallRecovery: true,
        experimentalRestartPreparation: true,
        experimentalTransitionIntelligence: true,
        experimentalActivePerception: true,
        experimentalReceivingPositions: true,
        experimentalTeamTempo: true,
        experimentalDefensiveReception: true,
        experimentalHeightAwarePassing: true,
        experimentalReceiverAnticipation: true,
      });
      const a = s.players.find((p) => p.id === f.actorId),
        r = s.players.find((p) => p.team === a.team && p.slot.position === 'left_winger');
      const d = s.players.find((p) => p.id === f.defenderId),
        d2 = s.players.find(
          (p) => p.team !== a.team && p.id !== d.id && p.slot.position !== 'goalkeeper',
        );
      const place = (p, x, y) => {
        p.position = { x, y };
        p.velocity = { x: 0, y: 0 };
        p.target = { ...p.position };
        p.anchor = { ...p.position };
        p.neutralAnchor = { ...p.position };
      };
      place(r, 57, 58);
      r.facingAngle = -Math.PI / 2;
      place(d, 68, 40);
      d.facingAngle = -Math.PI / 2;
      place(d2, 73, 28);
      if (variant === 'closed_corridor') {
        place(d, 61, 49);
        place(d2, 65, 42);
      }
      if (variant === 'unseen_runner') place(r, 26, 58);
      if (variant === 'stale_runner') {
        place(r, 26, 58);
        s.activePerceptionConfig = { scanning: false, memory: true, preparation: true };
      }
      if (variant === 'anticipating_defender') {
        for (const key of ['positioning', 'gameReading', 'concentration', 'pace', 'agility'])
          d.profile.attributes[key] = 100;
        d.facingAngle = Math.PI / 2;
      }
      if (variant === 'delayed_pass') s.onBallPreparation.readyAt = s.time + 1.5;
      if (variant === 'poor_delivery') a.profile.attributes.passing = 20;
      if (variant === 'slow_runner') {
        r.profile.attributes.pace = 20;
        r.profile.attributes.agility = 20;
      }
      if (variant === 'offside') place(r, 99, 48);
      if (variant === 'poor_first_touch') r.profile.attributes.firstTouch = 20;
      if (variant === 'keeper_first')
        place(
          s.players.find((p) => p.team !== a.team && p.slot.position === 'goalkeeper'),
          80,
          36,
        );
      const inputHash = hash(s),
        frames = [],
        contacts = [],
        passes = [];
      let opportunityRecognition = null,
        runBegins = null,
        diagonalRunBegins = null,
        passerSeesRun = null,
        candidateAt = null,
        loftedCandidateAt = null,
        selectedAt = null,
        preparation = null;
      for (let tick = 0; tick < 480; tick++) {
        const before = s;
        s = step(s, 0.025);
        const runner = s.players.find((p) => p.id === r.id),
          passer = s.players.find((p) => p.id === a.id);
        const opportunity = s.activePerceptionRuntime?.positions[r.id];
        if (
          !opportunityRecognition &&
          opportunity &&
          opportunity.reason !== 'protect_role_and_rest_defence'
        )
          opportunityRecognition = globalThis.structuredClone(opportunity);
        if (runBegins === null && Math.hypot(runner.velocity.x, runner.velocity.y) > 0.7)
          runBegins = s.time;
        if (diagonalRunBegins === null && runner.velocity.x > 0.5 && runner.velocity.y < -0.5)
          diagonalRunBegins = s.time;
        const observation = observeBoundedScene(s, passer);
        if (
          runBegins !== null &&
          passerSeesRun === null &&
          observation.visible.some((p) => p.id === runner.id)
        )
          passerSeesRun = s.time;
        if (tick % 20 === 0 && s.ball.ownerId === a.id && !s.restart) {
          const candidates =
            policy.includes('state-value') || policy.includes('phase-role')
              ? rankAvailableActionsForAI(s, a.id).map((x) => x.action)
              : constructBoundedCandidates(observation).map((c) => c.action);
          const toRunner = candidates.filter((c) => c.type === 'pass' && c.receiverId === r.id);
          if (toRunner.length && candidateAt === null) candidateAt = s.time;
          if (toRunner.some((c) => c.delivery === 'lofted') && loftedCandidateAt === null)
            loftedCandidateAt = s.time;
        }
        if (s.onBallPreparation?.actorId === a.id && !preparation)
          preparation = globalThis.structuredClone(s.onBallPreparation);
        if (
          s.currentAction?.type === 'pass' &&
          s.currentAction.actorId === a.id &&
          s.currentAction.receiverId === r.id &&
          selectedAt === null
        )
          selectedAt = s.time;
        if (
          s.lastPassDiagnostic?.passId !== before.lastPassDiagnostic?.passId &&
          s.lastPassDiagnostic
        )
          passes.push({
            diagnostic: s.lastPassDiagnostic,
            offside: s.offsideSnapshot ?? null,
            ball: s.ball,
          });
        const observationSample = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
        contacts.push(...observationSample.contacts);
        if (tick % 10 === 0 || observationSample.contacts.length)
          frames.push({
            at: s.time,
            runner: { position: runner.position, velocity: runner.velocity, target: runner.target },
            passerObservation: {
              at: observation.at,
              runner: observation.visible.find((p) => p.id === r.id) ?? null,
            },
            ball: observationSample.ball,
            ownerId: observationSample.ownerId,
            defenders: s.players
              .filter((p) => p.team !== a.team)
              .map((p) => ({
                id: p.id,
                position: p.position,
                velocity: p.velocity,
                facing: p.facingAngle,
              })),
          });
      }
      rows.push({
        variant,
        policy,
        sample,
        inputHash,
        opportunityRecognition,
        runBegins,
        diagonalRunBegins,
        passerSeesRun,
        candidateAt,
        loftedCandidateAt,
        selectedAt,
        preparation,
        passes,
        firstContact: contacts[0] ?? null,
        contactsHash: hash(contacts),
        framesHash: hash(frames),
        frames:
          variant === 'open_corridor' || (policy === 'state-value-v1' && sample === 0)
            ? frames
            : [frames[0], frames.at(-1)],
        finalHash: hash(s),
        score: s.score,
        classification: passes.some(
          (p) =>
            p.diagnostic.passerId === a.id &&
            p.diagnostic.intendedReceiverId === r.id &&
            p.diagnostic.delivery === 'lofted',
        )
          ? 'autonomous_lofted_release'
          : 'sequence_not_elicited',
      });
      console.log('autonomous', rows.length, policy, variant);
    }
finish(
  `docs/performance/pr197/autonomous-${version}.json.gz`,
  {
    schema: 'pr197-autonomous-v1',
    source: identity,
    rows,
    method:
      'Standing winger; no prescribed initial runner velocity, target, pass request or defender mistake. Both teams autonomous. Candidate menus inspected every 0.5s, physical execution 40Hz.',
    limits: [
      'Poor delivery and slow runner are negative initial conditions, not forced overhit/unreachable outcomes.',
      'Stale-runner variant disables rescanning; actual observation history is recorded rather than fabricating a sighting.',
      'No new free-kick tactical system; moving-run restart sequence remains a restart registry dependency.',
    ],
  },
  {
    milliseconds: performance.now() - start,
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
  },
  args.has('check'),
);
