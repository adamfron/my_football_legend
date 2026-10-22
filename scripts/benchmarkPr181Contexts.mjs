import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { z } from 'zod';
import { createSpatialFixture } from './pr181SpatialFixtures.ts';
import { createReformFixture } from './pr177Fixtures.ts';
import { pr172SourceHash } from './pr172Evidence.ts';
import { SpatialEvidence } from './pr181Observation.ts';
import { PRIMARY_DECISION_POLICIES } from '../src/core/matchSimulation/decisionPolicyConfig.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { changeTacticalRole } from '../src/core/matchSimulation/tacticalRoles.ts';
import { deriveTacticalTargets } from '../src/core/matchSimulation/tacticalPositioning.ts';
import {
  evaluateTransitionOpportunity,
  deriveTransitionRuns,
} from '../src/core/matchSimulation/attackingTransition.ts';
import {
  rankAvailableActionsForAI,
  resolveMatchAction,
} from '../src/core/matchSimulation/matchActions.ts';
import { deriveCrossOpportunities } from '../src/core/matchSimulation/crossOpportunity.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';

const cases = z.enum([
  'high-fast',
  'high-target',
  'low-technical',
  'mid-wide',
  'two-forwards',
  'outnumbered',
  'late-lead',
  'late-press',
  'after-corner-clearance',
  'after-shot-block',
  'after-interception',
  'after-failed-press',
  'keeper-distribution',
  'after-aerial-recovery',
  'byline-cutback',
  'wing-to-cross',
]);
const sha = (s) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const sourceHash = pr172SourceHash();
const inputs = cases.options.map((name, index) => {
  const transition = index >= 8 && !['byline-cutback', 'wing-to-cross'].includes(name);
  const f = transition
    ? createReformFixture(
        name === 'after-shot-block'
          ? 'blocked-shot-counter'
          : name === 'after-failed-press'
            ? 'press-escape'
            : 'corner-counter',
      )
    : createSpatialFixture(
        name === 'byline-cutback'
          ? 'late-midfielder'
          : name === 'low-technical'
            ? 'low-block'
            : ['mid-wide', 'wing-to-cross'].includes(name)
              ? 'isolated'
              : 'depth',
      );
  let state = f.state;
  state.seed = `pr181:context:${name}`;
  const actor = f.actor,
    other = actor.team === 'home' ? 'away' : 'home';
  if (!transition) {
    if (name === 'byline-cutback') {
      actor.position = { x: 96, y: 8 };
      actor.target = { ...actor.position };
      const midfielder = state.players.find(
        (p) => p.team === actor.team && p.slot.position === 'central_midfielder',
      );
      midfielder.position = { x: 86, y: 34 };
      midfielder.velocity = { x: 2, y: 0 };
      state.ball = { ...actor.position, ownerId: actor.id, height: 0.11, velocity: { x: 2, y: 0 } };
    }
    const striker = state.players.find(
      (p) => p.team === actor.team && p.slot.position === 'striker',
    );
    if (name === 'high-target') {
      state = changeTacticalRole(state, striker.id, 'target_forward');
      striker.profile.attributes.pace = 35;
    }
    if (name === 'two-forwards') {
      const partner = state.players.find((p) => p.id === f.runner.id);
      partner.slot = { ...partner.slot, position: 'striker' };
      state = changeTacticalRole(state, partner.id, 'advanced_forward');
    }
    if (name === 'outnumbered') {
      state.discipline = {
        ...state.discipline,
        [f.defender.id]: { team: other, yellowCards: 2, sentOff: true, sentOffAt: 20 },
      };
      state.players = state.players.filter((p) => p.id !== f.defender.id);
      state.departedPlayers = [...(state.departedPlayers ?? []), f.defender];
    }
    if (name.startsWith('late-')) {
      state.time = 5100;
      state.ballOwnershipStartedAt = 5098;
      state.score[other] = name === 'late-lead' ? 1 : 0;
      state.score[actor.team] = name === 'late-press' ? 1 : 0;
      state.teams[other].style = name === 'late-press' ? 'pressing' : 'counter_attacking';
    }
  } else {
    // Prescribed post-recovery geometry; the preceding corner/block is NOT simulated
    // or asserted as an event. The continuation and all subsequent contacts are live.
    const allowedCause =
      name === 'keeper-distribution'
        ? 'claim'
        : name === 'after-failed-press'
          ? 'tackle'
          : 'interception';
    state.lastPossessionChange = {
      at: 29.75,
      from: other,
      to: actor.team,
      cause: allowedCause,
      winnerId: actor.id,
    };
    for (const p of state.players.filter((p) => p.team === actor.team))
      Object.assign(p.profile.attributes, { passing: 46, firstTouch: 46, technique: 46 });
    if (name === 'keeper-distribution') {
      const keeper = state.players.find(
        (p) => p.team === actor.team && p.slot.position === 'goalkeeper',
      );
      keeper.position = { x: 8, y: 34 };
      state.ball = { ...keeper.position, ownerId: keeper.id, height: 0, velocity: { x: 0, y: 0 } };
    }
  }
  tacticalMatchStateSchema.parse(state);
  return {
    name,
    state,
    inputHash: sha(state),
    actorId: state.ball.ownerId,
    prescribedRecoveryContext: transition,
  };
});
const rows = [];
for (const input of inputs)
  for (const policy of PRIMARY_DECISION_POLICIES) {
    let state = globalThis.structuredClone(input.state);
    state.decisionPolicy = policy;
    const actor = state.players.find((p) => p.id === input.actorId),
      evidence = new SpatialEvidence();
    const initial = {
      crosses: deriveCrossOpportunities(state, actor),
      ranks: rankAvailableActionsForAI(state, actor.id).slice(0, 6),
      targets: deriveTacticalTargets(state).map((p) => ({
        id: p.id,
        position: p.position,
        target: p.target,
        spatial: p.spatialMovement,
      })),
      transition: evaluateTransitionOpportunity(state, actor),
      transitionRuns: deriveTransitionRuns(state),
    };
    let prescribedAction;
    let conditionalDelivery;
    const canonicalEvents = new Map();
    const startAt = state.time;
    if (input.name === 'wing-to-cross') {
      prescribedAction = {
        type: 'carry',
        actorId: actor.id,
        target: { x: 92, y: 12 },
        movementMode: 'sprint',
      };
      state = resolveMatchAction(state, prescribedAction, 'human_selected');
    }
    if (input.name === 'byline-cutback') {
      const c = initial.crosses.find((c) => c.intent === 'cutback');
      if (!c) throw Error('Byline receiver is not physically reachable for a cutback');
      prescribedAction = {
        type: 'cross',
        actorId: actor.id,
        intendedTargetId: c.receiverId,
        target: c.target,
        intent: c.intent,
      };
      state = resolveMatchAction(state, prescribedAction, 'human_selected');
    }
    const samples = [];
    for (let tick = 0; tick < (input.name === 'wing-to-cross' ? 720 : 320); tick++) {
      const previous = state;
      if (
        input.name === 'wing-to-cross' &&
        !conditionalDelivery &&
        state.ball.ownerId === actor.id
      ) {
        const currentActor = state.players.find((p) => p.id === actor.id);
        const c = deriveCrossOpportunities(state, currentActor)[0];
        if (c) {
          const action = {
            type: 'cross',
            actorId: actor.id,
            intendedTargetId: c.receiverId,
            target: c.target,
            intent: c.intent,
          };
          conditionalDelivery = {
            at: state.time,
            opportunity: c,
            action,
            players: state.players.map((p) => ({
              id: p.id,
              position: p.position,
              velocity: p.velocity,
            })),
          };
          state = resolveMatchAction(state, action, 'human_selected');
        }
      }
      state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
      evidence.observe(previous, state);
      for (const event of state.actionEvents ?? [])
        if (event.at >= startAt - 1e-6) canonicalEvents.set(event.id, event);
      if (tick % 40 === 0)
        samples.push({
          time: state.time,
          ball: state.ball,
          players: state.players.map((p) => ({
            id: p.id,
            position: p.position,
            velocity: p.velocity,
            recovery: p.challengeRecovery,
          })),
          action: state.latestAction,
        });
    }
    rows.push({
      name: input.name,
      policy,
      inputHash: input.inputHash,
      initial,
      prescribedAction,
      conditionalDelivery,
      canonicalEvents: [...canonicalEvents.values()],
      samples,
      finalHash: sha(state),
      evidence: evidence.export(state),
    });
  }
if (pr172SourceHash() !== sourceHash) throw Error('Source changed');
writeFileSync(
  'docs/performance/pr181-evidence/context-inputs.json.gz',
  gzipSync(JSON.stringify(inputs)),
);
writeFileSync(
  'docs/performance/pr181-evidence/contexts.json.gz',
  gzipSync(
    JSON.stringify({
      sourceHash,
      rows,
      method:
        'Fifteen eight-second contexts plus one eighteen-second wing-to-cross context, five paired policies. The byline case prescribes a reachable cutback. Wing-to-cross prescribes a finite sprint, then requests a cross only if the actual owner and shared reachable candidate exist; failure to reach that state remains a failed probe. Original rankings remain separate. Recovery labels describe starting context, not a claim that the preceding event was simulated. Native complete matches remain separate evidence.',
    }),
  ),
);
console.log(JSON.stringify({ cases: inputs.length, rows: rows.length, sourceHash }));
