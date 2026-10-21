import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
const root = process.argv[2];
const load = (p) => import(pathToFileURL(resolve(root, p)).href);
const { pr172SourceHash } = await load('scripts/pr172Evidence.ts');
const baseline = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr180-evidence/manual-before-legacy-pr176.json.gz')),
);
if (pr172SourceHash(root) !== baseline.sourceHash) throw Error('Untouched PR179 source required');
const { createReformFixture } = await load('scripts/pr177Fixtures.ts');
const { awardNaturalRestart } = await load('src/core/matchSimulation/restartScenarios.ts');
const { enumerateRestartActions, resolveMatchAction } = await load(
  'src/core/matchSimulation/matchActions.ts',
);
const { stepTacticalMatchAfterDecisionProbe } = await load(
  'src/core/matchSimulation/matchSimulation.ts',
);
const f = createReformFixture('corner-counter');
let state = f.state;
state.seed = 'pr178-physical-transition:corner:0';
state.decisionPolicy = 'state-value-v1';
delete state.lastPossessionChange;
state.possessionTeam = f.opponents[0].team;
state = awardNaturalRestart(state, 'corner', {
  restartTeam: f.opponents[0].team,
  cause: 'boundary',
  incidentId: state.seed + ':corner',
  incidentPoint: { x: 0, y: 0 },
});
const delivery = enumerateRestartActions(state).find(
  (a) => a.type === 'cross' && a.intent === 'floated',
);
state = resolveMatchAction(state, delivery, 'dev_ai_selected');
while (state.time < 52) {
  const before = state;
  state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
  if (
    state.lastAerialContact?.id !== before.lastAerialContact?.id &&
    state.lastAerialContact?.winnerId === 'geometry:anchor:7'
  ) {
    writeFileSync(
      'docs/performance/pr180-evidence/pr178-corner-pre-header.json.gz',
      gzipSync(
        JSON.stringify({
          baselineCommit: '5646bb0e757289e1fa6ffde79ff9f94766139f48',
          scope:
            'Untouched PR179 original PR178 canonical corner trajectory, immediately before first anchor header. Later trajectories intentionally diverge under shared contact fixes.',
          state: before,
          historicalContact: state.lastAerialContact,
        }),
      ),
    );
    console.log(JSON.stringify({ time: before.time, contact: state.lastAerialContact }));
    process.exit(0);
  }
}
throw Error('Historical header not reproduced');
