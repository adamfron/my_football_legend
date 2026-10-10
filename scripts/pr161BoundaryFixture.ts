import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import { createTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry';
import { distance, type PhysicalPoint } from '../src/core/matchSimulation/matchSpace';

const world = createCanonicalWorldDatabase();

/** Equivalent recorded geometry, not an invented reconstruction of the missing match export. */
export const createBoundaryFixture = (
  point: PhysicalPoint = { x: 45.0816, y: -0.0324 },
  velocity: PhysicalPoint = { x: 0, y: 0 },
  seed = 'lab-mv2640wz',
): TacticalMatchState => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 439;
  state.actionCooldown = 20;
  state.playerAgencyEnabled = false;
  state.players = state.players.map((player, index) => ({
    ...player,
    position: {
      x: player.team === 'home' ? 12 + (index % 4) * 3 : 90 - (index % 4) * 3,
      y: 15 + (index % 8) * 5,
    },
    target: {
      x: player.team === 'home' ? 12 + (index % 4) * 3 : 90 - (index % 4) * 3,
      y: 15 + (index % 8) * 5,
    },
    velocity: { x: 0, y: 0 },
  }));
  const pursuer = state.players.find(
    (player) => player.team === 'home' && player.slot.position !== 'goalkeeper',
  )!;
  pursuer.position = {
    x: Math.max(0.4, Math.min(104.6, point.x - 2)),
    y: Math.max(1.4, Math.min(66.6, point.y)),
  };
  pursuer.target = { ...pursuer.position };
  pursuer.facingAngle = Math.atan2(point.x - pursuer.position.x, point.y - pursuer.position.y);
  state.ball = {
    ...point,
    velocity: { ...velocity, z: 0 },
    height: 0,
    airborne: false,
    looseSince: state.time - 1,
    lastTouchPlayerId: pursuer.id,
  };
  return state;
};

export const nearestFootDistance = (state: TacticalMatchState) =>
  Math.min(
    ...state.players.map((player) => {
      const geometry = playerContactGeometry(player);
      return Math.min(
        distance(geometry.leftFoot, state.ball),
        distance(geometry.rightFoot, state.ball),
      );
    }),
  );
