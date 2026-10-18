import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pr172Hash, pr172SourceHash } from './pr172Evidence';
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16_000_000 });
const merged = 'd6556eba33d240bfc6ed845e256b185e9a24bc4a', frozenK = 'b902e4c';
const paths = git('ls-tree', '-r', '--name-only', merged, 'src/core/matchSimulation').trim().split('\n').filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts')).sort();
const hashAt = (ref: string) => pr172Hash(paths.map((p) => `${p}\0${git('show', `${ref}:${p}`).replaceAll('\r\n', '\n')}\0`).join(''));
const archived = readdirSync('docs/performance', { recursive: true }).map(String).filter((p) => /^PR17[1-4]|^pr17[1-4]-/.test(p));
const historical = archived.filter((p) => !p.endsWith('.png') && /\.(json|gz|md)$/.test(p)).map((p) => `docs/performance/${p.replaceAll('\\', '/')}`);
const scripts = ['benchmarkPr174Cohort.ts', 'pr171Fixtures.ts', 'pr174CohortFixtures.ts', 'pr172DecisionLoader.mjs', 'benchmarkPr175.ts', 'pr175Fixtures.ts', 'pr175Observer.ts'];
writeFileSync('docs/performance/PR175-source-baseline.json', JSON.stringify({
  version: 1, mergedCommit: merged, pr174Head: '63957f998884e4f8397164ada636070940fbdb3e', frozenK,
  hashMethod: 'SHA256 of sorted production matchSimulation TS paths + NUL + LF-normalised UTF8 source + NUL; existing PR172–174 convention',
  mergedCanonicalHash: hashAt(merged), workingCanonicalHash: pr172SourceHash(), frozenKCanonicalHash: hashAt(frozenK),
  frozenKDiff: git('diff', `${frozenK}..${merged}`, '--', 'src/core/matchSimulation'),
  researchHashes: Object.fromEntries(scripts.map((p) => [`scripts/${p}`, pr172Hash(readFileSync(`scripts/${p}`, 'utf8').replaceAll('\r\n', '\n'))])),
  historicalEvidenceHashes: Object.fromEntries(historical.map((p) => [p, pr172Hash(readFileSync(p).toString('base64'))])),
  historicalHashEncoding: 'SHA256 of base64 of exact bytes; retained as a preservation check, not a raw-byte digest',
  comparability: {
    exactInputs: 'Original 16 and previously examined eight rerun using unchanged PR171/PR174 factories and final merged production source.',
    frozenK: 'Historical outputs remain measurements of K. Only paired fixtures with matching full input hashes can be compared; changed trajectories are new measurements.',
    newCohort: 'Fresh seeds and predeclared configurations; six development and six sealed validation. Shared youth club population is an explicit dependence limitation.',
  },
}, null, 2) + '\n');
console.log(JSON.stringify({ mergedHash: hashAt(merged), workingHash: pr172SourceHash(), frozenKHash: hashAt(frozenK), historical: historical.length }));
