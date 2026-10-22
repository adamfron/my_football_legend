import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { pr179Population, createPr179Fixture } from './pr179Fixtures.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
const hash = (s) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
// The archived complete inputs are authoritative after their first freeze. Later
// tactical changes may legitimately change createTacticalMatch's initial targets.
// Verify the frozen states rather than silently regenerating different paired inputs.
if (existsSync('docs/performance/PR181-inputs.json')) {
  const manifest = JSON.parse(readFileSync('docs/performance/PR181-inputs.json'));
  const frozen = JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr181-evidence/development.json.gz')),
  );
  if (frozen.length !== 6) throw Error('Expected six development inputs');
  for (const f of frozen) {
    tacticalMatchStateSchema.parse(f.state);
    const entry = manifest.fixtures.find((m) => m.design.id === f.design.id);
    if (
      f.inputHash !== hash(f.state) ||
      entry?.inputHash !== f.inputHash ||
      f.sessionHash !== hash(f.session) ||
      entry?.sessionHash !== f.sessionHash
    )
      throw Error('Frozen development input mismatch');
  }
  console.log('Six archived development states verified; reserved archives not read.');
  process.exit(0);
}
const n = Math.floor(pr179Population.length / 4),
  strong = pr179Population.slice(0, n),
  weak = pr179Population.slice(-n);
const formations = ['4-4-2', '4-3-3', '3-4-2-1', '4-2-3-1', '3-5-2'];
const styles = ['direct', 'balanced', 'counter_attacking', 'pressing', 'possession'];
const fixtures = Array.from({ length: 6 }, (_, i) => {
  const tier = ['SS', 'SW', 'WW'][Math.floor(i / 2)];
  const home = (tier === 'WW' ? weak : strong)[(i * 5 + 1) % n],
    away = (tier === 'SS' ? strong : weak)[(i * 5 + 6) % n];
  const id = `pr181-dev-${tier.toLowerCase()}-${(i % 2) + 1}`;
  const design = {
    id,
    split: 'development',
    seed: `${id}:20261021-v1`,
    tier,
    strength: [home.strength, away.strength],
    youth: false,
    clubs: [home.clubId, away.clubId],
    formations: [formations[i % 5], formations[(i + 1) % 5]],
    styles: [styles[i % 5], styles[(i + 2) % 5]],
    attributes: 'native',
  };
  const { state, session } = createPr179Fixture(design);
  tacticalMatchStateSchema.parse(state);
  const attributes = state.players.map((p) => ({
    id: p.id,
    team: p.team,
    pace: p.profile.attributes.pace,
    heading: p.profile.attributes.heading,
  }));
  return { design, state, session, inputHash: hash(state), sessionHash: hash(session), attributes };
});
const dir = 'docs/performance/pr181-evidence';
mkdirSync(dir, { recursive: true });
const manifest = {
  schema: 'mfl-pr181-inputs-v1',
  base: '3525039',
  unit: 'six new development designs, five matched policies; no reserved inputs opened',
  fixtures: fixtures.map(({ design, inputHash, sessionHash, attributes }) => ({
    design,
    inputHash,
    sessionHash,
    attributes,
  })),
};
const path = 'docs/performance/PR181-inputs.json';
if (existsSync(path)) {
  if (hash(JSON.parse(readFileSync(path))) !== hash(manifest)) throw Error('frozen inputs changed');
} else {
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(`${dir}/development.json.gz`, gzipSync(JSON.stringify(fixtures)));
}
console.log('Six new development fixtures frozen; reserved fixture archives not read.');
