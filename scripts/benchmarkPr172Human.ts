import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { TacticalMatchState, MatchAction } from '../src/core/matchSimulation/matchState';
import { pr172Hash, pr172Manifest } from './pr172Evidence';
const root = process.argv.find((a) => a.startsWith('--baseline-root='))?.slice(16);
if (!root) throw new Error('--baseline-root must identify the unmodified PR171 checkout');
const engines = await Promise.all(
  [resolve(root), resolve('.')].map(async (path) => ({
    actions: (await import(
      pathToFileURL(resolve(path, 'src/core/matchSimulation/matchActions.ts')).href
    )) as typeof import('../src/core/matchSimulation/matchActions'),
    simulation: (await import(
      pathToFileURL(resolve(path, 'src/core/matchSimulation/matchSimulation.ts')).href
    )) as typeof import('../src/core/matchSimulation/matchSimulation'),
    agency: (await import(
      pathToFileURL(resolve(path, 'src/core/matchSimulation/playerDecision.ts')).href
    )) as typeof import('../src/core/matchSimulation/playerDecision'),
  })),
);
type FrozenCases = {
  cases: {
    id: string;
    category: string;
    state: TacticalMatchState;
    ranking: { action: MatchAction }[];
  }[];
};
const payloads = ['central_possession', 'wide_direct'].map(
  (name) =>
    JSON.parse(
      gunzipSync(readFileSync(`docs/performance/pr172-decisions/${name}.json.gz`)).toString(),
    ) as FrozenCases,
);
const cases = payloads
  .flatMap((p) => p.cases)
  .filter((c) => c.ranking[0]?.action.type === 'carry')
  .slice(0, 4);
const rows = cases.map((c) => ({
  id: c.id,
  category: c.category,
  initialHash: pr172Hash(c.state),
  runs: engines.map((engine, index) => {
    const initial = structuredClone(c.state),
      action = c.ranking[0]!.action;
    initial.controlledFootballerId = action.actorId;
    initial.playerAgencyEnabled = true;
    let state = engine.actions.resolveMatchAction(initial, action, 'human_selected');
    let contacts = 0,
      firstPrompt: unknown = null;
    for (let tick = 0; tick < 320; tick++) {
      const agency = engine.agency.projectPlayerAgency(state);
      if (agency.opportunity) {
        firstPrompt = {
          at: state.time,
          elapsed: state.time - initial.time,
          probe: agency.probe,
          ownerId: state.ball.ownerId,
          ball: state.ball,
          position: state.players.find((p) => p.id === action.actorId)?.position,
        };
        break;
      }
      const previous = state;
      state = engine.simulation.stepTacticalMatchAfterDecisionProbe(state);
      if (
        state.lastGroundContact?.executed &&
        state.lastGroundContact.actorId === action.actorId &&
        state.lastGroundContact.at > previous.time
      )
        contacts++;
      if ((state.ball.ownerId && state.ball.ownerId !== action.actorId) || state.restart) break;
    }
    return {
      engine: index ? 'PR172' : 'PR171',
      firstPrompt,
      contacts,
      time: state.time,
      ownerId: state.ball.ownerId,
      carry: state.ballCarrierIntent ?? null,
      loss: state.lastPossessionLoss ?? null,
    };
  }),
}));
const schema = z.object({
  version: z.literal(1),
  manifest: z.unknown(),
  scope: z.string(),
  rows: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      initialHash: z.string(),
      runs: z.array(z.unknown()).length(2),
    }),
  ),
});
writeFileSync(
  'docs/performance/PR172-natural-human-carries.json',
  JSON.stringify(
    schema.parse({
      version: 1,
      manifest: pr172Manifest(),
      scope:
        'Four frozen genuine autonomous carry decisions with the same geometry and selected action; only human ownership is activated for both engines. Stops at the first real human prompt, opponent control or restart. No automatic choice is made at a pending prompt.',
      rows,
    }),
    null,
    2,
  ) + '\n',
);
