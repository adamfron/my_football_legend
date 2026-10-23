import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import console from 'node:console';
import { digest, pr183SourceHash } from './pr183Evidence.mjs';
const policies = [
  'legacy-pr176',
  'state-value-v1',
  'role-value-v1',
  'role-intent-v1',
  'phase-role-hybrid-v1',
];
const cases = [
  ['away12', '08:29–08:43'],
  ['cm13-earlier', '26:26–26:40'],
  ['cm13', '41:46–42:10'],
  ['cm14', '46:10–46:29'],
  ['closure-retreat-pr183-development-ww-1', 'draft development 38.73m'],
  ['closure-retreat-pr183-validation-ww-1', 'draft confirmation 44.57m'],
  ['closure-retreat-pr183-validation-sw-1', 'draft confirmation 33.21m'],
];
const rows = [],
  traces = [];
for (const [version, root] of [
  ['before', '../pr183-rejected'],
  ['after', '.'],
]) {
  const load = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { stepTacticalMatchAfterDecisionProbe } = await load(
    'src/core/matchSimulation/matchSimulation.ts',
  );
  const { attacksRight } = await load('src/core/matchSimulation/matchSpace.ts');
  const { withRankingObserver } = await load('src/core/matchSimulation/decisionObservation.ts');
  const { deriveTacticalRolePhase } = await load('src/core/matchSimulation/roleTactics.ts');
  const { tacticalRoleFor } = await load('src/core/matchSimulation/tacticalRoles.ts');
  const { canReleaseControlledAction } = await load(
    'src/core/matchSimulation/decisionReadiness.ts',
  );
  for (const [name, originalAnchor] of cases)
    for (const policy of policies) {
      const raw = JSON.parse(
        gunzipSync(
          readFileSync(
            `docs/performance/pr183-evidence/${name.startsWith('closure-') ? name : `native-retreat-${name}`}.json.gz`,
          ),
        ),
      );
      let state = { ...raw, decisionPolicy: policy };
      const start = state.time,
        id = state.ball.ownerId;
      const actor = state.players.find((p) => p.id === id),
        origin = { ...actor.position },
        dir = attacksRight(actor) ? 1 : -1;
      const originBodies = new Map(state.players.map((p) => [p.id, p.position]));
      const ranks = [];
      let maxRetreat = 0,
        speedIntegral = 0,
        bodySeconds = 0,
        targetChanges = 0;
      const rank = (s, actorId, ranked) => {
        if (actorId !== id) return;
        const a = s.players.find((p) => p.id === id);
        ranks.push({
          at: s.time,
          position: a.position,
          role: tacticalRoleFor(s, a).id,
          phase: deriveTacticalRolePhase(s, a.team),
          coachPlan: s.teams[a.team].coaching?.plan,
          releaseReady: canReleaseControlledAction(s, a),
          passingAlternatives: ranked.filter((r) => r.action.type === 'pass').length,
          forwardPassingAlternatives: ranked.filter(
            (r) => r.action.type === 'pass' && dir * (r.action.target.x - a.position.x) > 3,
          ).length,
          top: ranked.slice(0, 4).map((r) => ({
            score: r.score,
            canonicalScore: r.canonicalScore,
            type: r.action.type,
            target: r.action.target,
            receiverId: r.action.receiverId,
          })),
        });
      };
      while (state.time < start + 30 && state.ball.ownerId === id) {
        const previous = state;
        state = withRankingObserver(rank, () => stepTacticalMatchAfterDecisionProbe(state, 0.025));
        const a = state.players.find((p) => p.id === id);
        maxRetreat = Math.max(maxRetreat, dir * (origin.x - a.position.x));
        for (const p of state.players.filter((p) => p.team === actor.team && p.id !== id)) {
          speedIntegral += Math.hypot(p.velocity.x, p.velocity.y) * 0.025;
          bodySeconds += 0.025;
          const old = previous.players.find((q) => q.id === p.id);
          if (old && Math.hypot(p.target.x - old.target.x, p.target.y - old.target.y) > 1)
            targetChanges++;
        }
      }
      const endpoint = state.players.find((p) => p.id === id).position;
      const row = {
        name,
        originalAnchor,
        version,
        policy,
        sourceHash: pr183SourceHash(root),
        inputHash: digest(raw),
        actorId: id,
        nativeTime: start,
        duration: state.time - start,
        origin,
        endpoint,
        maxRetreatMetres: maxRetreat,
        released: state.ball.ownerId !== id,
        releaseAction: state.latestAction?.type,
        rankings: ranks.length,
        rankingsWithPass: ranks.filter((r) => r.passingAlternatives).length,
        rankingsWithForwardPass: ranks.filter((r) => r.forwardPassingAlternatives).length,
        meanTeammateSpeed: speedIntegral / Math.max(0.025, bodySeconds),
        targetChanges,
        teammateDisplacement: state.players
          .filter((p) => p.team === actor.team && p.id !== id)
          .map((p) => ({
            id: p.id,
            from: originBodies.get(p.id),
            to: p.position,
            metres: Math.hypot(
              p.position.x - originBodies.get(p.id).x,
              p.position.y - originBodies.get(p.id).y,
            ),
            velocity: p.velocity,
            target: p.target,
          })),
        lastPassAt: state.lastPassDiagnostic?.releasedAt,
        finalHash: digest(state),
      };
      rows.push(row);
      traces.push({ name, version, policy, ranks });
      console.log(
        JSON.stringify({
          name,
          version,
          policy,
          duration: row.duration,
          retreat: maxRetreat,
          passes: row.rankingsWithPass,
        }),
      );
    }
}
writeFileSync(
  'docs/performance/PR183-closure-retreat-reproductions.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-closure-retreat-continuations-v1',
      limitation:
        'Native frozen same-seed PR182 episodes matched to the four observed player/defect anchors; NOT the inaccessible exact original states. Original browser export matches only 37/2820 sampled positions in the complete closest replay despite equal fixture identity. Policy overrides are controlled counterfactuals on the same body/role state, not original-policy histories.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  'docs/performance/pr183-evidence/closure-r3-decision-traces.json.gz',
  gzipSync(JSON.stringify(traces)),
);
