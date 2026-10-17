import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  tacticalMatchStateSchema,
  type TacticalMatchState,
  type MatchAction,
} from '../src/core/matchSimulation/matchState';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { attacksRight, clampPitchPoint, distance } from '../src/core/matchSimulation/matchSpace';
import { evaluatePassDecision } from '../src/core/matchSimulation/passDecision';
import { evaluateShootingOpportunity } from '../src/core/matchSimulation/shootingOpportunity';
import {
  deriveBuildUpSupport,
  deriveDepthRunAssignments,
} from '../src/core/matchSimulation/tacticalPositioning';

const summarySchema = z.object({
  version: z.literal(1),
  method: z.string(),
  rows: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      experiments: z.array(
        z.object({
          factor: z.string(),
          changed: z.string(),
          initialHash: z.string(),
          ranking: z.unknown(),
          continuation: z.unknown(),
        }),
      ),
      opportunity: z.unknown(),
      support: z.unknown(),
      depthRuns: z.unknown(),
    }),
  ),
  wallMs: z.number(),
});
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const start = performance.now(),
  rows: z.infer<typeof summarySchema>['rows'] = [];
const engineRoot = resolve(
  process.argv.find((a) => a.startsWith('--engine-root='))?.slice(14) ?? '.',
);
const { rankAvailableActionsForAI, resolveMatchAction, scoreActionForAI } = (await import(
  pathToFileURL(resolve(engineRoot, 'src/core/matchSimulation/matchActions.ts')).href
)) as typeof import('../src/core/matchSimulation/matchActions');
const { stepTacticalMatchAfterDecisionProbe } = (await import(
  pathToFileURL(resolve(engineRoot, 'src/core/matchSimulation/matchSimulation.ts')).href
)) as typeof import('../src/core/matchSimulation/matchSimulation');
const observedFiles = readdirSync('docs/performance/pr172-decisions').filter((n) =>
  /^(central_possession|wide_direct|youth_native)\.json\.gz$/.test(n),
);
for (const file of observedFiles) {
  const payload = JSON.parse(
    gunzipSync(readFileSync(`docs/performance/pr172-decisions/${file}`)).toString(),
  ) as {
    cases: {
      id: string;
      category: string;
      state: TacticalMatchState;
      ranking: { action: MatchAction; score: number }[];
    }[];
  };
  for (const frozen of payload.cases) {
    const baseline = frozen.state,
      actorId = baseline.ball.ownerId!,
      actor = baseline.players.find((p) => p.id === actorId)!;
    tacticalMatchStateSchema.parse(baseline);
    const ranking = rankAvailableActionsForAI(baseline, actorId);
    if (
      JSON.stringify(ranking.map((r) => ({ action: r.action, score: r.score }))) !==
      JSON.stringify(frozen.ranking.map((r) => ({ action: r.action, score: r.score })))
    )
      throw new Error(`Frozen ranking changed before experiment: ${frozen.id}`);
    const central = ranking.find(
      (r) =>
        r.action.type === 'pass' &&
        baseline.players.some(
          (p) =>
            r.action.type === 'pass' &&
            p.id === r.action.receiverId &&
            p.slot.position === 'central_midfielder',
        ),
    )?.action;
    const forward = ranking.find(
      (r) =>
        r.action.type === 'pass' &&
        (r.action.target.x - actor.position.x) * (attacksRight(actor) ? 1 : -1) > 5,
    )?.action;
    const experiments: z.infer<typeof summarySchema>['rows'][number]['experiments'] = [];
    const run = (
      factor: string,
      changed: string,
      state: TacticalMatchState,
      requested?: MatchAction,
    ) => {
      const initialHash = hash(state),
        ranked = rankAvailableActionsForAI(state, actorId),
        action = requested ?? ranked[0]?.action;
      if (!action) return;
      const cm = state.players.find((p) => central?.type === 'pass' && p.id === central.receiverId);
      const pass =
        action.type === 'pass'
          ? evaluatePassDecision(
              state,
              state.players.find((p) => p.id === actorId)!,
              state.players.find((p) => p.id === action.receiverId)!,
              action.target,
              action.intent,
              action.delivery,
            )
          : null;
      let next = resolveMatchAction(structuredClone(state), action, 'autonomous_npc');
      const release = next.ball.shot?.shotId ?? next.lastPassDiagnostic?.passId ?? null;
      const initialControl =
        state.statistics?.players.reduce((n, p) => n + p.possessionLost, 0) ?? 0;
      let maxOwnedProgress = 0,
        finalEntry = false,
        boxEntry = false;
      for (
        let tick = 0;
        tick < 200 && !['full_time', 'half_time', 'abandoned'].includes(next.status ?? '');
        tick++
      ) {
        next = stepTacticalMatchAfterDecisionProbe(next);
        const owner = next.players.find((p) => p.id === next.ball.ownerId);
        if (owner?.team === actor.team) {
          const depth = attacksRight(owner) ? owner.position.x : 105 - owner.position.x;
          maxOwnedProgress = Math.max(
            maxOwnedProgress,
            (owner.position.x - actor.position.x) * (attacksRight(actor) ? 1 : -1),
          );
          finalEntry ||= depth >= 70;
          boxEntry ||= depth >= 88.5 && Math.abs(owner.position.y - 34) <= 20.16;
        }
      }
      experiments.push({
        factor,
        changed,
        initialHash,
        ranking: {
          selected: action,
          selectedScore: scoreActionForAI(state, actorId, action),
          best: ranked[0],
          centralRank: cm
            ? ranked.findIndex((r) => r.action.type === 'pass' && r.action.receiverId === cm.id) + 1
            : null,
          centralFixedActionScore: central ? scoreActionForAI(state, actorId, central) : null,
          pass,
        },
        continuation: {
          at: next.time,
          release,
          ball: next.ball,
          ownerTeam: next.players.find((p) => p.id === next.ball.ownerId)?.team ?? null,
          maxOwnedProgress,
          finalEntry,
          boxEntry,
          shot:
            next.lastShot?.releasedAt && next.lastShot.releasedAt >= state.time
              ? next.lastShot
              : null,
          score: next.score,
          losses:
            (next.statistics?.players.reduce((n, p) => n + p.possessionLost, 0) ?? 0) -
            initialControl,
        },
      });
    };
    run('baseline', 'none', structuredClone(baseline));
    if (forward)
      run(
        'progressive_action',
        'Only the initial selected generated pass',
        structuredClone(baseline),
        forward,
      );
    if (central?.type === 'pass') {
      run(
        'central_action',
        'Only the initial selected generated pass',
        structuredClone(baseline),
        central,
      );
      for (const quality of [50, 90]) {
        const state = structuredClone(baseline),
          receiver = state.players.find((p) => p.id === central.receiverId)!;
        for (const key of ['firstTouch', 'technique', 'gameReading', 'composure'] as const)
          receiver.profile.attributes[key] = quality;
        run(
          `receiver_quality_${quality}`,
          'Only central receiver technical-quality axis; position, role, opponent and passer unchanged',
          state,
        );
      }
      const moved = structuredClone(baseline),
        receiver = moved.players.find((p) => p.id === central.receiverId)!;
      const foe = moved.players
        .filter((p) => p.team !== actor.team)
        .sort(
          (a, b) =>
            distance(a.position, receiver.position) - distance(b.position, receiver.position),
        )[0]!;
      const dx = receiver.position.x - foe.position.x,
        dy = receiver.position.y - foe.position.y,
        len = Math.max(0.001, Math.hypot(dx, dy));
      receiver.position = clampPitchPoint({
        x: receiver.position.x + (dx / len) * 2,
        y: receiver.position.y + (dy / len) * 2,
      });
      run(
        'receiver_support_endpoint',
        'Only central receiver physical starting position, 2m away from its nearest marker. Hypothetical attainable endpoint; does not prove a movement policy can create it.',
        moved,
      );
      const role = structuredClone(baseline);
      role.players.find((p) => p.id === central.receiverId)!.slot = {
        ...role.players.find((p) => p.id === central.receiverId)!.slot,
        position: 'left_winger',
      };
      run(
        'nominal_role',
        'Only central receiver nominal slot label; fixed-action score tests role bonus independently of candidate regeneration',
        role,
      );
    }
    rows.push({
      id: frozen.id,
      category: frozen.category,
      experiments,
      opportunity: evaluateShootingOpportunity(baseline, actor),
      support: deriveBuildUpSupport(baseline, actor.team),
      depthRuns: deriveDepthRunAssignments(baseline, actor.team),
    });
  }
}
writeFileSync(
  process.argv.find((a) => a.startsWith('--output='))?.slice(9) ??
    'docs/performance/PR172-tactical-experiments.json',
  JSON.stringify(
    summarySchema.parse({
      version: 1,
      method:
        'One controlled change per frozen genuine decision; all other canonical fields fixed. Five-second actual continuations, not a calibrated expected-value estimator. No tactical production-policy change is implied.',
      rows,
      wallMs: performance.now() - start,
    }),
    null,
    2,
  ) + '\n',
);
console.log(
  `Completed ${rows.length} frozen states / ${rows.reduce((n, r) => n + r.experiments.length, 0)} controlled continuations`,
);
