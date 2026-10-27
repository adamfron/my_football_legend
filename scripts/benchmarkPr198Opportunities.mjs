import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  observeBoundedScene,
  knownBoundedPlayers,
} from '../src/core/matchSimulation/boundedPerception.ts';
import { constructBoundedCandidates } from '../src/core/matchSimulation/boundedDecision.ts';
import { rankAvailableActionsForAI } from '../src/core/matchSimulation/matchActions.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import {
  runCanonicalOutcomeTrial,
  sampleCanonicalOutcome,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { hash, sourceIdentity, args, finish } from './pr198Evidence.mjs';
const options = args(),
  model = options.get('model') ?? 'baseline',
  version = options.get('version') ?? 'v1';
if (!['baseline', 'loft'].includes(model)) throw Error('Unknown opportunity model');
const identity = sourceIdentity(),
  rows = [],
  start = performance.now(),
  cpu = process.cpuUsage();
const variants = [
  'open_corridor',
  'emerging_lane',
  'runner_before_selection',
  'poor_orientation',
  'good_orientation',
  'recovering_opponent',
  'long_target',
  'short_ground',
  'too_early',
  'too_late',
  'offside',
  'poor_reception',
  'poor_delivery',
  'closed_corridor',
];
const policies = [
  'state-value-v1',
  'phase-role-hybrid-v1',
  'opportunity-driven-v1',
  'hierarchical-intent-v1',
  'contextual-judgment-v1',
];
for (const policy of policies)
  for (const variant of variants)
    for (const skill of [40, 80])
      for (const sample of [0, 1]) {
        const f = createCalibrationFixture({
          scenario: 'long_pass',
          attacker: skill,
          defender: 60,
          seed: 'pr198-opportunity-development-0',
          mirror: sample === 1,
        });
        let s = f.state;
        Object.assign(s, {
          decisionPolicy: policy,
          experimentalBallRecovery: true,
          experimentalRestartPreparation: true,
          experimentalTransitionIntelligence: true,
          experimentalActivePerception: true,
          experimentalReceivingPositions: true,
          experimentalTeamTempo: true,
          experimentalDefensiveReception: true,
          experimentalHeightAwarePassing: true,
          experimentalReceiverAnticipation: true,
          experimentalReceiverSynchronisation: true,
          experimentalObservedLoftedPasses: model === 'loft',
          experimentalCanonicalArrival: false,
        });
        const actor = s.players.find((p) => p.id === f.actorId),
          runner = s.players.find(
            (p) => p.team === actor.team && p.slot.position === 'left_winger',
          );
        const defender = s.players.find((p) => p.id === f.defenderId),
          d2 = s.players.find(
            (p) =>
              p.team !== actor.team && p.id !== defender.id && p.slot.position !== 'goalkeeper',
          );
        const place = (p, x, y, vx = 0, vy = 0) => {
          p.position = { x, y: sample ? 68 - y : y };
          p.velocity = { x: vx, y: sample ? -vy : vy };
          p.target = { ...p.position };
          p.anchor = { ...p.position };
          p.neutralAnchor = { ...p.position };
        };
        place(runner, 57, 58);
        runner.facingAngle = -Math.PI / 2;
        place(defender, 68, 40);
        defender.facingAngle = -Math.PI / 2;
        place(d2, 73, 28);
        if (variant === 'emerging_lane') place(defender, 61, 49, -1, 2);
        if (variant === 'runner_before_selection') s.onBallPreparation.readyAt = s.time + 0.8;
        if (variant === 'poor_orientation') defender.facingAngle = Math.PI / 2;
        if (variant === 'good_orientation') {
          defender.facingAngle = -Math.PI / 2;
          for (const key of ['positioning', 'gameReading', 'concentration', 'pace', 'agility'])
            defender.profile.attributes[key] = 100;
        }
        if (variant === 'recovering_opponent') place(defender, 68, 48, -4, -2);
        if (variant === 'long_target') place(runner, 63, 58);
        if (variant === 'short_ground') place(runner, 50, 46);
        if (variant === 'too_early') s.onBallPreparation.readyAt = s.time;
        if (variant === 'too_late') s.onBallPreparation.readyAt = s.time + 1.8;
        if (variant === 'offside') place(runner, 99, 48);
        if (variant === 'poor_reception') runner.profile.attributes.firstTouch = 20;
        if (variant === 'poor_delivery') actor.profile.attributes.passing = 20;
        if (variant === 'closed_corridor') {
          place(defender, 61, 49);
          place(d2, 65, 42);
        }
        const initial = globalThis.structuredClone(s),
          frames = [],
          releases = [],
          decisions = [],
          stages = {
            opportunity: null,
            run: null,
            observedRun: null,
            candidate: null,
            loftCandidate: null,
            admissibleLoft: null,
            selectedLoft: null,
            preparingLoft: null,
            releasedLoft: null,
          };
        let closedAt = null,
          closeReason = null,
          forced = null,
          firstPhysicalProbe = null;
        const update = (key, value) => {
          if (stages[key] === null) stages[key] = value;
        };
        withBoundedObserver(
          (t) => {
            if (t.actorId !== actor.id || closedAt !== null) return;
            if (t.stage === 'decision') {
              const selected = t.candidates?.find((c) => c.id === t.decision?.selectedCandidateId),
                prepared = t.candidates?.find((c) => c.id === t.decision?.preparationCandidateId);
              if (
                selected?.action.type === 'pass' &&
                selected.action.receiverId === runner.id &&
                selected.action.delivery === 'lofted'
              )
                update('selectedLoft', t.at);
              if (
                prepared?.action.type === 'pass' &&
                prepared.action.receiverId === runner.id &&
                prepared.action.delivery === 'lofted'
              )
                update('preparingLoft', t.at);
              decisions.push({
                at: t.at,
                decision: t.decision,
                candidates: t.candidates,
                reason: t.reason,
              });
            }
          },
          () => {
            for (let tick = 0; tick < 320; tick++) {
              const before = s;
              s = step(s, 0.025);
              const r = s.players.find((p) => p.id === runner.id),
                a = s.players.find((p) => p.id === actor.id);
              if (!r || !a) {
                closedAt ??= s.time;
                closeReason ??= 'original_participant_left_active_XI';
                break;
              }
              const pass = s.lastPassDiagnostic;
              if (pass && pass.passId !== before.lastPassDiagnostic?.passId) {
                releases.push({
                  at: s.time,
                  pass,
                  ball: s.ball,
                  offside: s.offsideSnapshot ?? null,
                });
                if (closedAt === null && pass.passerId === actor.id) {
                  if (pass.intendedReceiverId === runner.id && pass.delivery === 'lofted')
                    update('releasedLoft', s.time);
                  closedAt = s.time;
                  closeReason = 'first_passer_release';
                }
              }
              if (
                closedAt === null &&
                s.ball.ownerId &&
                s.ball.ownerId !== actor.id &&
                !s.ball.travelKind
              ) {
                closedAt = s.time;
                closeReason = 'possession_changed';
              }
              if (tick % 8 !== 0) continue;
              const scene = observeBoundedScene(s, a),
                seen = knownBoundedPlayers(scene).find((p) => p.id === r.id),
                knowledge = scene.knowledge?.find((k) => k.id === r.id);
              const job = s.activePerceptionRuntime?.positions[r.id],
                transition = s.transitionRuntime?.runs.find((run) => run.actorId === r.id);
              const moving = Math.hypot(r.velocity.x, r.velocity.y) > 0.7,
                deliberate = Boolean(
                  transition || (job && job.reason !== 'protect_role_and_rest_defence'),
                );
              const bounded = constructBoundedCandidates(scene);
              const menu =
                policy === 'state-value-v1' || policy === 'phase-role-hybrid-v1'
                  ? rankAvailableActionsForAI(s, a.id).map((c) => ({
                      action: c.action,
                      score: c.score,
                    }))
                  : bounded;
              const toRunner = menu.filter(
                (c) => c.action.type === 'pass' && c.action.receiverId === r.id,
              );
              const loft = toRunner.filter((c) => c.action.delivery === 'lofted');
              if (closedAt === null) {
                if (job && job.reason !== 'protect_role_and_rest_defence')
                  update('opportunity', {
                    at: s.time,
                    reason: job.reason,
                    origin: job.origin,
                    target: job.target,
                  });
                if (moving && deliberate)
                  update('run', {
                    at: s.time,
                    origin: transition ? 'transition_run' : 'receiving_position_adjustment',
                    velocity: r.velocity,
                  });
                if (moving && seen)
                  update('observedRun', {
                    at: s.time,
                    position: seen.position,
                    velocity: seen.velocity,
                    knowledge: knowledge ?? null,
                  });
                if (toRunner.length) update('candidate', s.time);
                if (loft.length) update('loftCandidate', s.time);
                if (
                  loft.some(
                    (c) =>
                      !('feasible' in c) ||
                      (c.feasible && c.readyAt <= s.time && c.closesAt > s.time),
                  )
                )
                  update('admissibleLoft', s.time);
                // A single declined native-menu alternative is tested physically, labelled forced.
                if (
                  !firstPhysicalProbe &&
                  skill === 80 &&
                  sample === 0 &&
                  ['state-value-v1', 'opportunity-driven-v1'].includes(policy) &&
                  seen &&
                  moving &&
                  scene.contactReady
                ) {
                  const diagnostic = constructBoundedCandidates({
                    ...scene,
                    observedLoftedExperiment: true,
                  }).find(
                    (c) =>
                      c.action.type === 'pass' &&
                      c.action.receiverId === r.id &&
                      c.action.delivery === 'lofted',
                  );
                  if (diagnostic)
                    firstPhysicalProbe = {
                      state: globalThis.structuredClone(s),
                      action: diagnostic.action,
                      at: s.time,
                    };
                }
              }
              const reason = !seen
                ? 'receiver_not_observed'
                : knowledge && (knowledge.uncertainty > 1.5 || s.time - knowledge.observedAt > 0.5)
                  ? 'unreliable_receiver_location'
                  : !moving
                    ? 'runner_not_yet_moving'
                    : !deliberate
                      ? 'ordinary_structural_movement'
                      : !toRunner.length
                        ? 'receiver_family_absent'
                        : !loft.length
                          ? 'loft_delivery_absent'
                          : !scene.contactReady
                            ? 'physical_preparation_required'
                            : 'candidate_available_selection_separate';
              frames.push({
                at: s.time,
                chainOpen: closedAt === null,
                reason,
                actorPosition: a.position,
                runner: { position: r.position, velocity: r.velocity, target: r.target },
                seen: seen ?? null,
                knowledge: knowledge ?? null,
                job: job ?? null,
                menu: toRunner,
                alternatives: menu.filter((c) => !toRunner.includes(c)).slice(0, 3),
                ball: {
                  x: s.ball.x,
                  y: s.ball.y,
                  height: s.ball.height,
                  ownerId: s.ball.ownerId ?? null,
                },
              });
            }
          },
        );
        if (firstPhysicalProbe) {
          const trial = runCanonicalOutcomeTrial(
            firstPhysicalProbe.state,
            firstPhysicalProbe.action,
            8,
            undefined,
            'original-delivery-v3',
          );
          forced = {
            classification: 'forced_experiment; not autonomous recognition or selection',
            at: firstPhysicalProbe.at,
            inputHash: hash(firstPhysicalProbe.state),
            action: firstPhysicalProbe.action,
            outcome: trial.outcome,
            finalHash: hash(trial.final),
            samplesHash: hash(trial.samples),
          };
        }
        const releasedLoft = stages.releasedLoft !== null;
        const firstMissing =
          stages.opportunity === null
            ? 'opportunity_not_recognized'
            : stages.run === null
              ? 'no_deliberate_run'
              : stages.observedRun === null
                ? 'run_not_observed'
                : stages.loftCandidate === null
                  ? 'loft_candidate_absent'
                  : stages.admissibleLoft === null
                    ? 'candidate_not_admissible'
                    : stages.selectedLoft === null && !releasedLoft
                      ? 'valued_below_alternatives'
                      : !releasedLoft
                        ? 'selected_or_prepared_not_released'
                        : 'released_continuation_observed';
        rows.push({
          policy,
          variant,
          skill,
          sample,
          inputHash: hash(initial),
          seed: s.seed,
          stages,
          closedAt,
          closeReason,
          firstMissing,
          forced,
          releases,
          framesHash: hash(frames),
          decisionsHash: hash(decisions),
          frames: sample === 0 && skill === 80 ? frames : [frames[0], frames.at(-1)],
          decisionWitnesses: decisions
            .filter((d) =>
              d.candidates?.some(
                (c) =>
                  c.action.type === 'pass' &&
                  c.action.receiverId === runner.id &&
                  c.action.delivery === 'lofted',
              ),
            )
            .slice(0, 2),
          finalHash: hash(s),
          score: s.score,
          lastContact: sampleCanonicalOutcome(initial, s, 'original-delivery-v3').contacts,
        });
        if (rows.length % 28 === 0) console.log('opportunity', model, rows.length, policy);
      }
const summary = {
  scenarios: rows.length,
  loftCandidates: rows.filter((r) => r.stages.loftCandidate !== null).length,
  admissible: rows.filter((r) => r.stages.admissibleLoft !== null).length,
  released: rows.filter((r) => r.stages.releasedLoft !== null).length,
  forced: rows.filter((r) => r.forced).length,
  firstMissing: Object.fromEntries(
    [...new Set(rows.map((r) => r.firstMissing))].map((key) => [
      key,
      rows.filter((r) => r.firstMissing === key).length,
    ]),
  ),
};
finish(
  `docs/performance/pr198/opportunities-${model}-${version}.json.gz`,
  {
    schema: 'pr198-opportunities-v1',
    source: identity,
    model,
    method:
      'Standing wide runner, autonomous teams; paired seeds/mirrors and 40/80 ability. Native menus sampled every 0.2s, bounded decisions witnessed. First passer release or opposing control closes the causal attempt. Later actions cannot complete it. Events are not a nested probability funnel.',
    rows,
    summary,
  },
  {
    milliseconds: performance.now() - start,
    cpu: process.cpuUsage(cpu),
    maxRSSKiB: process.resourceUsage().maxRSS,
  },
);
console.log(JSON.stringify(summary));
