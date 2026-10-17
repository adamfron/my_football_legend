/* global console, structuredClone */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
const baseline = process.argv.find((a) => a.startsWith('--baseline-root='))?.slice(16);
if (!baseline) throw new Error('--baseline-root is required');
const engines = [];
for (const [label, root] of [
  ['PR172', baseline],
  ['PR173', '.'],
]) {
  const load = (p) => import(pathToFileURL(resolve(root, p)).href);
  const [{ createCanonicalWorldDatabase }, { createSingleMatchSession }, sim] = await Promise.all([
    load('scripts/createCanonicalWorldDatabase.ts'),
    load('src/core/singleMatch.ts'),
    load('src/core/matchSimulation/index.ts'),
  ]);
  const world = createCanonicalWorldDatabase();
  const state = sim.createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0].id,
      awayClubId: world.clubs[1].id,
      seed: 'pr149-stats-render-independent',
      control: { mode: 'spectator' },
    }),
  );
  engines.push({ label, state, sim });
}
const rows = [];
for (let repetition = -1; repetition < 3; repetition++)
  for (const e of repetition % 2 === 0 ? [...engines].reverse() : engines) {
    let headless = structuredClone(e.state),
      watched = structuredClone(headless);
    const at = performance.now();
    for (let tick = 0; tick < 2400; tick++) {
      headless = e.sim.stepTacticalMatchAfterDecisionProbe(headless, e.sim.FIXED_MATCH_DT);
      watched = e.sim.stepTacticalMatch(watched, e.sim.FIXED_MATCH_DT);
      if (tick % 20 === 0) {
        e.sim.matchStateToFrame(watched);
        e.sim.projectMatchCentreStatistics(watched);
      }
    }
    const wallMs = performance.now() - at;
    if (JSON.stringify(headless) !== JSON.stringify(watched))
      throw new Error('Statistics projection changed complete state');
    rows.push({ engine: e.label, repetition, wallMs });
    console.log(`${e.label} ${repetition} ${wallMs.toFixed(1)}ms`);
  }
writeFileSync(
  'docs/performance/PR173-statistics-test-cpu.json',
  JSON.stringify(
    {
      version: 1,
      method:
        'Serial Node CPU control using the exact pr149Statistics test seed, 2400 ticks for each of headless and watched, projection every 20 ticks. No changed timeout/worker/assertion. First repetition warm-up. Alternating engines; full JSON state equality after stepping. This control does not replace npm run verify or claim a Vitest PASS.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
