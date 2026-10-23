import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import console from 'node:console';
import process from 'node:process';
import { pr179Population, createPr179Fixture, pr179FixtureDesignSchema } from './pr179Fixtures.ts';
import { assignTacticalRoles } from '../src/core/matchSimulation/tacticalRoles.ts';
import { initialiseCoachIntelligence } from '../src/core/matchSimulation/coachIntelligence.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { digest, pr182SourceHash } from './pr182Evidence.mjs';
const dir = 'docs/performance/pr183-evidence';
mkdirSync(dir, { recursive: true });
const n = Math.floor(pr179Population.length / 4);
const strong = pr179Population.slice(0, n),
  weak = pr179Population.slice(-n);
const formations = ['4-4-2', '4-3-3', '3-4-2-1', '4-2-3-1', '3-5-2'];
const styles = ['direct', 'balanced', 'counter_attacking', 'pressing', 'possession'];
for (const cohort of ['development', 'validation']) {
  if (existsSync(`${dir}/${cohort}.json.gz`)) continue;
  const count = cohort === 'development' ? 6 : 3;
  const fixtures = Array.from({ length: count }, (_, i) => {
    const tier = ['SS', 'SW', 'WW'][cohort === 'development' ? Math.floor(i / 2) : i];
    const offset = cohort === 'development' ? 2 : 9;
    const home = (tier === 'WW' ? weak : strong)[(i * 3 + offset) % n];
    const away = (tier === 'SS' ? strong : weak)[(i * 3 + offset + 3) % n];
    const id = `pr183-${cohort}-${tier.toLowerCase()}-${cohort === 'development' ? (i % 2) + 1 : 1}`;
    const design = pr179FixtureDesignSchema.parse({
      id,
      split: cohort,
      seed: `20261022-pr183-fresh:${id}:v1`,
      tier,
      strength: [home.strength, away.strength],
      youth: false,
      clubs: [home.clubId, away.clubId],
      formations: [formations[(i + offset) % 5], formations[(i + offset + 2) % 5]],
      styles: [styles[(i + offset) % 5], styles[(i + offset + 3) % 5]],
      attributes: 'native',
    });
    const f = createPr179Fixture(design);
    let state = initialiseCoachIntelligence(f.state);
    state.rolePlan = assignTacticalRoles(state);
    tacticalMatchStateSchema.parse(state);
    return {
      design,
      state,
      session: f.session,
      inputHash: digest(state),
      sessionHash: digest(f.session),
    };
  });
  writeFileSync(`${dir}/${cohort}.json.gz`, gzipSync(JSON.stringify(fixtures)));
  writeFileSync(
    `docs/performance/PR183-${cohort}-inputs.json`,
    JSON.stringify(
      {
        schema: 'mfl-pr183-inputs-v1',
        sourceHashAtMaterialisation: pr182SourceHash(),
        cohort,
        simulatedTicks: 0,
        unit: 'native SS/SW/WW design, paired across five policies',
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
  console.log(`${cohort}: ${count} new complete inputs materialised; zero steps`);
}
const manualRoot = process.argv
  .find((a) => a.startsWith('--manual-root='))
  ?.slice('--manual-root='.length);
if (manualRoot) {
  const compact = JSON.parse(
    readFileSync(`${manualRoot}/PR183_R3_backward_carry_reproductions.json`),
  );
  const analysis = JSON.parse(readFileSync(`${manualRoot}/PR182_manual_five_policy_analysis.json`));
  const sources = Object.entries(compact.policies).map(([policy, evidence]) => {
    const bytes = readFileSync(`${manualRoot}/${evidence.originalFile}`);
    if (bytes.length !== evidence.sizeBytes || digest(bytes) !== evidence.sha256)
      throw Error(`Original evidence hash mismatch: ${policy}`);
    const raw = JSON.parse(bytes);
    return {
      policy,
      file: evidence.originalFile,
      bytes: bytes.length,
      sha256: digest(bytes),
      metadata: raw.metadata,
      duration: raw.duration,
      observations: analysis.policies[policy].summaries,
      originalRetreats: evidence.episodes,
      firstSubstitutions: analysis.policies[policy].firstHalfIncomingSubstitutions,
    };
  });
  writeFileSync(
    'docs/performance/PR183-owner-evidence.json',
    JSON.stringify(
      {
        schema: 'mfl-pr183-owner-evidence-v1',
        provenance: compact.provenance,
        method: compact.method,
        compactFileHashes: {
          analysis: digest(readFileSync(`${manualRoot}/PR182_manual_five_policy_analysis.json`)),
          retreats: digest(
            readFileSync(`${manualRoot}/PR183_R3_backward_carry_reproductions.json`),
          ),
        },
        sources,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'All five original exports verified by bytes and SHA-256; compact receipts retained.',
  );
}
