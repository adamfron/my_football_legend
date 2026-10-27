import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { hash, read, normalized, options } from './pr199Evidence.mjs';
import console from 'node:console';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
export const dimensions = [
  'SOURCE_AUDITED',
  'EXPERIMENT_INVESTIGATED',
  'ROOT_CAUSE_IDENTIFIED',
  'FIX_IMPLEMENTED',
  'DEVELOPMENT_VALIDATED',
  'INDEPENDENT_VALIDATED',
  'COMPLETE',
];
const statuses = ['NOT_ASSESSED', 'PARTIAL', 'SUPPORTED', 'FAILED', 'BLOCKED'];
const registryStatuses = [
  'NOT_AUDITED',
  'AUDITED_UNVALIDATED',
  'LAB_REQUIRED',
  'LAB_ACTIVE',
  'CALIBRATION_REQUIRED',
  'REFACTOR_REQUIRED',
  'BLOCKED',
  'DEVELOPMENT_VALIDATED',
  'INDEPENDENT_VALIDATION_REQUIRED',
  'COMPLETE',
];
const dimension = z.object({
  status: z.enum(statuses),
  evidence: z.string().array(),
  limitation: z.string().min(1),
});
export const progressMappingSchema = z.object({
  schema: z.literal('mfl-realism-evidence-v1'),
  baseline: z.string(),
  records: z.array(
    z.object({
      id: z.string().regex(/^[A-Z]+-\d+$/),
      dimensions: z.object(Object.fromEntries(dimensions.map((d) => [d, dimension]))),
      regressions: z.string().array(),
      blockers: z.string().array(),
    }),
  ),
  evidence: z.array(
    z.object({
      key: z.string(),
      ids: z.string().array().min(1),
      pr: z.number().int().min(195),
      receipt: z.string(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      sourceArchive: z.string().optional(),
      commit: z.string().optional(),
      experiment: z.string().min(1),
      result: z.string().min(1),
      limitation: z.string().min(1),
      correctionId: z.string().optional(),
    }),
  ),
});
export const parseRegistry = (text) =>
  text
    .split(/^### /m)
    .slice(1)
    .map((block) => {
      const title = block.match(/^([A-Z]+-\d+) — ([^\n]+)/),
        status = block.match(/^- \[([ x])\] ([A-Z_]+)/m);
      if (!title || !status) throw Error('Malformed registry item');
      const priority = block.match(/\*\*(P[0-3])\*\*/)?.[1];
      const subsystem = block.match(/\*\*Category \/ subsystem:\*\* ([^\n]+)/)?.[1]?.trim();
      if (!priority || !subsystem || !registryStatuses.includes(status[2]))
        throw Error('Invalid registry metadata: ' + title[1]);
      if ((status[1] === 'x') !== (status[2] === 'COMPLETE'))
        throw Error('Registry checkbox/status mismatch: ' + title[1]);
      return {
        id: title[1],
        title: title[2].trim(),
        priority,
        subsystem,
        status: status[2],
        checked: status[1] === 'x',
        developmentUpdates: [
          ...new Set(
            [...block.matchAll(/PR(196|197|198|199) development update/g)].map((m) => Number(m[1])),
          ),
        ],
        sourceAuditable:
          block.includes('Implementation:') &&
          ['Current values / structural rule:', 'Current rule / discovery:'].some((s) =>
            block.includes(s),
          ) &&
          ['Proposed validation laboratory:', 'Proposed laboratory / acceptance:'].some((s) =>
            block.includes(s),
          ),
      };
    });
export const validateProgress = (registry, mapping, historicalIds, inspectEvidence = true) => {
  progressMappingSchema.parse(mapping);
  const unique = (list) => new Set(list).size === list.length;
  const ids = registry.map((r) => r.id),
    mapped = mapping.records.map((r) => r.id),
    keys = mapping.evidence.map((e) => e.key);
  if (!unique(ids) || !unique(mapped) || !unique(keys))
    throw Error('Duplicate registry, mapping or evidence identity');
  if (ids.length !== mapped.length || ids.some((id) => !mapped.includes(id)))
    throw Error('Missing or unregistered progress mapping');
  if (historicalIds.some((id) => !ids.includes(id)))
    throw Error('Historical registry item disappeared');
  const evidence = new Map(mapping.evidence.map((e) => [e.key, e]));
  const bytes = new Map(),
    receipts = new Map(),
    sourceArchives = new Set();
  for (const e of mapping.evidence) {
    if (!unique(e.ids) || e.ids.some((id) => !ids.includes(id)))
      throw Error('Invalid evidence issue references');
    const path = resolve(e.receipt);
    if (!path.startsWith(resolve('docs') + sep) || !existsSync(path))
      throw Error('Unsafe/missing evidence receipt: ' + e.receipt);
    if (!inspectEvidence) continue;
    if (!bytes.has(path)) bytes.set(path, hash(readFileSync(path)));
    if (bytes.get(path) !== e.sha256) throw Error('Evidence hash drift: ' + e.receipt);
    if (!receipts.has(path)) receipts.set(path, read(e.receipt));
    const receipt = receipts.get(path),
      identity = receipt.result?.source ?? receipt.sourceArchive;
    const fingerprint =
      identity?.fingerprint ?? identity?.sourceHash ?? receipt.sourceHash ?? receipt.fingerprint;
    if (fingerprint !== e.sourceFingerprint)
      throw Error('Evidence source fingerprint mismatch: ' + e.key);
    if (e.sourceArchive && !existsSync(e.sourceArchive)) throw Error('Missing source archive');
    if (e.sourceArchive && identity?.path !== e.sourceArchive)
      throw Error('Wrong source archive reference');
    if (e.sourceArchive && !sourceArchives.has(e.sourceArchive)) {
      if (hash(read(e.sourceArchive).manifest) !== e.sourceFingerprint)
        throw Error('Corrupt evidence source archive');
      sourceArchives.add(e.sourceArchive);
    }
  }
  for (const r of mapping.records)
    for (const d of dimensions) {
      const status = r.dimensions[d];
      if (!unique(status.evidence)) throw Error('Duplicate dimension evidence: ' + r.id);
      for (const key of status.evidence)
        if (!evidence.get(key)?.ids.includes(r.id))
          throw Error('Invalid item evidence reference: ' + r.id + '/' + key);
      if (status.status === 'SUPPORTED' && !status.evidence.length)
        throw Error('Unsupported positive classification: ' + r.id + '/' + d);
      if (d === 'INDEPENDENT_VALIDATED' && status.status === 'SUPPORTED')
        throw Error('Independent confirmation is sealed');
      if (
        d === 'SOURCE_AUDITED' &&
        status.status === 'SUPPORTED' &&
        !registry.find((i) => i.id === r.id).sourceAuditable
      )
        throw Error('Incomplete source audit: ' + r.id);
      if (
        d === 'COMPLETE' &&
        (status.status === 'SUPPORTED') !== registry.find((i) => i.id === r.id).checked
      )
        throw Error('COMPLETE disagrees with original checkbox: ' + r.id);
    }
  return true;
};
export const generateProgress = (registry, mapping, frozen) => {
  const byId = new Map(mapping.records.map((r) => [r.id, r]));
  const counts = (list) =>
    Object.fromEntries(
      dimensions.map((d) => [
        d,
        Object.fromEntries(
          statuses.map((s) => [
            s,
            list.filter((r) => byId.get(r.id).dimensions[d].status === s).length,
          ]),
        ),
      ]),
    );
  const group = (key) =>
    Object.fromEntries(
      [...new Set(registry.map((r) => r[key]))].sort().map((value) => {
        const list = registry.filter((r) => r[key] === value);
        return [value, { total: list.length, dimensions: counts(list) }];
      }),
    );
  const supported = (dimension) =>
    registry
      .filter((r) => byId.get(r.id).dimensions[dimension].status === 'SUPPORTED')
      .map((r) => r.id);
  const explicitUpdates = Object.fromEntries(
    [196, 197, 198, 199].map((pr) => [
      pr,
      registry.filter((r) => r.developmentUpdates.includes(pr)).map((r) => r.id),
    ]),
  );
  const historicalUpdateUnion = [
    ...new Set([196, 197, 198].flatMap((pr) => explicitUpdates[pr])),
  ].sort();
  const old195 = read('docs/performance/pr196/frozen-pr195.json').registryStatuses.map((r) => r.id);
  const old196 = read('docs/performance/pr197/frozen-pr196.json').registry.map((r) => r.id);
  const old197 = read('docs/performance/pr198/frozen-pr197.json').registry.map((r) => r.id);
  const introducedByPR = {
    196: old196.filter((id) => !old195.includes(id)),
    197: old197.filter((id) => !old196.includes(id)),
    198: frozen.registry.map((r) => r.id).filter((id) => !old197.includes(id)),
    199: registry.map((r) => r.id).filter((id) => !frozen.registry.some((r) => r.id === id)),
  };
  const updated = Object.fromEntries(
    [196, 197, 198, 199].map((pr) => [
      pr,
      [...new Set([...explicitUpdates[pr], ...introducedByPR[pr]])].sort(),
    ]),
  );
  return {
    schema: 'mfl-realism-progress-v1',
    registryHash: hash(normalized('docs/match-engine/ASSUMPTIONS_REGISTER.md')),
    mappingHash: hash(mapping),
    baseline: frozen.base,
    definitions: {
      supported:
        'Evidence supports the explicitly stated scope; it does not close the whole issue.',
      partial:
        'Some relevant evidence exists; the dimension cannot yet be affirmed for its recorded scope.',
      unknown: 'NOT_ASSESSED is missing classification, not failure or success.',
      awaiting:
        'No linked item-specific experiment in this curated mapping; historical references may still need review.',
      complete:
        'Only original checked COMPLETE and all original I/F/E/T/M/C closure conditions; no weakened gates.',
    },
    total: registry.length,
    dimensions: counts(registry),
    supportedCounts: Object.fromEntries(dimensions.map((d) => [d, supported(d).length])),
    investigatedIds: supported('EXPERIMENT_INVESTIGATED'),
    historicalUpdateUnion,
    historicalUpdateCount: historicalUpdateUnion.length,
    updatedByPR: updated,
    explicitDevelopmentUpdates: explicitUpdates,
    introducedByPR,
    newlyAdded: registry
      .filter((r) => !frozen.registry.some((old) => old.id === r.id))
      .map((r) => r.id),
    blockedIds: registry.filter((r) => r.status === 'BLOCKED').map((r) => r.id),
    awaitingFirstLinkedLab: registry
      .filter((r) => !byId.get(r.id).dimensions.EXPERIMENT_INVESTIGATED.evidence.length)
      .map((r) => r.id),
    distinctScopedCorrections: [
      ...new Set(
        mapping.records
          .filter((r) => r.dimensions.FIX_IMPLEMENTED.status === 'SUPPORTED')
          .flatMap((r) =>
            r.dimensions.FIX_IMPLEMENTED.evidence.map(
              (key) => mapping.evidence.find((e) => e.key === key).correctionId,
            ),
          )
          .filter(Boolean),
      ),
    ],
    bySubsystem: group('subsystem'),
    byPriority: group('priority'),
    regressions: mapping.records
      .filter((r) => r.regressions.length)
      .map((r) => ({ id: r.id, evidence: r.regressions })),
    majorBlockers: [...new Set(mapping.records.flatMap((r) => r.blockers))],
    items: registry.map((r) => ({ ...r, ...byId.get(r.id) })),
    evidence: mapping.evidence,
  };
};
export const renderProgress = (report) => {
  let md =
    '# MatchEngine realism progress\n\nGenerated from the authoritative register and explicit [evidence mapping](REALISM_EVIDENCE.json). **Canonical NOT READY; B default; independent confirmation sealed.**\n\n';
  md += `Registered: **${report.total}**. Historical PR196–198 explicit development-update union: **${report.historicalUpdateCount}**. This count is reproduced from actual update paragraphs, separately from new entries and from evidence classifications.\n\n`;
  md +=
    '| Dimension | Supported | Partial | Failed | Blocked | Not assessed |\n| --- | ---: | ---: | ---: | ---: | ---: |\n';
  for (const d of dimensions) {
    const c = report.dimensions[d];
    md += `| ${d} | ${c.SUPPORTED} | ${c.PARTIAL} | ${c.FAILED} | ${c.BLOCKED} | ${c.NOT_ASSESSED} |\n`;
  }
  md += `\nRegistry-blocked items: **${report.blockedIds.length}**. Awaiting first linked item-specific laboratory: **${report.awaitingFirstLinkedLab.length}** (not a claim that older uncatalogued work never occurred). Distinct scoped source corrections: **${report.distinctScopedCorrections.length}**. Issue counts can share one correction; they are not counts of independent repairs.\n\nSupported means only the stated evidence scope. Local development validation does not establish E/T/M/C. No completion percentage is inferred.\n\n`;
  for (const [label, groups] of [
    ['Subsystem', report.bySubsystem],
    ['Priority', report.byPriority],
  ]) {
    md += `| ${label} | Total | Investigated | Diagnosed | Scoped correction | Development validated | COMPLETE |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n`;
    for (const [name, group] of Object.entries(groups))
      md += `| ${name} | ${group.total} | ${group.dimensions.EXPERIMENT_INVESTIGATED.SUPPORTED} | ${group.dimensions.ROOT_CAUSE_IDENTIFIED.SUPPORTED} | ${group.dimensions.FIX_IMPLEMENTED.SUPPORTED} | ${group.dimensions.DEVELOPMENT_VALIDATED.SUPPORTED} | ${group.dimensions.COMPLETE.SUPPORTED} |\n`;
    md += '\n';
  }
  md += '## Development updates and deduplicated investigation\n\n';
  for (const [pr, ids] of Object.entries(report.updatedByPR))
    md += `PR${pr} (${ids.length}): ${ids.join(', ')}.\n\n`;
  md += `Investigated union (${report.investigatedIds.length}): ${report.investigatedIds.join(', ')}.\n\nNew IDs in PR199: ${report.newlyAdded.join(', ') || 'none; temporal observation/velocity/memory is explicitly covered by TACT-009 with PASS-004/009 and GK-002'} .\n\n`;
  md += '## Regressions and blockers\n\n';
  for (const r of report.regressions) md += `- ${r.id}: ${r.evidence.join('; ')}\n`;
  md += '\n';
  for (const b of report.majorBlockers) md += `- ${b}\n`;
  md +=
    '\n## Per-issue record\n\nS = source, X = experiment, R = root cause, F = scoped fix, D = development, I = independent, C = COMPLETE. Full positive evidence (PR, source fingerprint, exact receipt, result and limitation) is in the linked mapping and [machine report](REALISM_PROGRESS.json).\n\n| ID | Registry | S | X | R | F | D | I | C |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
  for (const r of report.items)
    md += `| [${r.id}](ASSUMPTIONS_REGISTER.md#${r.id.toLowerCase()}--${r.title
      .toLowerCase()
      .replace(/[^a-z0-9 -]/g, '')
      .replaceAll(
        ' ',
        '-',
      )}) | ${r.status} | ${dimensions.map((d) => r.dimensions[d].status).join(' | ')} |\n`;
  md +=
    '\nRead-only verification: `npm run benchmark:realism:check`. Regeneration after reviewed mapping changes: `npm run benchmark:realism:generate`. Neither command changes the original registry or closure contract.\n';
  return md;
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const registry = parseRegistry(normalized('docs/match-engine/ASSUMPTIONS_REGISTER.md'));
  const mapping = read('docs/match-engine/REALISM_EVIDENCE.json'),
    frozen = read('docs/performance/pr199/frozen-pr198.json');
  validateProgress(
    registry,
    mapping,
    frozen.registry.map((r) => r.id),
  );
  const report = generateProgress(registry, mapping, frozen),
    md = renderProgress(report),
    json = JSON.stringify(report, null, 2) + '\n';
  if (options.has('check')) {
    if (
      normalized('docs/match-engine/REALISM_PROGRESS.json') !== json ||
      normalized('docs/match-engine/REALISM_PROGRESS.md') !== md
    )
      throw Error('Generated progress output is inconsistent');
  } else {
    writeFileSync('docs/match-engine/REALISM_PROGRESS.json', json);
    writeFileSync('docs/match-engine/REALISM_PROGRESS.md', md);
  }
  console.log('Realism progress PASS', report.total, report.supportedCounts);
}
