import console from 'node:console';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { playerFootGeometry } from '../../../../src/core/matchSimulation/footContact.ts';
import { motorContactReadyAt } from '../../../../src/core/matchSimulation/ballContactGeometry.ts';
const r = JSON.parse(gunzipSync(readFileSync('docs/performance/pr216/canonical-final-v2.json.gz'))),
  s = r.match.terminal;
const players = s.players
  .filter((p) => Math.hypot(p.position.x - s.ball.x, p.position.y - s.ball.y) < 2)
  .map((p) => {
    const geometry = playerFootGeometry(p),
      feet = ['left', 'right'].map((foot) => {
        const position = geometry[foot + 'Foot'];
        const distance = Math.hypot(
          position.x - s.ball.x,
          position.y - s.ball.y,
          0.04 - (s.ball.height ?? 0.11),
        );
        return { foot, position, distance, surfaceClearance: distance - 0.145 };
      });
    return {
      id: p.id,
      position: p.position,
      velocity: p.velocity,
      target: p.target,
      plant: p.plantBalance,
      readyAt: motorContactReadyAt(s, p.id),
      feet,
      nominalControlReach: geometry.footReach,
    };
  });
const result = {
  source: r.source,
  time: s.time,
  ball: s.ball,
  lastPolicyAt: s.executionWitnesses['policy-b'].at,
  players,
  minimumFootSurfaceClearance: Math.min(
    ...players.flatMap((p) => p.feet.map((f) => f.surfaceClearance)),
  ),
  scope:
    'direct audit of source-bound terminal; nominal control reach is not an active reaching-foot trajectory',
};
writeFileSync(
  'docs/performance/pr216/loose-ball-reaching-blocker.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result, null, 2));
