import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const source = resolve(process.argv[2] ?? '.');
const scenario = process.argv[3] ?? 'free_kick_close';
if (!['open_play', 'free_kick_close'].includes(scenario))
  throw new Error('Unknown benchmark scene.');
const load = (file) => import(pathToFileURL(resolve(source, file)).href);
const { createFormationBenchmarkMatch } = await load(
  'src/core/matchSimulation/benchmarkFixtures.ts',
);
const { stepTacticalMatch, stepTacticalMatchAfterDecisionProbe, FIXED_MATCH_DT } = await load(
  'src/core/matchSimulation/matchSimulation.ts',
);
const { projectPlayerDecisionOpportunity, applyPlayerDecision } = await load(
  'src/core/matchSimulation/playerDecision.ts',
);
const { CareerMatchEvidence } = await load('src/core/careerMatchContract.ts');
const { applyRestartScenario } = await load('src/core/matchSimulation/restartScenarios.ts');
const rows = [];
for (const mode of ['interactive', 'background']) {
  let { state } = createFormationBenchmarkMatch({
    anchor: '4-3-3',
    opponent: '4-4-2',
    attributes: 65,
    seed: 'pr166-cpu',
  });
  if (scenario !== 'open_play')
    state = applyRestartScenario(state, 'free_kick_close', {
      restartTeam: 'home',
      restartPoint: { x: 80, y: 34 },
    });
  state.controlledFootballerId =
    scenario === 'open_play' ? state.players[8].id : state.restart.takerId;
  state.playerAgencyEnabled = true;
  const evidence = new CareerMatchEvidence();
  for (let tick = 0; tick < 200; tick++)
    state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
  const before = process.memoryUsage();
  const start = performance.now();
  for (let tick = 0; tick < 2400; tick++) {
    const opportunity = projectPlayerDecisionOpportunity(state);
    if (opportunity) state = applyPlayerDecision(state, opportunity, opportunity.options[0].id);
    state =
      mode === 'interactive'
        ? stepTacticalMatch(state, FIXED_MATCH_DT)
        : stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    evidence.observe(state);
  }
  rows.push({
    mode,
    footballSeconds: 60,
    elapsedMs: performance.now() - start,
    beforeHeapBytes: before.heapUsed,
    afterHeapBytes: process.memoryUsage().heapUsed,
    rssBytes: process.memoryUsage().rss,
    selected: evidence.snapshot(state.controlledFootballerId).selected,
    stateDigest: JSON.stringify({
      score: state.score,
      time: state.time,
      decisionIndex: state.decisionIndex,
      ball: state.ball,
    }),
  });
}
process.stdout.write(
  JSON.stringify({
    source,
    scenario,
    rows,
    scope: `Node CPU, ${scenario} fixture, fixed 60-second measured window after 200 preliminary probes; first eligible human option and bounded career evidence; excludes browser scheduling, 3D rendering and GPU/FPS`,
  }) + '\n',
);
