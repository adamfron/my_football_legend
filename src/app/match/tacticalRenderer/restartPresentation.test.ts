// @vitest-environment node
import { expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../../../core/singleMatch';
import { createTacticalMatch } from '../../../core/matchSimulation/matchSimulation';
import { awardNaturalRestart } from '../../../core/matchSimulation/restartScenarios';
import { PresentationFrameProjector } from './frameProjection';
import { deriveOwnedBallPose, tacticalFrameSchema } from './model';

it('projects the anchored restart spot, actual ball, selected delivery and wall without changing physics', () => {
  const world = createCanonicalWorldDatabase();
  let state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr159-presentation',
      control: { mode: 'spectator' },
    }),
  );
  state = awardNaturalRestart(state, 'free_kick_close', {
    restartTeam: 'home',
    restartPoint: { x: 83, y: 34 },
    incidentId: 'actual-foul',
  });
  const takerId = state.restart!.takerId;
  state = {
    ...state,
    ball: { x: 75, y: 22, ownerId: takerId },
    restart: {
      ...state.restart!,
      selectedAction: {
        type: 'cross',
        actorId: takerId,
        intent: 'floated',
        target: { x: 97, y: 41 },
      },
      readiness: {
        ballReady: false,
        takerReady: false,
        legalReady: false,
        tacticalReady: false,
        blockers: ['ball_not_placed'],
      },
    },
  };
  const before = structuredClone(state);
  const frame = tacticalFrameSchema.parse(new PresentationFrameProjector().frame(state));
  expect(frame.restart?.spot).toEqual({ x: 83, y: 34 });
  expect(frame.restart?.deliveryTarget).toEqual({ x: 97, y: 41 });
  expect(frame.restart?.wallIds).toHaveLength(4);
  expect(frame.restart?.takerId).toBe(takerId);
  expect(frame.restart?.ready).toBe(false);
  expect(deriveOwnedBallPose(frame)).toEqual(frame.ball);
  expect(frame.ball).toMatchObject({ x: 75, y: 22 });
  expect(state).toEqual(before);
});
