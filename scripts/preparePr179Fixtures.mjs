import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import {
  PR179_DESIGNS,
  PR180_RESERVED,
  createPr179Fixture,
  pr179Population,
} from './pr179Fixtures.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const dir = 'docs/performance/pr179-evidence';
mkdirSync(dir, { recursive: true });
const frozen = [...PR179_DESIGNS, ...PR180_RESERVED].map((design) => {
  const { state, session } = createPr179Fixture(design);
  tacticalMatchStateSchema.parse(state);
  return { design, state, session, inputHash: sha(state), sessionHash: sha(session) };
});
const manifest = {
  version: 1,
  frozenAt: '2026-10-20',
  strengthDefinition:
    'Native fresh senior population, 0.85 * effective 4-3-3 XI (position/duty fit and eligibility) + 0.15 * available bench. Upper/lower quartiles declared before play. All fixtures start fit; native attributes are unchanged. No result-derived strength labels. Actual formation-specific XI strength remains in every session.',
  population: pr179Population,
  statisticalUnit:
    'Six development fixture designs, each paired across five policies; not thirty independent matches. Twelve new validation designs are unopened.',
  fixtures: frozen.map(({ design, inputHash, sessionHash }) => ({
    design,
    inputHash,
    sessionHash,
  })),
};
const path = 'docs/performance/PR179-fixture-manifest.json';
if (existsSync(path)) {
  if (sha(JSON.parse(readFileSync(path))) !== sha(manifest))
    throw new Error('Sealed inputs differ');
  console.log('sealed inputs reproduced');
} else {
  if (process.argv.includes('--check')) throw new Error('Missing sealed inputs');
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(`${dir}/initial-states.json.gz`, gzipSync(JSON.stringify(frozen)));
  console.log('sealed 6 development + 12 unopened PR180 fixtures');
}
