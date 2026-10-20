import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { PR175_DESIGNS, createPr175Fixture, pr175DesignSchema } from './pr175Fixtures.ts';
import { tacticalPreferencesSchema } from '../src/core/matchSimulation/tacticalPreferences.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { createMatchFitness } from '../src/core/matchSimulation/matchFitness.ts';

const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const precedingManifestHash = existsSync('docs/performance/PR178-new-fixture-manifest.json')
  ? sha(readFileSync('docs/performance/PR178-new-fixture-manifest.json', 'utf8'))
  : null;
if (
  precedingManifestHash &&
  !process.argv.includes('--revise-unrun') &&
  !process.argv.includes('--check')
)
  throw new Error('Fixtures already sealed');
const rows = [
  [
    'dev-youth',
    true,
    ['academy_0', 'academy_1'],
    ['3-5-2', '4-4-2'],
    ['pressing', 'direct'],
    'native',
  ],
  [
    'dev-strength',
    false,
    ['pro_2', 'pro_58'],
    ['4-3-3', '4-2-3-1'],
    ['possession', 'counter_attacking'],
    'fast-v-slow',
  ],
  [
    'dev-technical',
    false,
    ['pro_12', 'pro_13'],
    ['3-4-2-1', '4-4-2'],
    ['direct', 'possession'],
    'technical-v-physical',
  ],
  [
    'dev-keepers',
    false,
    ['pro_30', 'pro_31'],
    ['4-2-3-1', '3-5-2'],
    ['pressing', 'counter_attacking'],
    'keeper-strong-v-weak',
  ],
  [
    'val-youth-press',
    true,
    ['academy_0', 'academy_1'],
    ['4-4-2', '4-2-3-1'],
    ['pressing', 'possession'],
    'native',
  ],
  [
    'val-youth-direct',
    true,
    ['academy_0', 'academy_1'],
    ['3-4-2-1', '4-3-3'],
    ['direct', 'counter_attacking'],
    'fast-v-slow',
  ],
  [
    'val-equal',
    false,
    ['pro_8', 'pro_9'],
    ['4-2-3-1', '4-4-2'],
    ['balanced', 'balanced'],
    'native',
  ],
  [
    'val-equal-central',
    false,
    ['pro_23', 'pro_24'],
    ['3-5-2', '4-2-3-1'],
    ['balanced', 'possession'],
    'native',
  ],
  [
    'val-strength-low',
    false,
    ['pro_0', 'pro_56'],
    ['4-3-3', '4-4-2'],
    ['possession', 'counter_attacking'],
    'native',
  ],
  [
    'val-strength-direct',
    false,
    ['pro_5', 'pro_52'],
    ['3-4-2-1', '4-2-3-1'],
    ['pressing', 'direct'],
    'native',
  ],
  [
    'val-press-escape',
    false,
    ['pro_10', 'pro_11'],
    ['3-5-2', '4-3-3'],
    ['possession', 'pressing'],
    'technical-v-physical',
  ],
  [
    'val-high-line',
    false,
    ['pro_20', 'pro_21'],
    ['4-4-2', '3-5-2'],
    ['direct', 'pressing'],
    'fast-v-slow',
  ],
  [
    'val-low-block',
    false,
    ['pro_32', 'pro_33'],
    ['4-2-3-1', '3-4-2-1'],
    ['possession', 'counter_attacking'],
    'technical-v-physical',
  ],
  [
    'val-wide',
    false,
    ['pro_38', 'pro_39'],
    ['4-3-3', '4-4-2'],
    ['direct', 'possession'],
    'fast-v-slow',
  ],
  [
    'val-keepers',
    false,
    ['pro_44', 'pro_45'],
    ['3-5-2', '4-2-3-1'],
    ['counter_attacking', 'pressing'],
    'keeper-strong-v-weak',
  ],
  [
    'val-keepers-patient',
    false,
    ['pro_48', 'pro_49'],
    ['4-4-2', '3-4-2-1'],
    ['possession', 'direct'],
    'keeper-strong-v-weak',
  ],
];
const fixtures = rows.map(([suffix, youth, clubs, formations, styles, attributes], index) => {
  const id = `pr178-${suffix}`;
  const design = pr175DesignSchema.parse({
    id,
    split: suffix.startsWith('dev-') ? 'development' : 'validation',
    seed: `pr178-independent-20261019-v1:${id}`,
    youth,
    clubs,
    formations,
    styles,
    attributes,
  });
  PR175_DESIGNS.push(design);
  const f = createPr175Fixture(id);
  // Independent roster capability/condition variation, shared identically by policies.
  for (const [sideIndex, side] of ['home', 'away'].entries()) {
    const team = f.state.teams[side];
    if (suffix.includes('low')) team.tacticalPreferences.blockHeight = sideIndex ? 0.16 : 0.62;
    if (suffix.includes('high-line'))
      team.tacticalPreferences.blockHeight = sideIndex ? 0.88 : 0.45;
    team.tacticalPreferences.possessionPatience = Math.max(
      0.1,
      Math.min(0.95, team.tacticalPreferences.possessionPatience + ((index % 3) - 1) * 0.08),
    );
    tacticalPreferencesSchema.parse(team.tacticalPreferences);
    for (const p of f.state.players.filter((p) => p.team === side)) {
      p.fitness = createMatchFitness(89 + ((index * 3 + p.slotIndex + sideIndex) % 12));
      p.profile.attributes.agility = Math.max(
        20,
        Math.min(95, p.profile.attributes.agility + ((index % 4) - 2) * 3),
      );
    }
  }
  tacticalMatchStateSchema.parse(f.state);
  return { ...f, inputHash: sha(f.state), sessionHash: sha(f.session) };
});
const manifest = {
  version: 1,
  method:
    '16 new initial states: 4 diagnostic development and 12 sealed validation. No orientation mirrors; each is one independent design, not a random league sample. Outcomes unread and zero canonical ticks at generation. Youth shares the finite world population but varies XI/formation/capabilities and seed. Paired policies use identical full initial states. No post-validation tuning is allowed.',
  preStepRevision: precedingManifestHash
    ? {
        previousManifestHash: precedingManifestHash,
        reason:
          'Before any canonical tick/outcome inspection, replace unused player.condition with the canonical fitness reserve.',
      }
    : null,
  factoryHash: sha(readFileSync('scripts/pr175Fixtures.ts', 'utf8').replaceAll('\r\n', '\n')),
  generatorHash: sha(
    readFileSync('scripts/preparePr178Fixtures.mjs', 'utf8').replaceAll('\r\n', '\n'),
  ),
  preregistration: {
    primary: [
      'progression and final-third/box access',
      'opportunity/selection/release funnel',
      'outcome and restart distributions',
      'exposed-recovery progress and recovery',
      'possession quality and role involvement',
    ],
    noEventQuotas: true,
    confidence:
      'paired fixture bootstrap; matches are the independent unit; team rows are dependent',
    promotion:
      'correctness, independently improved coherent football, career/browser, acceptable serial full-match performance; no shot-only decision',
  },
  designs: fixtures.map((f) => ({
    design: f.design,
    inputHash: f.inputHash,
    sessionHash: f.sessionHash,
    players: f.state.players.length,
    formations: [f.state.teams.home.formation, f.state.teams.away.formation],
  })),
};
if (process.argv.includes('--check')) {
  const expected = JSON.parse(
    readFileSync('docs/performance/PR178-new-fixture-manifest.json', 'utf8'),
  );
  for (const fixture of fixtures) {
    const existing = expected.designs.find((entry) => entry.design.id === fixture.design.id);
    if (existing.inputHash !== fixture.inputHash || existing.sessionHash !== fixture.sessionHash)
      throw new Error('Published generator changed inputs');
  }
  console.log(JSON.stringify({ reproducedInputs: fixtures.length, ticks: 0 }));
  process.exit(0);
}
writeFileSync(
  'docs/performance/PR178-new-fixture-manifest.json',
  JSON.stringify(manifest, null, 2) + '\n',
);
writeFileSync(
  'docs/performance/pr178-evidence/initial-states.json.gz',
  gzipSync(JSON.stringify(fixtures)),
);
console.log(JSON.stringify({ fixtures: fixtures.length, validation: 12, ticks: 0 }));
