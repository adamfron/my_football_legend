import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import console from 'node:console';
import { isDeepStrictEqual } from 'node:util';
import { stringifyPr178Receipt } from './pr178ReceiptJson.mjs';

const frozenSource = JSON.parse(
  readFileSync('docs/performance/PR178-validation-freeze.json', 'utf8'),
).sourceHash;
for (const name of ['physical-transitions', 'physical-transitions-prescribed', 'career']) {
  const path = `docs/performance/PR178-${name}.json`;
  const archive = `docs/performance/pr178-evidence/${name}.json.gz`;
  const input = existsSync(archive)
    ? JSON.parse(gunzipSync(readFileSync(archive)))
    : JSON.parse(readFileSync(path, 'utf8'));
  if ((input.sourceHash ?? input.manifest?.sourceHash) !== frozenSource)
    throw new Error('Cannot compact evidence from another physics revision');
  if (!existsSync(archive)) writeFileSync(archive, gzipSync(JSON.stringify(input)));
  const rows = input.rows.map((row) => {
    if (name === 'career') {
      const compact = { ...row };
      delete compact.statistics;
      return compact;
    }
    return {
      scenario: row.scenario,
      policy: row.policy,
      seedIndex: row.seedIndex,
      inputHash: row.inputHash,
      seconds: row.seconds,
      contacts: row.contacts,
      shots: row.shots,
      restarts: row.restarts,
      finalHash: row.finalHash,
      interpretation: row.interpretation,
      recoveries: row.recoveries.map((entry) => {
        const recovery = { ...entry };
        delete recovery.ranking;
        return recovery;
      }),
      physicalSamples: row.samples.length,
      observedActions: row.actions.length,
    };
  });
  writeFileSync(
    path,
    stringifyPr178Receipt({
      ...input,
      rows,
      detailsArchive: archive.replace('docs/performance/', ''),
      compactNote:
        'Detailed physical frames/actions/rankings or complete career statistics are preserved once in the compressed archive.',
    }),
  );
  console.log(
    JSON.stringify({
      name,
      bytes: readFileSync(path).length,
      archiveBytes: readFileSync(archive).length,
    }),
  );
}

// Preserve every value in derived summaries while keeping generated arrays from
// consuming the review's line budget. Do not reformat frozen fixture manifests.
for (const name of [
  'policy-comparison',
  'possession-to-shot-funnel',
  'shooting-outcomes',
  'passing-and-reception',
  'counterattacks',
  'defensive-recovery',
  'stoppages',
  'positional-involvement',
  'combinations',
  'turnovers',
  'regressions',
]) {
  const path = `docs/performance/PR178-${name}.json`;
  const value = JSON.parse(readFileSync(path, 'utf8'));
  const encoded = stringifyPr178Receipt(value);
  if (!isDeepStrictEqual(value, JSON.parse(encoded)))
    throw new Error('Receipt formatting changed data');
  writeFileSync(path, encoded);
}
