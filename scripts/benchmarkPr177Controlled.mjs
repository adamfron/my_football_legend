import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import console from 'node:console';
import { createReformFixture, reformScenarioSchema } from './pr177Fixtures.ts';
import { rankAvailableActionsForAI, enumerateAvailableActions, resolveMatchAction, deriveLeadPass } from '../src/core/matchSimulation/matchActions.ts';
import { enumerateStateValueActions } from '../src/core/matchSimulation/decisionPolicy.ts';
import { evaluateStateValueAction, stateValueEvaluationSchema } from '../src/core/matchSimulation/decisionStateValue.ts';
import { prospectiveSpaceTargets } from '../src/core/matchSimulation/spacePassing.ts';
import { deriveFeasiblePassPlans, derivePassLaunchPlan } from '../src/core/matchSimulation/passLaunchPlan.ts';
import { estimatePlayerArrivalTime } from '../src/core/matchSimulation/playerArrival.ts';
import { preparationMarginForAction } from '../src/core/matchSimulation/onBallPreparation.ts';
import { canReleaseControlledAction } from '../src/core/matchSimulation/decisionReadiness.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { angleForVector } from '../src/core/matchSimulation/playerOrientation.ts';
import { projectFutureBallTrajectory } from '../src/core/matchSimulation/ballPhysics.ts';
import { evaluatePassDecision } from '../src/core/matchSimulation/passDecision.ts';

