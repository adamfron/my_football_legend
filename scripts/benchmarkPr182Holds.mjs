import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { PRIMARY_DECISION_POLICIES } from '../src/core/matchSimulation/decisionPolicyConfig.ts';
import { rankAvailableActionsForAI } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { canReleaseControlledAction } from '../src/core/matchSimulation/decisionReadiness.ts';
import { forecastWaiting } from '../src/core/matchSimulation/roleTactics.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { pr172SourceHash } from './pr172Evidence.ts';
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const rows = [];
for (const path of [
  'docs/performance/pr179-evidence/pr178-worst-hold-input.json.gz',
  'docs/performance/pr179-evidence/r2-new-hold-state.json.gz',
  'docs/performance/pr182-evidence/r2-new-ww-hold-state.json.gz',
]) {
  const input = JSON.parse(gunzipSync(readFileSync(path)));
  const original = input.state ?? input;
  for (const policy of PRIMARY_DECISION_POLICIES) {
    let state = { ...globalThis.structuredClone(original), decisionPolicy: policy };
    const owner = state.players.find((p) => p.id === state.ball.ownerId);
    const initial = hash(state),
      rank = owner ? rankAvailableActionsForAI(state, owner.id) : [];
    const checkpoints = [],
      actions = {};
    for (let tick = 0; tick < 1200; tick++) {
      const prev = state;
      state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
      if (state.decisionIndex !== prev.decisionIndex)
        actions[state.latestAction?.type ?? 'none'] =
          (actions[state.latestAction?.type ?? 'none'] ?? 0) + 1;
      if ([79, 199, 399, 1199].includes(tick))
        checkpoints.push({
          seconds: (tick + 1) / 40,
          owner: state.ball.ownerId,
          ball: state.ball,
          action: state.latestAction,
          displacement: owner
            ? distance(
                owner.position,
                state.players.find((p) => p.id === owner.id)?.position ?? owner.position,
              )
            : null,
        });
    }
    rows.push({
      path,
      policy,
      initialHash: initial,
      finalHash: hash(state),
      initialTime: original.time,
      releasePossible: owner ? canReleaseControlledAction(original, owner) : false,
      waiting: owner ? forecastWaiting(original, owner).diagnostic : null,
      rank: rank.slice(0, 5),
      actions,
      checkpoints,
      survivedStationary: Boolean(
        owner &&
          state.ball.ownerId === owner.id &&
          distance(
            owner.position,
            state.players.find((p) => p.id === owner.id)?.position ?? owner.position,
          ) < 1,
      ),
    });
    console.log(
      JSON.stringify({ path, policy, actions, survivedStationary: rows.at(-1).survivedStationary }),
    );
  }
}
mkdirSync('docs/performance/pr182-evidence', { recursive: true });
writeFileSync(
  'docs/performance/PR182-hold-regressions.json',
  JSON.stringify(
    {
      sourceHash: pr172SourceHash(),
      scope:
        'Two unchanged historical physical states and the new PR182 development WW hold, five policies, 30-second canonical continuations; dependent development regression, no independent frequency claim.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
