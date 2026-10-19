import { writeFileSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { z } from 'zod';
import { PR175_DESIGNS, createPr175Fixture, pr175DesignSchema } from './pr175Fixtures.ts';

// Register NEW designs in this research process only; reuse the unchanged canonical
// fixture construction. No stepping, scoring, outcome inspection or production edits.
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const originals = [...PR175_DESIGNS];
const fixtures = [];
for (const [index, original] of originals.entries()) {
  const id = `pr177-${original.id}`;
  const design = pr175DesignSchema.parse({
    ...original,
    id,
    seed: `pr177-unseen-20261018-v1:${id}`,
  });
  if (originals.some((old) => old.seed === design.seed)) throw new Error('Reused seed');
  PR175_DESIGNS.push(design);
  const fixture = createPr175Fixture(id);
  fixtures.push({
    ...fixture,
    index,
    inputHash: sha(fixture.state),
    sessionHash: sha(fixture.session),
  });
}
const manifest = z
  .object({
    version: z.literal(1),
    method: z.string(),
    fixtureFactorySha256: z.string(),
    designs: z.array(
      z.object({
        design: pr175DesignSchema,
        inputHash: z.string(),
        sessionHash: z.string(),
        players: z.number(),
        formations: z.array(z.string()),
      }),
    ),
  })
  .parse({
    version: 1,
    method:
      'Twelve new seed-specific full initial states; six development and six validation, no mirrors. Same predeclared stress strata as PR175 to reduce distribution drift; they are not a random league population. Generated without advancing a tick or reading a match outcome. Recheck hashes and freeze candidate before PR177 validation; if tuning after validation, retire this holdout.',
    fixtureFactorySha256: sha(readFileSync('scripts/pr175Fixtures.ts', 'utf8')),
    designs: fixtures.map((f) => ({
      design: f.design,
      inputHash: f.inputHash,
      sessionHash: f.sessionHash,
      players: f.state.players.length,
      formations: [f.state.teams.home.formation, f.state.teams.away.formation],
    })),
  });
writeFileSync(
  'docs/performance/PR176-pr177-new-fixtures.json',
  JSON.stringify(manifest, null, 2) + '\n',
);
writeFileSync(
  'docs/performance/PR176-pr177-initial-states.json.gz',
  gzipSync(JSON.stringify(fixtures)),
);
console.log(
  JSON.stringify({
    newFixtures: fixtures.length,
    validation: fixtures.filter((f) => f.design.split === 'validation').length,
    canonicalTicksExecuted: 0,
  }),
);
