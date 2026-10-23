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
const root = resolve(args.get('source') ?? '.');
const load = (p) => import(pathToFileURL(resolve(root, p)).href);
const { rankStateValueActions, enumerateStateValueActions } = await load(
  'src/core/matchSimulation/decisionPolicy.ts',
);
const { evaluateControlledState, evaluateStateValueAction } = await load(
  'src/core/matchSimulation/decisionStateValue.ts',
);
const { deriveTacticalRolePhase, roleControlledValue } = await load(
  'src/core/matchSimulation/roleTactics.ts',
);
const { canReleaseControlledAction } = await load('src/core/matchSimulation/decisionReadiness.ts');
const dir = args.get('inputs') ?? '../pr183-reproduce-before';
const receipt = JSON.parse(readFileSync(`${dir}/receipt.json`));
const rows = receipt.episodes.map((episode) => {
  const state = JSON.parse(gunzipSync(readFileSync(`${dir}/${episode.stateFile}`)));
  const actor = state.players.find((p) => p.id === state.ball.ownerId);
  const ranked = rankStateValueActions(state, actor);
  const candidates = enumerateStateValueActions(state, actor);
  const action = (a) => ({
    type: a.type,
    target: a.target,
    receiverId: a.receiverId,
    intent: a.intent,
    movementMode: a.movementMode,
  });
  return {
    file: episode.stateFile,
    at: state.time,
    actor: actor.id,
    retreat: episode.retreat,
    position: actor.position,
    phase: deriveTacticalRolePhase(state, actor.team),
    canRelease: canReleaseControlledAction(state, actor),
    before: evaluateControlledState(state, actor, actor.position),
    counts: {
      candidates: candidates.length,
      passes: candidates.filter((a) => a.type === 'pass').length,
      rankedPasses: ranked.filter((r) => r.action.type === 'pass').length,
    },
    ranked: ranked
      .slice(0, 5)
      .map((r) => ({
        action: action(r.action),
        score: r.score,
        evaluation: evaluateStateValueAction(state, actor, r.action),
      })),
    roleTransect: [-8, -3, 0, 3, 8].map((dx) => ({
      dx,
      value: evaluateControlledState(state, actor, {
        x: actor.position.x + dx,
        y: actor.position.y,
      }),
      role: roleControlledValue(state, actor, { x: actor.position.x + dx, y: actor.position.y }, 0),
    })),
  };
});
writeFileSync(args.get('out') ?? '../pr183-retreat-inspection.json', JSON.stringify(rows, null, 2));
console.log(
  JSON.stringify(
    rows.map((r) => ({
      file: r.file,
      at: r.at,
      retreat: r.retreat,
      phase: r.phase,
      canRelease: r.canRelease,
      counts: r.counts,
      top: r.ranked.slice(0, 2).map((a) => ({ action: a.action, score: a.score })),
      transect: r.roleTransect.map((v) => ({
        dx: v.dx,
        value: v.value.value,
        outlets: v.value.outlets,
        space: v.value.space,
      })),
    })),
    null,
    2,
  ),
);
