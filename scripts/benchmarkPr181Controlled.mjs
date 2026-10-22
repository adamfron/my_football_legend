import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { createSpatialFixture, spatialScenarioSchema } from './pr181SpatialFixtures.ts';
import { SpatialEvidence } from './pr181Observation.ts';
import { PRIMARY_DECISION_POLICIES } from '../src/core/matchSimulation/decisionPolicyConfig.ts';
import {
  deriveDepthRunAssignments,
  deriveTacticalTargets,
  deriveFlankRunAssignments,
  deriveFinalThirdOccupations,
} from '../src/core/matchSimulation/tacticalPositioning.ts';
import {
  deriveDepthDefence,
  observeDepthThreats,
} from '../src/core/matchSimulation/depthThreat.ts';
import { deriveAerialAssignments } from '../src/core/matchSimulation/aerialPositioning.ts';
import { deriveCrossOpportunities } from '../src/core/matchSimulation/crossOpportunity.ts';
import { enumerateCarryChoices } from '../src/core/matchSimulation/carryOpportunity.ts';
import { derivePressingPlan } from '../src/core/matchSimulation/defensiveChallenges.ts';
import {
  rankAvailableActionsForAI,
  resolveMatchAction,
} from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { deriveMovementCapability } from '../src/core/matchSimulation/locomotion.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { pr172SourceHash } from './pr172Evidence.ts';
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const dir = 'docs/performance/pr181-evidence';
mkdirSync(dir, { recursive: true });
const inputs = spatialScenarioSchema.options.map((scenario) => ({
  scenario,
  ...createSpatialFixture(scenario),
}));
writeFileSync(
  `${dir}/controlled-inputs.json.gz`,
  gzipSync(
    JSON.stringify(inputs.map(({ scenario, state }) => ({ scenario, state, hash: sha(state) }))),
  ),
);
const rows = [],
  sourceHash = pr172SourceHash();
