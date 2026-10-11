import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  tacticalMatchStateSchema,
  type TacticalMatchState,
} from '../src/core/matchSimulation/matchState';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const archive = z
  .object({
    cases: z.array(
      z.object({
        name: z.string(),
        sourceCommit: z.string(),
        stateHash: z.string(),
        state: z.unknown(),
      }),
    ),
  })
  .parse(
    JSON.parse(
      gunzipSync(
        readFileSync(args.get('archive') ?? '../PR162-evidence/PR162-restart-states.json.gz'),
      ).toString('utf8'),
    ),
  );
const root = resolve(args.get('engine-root') ?? '.');
const engine = (await import(
  pathToFileURL(resolve(root, 'src/core/matchSimulation/matchSimulation.ts')).href
)) as typeof import('../src/core/matchSimulation/matchSimulation');
for (const snapshot of archive.cases.filter(
  (entry) => !args.has('case') || args.get('case') === entry.name,
)) {
  const hash = createHash('sha256').update(JSON.stringify(snapshot.state)).digest('hex');
  if (hash !== snapshot.stateHash) throw new Error('Frozen restart snapshot identity differs');
  tacticalMatchStateSchema.parse(snapshot.state);
  let state = structuredClone(snapshot.state) as TacticalMatchState;
  const resumedAt = state.time,
    awardId = state.restart?.awardId;
  if (!awardId) throw new Error('Frozen snapshot has no actual restart award');
  for (let tick = 0; tick < 1200 && state.restart?.awardId === awardId; tick++)
    state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
  console.info(
    JSON.stringify({
      case: snapshot.name,
      sourceCommit: snapshot.sourceCommit,
      stateHash: hash,
      resumedAt,
      endTime: state.time,
      released: state.restart?.awardId !== awardId,
      elapsedSeconds: state.time - resumedAt,
      ball: state.ball,
      remainingRestart: state.restart?.readiness,
    }),
  );
}
