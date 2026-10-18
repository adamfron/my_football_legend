import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createPr175Fixture } from './pr175Fixtures';
import { pr172Hash, pr172Manifest } from './pr172Evidence';
import { startSecondHalf, stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions';
import type { RankedAiAction } from '../src/core/matchSimulation/matchActions';
import { evaluateShootingOpportunity } from '../src/core/matchSimulation/shootingOpportunity';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { attacksRight } from '../src/core/matchSimulation/matchSpace';
import { z } from 'zod';

const id = z.enum(['dev-youth', 'dev-strength']).parse(process.argv.find((a)=>a.startsWith('--id='))?.slice(5)??'dev-youth');
const fixture = createPr175Fixture(id);
const output = id==='dev-youth'?'../pr175-natural':`../pr175-natural-${id}`; mkdirSync(output, { recursive: true });
const hooks = globalThis as unknown as Record<symbol, ((...a: never[]) => void) | undefined>;
const counts: Record<string, number> = {}, captures: { category: string; actorId: string; state: TacticalMatchState; ranking: RankedAiAction[] }[] = [];
hooks[Symbol.for('mfl.pr172.decision')] = ((s: TacticalMatchState, actorId: string, ranking: RankedAiAction[]) => {
  if (s.ball.ownerId !== actorId || s.restart) return;
  const actor = s.players.find((p) => p.id === actorId)!;
  const opportunity = evaluateShootingOpportunity(s, actor), depth = attacksRight(actor) ? actor.position.x : 105 - actor.position.x;
  const credible = ['credible', 'high_value'].includes(opportunity.category);
  const category = credible && !ranking.some((r)=>r.action.type==='shot') ? 'credible_no_candidate' : credible ? 'credible' :
    depth >= 70 ? 'final_third' : ranking[0]?.action.type === 'pass' && 'target' in ranking[0].action &&
    (ranking[0].action.target.x - actor.position.x) * (attacksRight(actor) ? 1 : -1) < -2 ? 'backward' : null;
  if (!category || (counts[category] ?? 0) >= 3) return;
  counts[category] = (counts[category] ?? 0) + 1;
  captures.push({ category, actorId, state: structuredClone(s), ranking: structuredClone(ranking) });
}) as never;
let state = structuredClone(fixture.state), tick = 0;
while (state.status !== 'full_time' && state.time < 7200) {
  if (state.status === 'half_time') state = startSecondHalf(state);
  state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
  if (++tick % 24000 === 0) console.log(`natural capture ${state.time.toFixed(1)}`);
}
hooks[Symbol.for('mfl.pr172.decision')] = undefined;
const reference = JSON.parse(readFileSync(`../pr175-development/${id}-cohort.json`, 'utf8'));
if (reference.finalHash !== pr172Hash(state)) throw new Error('Natural capture changed complete canonical state');
const rows = [];
for (const [index, c] of captures.entries()) {
  const actor = c.state.players.find((p) => p.id === c.actorId)!;
  const progressive = c.ranking.find((r) => (r.action.type === 'pass' || r.action.type === 'space_pass') &&
    (r.action.target.x - actor.position.x) * (attacksRight(actor) ? 1 : -1) > 5);
  const shot = c.ranking.find((r) => r.action.type === 'shot');
  const candidates = [{ kind: 'selected', candidate: c.ranking[0] }, { kind: 'best_progressive', candidate: progressive }, { kind: 'best_shot', candidate: shot }];
  const outcomes = [];
  for (const variant of candidates) {
    if (!variant.candidate) { outcomes.push({ kind: variant.kind, available: false }); continue; }
    let next = resolveMatchAction(structuredClone(c.state), variant.candidate.action);
    let maxControlledProgress = 0, losses = 0, finalPresence = false, boxPresence = false;
    const shots = new Map<string, unknown>();
    const observe = () => {
      const owner = next.players.find((p) => p.id === next.ball.ownerId);
      if (owner?.team === actor.team) {
        const gain = (owner.position.x - c.state.ball.x) * (attacksRight(actor) ? 1 : -1);
        const depth = attacksRight(actor) ? owner.position.x : 105 - owner.position.x;
        maxControlledProgress = Math.max(maxControlledProgress, gain); finalPresence ||= depth >= 70;
        boxPresence ||= depth >= 88.5 && Math.abs(owner.position.y - 34) <= 20.16;
      }
      for (const shot of [next.ball.shot, next.lastShot]) if (shot && (shot.releasedAt ?? 0) >= c.state.time) shots.set(shot.shotId, structuredClone(shot));
    };
    observe();
    for (let t = 0; t < 320; t++) {
      const before = next;
      next = stepTacticalMatchAfterDecisionProbe(next, 0.025); observe();
      if (next.lastPossessionLoss?.id !== before.lastPossessionLoss?.id && next.lastPossessionLoss?.from === actor.team) losses++;
    }
    outcomes.push({ kind: variant.kind, available: true, action: variant.candidate.action, score: variant.candidate.score,
      maxControlledProgress, losses, finalPresence, boxPresence, shots: [...shots.values()],
      retained: next.players.find((p) => p.id === next.ball.ownerId)?.team === actor.team, finalHash: pr172Hash(next) });
  }
  rows.push({ index, category: c.category, at: c.state.time, actorId: c.actorId, initialHash: pr172Hash(c.state),
    opportunity: evaluateShootingOpportunity(c.state, actor), ranking: c.ranking, outcomes });
}
writeFileSync(`${output}/frozen-states.json.gz`, gzipSync(JSON.stringify(captures)));
const schema = z.object({ version: z.literal(1), manifest: z.unknown(), method: z.string(), completeCaptureReplayEqual: z.literal(true), rows: z.array(z.unknown()) });
writeFileSync(`docs/performance/PR175-natural-counterfactuals${id==='dev-youth'?'':`-${id}`}.json`, JSON.stringify(schema.parse({ version: 1, manifest: pr172Manifest(),
  method: `First three owner decisions per category in ${id}; frozen before examining eight-second outcomes. A later dev-strength diagnostic explicitly adds the first credible/no-shot-candidate category after observing its existence in the development ledger. Same full state/RNG; prescribed selected/best generated progressive/best generated shot then ordinary autonomous play. Presence is not a new zone entry. Dependent exploratory counterfactuals, no global policy change.`,
  completeCaptureReplayEqual: true, rows,
}), null, 2) + '\n');
console.log(JSON.stringify({ captures: captures.length, categories: counts }));
