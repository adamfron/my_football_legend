import { performance } from 'node:perf_hooks';
import { log } from 'node:console';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createOffensiveScenario } from '../src/core/matchSimulation/pr163Fixtures.ts';
import { createFormationBenchmarkSession } from '../src/core/matchSimulation/benchmarkFixtures.ts';
import { enumerateCarryChoices } from '../src/core/matchSimulation/carryOpportunity.ts';
import { enumerateNpcSpacePasses } from '../src/core/matchSimulation/spacePassing.ts';

const hash = (s) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const roots = { before: resolve('../baseline'), after: resolve('.') };
const engines = {},
  actions = {};
for (const [key, root] of Object.entries(roots)) {
  engines[key] = await import(
    pathToFileURL(resolve(root, 'src/core/matchSimulation/matchSimulation.ts')).href
  );
  actions[key] = await import(
    pathToFileURL(resolve(root, 'src/core/matchSimulation/matchActions.ts')).href
  );
}
const ranking = [];
for (const scenario of ['elite_winger', 'immediate_pressure', 'baran_equivalent']) {
  const samples = { before: [], after: [] },
    counts = {};
  for (let block = 0; block < 8; block++)
    for (const key of block % 2 ? ['after', 'before'] : ['before', 'after']) {
      const { state, wingerId } = createOffensiveScenario(
        scenario,
        'pr163-performance',
        engines[key].createTacticalMatch,
      );
      const actor = state.players.find((p) => p.id === wingerId);
      state.ball = { ...actor.position, ownerId: actor.id };
      const before = hash(state),
        start = performance.now();
      for (let i = 0; i < 50; i++) actions[key].rankAvailableActionsForAI(state, actor.id);
      const milliseconds = (performance.now() - start) / 50;
      if (block > 0) samples[key].push(milliseconds);
      counts[key] = actions[key].enumerateAvailableActions(state, actor.id).length;
      if (hash(state) !== before) throw new Error('Ranking mutated canonical state');
    }
  ranking.push({ scenario, samples, counts });
}
const generation = [];
for (const scenario of ['elite_winger', 'immediate_pressure', 'baran_equivalent']) {
  const f = createOffensiveScenario(scenario, 'pr163-generation');
  const actor = f.state.players.find((p) => p.id === f.wingerId),
    passer = f.state.players.find((p) => p.id === f.passerId);
  const before = hash(f.state);
  for (const [name, project] of [
    ['carry', () => enumerateCarryChoices(f.state, actor)],
    ['space', () => enumerateNpcSpacePasses(f.state, passer)],
  ]) {
    const milliseconds = [];
    for (let block = 0; block < 8; block++) {
      const start = performance.now();
      for (let i = 0; i < 50; i++) project();
      if (block > 0) milliseconds.push((performance.now() - start) / 50);
    }
    generation.push({ scenario, name, candidates: project().length, milliseconds });
  }
  if (hash(f.state) !== before) throw new Error('Generation mutated canonical state');
}
const physics = { before: [], after: [] };
for (let block = 0; block < 8; block++)
  for (const key of block % 2 ? ['after', 'before'] : ['before', 'after']) {
    let state = engines[key].createTacticalMatch(
      createFormationBenchmarkSession({
        anchor: '4-3-3',
        opponent: '4-4-2',
        attributes: 70,
        seed: 'pr163-physics-performance',
      }),
    );
    state.playerAgencyEnabled = false;
    const start = performance.now();
    for (let tick = 0; tick < 12000; tick++)
      state = engines[key].stepTacticalMatchAfterDecisionProbe(state, engines[key].FIXED_MATCH_DT);
    if (block > 0) physics[key].push(performance.now() - start);
  }
writeFileSync(
  resolve('../performance-final.json'),
  JSON.stringify(
    {
      warmupBlocks: 1,
      measurementBlocks: 7,
      rankingCallsPerBlock: 50,
      physicsSecondsPerBlock: 300,
      fixedDt: 0.025,
      order: 'alternating before/after, reversed each block',
      stateMutation: false,
      ranking,
      generation,
      physics,
    },
    null,
    2,
  ) + '\n',
);
log('saved alternating ranking, independent generation and 300-second physics costs');
