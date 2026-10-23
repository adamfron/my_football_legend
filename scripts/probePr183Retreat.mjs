import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const root = resolve(args.get('source') ?? '.'),
  load = (p) => import(pathToFileURL(resolve(root, p)).href);
const { stepTacticalMatchAfterDecisionProbe } = await load(
  'src/core/matchSimulation/matchSimulation.ts',
);
const { withRankingObserver } = await load('src/core/matchSimulation/decisionObservation.ts');
const { enumerateStateValueActions } = await load('src/core/matchSimulation/decisionPolicy.ts');
const { evaluateStateValueAction, evaluateControlledState } = await load(
  'src/core/matchSimulation/decisionStateValue.ts',
);
const { preparationMarginForAction } = await load('src/core/matchSimulation/onBallPreparation.ts');
const { canReleaseControlledAction } = await load('src/core/matchSimulation/decisionReadiness.ts');
const file = args.get('file') ?? '../pr183-reproduce-before/retreat-17.json.gz';
let state = JSON.parse(gunzipSync(readFileSync(file)));
const start = state.time,
  id = state.ball.ownerId;
const trace = [],
  samples = [];
let last = -1;
const rank = (s, actorId, ranked) => {
  if (actorId !== id) return;
  const actor = s.players.find((p) => p.id === id),
    candidates = enumerateStateValueActions(s, actor);
  trace.push({
    at: s.time,
    position: actor.position,
    ball: s.ball,
    canRelease: canReleaseControlledAction(s, actor),
    preparation: s.onBallPreparation,
    before: evaluateControlledState(s, actor, actor.position),
    ranked: ranked
      .slice(0, 4)
      .map((r) => ({
        action: r.action,
        score: r.score,
        evaluation: evaluateStateValueAction(s, actor, r.action),
      })),
    passes: candidates
      .filter((a) => a.type === 'pass')
      .map((a) => ({
        receiverId: a.receiverId,
        target: a.target,
        feasible: a.deliveryPlan?.feasible,
        margin: preparationMarginForAction(s, actor, a),
        evaluation: evaluateStateValueAction(s, actor, a),
      })),
  });
};
while (state.time < start + Number(args.get('seconds') ?? 25) && state.ball.ownerId === id) {
  state = withRankingObserver(rank, () => stepTacticalMatchAfterDecisionProbe(state, 0.025));
  if (state.time - last >= 0.5) {
    samples.push({
      at: state.time,
      ball: state.ball,
      bodies: state.players.map((p) => ({
        id: p.id,
        position: p.position,
        velocity: p.velocity,
        target: p.target,
      })),
    });
    last = state.time;
  }
}
const result = { file, start, id, end: state.time, finalBall: state.ball, trace, samples };
writeFileSync(args.get('out') ?? '../pr183-probe-retreat.json', JSON.stringify(result, null, 2));
console.log(
  JSON.stringify(
    {
      start,
      end: state.time,
      finalBall: state.ball,
      trace: trace.map((t) => ({
        at: t.at,
        position: t.position,
        release: t.canRelease,
        passes: t.passes.length,
        acceptedPasses: t.passes.filter((p) => p.evaluation).length,
        minMargin: Math.min(...t.passes.map((p) => p.margin)),
        top: t.ranked.map((r) => ({
          type: r.action.type,
          target: r.action.target,
          score: r.score,
        })),
        current: t.before,
      })),
    },
    null,
    2,
  ),
);
