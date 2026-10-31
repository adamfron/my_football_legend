import console from 'node:console';
import { createKickFixture } from '../src/core/matchSimulation/physicalKickLaboratory.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { hash } from './pr199Evidence.mjs';
const rows = [];
for (const family of ['pass', 'shot'])
  for (const context of ['open', 'first_time']) {
    const f = createKickFixture({
      seed: 'pr207-baseline-' + family + context,
      family,
      context,
      experimental: false,
    });
    let state = resolveMatchAction(f.state, f.action, 'human_selected');
    const release = hash(state);
    for (let tick = 0; tick < 80; tick++) state = step(state, 0.025);
    rows.push({ family, context, release, continuation: hash(state) });
  }
console.log(JSON.stringify(rows));
