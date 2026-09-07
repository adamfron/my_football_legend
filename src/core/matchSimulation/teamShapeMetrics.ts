import { distance, type PitchPoint, type TeamSide } from './matchSpace';
import type { TacticalMatchState } from './matchState';

export interface TeamShapeMetrics {
  centroid: PitchPoint;
  length: number;
  width: number;
  stretchIndex: number;
  area: number;
  playersAheadOfBall: number;
  restDefenceCount: number;
}

const hullArea = (points: PitchPoint[]) => {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: PitchPoint, a: PitchPoint, b: PitchPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (values: PitchPoint[]) => {
    const result: PitchPoint[] = [];
    for (const point of values) {
      while (result.length >= 2 && cross(result.at(-2)!, result.at(-1)!, point) <= 0) result.pop();
      result.push(point);
    }
    return result;
  };
  const hull = [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)];
  return (
    Math.abs(
      hull.reduce(
        (sum, p, i) =>
          sum + p.x * hull[(i + 1) % hull.length]!.y - p.y * hull[(i + 1) % hull.length]!.x,
        0,
      ),
    ) / 2
  );
};

/** Ephemeral diagnostics; never persisted or fed back as shape clamps. */
export const deriveTeamShapeMetrics = (
  state: TacticalMatchState,
  side: TeamSide,
): TeamShapeMetrics => {
  const players = state.players.filter(
    (p) => p.team === side && p.profile.primaryPosition !== 'goalkeeper',
  );
  const xs = players.map((p) => p.position.x),
    ys = players.map((p) => p.position.y);
  const centroid = {
    x: xs.reduce((a, b) => a + b, 0) / players.length,
    y: ys.reduce((a, b) => a + b, 0) / players.length,
  };
  const dir = side === 'home' ? 1 : -1;
  return {
    centroid,
    length: Math.max(...xs) - Math.min(...xs),
    width: Math.max(...ys) - Math.min(...ys),
    stretchIndex:
      players.reduce((sum, p) => sum + distance(p.position, centroid), 0) / players.length,
    area: hullArea(players.map((p) => p.position)),
    playersAheadOfBall: players.filter((p) => dir * (p.position.x - state.ball.x) > 0).length,
    restDefenceCount: players.filter((p) => dir * (p.position.x - state.ball.x) < -12).length,
  };
};