for (const input of inputs)
  for (const policy of PRIMARY_DECISION_POLICIES) {
    let state = globalThis.structuredClone(input.state);
    state.decisionPolicy = policy;
    const actor = state.players.find((p) => p.id === input.actor.id),
      defender = state.players.find((p) => p.id === input.defender.id);
    const initial = {
      inputHash: sha(input.state),
      actor: {
        id: actor.id,
        position: actor.position,
        velocity: actor.velocity,
        facing: actor.facingAngle,
        capability: deriveMovementCapability(actor),
      },
      defender: {
        id: defender.id,
        position: defender.position,
        velocity: defender.velocity,
        facing: defender.facingAngle,
        capability: deriveMovementCapability(defender),
      },
      depth: deriveDepthRunAssignments(state, actor.team),
      threats: observeDepthThreats(state),
      defence: deriveDepthDefence(state),
      wing: enumerateCarryChoices(state, actor),
      press: derivePressingPlan(state, defender.id),
      overlaps: deriveFlankRunAssignments(state, actor.team),
      crosses: deriveCrossOpportunities(state, actor),
      occupations: deriveFinalThirdOccupations(state, actor.team),
      aerial: deriveAerialAssignments(state),
      movement: deriveTacticalTargets(state).map((p) => ({
        id: p.id,
        target: p.target,
        ideal: p.idealTarget,
        intent: p.spatialMovement,
      })),
    };
    const ranks =
      state.ball.ownerId === actor.id
        ? rankAvailableActionsForAI(state, actor.id)
            .slice(0, 5)
            .map((r) => ({ action: r.action, score: r.score }))
        : [];
    const variants = [{ name: 'autonomous', requested: undefined }];
    if (input.scenario === 'depth' && initial.depth[0]) {
      const run = initial.depth[0];
      variants.push({
        name: 'prescribed-depth-release',
        requested: {
          type: 'pass',
          actorId: actor.id,
          receiverId: run.playerId,
          target: run.target,
          requestedSpace: run.target,
          intent: 'through',
          delivery: 'ground',
        },
      });
    }
    if (
      ['isolated', 'wing-backward', 'covered', 'skilled-slow', 'tired'].includes(input.scenario)
    ) {
      const sprint = initial.wing.find((a) => a.type === 'carry' && a.movementMode === 'sprint');
      if (sprint) variants.push({ name: 'prescribed-sprint', requested: sprint });
    }
    if (input.scenario.startsWith('cross') && initial.crosses[0]) {
      const c = initial.crosses[0];
      variants.push({
        name: 'prescribed-cross',
        requested: {
          type: 'cross',
          actorId: actor.id,
          intendedTargetId: c.receiverId,
          target: c.target,
          intent: c.intent,
        },
      });
    }
    for (const variant of variants) {
      state = globalThis.structuredClone(input.state);
      state.decisionPolicy = policy;
      if (variant.requested) state = resolveMatchAction(state, variant.requested, 'human_selected');
      const start = state.time,
        evidence = new SpatialEvidence(),
        canonicalEvents = new Map(),
        samples = [];
      let peakBallSeparation = 0,
        peakSpeed = 0,
        peakAcceleration = 0;
      for (let i = 0; i < 480; i++) {
        if (['half_time', 'full_time', 'abandoned'].includes(state.status)) break;
        const previous = state;
        state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
        evidence.observe(previous, state);
        for (const event of state.actionEvents ?? [])
          if (event.at >= start - 1e-6) canonicalEvents.set(event.id, event);
        const p = state.players.find((p) => p.id === actor.id),
          old = previous.players.find((p) => p.id === actor.id);
        const speed = Math.hypot(p.velocity.x, p.velocity.y);
        peakSpeed = Math.max(peakSpeed, speed);
        peakAcceleration = Math.max(
          peakAcceleration,
          Math.hypot(p.velocity.x - old.velocity.x, p.velocity.y - old.velocity.y) / 0.025,
        );
        if (
          state.ballCarrierIntent?.actorId === actor.id &&
          (state.ball.ownerId === actor.id || state.ball.lastTouchPlayerId === actor.id)
        )
          peakBallSeparation = Math.max(peakBallSeparation, distance(p.position, state.ball));
        if (i % 20 === 0)
          samples.push({
            at: state.time,
            actor: { position: p.position, velocity: p.velocity, facing: p.facingAngle },
            defender: state.players.find((p) => p.id === defender.id),
            ball: state.ball,
            relevantPlayers: state.players.map((p) => ({
              id: p.id,
              position: p.position,
              velocity: p.velocity,
              target: p.target,
              spatial: p.spatialMovement,
            })),
            action: state.latestAction,
            challenge: state.lastChallenge,
          });
      }
      rows.push({
        scenario: input.scenario,
        policy,
        variant: variant.name,
        prescribedAction: variant.requested,
        requested: variant.requested,
        initial,
        ranks,
        elapsed: state.time - start,
        peakSpeed,
        peakAcceleration,
        peakBallSeparation,
        finalHash: sha(state),
        score: state.score,
        statistics: state.statistics?.teams,
        evidence: evidence.export(state),
        canonicalEvents: [...canonicalEvents.values()],
        samples: samples.map((s) => ({
          ...s,
          defender: {
            id: s.defender.id,
            position: s.defender.position,
            velocity: s.defender.velocity,
            facing: s.defender.facingAngle,
            recovery: s.defender.challengeRecovery,
          },
        })),
      });
    }
  }
if (pr172SourceHash() !== sourceHash) throw Error('Source changed during controlled experiment');
writeFileSync(
  `${dir}/controlled.json.gz`,
  gzipSync(
    JSON.stringify({
      schema: 'mfl-pr181-controlled-v1',
      sourceHash,
      rows,
      scope:
        'Prescribed geometries, autonomous and separately labelled explicit-action continuations; all physical opponents/laws active. Repeated policy rows are dependent.',
    }),
  ),
);
writeFileSync(
  'docs/performance/PR181-controlled.json',
  JSON.stringify(
    {
      sourceHash,
      rows: rows.length,
      cases: inputs.length,
      summary: rows.map((r) => ({
        scenario: r.scenario,
        policy: r.policy,
        variant: r.variant,
        autonomousRankedFirst: r.ranks[0]?.action,
        prescribedAction: r.prescribedAction,
        firstObservedAction: r.samples[0]?.action,
        events: r.evidence.events,
        aerial: r.evidence.aerialOutcomes,
        secondBalls: r.evidence.secondBallTeams,
        peakSpeed: r.peakSpeed,
        peakAcceleration: r.peakAcceleration,
        peakBallSeparation: r.peakBallSeparation,
      })),
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ rows: rows.length, sourceHash }));
