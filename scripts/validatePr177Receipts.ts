import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { decisionPolicyIdSchema, decisionAblationSchema } from '../src/core/matchSimulation/decisionPolicyConfig';
import { matchStatisticsSchema } from '../src/core/matchSimulation/playerMatchStats';
import { stateValueEvaluationSchema } from '../src/core/matchSimulation/decisionStateValue';
import { careerMatchResultSchema } from '../src/core/careerMatchContract';
import { pr175DesignSchema } from './pr175Fixtures';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const metrics = z.record(z.string(), z.number().finite());
export const pr177RunManifestSchema = z.object({
  version: z.literal(1), mode: z.enum(['development', 'validation', 'frozen', 'flight', 'scenarios']),
  policy: decisionPolicyIdSchema, ablation: decisionAblationSchema, sourceHash: hash,
  node: z.string(), dt: z.literal(0.025), harnessHash: hash,
});
export const pr177MatchReceiptSchema = z.object({
  manifest: pr177RunManifestSchema, design: pr175DesignSchema, inputHash: hash,
  finalHash: hash, ticks: z.number().int().positive(), time: z.number().nonnegative(),
  status: z.enum(['first_half', 'second_half', 'half_time', 'full_time', 'abandoned']),
  score: z.object({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() }),
  official: z.object({ home: metrics, away: metrics }), statistics: matchStatisticsSchema,
  cpuMs: z.number().nonnegative(), wallMs: z.number().nonnegative(),
}).passthrough();
export const pr177ArtifactSchema = z.object({ source: z.string(), path: z.string(), originalSha256: hash, compressedSha256: hash, bytes: z.number().int().positive() });
export const pr177ComparisonSchema = z.object({
  version: z.literal(1), method: z.string(), sourceHash: hash,
  rows: z.array(z.object({ group: z.string(), design: pr175DesignSchema, inputHash: hash,
    source: pr177RunManifestSchema, status: z.string(), finalHash: hash, football: metrics,
    metadata: z.string(), raw: z.string(), maxRankedCandidates: z.number().int().nonnegative() }).passthrough()).length(36),
  summary: z.array(z.object({ group: z.string(), matches: z.literal(6), fullTime: z.number().int().min(0).max(6), totals: metrics }).passthrough()).length(6),
  artifacts: z.array(pr177ArtifactSchema),
  decision: z.object({ default: decisionPolicyIdSchema, B: z.string(), reason: z.string() }),
});

const load = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as unknown;
const comparison = pr177ComparisonSchema.parse(load('docs/performance/PR177-comparison.json'));
let matches = 0, evaluations = 0;
for (const row of comparison.rows) {
  const value = JSON.parse(gunzipSync(readFileSync(row.metadata)).toString('utf8')) as unknown;
  const receipt = pr177MatchReceiptSchema.parse(value);
  if (receipt.manifest.sourceHash !== row.source.sourceHash || receipt.inputHash !== row.inputHash || receipt.finalHash !== row.finalHash) throw new Error('Receipt lineage mismatch');
  matches++;
}
const controlled = JSON.parse(gunzipSync(readFileSync('docs/performance/PR177-controlled.json.gz')).toString('utf8')) as {
  scenarios: { generated: { evaluation?: unknown }[] }[];
};
for (const scenario of controlled.scenarios) for (const candidate of scenario.generated) if (candidate.evaluation) {
  stateValueEvaluationSchema.parse(candidate.evaluation); evaluations++;
}
const careers = z.object({ rows: z.array(z.object({ professional: z.boolean(), policy: decisionPolicyIdSchema,
  choices: z.number().int().positive(), duplicateNoOp: z.literal(true), hybrid: careerMatchResultSchema }).passthrough()).length(2) })
  .parse(load('docs/performance/PR177-career.json'));
if (careers.rows.some((r) => r.hybrid.continuation?.source !== 'canonical_plus_summary')) throw new Error('Remainder provenance mismatch');
writeFileSync('docs/performance/PR177-receipt-validation.json', JSON.stringify({ version: 1, passed: true, matchReceipts: matches, validatedOutcomeEnvelopes: evaluations, careers: careers.rows.length }, null, 2) + '\n');
