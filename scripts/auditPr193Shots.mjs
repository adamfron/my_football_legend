import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import console from 'node:console';
import { runTransitionLab } from '../src/core/matchSimulation/transitionLaboratory.ts';
import { hash, manifest, retainSourceVersion, writeReceipt } from './pr193Evidence.mjs';
const lab = JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr193/laboratory-final-v6.json.gz')),
  ),
  rows = [];
for (const row of lab.rows.filter((r) => r.actions.some((a) => a.type === 'shot'))) {
  const replay = runTransitionLab(row.config);
  if (hash(replay.final) !== row.finalHash)
    throw Error('Shot audit canonical replay drift ' + row.config.id);
  rows.push({
    id: row.config.id,
    finalHash: row.finalHash,
    shot: replay.final.lastShot ?? null,
    initialPassAlternatives: row.candidates
      .filter((c) => c.action.type === 'pass')
      .map((c) => ({ id: c.id, risk: c.risk, benefit: c.benefit, window: c.opportunity ?? null })),
    limitation:
      'Final intentional shot is canonical; pass risk and shot difficulty use different models and cannot be compared as calibrated success probabilities. Any incidental goal is separately recorded.',
  });
}
const source = manifest();
writeReceipt('docs/performance/pr193/laboratory-shot-quality-v1.json', {
  schema: 'mfl-pr193-shot-audit-v1',
  source,
  sourceHash: hash(source),
  sourceArchive: retainSourceVersion(source),
  rows,
});
console.log('PR193 shot-quality audit', rows.length, 'identical canonical continuations');
