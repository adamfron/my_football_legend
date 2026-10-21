import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { pr179Population, createPr179Fixture } from './pr179Fixtures.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const n = Math.floor(pr179Population.length / 4),
  strong = pr179Population.slice(0, n),
  weak = pr179Population.slice(-n);
const formations = ['4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '3-4-2-1'];
const styles = ['balanced', 'pressing', 'direct', 'possession', 'counter_attacking'];
const make = (i, reserved) => {
  const tier = ['SS', 'SW', 'WW'][Math.floor(i / (reserved ? 4 : 2))],
    home = (tier === 'WW' ? weak : strong)[(i * 3 + 2) % n],
    away = (tier === 'SS' ? strong : weak)[(i * 3 + 7) % n];
  const id = `${reserved ? 'pr182-sealed' : 'pr180-dev'}-${tier.toLowerCase()}-${(i % (reserved ? 4 : 2)) + 1}`;
  const design = {
    id,
    split: reserved ? 'validation' : 'development',
    seed: `${id}:20261021-v1`,
    tier,
    strength: [home.strength, away.strength],
    youth: false,
    clubs: [home.clubId, away.clubId],
    formations: [formations[i % 5], formations[(i + 2) % 5]],
    styles: [styles[i % 5], styles[(i + 3) % 5]],
    attributes: 'native',
  };
  const { state, session } = createPr179Fixture(design);
  tacticalMatchStateSchema.parse(state);
  return { design, state, session, inputHash: sha(state), sessionHash: sha(session) };
};
const development = Array.from({ length: 6 }, (_, i) => make(i, false)),
  sealed = Array.from({ length: 12 }, (_, i) => make(i, true));
const dir = 'docs/performance/pr180-evidence';
mkdirSync(dir, { recursive: true });
const manualRoot = process.argv
  .find((a) => a.startsWith('--manual-root='))
  ?.slice('--manual-root='.length);
const archived = existsSync('docs/performance/PR180-inputs.json')
  ? JSON.parse(readFileSync('docs/performance/PR180-inputs.json'))
  : undefined;
if (!manualRoot && !archived)
  throw Error(
    'First preparation requires --manual-root=<directory with the five original exports and compact baseline>',
  );
const manual = manualRoot
  ? JSON.parse(readFileSync(`${manualRoot}/PR180_five_policy_manual_baseline.json`))
  : undefined;
const provenance = manual
  ? manual.policies.map((p) => {
      const b = readFileSync(`${manualRoot}/${p.original_file}`),
        hash = createHash('sha256').update(b).digest('hex');
      if (hash !== p.source_sha256 || b.length !== p.source_bytes)
        throw Error('manual provenance mismatch');
      const raw = JSON.parse(b);
      return {
        ...p,
        verifiedOriginal: true,
        exportSchema: raw.metadata.schema,
        coverage: raw.metadata.collectionScope,
        observerErrors:
          raw.runtimeDiagnostics.filter?.((x) =>
            JSON.stringify(x).includes('first-time completions'),
          ) ?? null,
      };
    })
  : archived.manual;
const manifest = {
  schema: 'mfl-pr180-inputs-v1',
  base: '5646bb0e757289e1fa6ffde79ff9f94766139f48',
  unit: 'six new development fixture designs, matched across five policies; not 30 independent matches',
  development: development.map(({ design, inputHash, sessionHash }) => ({
    design,
    inputHash,
    sessionHash,
  })),
  pr182: sealed.map(({ design, inputHash, sessionHash }) => ({ design, inputHash, sessionHash })),
  oldReserved:
    'All twelve PR179 pr180-reserved inputs remain unopened; their bytes and hashes are unchanged. Both sets are reserved for PR182.',
  manual: provenance,
};
const path = 'docs/performance/PR180-inputs.json';
if (existsSync(path)) {
  if (sha(JSON.parse(readFileSync(path))) !== sha(manifest)) throw Error('sealed inputs changed');
  console.log('sealed hashes reproduced');
} else {
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(`${dir}/development.json.gz`, gzipSync(JSON.stringify(development)));
  writeFileSync(`${dir}/pr182-sealed.json.gz`, gzipSync(JSON.stringify(sealed)));
  console.log(
    '6 development inputs and 12 never-stepped PR182 inputs frozen; five manual original hashes verified',
  );
}
