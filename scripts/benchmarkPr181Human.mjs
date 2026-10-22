import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { z } from 'zod';
import { createSpatialFixture } from './pr181SpatialFixtures.ts';
import { pr172SourceHash } from './pr172Evidence.ts';
import { SpatialEvidence } from './pr181Observation.ts';
import { deriveCrossOpportunities } from '../src/core/matchSimulation/crossOpportunity.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { deriveAerialAssignments } from '../src/core/matchSimulation/aerialPositioning.ts';
import { derivePressingPlan } from '../src/core/matchSimulation/defensiveChallenges.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  tacticalMatchStateSchema,
  matchActionSchema,
} from '../src/core/matchSimulation/matchState.ts';

const cases = z.enum([
  'wing-sprint',
  'pass-into-run',
  'lofted-pass',
  'cross',
  'contested-reception',
  'aerial-movement',
  'cut-in-shot',
  'defender-recovery',
]);
const sourceHash = pr172SourceHash(),
  rows = [],
  inputs = [];
const sha = (s) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
for (const name of cases.options)
  for (const policy of ['legacy-pr176', 'phase-role-hybrid-v1']) {
    const fixture = createSpatialFixture(
      name === 'cross'
        ? 'cross-target'
        : name === 'aerial-movement' || name === 'contested-reception'
          ? 'aerial-shoulder'
          : name === 'pass-into-run' || name === 'lofted-pass'
            ? 'depth'
            : 'isolated',
    );
    let state = fixture.state;
    const actor =
      name === 'aerial-movement' || name === 'contested-reception'
        ? fixture.striker
        : fixture.actor;
    state.seed = `pr181:human-mechanics:${name}`;
    state.decisionPolicy = policy;
    state.playerAgencyEnabled = true;
    state.controlledFootballerId = actor.id;
    let action;
    if (name === 'wing-sprint' || name === 'defender-recovery')
      action = {
        type: 'carry',
        actorId: actor.id,
        target: { x: 80, y: 9 },
        movementMode: 'sprint',
      };
    if (name === 'pass-into-run' || name === 'lofted-pass')
      action = {
        type: 'pass',
        actorId: actor.id,
        receiverId: fixture.striker.id,
        target: { x: 75, y: 25 },
        requestedSpace: { x: 75, y: 25 },
        intent: 'through',
        delivery: name === 'lofted-pass' ? 'lofted' : 'ground',
      };
    if (name === 'cross') {
      const c = deriveCrossOpportunities(state, actor)[0];
      if (!c) throw Error('No physically reachable human cross');
      action = {
        type: 'cross',
        actorId: actor.id,
        intendedTargetId: c.receiverId,
        target: c.target,
        intent: c.intent,
      };
    }
    if (name === 'cut-in-shot') {
      actor.position = { x: 88, y: 22 };
      actor.target = { x: 94, y: 32 };
      actor.velocity = { x: 3, y: 2 };
      actor.facingAngle = Math.PI / 3;
      state.ball = {
        ...actor.position,
        ownerId: actor.id,
        height: 0.11,
        velocity: { x: 3, y: 2, z: 0 },
      };
      // Prescribed end of a cut-in, not a claim that the preceding dribble succeeded.
      action = {
        type: 'shot',
        actorId: actor.id,
        target: { x: 105, y: 35 },
        intent: 'placed',
        goalTarget: { horizontal: 0.25, vertical: 0.2 },
      };
    }
    if (name === 'aerial-movement' || name === 'contested-reception') {
      const assignment = deriveAerialAssignments(state).find((a) => a.playerId === actor.id);
      const target = assignment?.target ?? { x: state.ball.x, y: state.ball.y };
      state.playerMovementIntent = {
        actorId: actor.id,
        target,
        type: 'attack_space',
        startedAt: state.time,
        expiresAt: state.time + 3,
      };
    }
    tacticalMatchStateSchema.parse(state);
    if (action) matchActionSchema.parse(action);
    inputs.push({
      name,
      policy,
      state: globalThis.structuredClone(state),
      action,
      inputHash: sha(state),
    });
    const before = globalThis.structuredClone(state);
    if (action) state = resolveMatchAction(state, action, 'human_selected');
    const release = {
      ball: state.ball,
      latestAction: state.latestAction,
      source: state.latestActionSource,
      intent: state.ballCarrierIntent,
    };
    const samples = [],
      evidence = new SpatialEvidence();
    for (let tick = 0; tick < 320; tick++) {
      const previous = state;
      state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
      evidence.observe(previous, state);
      if (tick % 20 === 0)
        samples.push({
          time: state.time,
          actor: state.players.find((p) => p.id === actor.id),
          ball: state.ball,
          defender: state.players.find((p) => p.id === fixture.defender.id),
          defence: derivePressingPlan(state, fixture.defender.id),
          action: state.latestAction,
          actionSource: state.latestActionSource,
        });
    }
    rows.push({
      name,
      policy,
      inputHash: sha(before),
      action,
      release,
      finalHash: sha(state),
      evidence: evidence.export(state),
      samples,
    });
  }
if (pr172SourceHash() !== sourceHash) throw Error('Source changed');
writeFileSync(
  'docs/performance/pr181-evidence/human-mechanics-inputs.json.gz',
  gzipSync(JSON.stringify(inputs)),
);
writeFileSync(
  'docs/performance/pr181-evidence/human-mechanics.json.gz',
  gzipSync(
    JSON.stringify({
      sourceHash,
      rows,
      method:
        'Eight prescribed human-control mechanics contexts, two policies, eight canonical seconds each. Commands enter the common human_selected executor; aerial movement has no invented jump command. Incoming agency and UI coverage remain separate browser/regression evidence. The shot starts at the prescribed end of a cut-in.',
    }),
  ),
);
console.log(JSON.stringify({ rows: rows.length, sourceHash }));
