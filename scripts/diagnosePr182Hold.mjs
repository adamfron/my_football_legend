import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import console from 'node:console';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry.ts';
import { enumerateStateValueActions } from '../src/core/matchSimulation/decisionPolicy.ts';
import { evaluateStateValueAction } from '../src/core/matchSimulation/decisionStateValue.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
let s = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr179-evidence/r2-new-hold-state.json.gz')),
);
for (const steps of [0, 160]) {
  for (let i = 0; i < steps; i++) s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
  const p = s.players.find((p) => p.id === s.ball.ownerId);
  console.log(
    JSON.stringify({
      time: s.time,
      player: p,
      ball: s.ball,
      contact: s.controlledBallContact,
      preparation: s.onBallPreparation,
      geometry: playerContactGeometry(p),
      choices: enumerateStateValueActions(s, p).map((action) => ({
        action,
        evaluation: evaluateStateValueAction(s, p, action),
      })),
    }),
  );
}
