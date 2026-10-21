import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { deriveRestartLegalReadiness } from '../src/core/matchSimulation/restartLaws.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { pr172SourceHash } from './pr172Evidence.ts';
const dir = 'docs/performance/pr180-evidence',
  rows = [];
for (const name of readdirSync(dir).filter((n) => n.endsWith('-restart-state.json.gz'))) {
  const raw = readFileSync(`${dir}/${name}`),
    frozen = JSON.parse(gunzipSync(raw));
  for (const policy of [
    'legacy-pr176',
    'state-value-v1',
    'role-value-v1',
    'role-intent-v1',
    'phase-role-hybrid-v1',
  ]) {
    let state = { ...globalThis.structuredClone(frozen), decisionPolicy: policy };
    const awardId = state.restart.awardId,
      initialReadiness = deriveRestartLegalReadiness(state);
    let physicallyReady = false,
      ticks = 0;
    while (ticks < 400 && state.restart?.awardId === awardId) {
      physicallyReady ||= deriveRestartLegalReadiness(state).ready;
      state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
      ticks++;
    }
    if (!physicallyReady || state.restart?.awardId === awardId)
      throw Error(`Blocked restart: ${name}/${policy}`);
    rows.push({
      name,
      inputSha256: createHash('sha256').update(raw).digest('hex'),
      policy,
      initialReadiness,
      physicallyReady,
      elapsedSeconds: state.time - frozen.time,
      ticks,
      finalHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
    });
  }
}
writeFileSync(
  'docs/performance/PR180-restart-regressions.json',
  JSON.stringify({ sourceHash: pr172SourceHash(), rows }, null, 2) + '\n',
);
console.log(JSON.stringify({ replayed: rows.length, releasedLegally: true }));
