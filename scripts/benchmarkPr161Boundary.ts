import { writeFileSync } from 'node:fs';
import { createBoundaryFixture, nearestFootDistance } from './pr161BoundaryFixture';
import {
  deriveLooseBallAssignments,
  evaluateGlobalBallRace,
  predictLooseBallIntercept,
} from '../src/core/matchSimulation/looseBallPhysics';
import { FIXED_MATCH_DT, stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import { findPitchBoundaryCrossing } from '../src/core/matchSimulation/pitchBoundary';
import { BALL_RADIUS } from '../src/core/matchSimulation/ballFlight';

let state = createBoundaryFixture();
const initial = {
  at: state.time,
  ball: structuredClone(state.ball),
  ballRadius: BALL_RADIUS,
  crossing: findPitchBoundaryCrossing(state.ball, state.ball) ?? null,
  nearestFootDistance: nearestFootDistance(state),
  assignments: deriveLooseBallAssignments(state),
  races: evaluateGlobalBallRace(state),
  prediction: predictLooseBallIntercept(state.ball, state.ball.velocity!, state.players[1]!),
};
const trace = [];
let recoveredAt: number | undefined;
for (let tick = 0; tick < 240; tick++) {
  const previous = state;
  state = stepTacticalMatch(state, FIXED_MATCH_DT);
  if (!previous.ball.ownerId && state.ball.ownerId) recoveredAt ??= state.time;
  if (tick % 40 === 0 || (!previous.ball.ownerId && state.ball.ownerId))
    trace.push({
      at: state.time,
      ball: { x: state.ball.x, y: state.ball.y, ownerId: state.ball.ownerId ?? null },
      scenario: state.scenario,
      nearestFootDistance: nearestFootDistance(state),
      assignments: deriveLooseBallAssignments(state).map(({ playerId, target }) => ({
        playerId,
        target,
      })),
      acquisition: state.ballAcquisition ?? null,
    });
}
const evidence = {
  referenceSeed: 'lab-mv2640wz',
  originalExportAvailable: false,
  reconstruction:
    'equivalent deterministic geometry; original complete canonical state unavailable in repository',
  fixedStep: FIXED_MATCH_DT,
  initial,
  trace,
  result: {
    recoveredAt: recoveredAt ?? null,
    finalTime: state.time,
    finalScenario: state.scenario,
    ownerId: state.ball.ownerId ?? null,
    physicalContacts: state.contactControlTelemetry?.physicalContacts ?? 0,
    boundaryRestart: state.lastBoundaryRestart ?? null,
  },
};
const target = process.argv[2];
if (target) writeFileSync(target, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence));
