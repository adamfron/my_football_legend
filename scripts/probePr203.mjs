import console from 'node:console';
import { createProspectiveFixture } from '../src/core/matchSimulation/prospectivePlayLaboratory.ts';
import { advanceActivePerception } from '../src/core/matchSimulation/activePerception.ts';
import { advanceLiveBallFlight } from '../src/core/matchSimulation/liveBallFlight.ts';
import {
  evaluateProspectivePosition,
  advanceReceivingPositions,
} from '../src/core/matchSimulation/receivingPositions.ts';
import { observeBoundedScene } from '../src/core/matchSimulation/boundedPerception.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
const f = createProspectiveFixture({ seed: 'pr203-probe' });
let s = advanceActivePerception(advanceLiveBallFlight(f.state));
console.log(
  JSON.stringify({
    memory: s.activePerceptionRuntime.memory[f.c.id],
    scene: observeBoundedScene(s, f.c),
    position: evaluateProspectivePosition(s, f.c),
  }),
);
s = advanceReceivingPositions(s);
for (let i = 0; i < 60; i++) {
  s = step(s, 0.025);
  if (i % 8 === 0)
    console.log(
      JSON.stringify({
        at: s.time,
        owner: s.ball.ownerId,
        c: s.players.find((p) => p.id === f.c.id).position,
        job: s.activePerceptionRuntime.positions[f.c.id],
      }),
    );
}
