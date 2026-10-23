// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { RealismEvidence } from './pr183ClosureObservation';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { attacksRight } from '../src/core/matchSimulation/matchSpace';

it('keeps a large retreat visible after its owner recovers forward before releasing', () => {
  const initial: TacticalMatchState = JSON.parse(
    gunzipSync(
      readFileSync('docs/performance/pr183-evidence/native-retreat-cm14.json.gz'),
    ).toString(),
  );
  const id = initial.ball.ownerId!,
    actor = initial.players.find((p) => p.id === id)!,
    dir = attacksRight(actor) ? 1 : -1;
  const frame = (seconds: number, retreat: number, owned = true): TacticalMatchState => ({
    ...initial,
    time: initial.time + seconds,
    ball: owned ? { ...initial.ball, ownerId: id } : { x: initial.ball.x, y: initial.ball.y },
    players: initial.players.map((p) =>
      p.id === id
        ? { ...p, position: { x: actor.position.x - dir * retreat, y: actor.position.y } }
        : p,
    ),
  });
  const observer = new RealismEvidence(),
    a = frame(0.025, 0),
    b = frame(5, 10),
    c = frame(8, 5),
    d = frame(8.025, 5, false);
  observer.observe(initial, a);
  observer.observe(a, b);
  observer.observe(b, c);
  observer.observe(c, d);
  const result = observer.export(d);
  expect(result.retreats).toHaveLength(0);
  expect(result.retreatExcursions).toHaveLength(1);
  expect(result.retreatExcursions[0]).toMatchObject({
    peakMetres: 10,
    netMetres: 5,
    recoveredForwardMetres: 5,
  });
});