const hash = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const scenarios = [];
for (const id of reformScenarioSchema.options) for (const policy of ['legacy-pr176', 'risk-ablation-v1', 'state-value-v1']) {
  const { state, actor, runner } = createReformFixture(id);
  state.decisionPolicy = policy;
  const initialHash = hash(state), ranking = rankAvailableActionsForAI(state, actor.id);
  const generated = policy === 'state-value-v1' && state.ball.ownerId === actor.id ? enumerateStateValueActions(state, actor) : enumerateAvailableActions(state, actor.id);
  const options = generated.map((action) => {
    const evaluation = policy === 'state-value-v1' ? evaluateStateValueAction(state, actor, action) : null;
    if (evaluation && !stateValueEvaluationSchema.safeParse(evaluation).success) throw new Error('Invalid probability/value branch');
    return { action, evaluated: ranking.some((r) => JSON.stringify(r.action) === JSON.stringify(action)),
      preparationMargin: preparationMarginForAction(state, actor, action), controlledContactReady: canReleaseControlledAction(state, actor),
      feasibleDelivery: action.deliveryPlan?.feasible ?? null,
      guard: evaluation === undefined ? 'release, preparation, participant or offside inadmissibility' : 'admissible', evaluation };
  });
  const prospective = policy === 'state-value-v1' ? prospectiveSpaceTargets(state, actor).map(({ receiver, target }) => {
    const eta = estimatePlayerArrivalTime(state, receiver, target, 'intercept').estimatedTime;
    const plans = deriveFeasiblePassPlans(state, actor, receiver, target, 'through', true);
    return { receiverId: receiver.id, velocity: receiver.velocity, oldLeadAccepted: Boolean(deriveLeadPass(state, actor, receiver)), target,
      receiverMovementEta: eta, plans: plans.map((plan) => ({ plan, receptionArrivalFits: eta + plan.receiverReadiness.awareAt <= plan.predictedArrivalTime + 0.3 })),
      generated: generated.some((a) => a.type === 'pass' && a.receiverId === receiver.id && distance(a.target, target) < 0.8) };
  }) : [];
  const checkpoints = [];
  let s = globalThis.structuredClone(state);
  for (let i = 0; i < 320; i++) {
    s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
    if ([80, 200, 320].includes(i + 1)) checkpoints.push({ seconds: (i + 1) / 40, hash: hash(s), possession: s.possessionTeam, ball: s.ball,
      players: s.players.map((p) => ({ id: p.id, position: p.position, velocity: p.velocity, target: p.target })),
      contact: s.lastGroundContact, pass: s.lastResolvedPass, shot: s.lastShot, loss: s.lastPossessionLoss, restart: s.restart?.phase });
  }
  scenarios.push({ id, policy, initialHash, ranking, generated: options, prospective, selected: ranking[0]?.action, checkpoints, originalRunnerVelocity: runner.velocity });
}
const flight = [];
let planningMs = 0, planningCalls = 0;
for (const metres of [5, 10, 15, 25, 35, 45, 60]) for (const geometry of ['straight', 'diagonal']) for (const delivery of ['ground', 'lofted']) for (const covered of [false, true]) {
  const { state, actor, runner, opponents } = createReformFixture('long-switch');
  for (const p of state.players) { p.position = { x: 100, y: 65 }; p.target = p.position; p.velocity = { x: 0, y: 0 }; }
  actor.position = { x: 5, y: 10 }; actor.target = actor.position; state.ball = { ...actor.position, ownerId: actor.id };
  const target = { x: 5 + metres * (geometry === 'straight' ? 1 : 0.8), y: 10 + metres * (geometry === 'straight' ? 0 : 0.6) };
  runner.position = target; runner.target = target;
  actor.facingAngle = angleForVector({ x: target.x - actor.position.x, y: target.y - actor.position.y });
  runner.facingAngle = angleForVector({ x: actor.position.x - target.x, y: actor.position.y - target.y });
  if (covered) { opponents[0].position = { x: (target.x + 5) / 2, y: (target.y + 10) / 2 + 0.6 }; opponents[0].target = target; }
  const start = performance.now();
  const plan = derivePassLaunchPlan(state, actor, runner, target, 'direct', delivery), alternatives = deriveFeasiblePassPlans(state, actor, runner, target, 'direct', true);
  planningMs += performance.now() - start; planningCalls++;
  const evidence = evaluatePassDecision(state, actor, runner, target, 'direct', delivery, plan);
  const action = { type: 'pass', actorId: actor.id, receiverId: runner.id, target, intent: 'direct', delivery, deliveryPlan: plan };
  const release = resolveMatchAction(state, action, 'dev_ai_selected');
  const initialPassId = release.lastPassDiagnostic?.passId;
  let s = release, outcome = null;
  for (let i = 0; i < 320; i++) {
    s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
    if (!outcome && s.lastResolvedPass?.passId === initialPassId && s.lastResolvedPass.finalResult) outcome = globalThis.structuredClone(s.lastResolvedPass);
  }
  const trajectory = projectFutureBallTrajectory({ position: { x: release.ball.x, y: release.ball.y, z: 0.11 }, velocity: release.ball.velocity, airborne: delivery === 'lofted', bounceCount: 0 }, 8, 0.025);
  const nearest = trajectory.reduce((a, b) => distance(a.ball.position, target) < distance(b.ball.position, target) ? a : b);
  flight.push({ metres, measuredDistance: distance(actor.position, target), geometry, delivery, covered, plan, alternatives, evidence,
    actualLaunchSpeed: release.ball.launchSpeed, actualLaunchVelocity: release.ball.launchVelocity,
    physicalOnlyArrival: nearest.at, physicalOnlyMissMetres: distance(nearest.ball.position, target),
    actualPassOutcome: outcome, finalBall: s.ball, reception: outcome?.actualReceiverId ?? null,
    interpretation: 'prescribed release with ordinary execution error; physical-only arrival and full-player interception/reception are separate observations' });
}
const historical = JSON.parse(gunzipSync(readFileSync('../pr176-inputs/pr175-natural.json.gz')))[0];
const sensitivity = [];
for (const reading of [20, 40, 60, 80, 99]) {
  const state = globalThis.structuredClone(historical.state); state.decisionPolicy = 'state-value-v1';
  const actor = state.players.find((p) => p.id === historical.actorId);
  actor.profile.attributes.gameReading = reading;
  const receiver = state.players.find((p) => p.team === actor.team && p.slot.position === 'central_midfielder');
  const target = receiver.position;
  const plans = deriveFeasiblePassPlans(state, actor, receiver, target, 'progressive');
  const action = { type: 'pass', actorId: actor.id, receiverId: receiver.id, target, intent: 'progressive', deliveryPlan: plans[0] };
  const evaluation = evaluateStateValueAction(state, actor, action);
  sensitivity.push({ reading, action, evaluation: evaluation ?? null, guard: evaluation ? 'admissible' : 'physical preparation/contact not ready in this original frozen state',
    forecast: evaluatePassDecision(state, actor, receiver, target, 'progressive', 'ground', plans[0]) });
}
const receipt = { version: 1, method: 'All generated actions, independent run proposals, selection and actual paired canonical continuations. No validation outcomes read.',
  scenarios, flight, planning: { calls: planningCalls, wallMs: planningMs, includesBothNominalAndAlternativePlans: true }, sensitivity };
writeFileSync('docs/performance/PR177-controlled.json.gz', gzipSync(JSON.stringify(receipt)));
writeFileSync('docs/performance/PR177-controlled-summary.json', JSON.stringify({ version: 1, cases: scenarios.length, scenarios: reformScenarioSchema.options,
  flightRows: flight.length, planning: receipt.planning, sensitivity, source: 'benchmarkPr177Controlled.mjs' }, null, 2) + '\n');
console.log(JSON.stringify({ scenarios: scenarios.length, flight: flight.length }));
