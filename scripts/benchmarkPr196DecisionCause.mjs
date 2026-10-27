import process from 'node:process';
import console from 'node:console';
import { rankAvailableActionsForAI } from '../src/core/matchSimulation/matchActions.ts';
import { projectCarryOpportunity } from '../src/core/matchSimulation/carryOpportunity.ts';
import { evaluateStateValueAction } from '../src/core/matchSimulation/decisionStateValue.ts';
import { read, hash, receipt, sourceForReplay } from './pr196Evidence.mjs';
const output = 'docs/performance/pr196/decision-cause-v1.json';
const sourceArchive = sourceForReplay(output, process.argv.includes('--check'));
const rows = [];
for (const r of read('docs/performance/pr196/counterfactuals-v2.json.gz').rows.filter(
  (r) => r.decisionChanged,
)) {
  const input = read(r.capture.path).state;
  const models = [];
  for (const corrected of [false, true]) {
    const s = { ...input, experimentalCanonicalArrival: corrected };
    const actor = s.players.find((p) => p.id === s.ball.ownerId);
    const rankings = rankAvailableActionsForAI(s, actor.id).map(({ action, score }) => ({
      action,
      score,
    }));
    if (hash(rankings) !== hash(r[corrected ? 'after' : 'before'].rankings))
      throw Error('Choice ranking replay drift');
    models.push({
      corrected,
      inputHash: hash(s),
      choices: [r.before.selected, r.after.selected].map((action) => ({
        action,
        score: rankings.find((x) => hash(x.action) === hash(action))?.score,
        stateValue: evaluateStateValueAction(s, actor, action),
        carry:
          action.type === 'carry'
            ? projectCarryOpportunity(s, actor, action.target, action.movementMode)
            : null,
      })),
    });
  }
  rows.push({ capture: r.capture.path, policy: r.policy, models });
}
receipt(
  output,
  { schema: 'pr196-choice-cause-v1', sourceArchive, rows },
  process.argv.includes('--check'),
);
console.log('PR196 changed-choice cause replay PASS', rows.length);
