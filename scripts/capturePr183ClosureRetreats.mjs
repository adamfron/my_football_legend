import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { digest, pr183SourceHash } from './pr183Evidence.mjs';
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const id = args.get('id'),
  cohort = args.get('cohort') ?? 'validation',
  root = '../pr183-rejected';
const load = (p) => import(pathToFileURL(resolve(root, p)).href);
const { configureMatchPolicy } = await load('src/core/matchSimulation/roleExperiment.ts');
const { stepTacticalMatchAfterDecisionProbe, startSecondHalf } = await load(
  'src/core/matchSimulation/matchSimulation.ts',
);
const { withRankingObserver } = await load('src/core/matchSimulation/decisionObservation.ts');
const { evaluateStateValueAction, evaluateControlledState } = await load(
  'src/core/matchSimulation/decisionStateValue.ts',
);
const { canReleaseControlledAction } = await load('src/core/matchSimulation/decisionReadiness.ts');
const { deriveTacticalRolePhase } = await load('src/core/matchSimulation/roleTactics.ts');
const raw = JSON.parse(
  gunzipSync(readFileSync(`../pr183-${cohort}/${id}-phase-role-hybrid-v1.json.gz`)),
);
const event = raw.realism.retreats.toSorted((a, b) => b.retreatMetres - a.retreatMetres)[0];
const input = JSON.parse(
  gunzipSync(readFileSync(`docs/performance/pr183-evidence/${cohort}.json.gz`)),
).find((f) => f.design.id === id);
if (raw.productionHash !== pr183SourceHash(root) || digest(input.state) !== raw.inputHash)
  throw Error('Input/source mismatch');
let s = configureMatchPolicy(globalThis.structuredClone(input.state), 'phase-role-hybrid-v1'),
  snapshot;
const ranks = [];
const rank = (state, actorId, ranked) => {
  if (actorId !== event.id || state.time < event.at || state.time > event.endAt) return;
  const actor = state.players.find((p) => p.id === actorId),
    dir = actor.team === 'home' ? 1 : -1;
  const selected = [
    ...ranked.slice(0, 3),
    ranked.find(
      (r) => r.action.type === 'pass' && dir * (r.action.target.x - actor.position.x) > 3,
    ),
  ].filter(Boolean);
  ranks.push({
    at: state.time,
    position: actor.position,
    ball: state.ball,
    phase: deriveTacticalRolePhase(state, actor.team),
    releaseReady: canReleaseControlledAction(state, actor),
    before: evaluateControlledState(state, actor, actor.position),
    options: selected.map((r) => ({
      ...r,
      evaluation: evaluateStateValueAction(state, actor, r.action),
    })),
  });
};
while (s.time <= event.endAt + 0.025) {
  if (s.status === 'half_time') s = startSecondHalf(s);
  s = withRankingObserver(rank, () => stepTacticalMatchAfterDecisionProbe(s, 0.025));
  if (!snapshot && s.time >= event.at - 1e-8) snapshot = globalThis.structuredClone(s);
}
if (!snapshot || snapshot.ball.ownerId !== event.id) throw Error('Snapshot drift');
const out = 'docs/performance/pr183-evidence';
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/closure-retreat-${id}.json.gz`, gzipSync(JSON.stringify(snapshot)));
writeFileSync(
  `${out}/closure-trace-${id}.json.gz`,
  gzipSync(
    JSON.stringify({
      schema: 'mfl-pr183-closure-retreat-trace-v1',
      sourceHash: pr183SourceHash(root),
      event,
      inputHash: raw.inputHash,
      snapshotHash: digest(snapshot),
      ranks,
      final: {
        at: s.time,
        ball: s.ball,
        position: s.players.find((p) => p.id === event.id).position,
      },
    }),
  ),
);
console.log(JSON.stringify({ id, event, rankings: ranks.length, snapshotHash: digest(snapshot) }));
