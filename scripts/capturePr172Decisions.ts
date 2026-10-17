import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createPr171Fixture, PR171_COHORT } from './pr171Fixtures';
import {
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import type { TacticalMatchState, MatchAction } from '../src/core/matchSimulation/matchState';
import type { RankedAiAction } from '../src/core/matchSimulation/matchActions';
import { attacksRight } from '../src/core/matchSimulation/matchSpace';
import { evaluateShootingOpportunity } from '../src/core/matchSimulation/shootingOpportunity';
import { pr172Manifest } from './pr172Evidence';

const arg = (key: string) => process.argv.find((a) => a.startsWith(`--${key}=`))?.split('=')[1];
const family = z.enum(PR171_COHORT).parse(arg('family') ?? 'central_possession');
const seconds = z.coerce
  .number()
  .positive()
  .max(7200)
  .parse(arg('seconds') ?? 900);
const shotsOnly = process.argv.includes('--shots-only');
const tag = z
  .string()
  .regex(/^[a-z0-9-]*$/)
  .parse(arg('tag') ?? (shotsOnly ? 'shots' : ''));
const manifest = pr172Manifest();
const outputDir = arg('output-dir') ?? 'docs/performance/pr172-decisions';
const hooks = globalThis as unknown as Record<symbol, (...args: never[]) => void>;
const components = new Map<string, unknown>();
type Case = {
  id: string;
  actorId?: string;
  category: string;
  state: TacticalMatchState;
  ranking: (RankedAiAction & { decomposition: unknown })[];
  selected?: MatchAction;
  execution?: unknown;
  continuation?: unknown;
};
const cases: Case[] = [];
const counts: Record<string, number> = {};
let latest: Case | undefined, previousDecision: Case | undefined;
hooks[Symbol.for('mfl.pr172.components')] = ((action: MatchAction, value: unknown) => {
  if (components.size > 256) components.clear();
  components.set(JSON.stringify(action), value);
}) as never;
hooks[Symbol.for('mfl.pr172.decision')] = ((
  state: TacticalMatchState,
  actorId: string,
  ranking: RankedAiAction[],
) => {
  if (state.restart || state.ball.ownerId !== actorId) return;
  const actor = state.players.find((p) => p.id === actorId)!;
  const depth = attacksRight(actor) ? actor.position.x : 105 - actor.position.x;
  const opportunity =
    shotsOnly && depth > 75 ? evaluateShootingOpportunity(state, actor) : undefined;
  if (
    shotsOnly &&
    !['credible', 'high_value'].includes(opportunity?.category ?? '') &&
    ranking[0]?.action.type !== 'shot'
  )
    return;
  const category = shotsOnly
    ? ranking[0]?.action.type === 'shot'
      ? 'selected_shot'
      : 'credible_shot_declined'
    : state.teams[actor.team].phase === 'attacking_transition' &&
        state.timeSincePossessionChanged < 2
      ? 'counterattack'
      : depth >= 70
        ? 'final_third'
        : Math.abs(actor.position.y - 34) > 20
          ? 'wide_progression'
          : depth < 35
            ? 'own_defensive_third'
            : depth < 55
              ? 'central_build_up'
              : 'attacking_midfield';
  latest = {
    id: `${family}:${state.time}:${actorId}`,
    category,
    state: structuredClone(state),
    ranking: ranking.map((r) => ({
      ...r,
      decomposition: structuredClone(components.get(JSON.stringify(r.action)) ?? null),
    })),
  };
  if ((counts[category] ?? 0) < 2) {
    counts[category] = (counts[category] ?? 0) + 1;
    cases.push(latest);
  }
  components.clear();
}) as never;
hooks[Symbol.for('mfl.pr172.incoming')] = ((
  state: TacticalMatchState,
  actorId: string,
  ranking: RankedAiAction[],
  selected?: MatchAction,
) => {
  if (
    !shotsOnly ||
    !selected ||
    !(
      selected.type === 'shot' ||
      (selected.type === 'header' && selected.intent === 'header_shot')
    ) ||
    (counts.incoming_selected_shot ?? 0) >= 8
  )
    return;
  latest = {
    id: `${family}:${state.time}:${actorId}:incoming`,
    actorId,
    category: 'incoming_selected_shot',
    state: structuredClone(state),
    ranking: ranking.map((r) => ({
      ...r,
      decomposition: structuredClone(components.get(JSON.stringify(r.action)) ?? null),
    })),
    selected,
  };
  cases.push(latest);
  counts.incoming_selected_shot = (counts.incoming_selected_shot ?? 0) + 1;
}) as never;
let { state } = createPr171Fixture(family, false);
const initialHash = createHash('sha256').update(JSON.stringify(state)).digest('hex');
for (
  let tick = 0;
  state.time < seconds && !['full_time', 'abandoned'].includes(state.status ?? '');
  tick++
) {
  if (state.status === 'half_time') state = startSecondHalf(state);
  const before = state;
  state = stepTacticalMatchAfterDecisionProbe(state);
  if (latest) {
    latest.execution = {
      at: state.time,
      decisionIndex: state.decisionIndex,
      action: state.latestAction,
      ball: state.ball,
      ownerId: state.ball.ownerId,
      preparation: state.onBallPreparation,
    };
    previousDecision = latest;
    latest = undefined;
  }
  for (const entry of cases)
    if (!entry.continuation && state.time >= entry.state.time + 5)
      entry.continuation = {
        at: state.time,
        ball: state.ball,
        score: state.score,
        ownerId: state.ball.ownerId,
        loss: state.lastPossessionLoss,
        lastShot: state.lastShot,
        action: state.latestAction,
      };
  if (
    state.lastPossessionLoss?.at === state.time &&
    previousDecision &&
    state.time - previousDecision.state.time <= 5 &&
    (counts.pre_turnover ?? 0) < 2 &&
    before.possessionTeam !== state.possessionTeam
  ) {
    const entry = structuredClone(previousDecision);
    entry.id += ':turnover';
    entry.category = 'pre_turnover';
    entry.continuation = { at: state.time, ball: state.ball, loss: state.lastPossessionLoss };
    cases.push(entry);
    counts.pre_turnover = (counts.pre_turnover ?? 0) + 1;
  }
  if (tick % 24000 === 0) console.log(`${family} ${state.time.toFixed(1)}s cases=${cases.length}`);
}
mkdirSync(outputDir, { recursive: true });
writeFileSync(
  `${outputDir}/${family}${tag ? `-${tag}` : ''}.json.gz`,
  gzipSync(
    JSON.stringify({
      version: 1,
      manifest,
      source:
        'Exact chooseNpcAction/chooseIncomingShotAction state/ranking at natural production decision, observed through an opt-in Node loader; no artificial geometry',
      initialHash,
      finalStateHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
      seconds: state.time,
      cases,
    }),
    { level: 9 },
  ),
);
console.log(JSON.stringify({ family, counts, cases: cases.length }));
