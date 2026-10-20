import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { pr172SourceHash } from './pr172Evidence.ts';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const emit = (name, value) =>
  writeFileSync(`docs/performance/PR178-${name}.json`, JSON.stringify(value, null, 2) + '\n');
const sourceHash = pr172SourceHash();
const archiveRoot = 'docs/performance/pr178-evidence/final';
mkdirSync(archiveRoot, { recursive: true });
const index = [];
for (const split of ['development', 'validation', 'historical']) {
  for (const policy of ['legacy-pr176', 'risk-ablation-v1', 'state-value-v1']) {
    const root =
      split === 'historical'
        ? `../pr178-final-historical-${policy}`
        : `../pr178-${split}-${policy}`;
    for (const name of readdirSync(root).filter(
      (n) => n.endsWith('.json') && !n.includes('failure'),
    )) {
      const metadata = read(`${root}/${name}`);
      if (metadata.manifest.sourceHash !== sourceHash || metadata.status !== 'full_time')
        throw new Error('Incomplete or incompatible final evidence');
      const raw = JSON.parse(
        gunzipSync(readFileSync(`${root}/${name.replace('.json', '-raw.json.gz')}`)),
      );
      const longEpisodes = new Set(
        raw.observations.episodes
          .filter((episode) => episode.end - episode.start > 60)
          .map((episode) => episode.id),
      );
      for (const [choiceIndex, choice] of raw.observations.choices.entries()) {
        const detailed =
          ['credible', 'high_value'].includes(choice.opportunity.category) ||
          choice.selected?.type === 'shot' ||
          choice.selected?.intent === 'header_shot' ||
          (longEpisodes.has(choice.episodeId) &&
            (choiceIndex % 100 === 0 || choiceIndex >= raw.observations.choices.length - 5));
        if (!detailed) {
          delete choice.top;
          const { category, pressure, value } = choice.opportunity;
          choice.opportunity = { category, pressure, value };
        }
      }
      const path = `${archiveRoot}/${split}-${policy}-${name}.gz`;
      const bytes = gzipSync(JSON.stringify({ metadata, ...raw }));
      writeFileSync(path, bytes);
      index.push({
        split,
        policy,
        id: metadata.design.id,
        sourceHash,
        inputHash: metadata.inputHash,
        finalHash: metadata.finalHash,
        ticks: metadata.ticks,
        path,
        bytes: bytes.length,
        sha256: sha(bytes),
        equivalence: metadata.equivalence,
      });
    }
  }
}
if (index.filter((row) => row.split === 'validation').length !== 36)
  throw new Error('Missing final validation');
emit('evidence-index', {
  sourceHash,
  method:
    'One compressed record per final full match contains metadata, all canonical pass/shot/possession/transition/loss/role/aerial/restart records and every observed decision ID/selection. Noncredible nonshot decisions omit redundant top alternatives and detailed opportunity geometry except sampled long-possession diagnostics; their category, pressure and value remain. Detailed credible/shot decisions and sampled long-possession decisions retain full geometry and top alternatives. No historical PR177 receipts changed. Original complete observations remain local; the deterministic harness can regenerate them.',
  rows: index,
});
const historical = read('docs/performance/PR177-comparison.json').rows.filter(
  (r) => r.design.id === 'pr177-dev-strength',
);
const fixed = index
  .filter((r) => r.split === 'historical')
  .map((entry) => {
    const { metadata } = JSON.parse(gunzipSync(readFileSync(entry.path)));
    const teams = Object.values(metadata.official);
    return {
      ...entry,
      football: Object.fromEntries(
        [
          'passesAttempted',
          'passesCompleted',
          'shots',
          'goals',
          'shotsOnTarget',
          'blockedShots',
          'corners',
          'fouls',
          'offsides',
          'possessionLost',
        ].map((key) => [key, teams.reduce((n, t) => n + (t[key] ?? 0), 0)]),
      ),
      contacts: metadata.statistics.observedContactIds.length,
    };
  });
emit('physics-baseline', {
  sourceHash,
  method:
    'A single paired historical strong/weak design isolates the common repair on the exact historical input. Pristine PR176, historical PR177 legacy/A/B and fixed PR178 legacy/A/B remain separate. This is not an engine-wide causal estimate, and original B passing cannot all be attributed to physics.',
  historical,
  fixed,
});
const before = read('docs/performance/PR178-contact-loop-before.json'),
  after = read('docs/performance/PR178-contact-loop-after.json');
emit('contact-loop-before-after', {
  sourceHash,
  before,
  after,
  acceptance:
    'Physical resolution and genuine control with canonical outcomes; no displacement quota or prescribed winner.',
});
emit('observer-equivalence', {
  sourceHash,
  method:
    'Complete canonical serialized final state hash and tick count, not just score or selected fields. Full-ranker/event observer vs disabled hooks on the same input. Serial profiler/event/full-ranker repetitions are additionally recorded in PR178-performance.json.',
  rows: index.filter((r) => r.equivalence),
});
console.log(
  JSON.stringify({
    matches: index.length,
    bytes: index.reduce((n, r) => n + r.bytes, 0),
    sourceHash,
  }),
);
