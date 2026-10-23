import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createFootballLabProfile } from './footballLabProfile';
import { createFootballDrillCatalog } from '../src/core/matchSimulation/footballLabCatalog';
import { runFootballSkillTrial } from '../src/core/matchSimulation/footballPerformanceLab';

const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
if (existsSync('src/core/matchSimulation/footContact.ts'))
  throw new Error(
    'Baseline capture requires the pristine merged PR184 checkout; do not overwrite the historical receipt on PR185.',
  );
const historical = readdirSync('docs/performance', { recursive: true })
  .filter((p): p is string => typeof p === 'string' && /pr184/i.test(p))
  .filter((p) => /\.(json|gz)$/.test(p))
  .sort()
  .map((p) => ({
    path: `docs/performance/${p}`,
    sha256: sha(readFileSync(`docs/performance/${p}`)),
  }));
const profile = createFootballLabProfile();
const cases = createFootballDrillCatalog().filter((c) =>
  /slalom-2|505-|receive-18|wall-receive-turn/.test(c.id),
);
const results = cases.map((c) => {
  const r = runFootballSkillTrial(c, profile, `pr185-baseline:${c.id}`);
  return {
    id: c.id,
    input: r.input,
    seed: r.seed,
    resultSha256: sha(JSON.stringify(r)),
    status: r.status,
    failure: r.failure,
    finishSeconds: r.finishSeconds,
    metrics: r.metrics,
    collisionSamples: r.events.filter((e) => /obstacle/.test(e.kind)).slice(0, 5),
    samples: r.samples
      .filter((s) => r.events.some((e) => /obstacle/.test(e.kind) && Math.abs(e.at - s.at) < 0.026))
      .slice(0, 8),
  };
});
writeFileSync(
  'docs/performance/PR185-baseline.json',
  JSON.stringify(
    {
      mergedPr184: '5fb7370a5c5c0440385c223b838108ba3f71763e',
      pr184Head: 'a355df53ac5be9aab8b2a9877a3617bb5b0d538e',
      historical,
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  results.map(({ id, status, failure, finishSeconds }) => ({ id, status, failure, finishSeconds })),
);
