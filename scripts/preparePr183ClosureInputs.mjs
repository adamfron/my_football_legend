import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import console from 'node:console';
import { pr179Population, createPr179Fixture, pr179FixtureDesignSchema } from './pr179Fixtures.ts';
import { assignTacticalRoles } from '../src/core/matchSimulation/tacticalRoles.ts';
import { initialiseCoachIntelligence } from '../src/core/matchSimulation/coachIntelligence.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { digest, pr183SourceHash } from './pr183ClosureEvidence.mjs';
const root = 'docs/performance/pr183-evidence';
const old = (name) => JSON.parse(gunzipSync(readFileSync(`${root}/${name}.json.gz`)));
const save = (cohort, fixtures, independent) => {
  const path = `${root}/closure-${cohort}.json.gz`;
  if (existsSync(path)) return;
  for (const f of fixtures) {
    tacticalMatchStateSchema.parse(f.state);
    if (digest(f.state) !== f.inputHash || digest(f.session) !== f.sessionHash)
      throw Error('Invalid input');
  }
  writeFileSync(path, gzipSync(JSON.stringify(fixtures)));
  writeFileSync(
    `docs/performance/PR183-closure-${cohort}-inputs.json`,
    JSON.stringify(
      {
        schema: 'mfl-pr183-closure-inputs-v1',
        cohort,
        independent,
        simulatedTicks: 0,
        sourceHashAtMaterialisation: pr183SourceHash(),
        purpose: independent
          ? 'New untouched paired SS/SW/WW confirmation after closure freeze'
          : 'Consumed inputs reused as development/regression only; no renewed independence',
        rows: fixtures.map(({ state, session, ...row }) => {
          void state;
          void session;
          return row;
        }),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`${cohort}: ${fixtures.length} materialised, zero steps; independent=${independent}`);
};
const development = old('development');
save('development', development, false);
save(
  'regression',
  [
    ...development,
    ...old('validation').map((f) => ({ ...f, design: { ...f.design, split: 'development' } })),
  ],
  false,
);
const n = Math.floor(pr179Population.length / 4),
  strong = pr179Population.slice(0, n),
  weak = pr179Population.slice(-n);
const formations = ['4-4-2', '4-3-3', '4-2-3-1'],
  styles = ['balanced', 'possession', 'counter_attacking'];
const validation = ['SS', 'SW', 'WW'].map((tier, i) => {
  const home = (tier === 'WW' ? weak : strong)[(12 + i * 3) % n],
    away = (tier === 'SS' ? strong : weak)[(17 + i * 3) % n];
  const id = `pr183-closure-validation-${tier.toLowerCase()}-1`;
  const design = pr179FixtureDesignSchema.parse({
    id,
    split: 'validation',
    seed: `20261023-pr183-closure:${id}:v2`,
    tier,
    strength: [home.strength, away.strength],
    youth: false,
    clubs: [home.clubId, away.clubId],
    formations: [formations[i], formations[(i + 1) % 3]],
    styles: [styles[i], styles[(i + 2) % 3]],
    attributes: 'native',
  });
  const fixture = createPr179Fixture(design);
  const state = initialiseCoachIntelligence(fixture.state);
  state.rolePlan = assignTacticalRoles(state);
  return {
    design,
    state,
    session: fixture.session,
    inputHash: digest(state),
    sessionHash: digest(fixture.session),
  };
});
save('validation', validation, true);
