import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import { pr172SourceHash } from './pr172Evidence.ts';

const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const input = JSON.parse(readFileSync('../pr177-debug-strength-half.json', 'utf8'));
const rows = [];
for (const [label, root] of [['before', '../r2-stats-before-index'], ['after', '.']]) {
  const sim = await import(pathToFileURL(resolve(root, 'src/core/matchSimulation/matchSimulation.ts')).href);
  let state = globalThis.structuredClone(input);
  const started = performance.now(), cpu = process.cpuUsage(), checkpoints = [];
  for (let tick = 0; tick < 48000; tick++) {
    if (state.status === 'half_time') state = sim.startSecondHalf(state);
    state = sim.stepTacticalMatchAfterDecisionProbe(state, 0.025);
    if ([80, 200, 2400, 12000, 24000, 48000].includes(tick + 1)) checkpoints.push({ tick: tick + 1, time: state.time, fullStateHash: sha(state) });
  }
  const usage = process.cpuUsage(cpu);
  rows.push({ label, sourceHash: pr172SourceHash(resolve(root)), initialHash: sha(input),
    finalHash: sha(state), checkpoints, cpuMs: (usage.user + usage.system) / 1000, wallMs: performance.now() - started });
  console.log(`${label} ${rows.at(-1).cpuMs}`);
}
const equal = rows[0].finalHash === rows[1].finalHash && rows[0].checkpoints.every((c, i) => c.fullStateHash === rows[1].checkpoints[i].fullStateHash);
writeFileSync('docs/performance/PR177-identity-parity.json', JSON.stringify({ version: 1, method: 'Same full strong/weak state at halftime, 48,000 ordinary 25ms steps per source. Six whole-state checkpoints including 20-minute continuation. Only statistics membership implementation differs.', equal, rows }, null, 2) + '\n');
if (!equal) throw new Error('Identity optimization changes complete canonical state');
