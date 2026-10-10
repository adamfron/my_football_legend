import { writeFileSync } from 'node:fs';
import { createBoundaryFixture } from './pr161BoundaryFixture';
import { FIXED_MATCH_DT, stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry';
import { deriveLooseBallAssignments } from '../src/core/matchSimulation/looseBallPhysics';
import { distance, type PhysicalPoint } from '../src/core/matchSimulation/matchSpace';
import { isBallWithinPlayingBoundary } from '../src/core/matchSimulation/pitchBoundary';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';

type Cell = {
  name: string;
  point?: PhysicalPoint;
  velocity?: PhysicalPoint;
  restart?: boolean;
  setup?: 'failed_control' | 'deflection' | 'multiple' | 'edge';
};
const cells: Cell[] = [
  { name: '1 stationary wholly inside', point: { x: 45.0816, y: 0.25 } },
  { name: '2 centre beyond paint, ball still legal' },
  { name: '3 whole ball beyond touchline', point: { x: 45.0816, y: -0.12 }, restart: true },
  { name: '4 slow tangential movement', velocity: { x: 0.45, y: 0 } },
  { name: '5 approaching corner', point: { x: 104.8, y: -0.0324 }, velocity: { x: 0.4, y: 0 } },
  { name: '6 opposite touchline', point: { x: 45.0816, y: 68.1 } },
  { name: '7 actual failed finite control', setup: 'failed_control' },
  { name: '8 after recorded defender deflection', setup: 'deflection', velocity: { x: 0.3, y: 0 } },
  { name: '9 multiple legal claimants', setup: 'multiple' },
  { name: '10 body constrained by pitch edge', point: { x: 45.0816, y: -0.105 }, setup: 'edge' },
  {
    name: '11 whole crossing then throw-in release',
    point: { x: 45.0816, y: 68.02 },
    velocity: { x: 0, y: 0.8 },
    restart: true,
  },
  {
    name: '12 throw-in returns to open play',
    point: { x: 45.0816, y: 0.02 },
    velocity: { x: 0, y: -1.2 },
    restart: true,
  },
];
const prepare = (cell: Cell): TacticalMatchState => {
  let state = createBoundaryFixture(cell.point, cell.velocity);
  const actor = state.players.find((player) => player.id === state.ball.lastTouchPlayerId)!;
  const rival = state.players.find(
    (player) => player.team === 'away' && player.slot.position !== 'goalkeeper',
  )!;
  if (cell.setup === 'failed_control') {
    actor.position = { x: state.ball.x - 2.8, y: 0.4 };
    actor.target = { ...actor.position };
    state.ball.ownerId = actor.id;
    delete state.ball.looseSince;
    state = stepTacticalMatch(state, FIXED_MATCH_DT);
    if (state.pendingPossessionLoss?.cause !== 'failed_control' || state.ball.ownerId)
      throw new Error('Failed-control fixture did not actually become loose.');
  }
  if (cell.setup === 'deflection') {
    state.lastBallContact = {
      kind: 'defender',
      playerId: rival.id,
      point: { x: state.ball.x, y: state.ball.y, z: 0 },
      at: state.time - 1,
      segmentFraction: 0.5,
      preContactSpeed: 2,
      postContactSpeed: 0.3,
    };
    state.ball.lastTouchPlayerId = rival.id;
    state.ballEpisode = 4;
  }
  if (cell.setup === 'multiple') {
    actor.position = { x: state.ball.x - 1.2, y: 0.4 };
    actor.target = { ...actor.position };
    rival.position = { x: state.ball.x + 1.2, y: 0.4 };
    rival.target = { ...rival.position };
    rival.facingAngle = -Math.PI / 2;
  }
  if (cell.setup === 'edge') {
    actor.position = { x: state.ball.x - 2, y: 0.4 };
    actor.target = { ...actor.position };
    actor.facingAngle = Math.PI / 2;
  }
  return state;
};
const results = cells.map((cell) => {
  let state = prepare(cell);
  const initial = {
    at: state.time,
    ball: { x: state.ball.x, y: state.ball.y },
    legal: isBallWithinPlayingBoundary(state.ball),
    assignments: deriveLooseBallAssignments(state).map(({ playerId, target }) => ({
      playerId,
      target,
    })),
  };
  let award:
    | { at: number; boundary: string; point: PhysicalPoint; spot: PhysicalPoint }
    | undefined;
  let releasedAt: number | undefined;
  for (let tick = 0; tick < (cell.restart ? 2400 : 400); tick++) {
    state = stepTacticalMatch(state, FIXED_MATCH_DT);
    if (state.lastBoundaryCrossing && !award)
      award = {
        at: state.time,
        boundary: state.lastBoundaryCrossing.boundary,
        point: state.lastBoundaryCrossing.point,
        spot: state.restart!.spot!,
      };
    releasedAt ??= state.throwInRestriction?.releasedAt;
    if (
      state.scenario === 'open_play' &&
      state.ball.ownerId &&
      (!cell.restart || releasedAt !== undefined)
    )
      break;
  }
  const actor = state.players.find((player) => player.id === state.ball.ownerId);
  const geometry = actor && playerContactGeometry(actor);
  const footDistance = geometry
    ? Math.min(distance(geometry.leftFoot, state.ball), distance(geometry.rightFoot, state.ball))
    : undefined;
  const passed = Boolean(
    actor &&
      state.scenario === 'open_play' &&
      (cell.restart
        ? award && releasedAt !== undefined
        : !award && footDistance! <= geometry!.footReach),
  );
  if (!passed)
    throw new Error(
      `Boundary matrix failed ${cell.name}: ${JSON.stringify({ state: state.ball, award, releasedAt, footDistance })}`,
    );
  return {
    case: cell.name,
    passed,
    initial,
    result: {
      at: state.time,
      elapsedSeconds: state.time - initial.at,
      scenario: state.scenario,
      ownerId: state.ball.ownerId,
      ball: { x: state.ball.x, y: state.ball.y },
      actorPosition: actor!.position,
      footDistance,
      footReach: geometry!.footReach,
      publicTouches: state.statistics!.players.find((entry) => entry.playerId === actor!.id)!
        .touches,
      award: award ?? null,
      releasedAt: releasedAt ?? null,
      passResult: state.lastPassDiagnostic?.finalResult ?? null,
      unresolvedDiagnostics: state.looseBallLivenessDiagnostics?.length ?? 0,
    },
  };
});
const evidence = {
  referenceSeed: 'lab-mv2640wz',
  originalExportAvailable: false,
  reconstruction: 'equivalent deterministic canonical geometry fixtures',
  fixedStep: FIXED_MATCH_DT,
  cases: results.length,
  passed: results.filter(({ passed }) => passed).length,
  results,
};
const target = process.argv[2];
if (target) writeFileSync(target, JSON.stringify(evidence, null, 2) + '\n');
console.log(
  JSON.stringify({
    cases: evidence.cases,
    passed: evidence.passed,
    results: results.map(({ case: name, result }) => ({
      case: name,
      elapsedSeconds: result.elapsedSeconds,
      footDistance: result.footDistance,
      releasedAt: result.releasedAt,
    })),
  }),
);
