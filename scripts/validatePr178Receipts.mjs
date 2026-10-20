import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { z } from 'zod';
import { pr172SourceHash } from './pr172Evidence.ts';
import { pr175DesignSchema } from './pr175Fixtures.ts';
import { decisionPolicyIdSchema } from '../src/core/matchSimulation/decisionPolicyConfig.ts';
import {
  matchStatisticsSchema,
  assertMatchStatisticsInvariants,
} from '../src/core/matchSimulation/playerMatchStats.ts';
import { stateValueEvaluationSchema } from '../src/core/matchSimulation/decisionStateValue.ts';
import { careerMatchResultSchema } from '../src/core/careerMatchContract.ts';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const zipped = (path) => JSON.parse(gunzipSync(readFileSync(path)));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const sourceHash = pr172SourceHash();
const freeze = read('docs/performance/PR178-validation-freeze.json');
if (sourceHash !== freeze.sourceHash) throw new Error('Changed frozen candidate');
const metadataSchema = z
  .object({
    manifest: z.object({
      sourceHash: hash,
      harnessHash: hash,
      policy: decisionPolicyIdSchema,
      dt: z.literal(0.025),
    }),
    design: pr175DesignSchema,
    inputHash: hash,
    finalHash: hash,
    ticks: z.number().int().positive(),
    status: z.literal('full_time'),
    statistics: matchStatisticsSchema,
  })
  .passthrough();
const index = read('docs/performance/PR178-evidence-index.json');
const unique = new Set();
for (const entry of index.rows) {
  if (sha(readFileSync(entry.path)) !== entry.sha256)
    throw new Error('Compressed evidence hash mismatch');
  const { metadata: value } = zipped(entry.path);
  const metadata = metadataSchema.parse(value);
  if (
    metadata.manifest.sourceHash !== sourceHash ||
    metadata.manifest.harnessHash !== freeze.harnessHash ||
    metadata.inputHash !== entry.inputHash ||
    metadata.finalHash !== entry.finalHash ||
    metadata.manifest.policy !== entry.policy
  )
    throw new Error('Match lineage mismatch');
  const key = `${entry.split}:${entry.policy}:${entry.id}`;
  if (unique.has(key)) throw new Error('Duplicate independent match row');
  unique.add(key);
  assertMatchStatisticsInvariants(metadata.statistics);
}
for (const policy of decisionPolicyIdSchema.options)
  if (index.rows.filter((row) => row.split === 'validation' && row.policy === policy).length !== 12)
    throw new Error('Missing independent validation designs');
let evaluations = 0;
const controlled = zipped('docs/performance/PR178-controlled.json.gz');
if (controlled.sourceHash !== sourceHash) throw new Error('Controlled source mismatch');
for (const scenario of controlled.scenarios)
  for (const option of scenario.generated)
    if (option.evaluation) {
      stateValueEvaluationSchema.parse(option.evaluation);
      evaluations++;
    }
const careers = read('docs/performance/PR178-career.json');
if (careers.manifest.sourceHash !== sourceHash || careers.rows.length !== 2)
  throw new Error('Career source/count mismatch');
for (const row of careers.rows) {
  const result = careerMatchResultSchema.parse(row.hybrid);
  if (
    !row.duplicateNoOp ||
    !row.choices ||
    result.continuation?.source !== 'canonical_plus_summary'
  )
    throw new Error('Career accounting/coverage mismatch');
}
const performance = read('docs/performance/PR178-performance.json');
if (performance.sourceHash !== sourceHash || performance.rows.length !== 6)
  throw new Error('Incomplete serial measurements');
for (const row of performance.rows) {
  const reference = index.rows.find(
    (entry) => entry.id === row.design && entry.policy === row.policy,
  );
  if (row.finalHash !== reference?.finalHash)
    throw new Error('Profiler/observer changes whole state');
}
for (const row of performance.stress) {
  const reference = read('docs/performance/PR178-contact-loop-after.json').rows.find(
    (entry) => entry.policy === row.policy,
  );
  if (row.finalHash !== reference.finalHash)
    throw new Error('High-contact repetition changes state');
}
const passing = read('docs/performance/PR178-passing-and-reception.json');
for (const row of passing.rows) {
  const delay = row.passing.receptionDelay;
  if (delay.n && (delay.min < 0 || !Number.isFinite(delay.mean)))
    throw new Error('Invalid reception duration');
}
const result = {
  version: 1,
  passed: true,
  sourceHash,
  matchReceipts: index.rows.length,
  independentValidationDesigns: 12,
  completeValidationRuns: 36,
  validatedOutcomeEnvelopes: evaluations,
  careers: careers.rows.length,
  serialFullMatches: performance.rows.length,
  exactStressRepeats: performance.stress.length,
  receptionDurationRows: passing.rows.length,
};
writeFileSync(
  'docs/performance/PR178-receipt-validation.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result));
