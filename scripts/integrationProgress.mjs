import { z } from 'zod';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { hash, read } from './pr200Evidence.mjs';
export const integrationDimensions = [
  'LIVE_CONSUMER_PRESENT',
  'INTEGRATION_CANDIDATE',
  'COMPATIBILITY_VALIDATED',
  'FULL_MATCH_TRANSFER_SUPPORTED',
  'CANONICAL_PROMOTED',
];
const stage = z.object({
  status: z.enum(['SUPPORTED', 'PARTIAL', 'FAILED', 'BLOCKED', 'NOT_ASSESSED']),
  evidence: z.string().array(),
  limitation: z.string().min(1),
});
export const integrationProgressSchema = z.object({
  schema: z.literal('mfl-integration-evidence-v0'),
  profile: z.literal('realism-candidate-v0'),
  decision: z.literal('NOT_READY_FOR_PROMOTION'),
  records: z.array(
    z.object({
      mechanism: z.string(),
      ids: z.string().array().min(1),
      sourceLocation: z.string(),
      sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      profile: z.string(),
      behaviour: z.string(),
      knownRegressions: z.string().array(),
      dimensions: z.object(Object.fromEntries(integrationDimensions.map((d) => [d, stage]))),
    }),
  ),
  evidence: z.array(
    z.object({
      key: z.string(),
      path: z.string(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});
export const validateIntegrationProgress = (mapping, registry, inspect = true) => {
  integrationProgressSchema.parse(mapping);
  if (new Set(mapping.records.map((r) => r.mechanism)).size !== mapping.records.length)
    throw Error('Duplicate integration mechanism');
  const evidence = new Map(mapping.evidence.map((e) => [e.key, e]));
  if (evidence.size !== mapping.evidence.length) throw Error('Duplicate integration evidence');
  for (const e of evidence.values()) {
    const path = resolve(e.path);
    if (!path.startsWith(resolve('docs') + sep) || !existsSync(path))
      throw Error('Missing/unsafe integration evidence');
    if (inspect) {
      if (createHash('sha256').update(readFileSync(path)).digest('hex') !== e.sha256)
        throw Error('Integration evidence bytes drift');
      const r = read(path);
      if ((r.result?.source ?? r.source)?.fingerprint !== e.sourceFingerprint)
        throw Error('Integration source identity drift');
    }
  }
  for (const r of mapping.records) {
    if (r.profile !== mapping.profile || r.ids.some((id) => !registry.some((i) => i.id === id)))
      throw Error('Unregistered integration identity');
    const path = resolve(r.sourceLocation);
    if (!path.startsWith(resolve('src/core') + sep) || !existsSync(path))
      throw Error('Missing integration source');
    for (const d of integrationDimensions) {
      const s = r.dimensions[d];
      if (s.status === 'SUPPORTED' && !s.evidence.length)
        throw Error('Unsupported positive integration status');
      if (s.evidence.some((key) => !evidence.has(key)))
        throw Error('Missing integration evidence key');
    }
    if (r.dimensions.CANONICAL_PROMOTED.status === 'SUPPORTED')
      throw Error('PR200 has no canonical promotion');
  }
  return true;
};
export const generateIntegrationProgress = (mapping, registry) => {
  validateIntegrationProgress(mapping, registry);
  return {
    profile: mapping.profile,
    decision: mapping.decision,
    mechanisms: mapping.records.length,
    supportedCounts: Object.fromEntries(
      integrationDimensions.map((d) => [
        d,
        mapping.records.filter((r) => r.dimensions[d].status === 'SUPPORTED').length,
      ]),
    ),
    dimensions: Object.fromEntries(
      integrationDimensions.map((d) => [
        d,
        Object.fromEntries(
          ['SUPPORTED', 'PARTIAL', 'FAILED', 'BLOCKED', 'NOT_ASSESSED'].map((s) => [
            s,
            mapping.records.filter((r) => r.dimensions[d].status === s).length,
          ]),
        ),
      ]),
    ),
    records: mapping.records,
    evidence: mapping.evidence,
    mappingHash: hash(mapping),
  };
};
export const renderIntegrationProgress = (i) => {
  let md =
    '\n## Integration progress (PR200)\n\nImplementation lifecycle is separate from I/F/E/T/M/C and the historical issue/fix counts. Each mechanism is counted once; shared issue IDs and flags do not become independent repairs. **' +
    i.profile +
    ': ' +
    i.decision +
    '**.\n\n| Dimension | Supported | Partial | Failed | Blocked | Not assessed |\n| --- | ---: | ---: | ---: | ---: | ---: |\n';
  for (const [d, c] of Object.entries(i.dimensions))
    md += `| ${d} | ${c.SUPPORTED} | ${c.PARTIAL} | ${c.FAILED} | ${c.BLOCKED} | ${c.NOT_ASSESSED} |\n`;
  md +=
    '\nEvidence, exact source identities, registry IDs, demonstrated scope and regressions: [integration mapping](INTEGRATION_EVIDENCE.json). Selection in an executable failing candidate does not imply compatibility, match transfer, calibration or canonical promotion.\n';
  return md;
};
