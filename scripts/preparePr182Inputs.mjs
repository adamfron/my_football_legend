import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { digest, pr182SourceHash, pr182HarnessHash } from './pr182Evidence.mjs';
import { deriveCanonicalCoachProfile } from '../src/core/coachProfiles.ts';
import { assignTacticalRoles } from '../src/core/matchSimulation/tacticalRoles.ts';
import { initialiseCoachIntelligence } from '../src/core/matchSimulation/coachIntelligence.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
const validation = process.argv.includes('--validation');
const cohort = validation ? 'validation' : 'development';
if (validation) {
  const frozen = JSON.parse(readFileSync('docs/performance/PR182-freeze.json'));
  if (frozen.sourceHash !== pr182SourceHash() || frozen.harnessHash !== pr182HarnessHash())
    throw Error('Candidate/harness differs from preregistered freeze');
}
const source = validation
  ? 'docs/performance/pr180-evidence/pr182-sealed.json.gz'
  : 'docs/performance/pr181-evidence/development.json.gz';
const bytes = readFileSync(source);
const fixtures = JSON.parse(gunzipSync(bytes)).map((f) => {
  if (digest(f.state) !== f.inputHash || digest(f.session) !== f.sessionHash)
    throw Error('Original archived input/session digest mismatch');
  let state = globalThis.structuredClone(f.state);
  for (const side of ['home', 'away']) {
    state.teams[side].coach = deriveCanonicalCoachProfile(
      f.session[side].club.managerId ?? 'manager',
    );
    delete state.teams[side].coaching;
  }
  state = initialiseCoachIntelligence(state);
  state.rolePlan = assignTacticalRoles(state);
  tacticalMatchStateSchema.parse(state);
  return {
    ...f,
    state,
    inputHash: digest(state),
    originalInputHash: f.inputHash,
    sessionHash: digest(f.session),
  };
});
const manifest = {
  schema: 'mfl-pr182-inputs-v1',
  cohort,
  source,
  archiveHash: digest(bytes),
  transformation:
    'Attach each canonical coach from the archived session manager ID; initialise empty bounded observation and common collective roles. Attributes, bodies, formations, bench, RNG/seed and referee state are preserved. Policy is the sole per-run override.',
  units: fixtures.length,
  rows: fixtures.map(({ state, session, ...f }) => {
    void state;
    void session;
    return f;
  }),
};
const path = `docs/performance/PR182-${cohort}-inputs.json`;
if (existsSync(path)) {
  if (digest(JSON.parse(readFileSync(path))) !== digest(manifest))
    throw Error('Frozen inputs changed');
} else {
  mkdirSync('docs/performance/pr182-evidence', { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(
    `docs/performance/pr182-evidence/${cohort}.json.gz`,
    gzipSync(JSON.stringify(fixtures)),
  );
}
console.log(
  JSON.stringify({
    cohort,
    units: fixtures.length,
    archiveHash: digest(bytes),
    hashes: fixtures.map((f) => ({ id: f.design.id, hash: f.inputHash })),
  }),
);
