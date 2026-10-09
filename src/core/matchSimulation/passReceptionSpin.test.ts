import { expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import { projectLiveReceptionTarget } from './passReception';
import { projectReceiverReadiness } from './receiverReadiness';
import { BALL_RADIUS } from './ballFlight';

it('moves a prepared reception objective with the actual curved flight without altering the ball', () => {
  const world = createCanonicalWorldDatabase();
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr159-curved-reception',
      control: { mode: 'spectator' },
    }),
  );
  const receiver = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  const desired = { x: 60, y: 34 };
  receiver.position = desired;
  state.ball = {
    x: 40,
    y: 34,
    height: BALL_RADIUS,
    airborne: true,
    bounceCount: 0,
    velocity: { x: 20, y: 0, z: 6 },
    spin: { x: 0, y: 0, z: 100 },
    travelKind: 'cross',
    from: { x: 40, y: 34 },
    target: desired,
  };
  state.receptionPreparation = {
    actorId: receiver.id,
    sourceActorId: 'passer',
    releasedAt: 0,
    awarenessAt: 0,
    expectedContactPoint: desired,
    expectedArrivalTime: 1.2,
    movement: 'meet_ball',
    ballEpisode: 'curved-flight',
    readiness: projectReceiverReadiness(state, receiver, desired, 1.2, 'support'),
  };
  const ordinary = structuredClone(state);
  delete ordinary.ball.spin;
  const originalBall = structuredClone(state.ball);
  const target = projectLiveReceptionTarget(state, receiver)!;
  const ordinaryTarget = projectLiveReceptionTarget(ordinary, receiver)!;
  expect(target.y).toBeGreaterThan(ordinaryTarget.y + 1);
  expect(ordinaryTarget.y).toBe(34);
  expect(state.ball).toEqual(originalBall);
});
