import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';

// Only the offline analysis helpers come from this checkout. Every canonical stepping, ranking,
// pass resolver and statistical module is imported from the untouched PR176 worktree.
const root = resolve(process.argv[2] ?? '../baseline-pr176');
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim();
if (git('rev-parse', 'HEAD') !== 'df8e532ecf29d6c0a7e92ec241795a6a37250e1c' || git('diff', '--name-only')) throw new Error('Baseline is not clean merged PR176');
let source = readFileSync('scripts/benchmarkPr177.mjs', 'utf8');
for (const p of ['src/core/matchSimulation/attackingTransition.ts', 'src/core/matchSimulation/decisionStateValue.ts', 'src/core/matchSimulation/passLaunchPlan.ts', 'scripts/pr177Fixtures.ts']) {
  source = source.replace(`from '${p.startsWith('scripts/') ? './' + p.slice(8) : '../' + p}'`, `from '${pathToFileURL(resolve(p)).href}'`);
}
source = source.replace(/const apply = \(s\) =>[^\n]+/, 'const apply = (s) => { const state = globalThis.structuredClone(s); delete state.decisionPolicy; delete state.decisionAblation; return state; };');
source = source.replace("'../src/core/matchSimulation/passLaunchPlan.ts'", `'${pathToFileURL(resolve('src/core/matchSimulation/passLaunchPlan.ts')).href}'`);
writeFileSync(resolve(root, 'scripts/benchmarkPr177.mjs'), source);
console.log(JSON.stringify({ baseline: root, source: git('rev-parse', 'HEAD'), trackedClean: true, researchHarnessOnly: true }));
