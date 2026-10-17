import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { pr172Hash } from './pr172Evidence';
const baseline = process.argv.find((a) => a.startsWith('--baseline-root='))?.slice(16);
if (!baseline) throw new Error('--baseline-root is required');
const engines = await Promise.all(
  [resolve(baseline), resolve('.')].map(async (root, i) => ({
    label: i ? 'PR173' : 'PR172',
    creator: (await import(
      pathToFileURL(resolve(root, 'src/core/playerCreator.ts')).href
    )) as typeof import('../src/core/playerCreator'),
    world: (await import(
      pathToFileURL(resolve(root, 'src/core/worldDatabase.ts')).href
    )) as typeof import('../src/core/worldDatabase'),
    persistence: (await import(
      pathToFileURL(resolve(root, 'src/core/persistence.ts')).href
    )) as typeof import('../src/core/persistence'),
  })),
);
const raw = readFileSync('.generated-public/data/world/pl-2026-v2.json', 'utf8');
const schema = z.object({
  engine: z.string(),
  sample: z.number(),
  worldParseValidationMs: z.number(),
  careerConstructionMs: z.number(),
  saveMs: z.number(),
  loadValidationMs: z.number(),
  saveBytes: z.number(),
  saveHash: z.string(),
});
const rows: z.infer<typeof schema>[] = [];
for (let sample = -1; sample < 7; sample++)
  for (const engine of sample % 2 === 0 ? [...engines].reverse() : engines) {
    let at = performance.now();
    const world = engine.world.worldDatabaseSchema.parse(JSON.parse(raw));
    const worldMs = performance.now() - at;
    const profile = engine.creator.generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Pomiar',
        age: 16,
        nationality: 'PL',
        dominantFoot: 'right',
        position: 'left_winger',
        heightCm: 178,
        weightKg: 70,
        seed: 'pr173-startup',
      },
      'pr173-startup',
      0,
    );
    at = performance.now();
    const career = engine.creator.createCareerState(profile, 'pr173-startup', world);
    const careerMs = performance.now() - at;
    at = performance.now();
    const save = engine.persistence.serializeCareerSave(career);
    const saveMs = performance.now() - at;
    at = performance.now();
    const loaded = engine.persistence.parseCareerSave(save);
    const loadMs = performance.now() - at;
    if (!loaded.ok) throw new Error('Invalid startup save');
    if (sample >= 0)
      rows.push(
        schema.parse({
          engine: engine.label,
          sample,
          worldParseValidationMs: worldMs,
          careerConstructionMs: careerMs,
          saveMs,
          loadValidationMs: loadMs,
          saveBytes: Buffer.byteLength(save),
          saveHash: pr172Hash(save),
        }),
      );
  }
if (new Set(rows.map((r) => r.saveHash)).size !== 1) throw new Error('Career-only payload changed');
const median = (a: number[]) => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)]!;
const medians = engines.map((e) => ({
  engine: e.label,
  ...Object.fromEntries(
    ['worldParseValidationMs', 'careerConstructionMs', 'saveMs', 'loadValidationMs'].map((key) => [
      key,
      median(rows.filter((r) => r.engine === e.label).map((r) => r[key as 'saveMs'])),
    ]),
  ),
}));
writeFileSync(
  'docs/performance/PR173-career-startup.json',
  JSON.stringify(
    {
      version: 1,
      method:
        'Serial local CPU after all cohorts and verification. Same generated world/profile/seed, one discarded warm-up and seven samples per engine, alternating order. Construction/save/load costs; excludes network, cold module import and browser rendering.',
      worldHash: pr172Hash(raw),
      medians,
      rows,
    },
    null,
    2,
  ) + '\n',
);
