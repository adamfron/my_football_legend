import { writeFileSync } from 'node:fs';
import { shotProbeFixture, centralProbe } from './pr171Probes';
import { createCombinationFixture } from './pr174Fixtures';
import { pr172Manifest, pr172Hash } from './pr172Evidence';
import { rankAvailableActionsForAI, resolveMatchAction } from '../src/core/matchSimulation/matchActions';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation';
import { evaluateShootingOpportunity } from '../src/core/matchSimulation/shootingOpportunity';
import { projectGoalkeeperIntervention } from '../src/core/matchSimulation/goalkeeperIntervention';
import { isShotAction } from '../src/core/matchSimulation/actionAgency';
import { tacticalMatchStateSchema, type MatchAction, type ShotDiagnostic, type TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { z } from 'zod';

const variants = ['base', 'finishing-30', 'finishing-90', 'distance-24', 'distance-30', 'angle-wide', 'pressure-close', 'keeper-38', 'keeper-90', 'keeper-advanced', 'defender-block', 'incoming-slow', 'incoming-fast'] as const;
const rows = [];
for (let i = 0; i < 16; i++) for (const variant of variants) {
  const seed = `pr175-shot-controlled:${i}`;
  const f = shotProbeFixture(variant.startsWith('incoming') ? 'first_time' : 'unmarked_striker', seed);
  const initial = f.state, actor = initial.players.find((p) => p.id === f.actorId)!;
  const keeper = initial.players.find((p) => p.team !== actor.team && p.slot.position === 'goalkeeper')!;
  const defender = initial.players.find((p) => p.team !== actor.team && p.slot.position === 'center_back')!;
  if (variant.startsWith('finishing')) actor.profile.attributes.finishing = Number(variant.split('-')[1]);
  if (variant.startsWith('distance')) actor.position.x = 105 - Number(variant.split('-')[1]);
  if (variant === 'angle-wide') actor.position.y = 21;
  if (variant.startsWith('keeper-') && variant !== 'keeper-advanced') {
    const value = Number(variant.split('-')[1]);
    Object.assign(keeper.profile.attributes, { reflexes: value, handling: value, oneOnOnes: value, agility: value });
  }
  if (variant === 'keeper-advanced') keeper.position.x = 96;
  if (variant === 'pressure-close') defender.position = { x: actor.position.x - 0.5, y: actor.position.y + 1.4 };
  if (variant === 'defender-block') defender.position = { x: actor.position.x + 3, y: actor.position.y + 0.05 };
  initial.ball.x = actor.position.x + 0.3; initial.ball.y = actor.position.y;
  if (variant.startsWith('incoming')) initial.ball.velocity = { x: variant === 'incoming-fast' ? -16 : -4, y: 0, z: 0 };
  const action: MatchAction = { type: 'shot', actorId: actor.id, intent: 'driven',
    contact: variant.startsWith('incoming') ? 'first_time' : 'settled', target: { x: 105, y: 34 }, goalTarget: { horizontal: 0.4, vertical: 0.24 } };
  const opportunity = evaluateShootingOpportunity(initial, actor), ranking = rankAvailableActionsForAI(initial, actor.id);
  let state = resolveMatchAction(initial, action), diagnostic = state.ball.shot;
  const released = diagnostic?.shotId ?? null, projection = projectGoalkeeperIntervention(state);
  const outcomes: { at: number; outcome: string; keeper: string | null }[] = [];
  let boundary: unknown = null;
  for (let tick = 0; tick < 320 && released; tick++) {
    state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    const d = [state.ball.shot, state.lastShot].find((s) => s?.shotId === released);
    if (d) diagnostic = structuredClone(d);
    if (d?.outcome && outcomes.at(-1)?.outcome !== d.outcome) outcomes.push({ at: state.time, outcome: d.outcome, keeper: d.goalkeeperAction ?? null });
    if (state.lastBoundaryCrossing && !boundary) boundary = structuredClone(state.lastBoundaryCrossing);
    if (diagnostic?.outcome && (boundary || state.ball.ownerId)) break;
  }
  rows.push({ variant, seed, initialHash: pr172Hash(initial), chosen: ranking[0] ?? null, opportunity,
    prescribedAction: action, shotId: released, diagnostic: diagnostic ?? null, outcomes,
    goalkeeperProjection: projection ? { reachable: projection.reachable, reaction: projection.reactionDelay,
      timeAvailable: projection.timeAvailable, requiredDisplacement: projection.requiredDisplacement, availableReach: projection.availableReach } : null,
    boundary, finalScore: state.score, finalHash: pr172Hash(state) });
}
const combinations = [];
for (const scenario of ['press', 'third_man', 'overlap', 'underlap'] as const)
  for (const variant of ['open', 'covered', 'timed_run', 'weak', 'recovering'] as const) {
    const f = createCombinationFixture({ scenario, variant, seed: `pr175-team-controlled:${scenario}` });
    let state = resolveMatchAction(f.state, f.action), maxProgress = 0, losses = 0;
    const intentions = new Map<string, unknown>(), passes = new Map<string, unknown>(), shots = new Map<string, ShotDiagnostic>();
    const rankingSamples: unknown[] = [];
    for (let tick = 0; tick < 480; tick++) {
      const before = state;
      state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
      if (state.lastPossessionLoss?.id !== before.lastPossessionLoss?.id && state.lastPossessionLoss?.from === 'home') losses++;
      const owner = state.players.find((p) => p.id === state.ball.ownerId);
      if (owner?.team === 'home') maxProgress = Math.max(maxProgress, owner.position.x - f.state.ball.x);
      for (const c of [state.combinationIntent, state.lastCombination]) if (c) intentions.set(c.id, structuredClone(c));
      for (const p of [state.lastPassDiagnostic, state.lastResolvedPass]) if (p) passes.set(p.passId, structuredClone(p));
      for (const s of [state.ball.shot, state.lastShot]) if (s) shots.set(s.shotId, structuredClone(s));
      if (owner?.team === 'home' && state.decisionIndex !== before.decisionIndex) {
        const ranking = rankAvailableActionsForAI(before, owner.id);
        rankingSamples.push({ at: state.time, actorId: owner.id, chosen: state.latestAction,
          runnerOptions: ranking.filter((r) => r.action.type === 'pass' && r.action.receiverId === f.c), shotOptions: ranking.filter((r) => isShotAction(r.action)), top: ranking.slice(0,3) });
      }
    }
    const normal = tacticalMatchStateSchema.parse(state) as unknown as TacticalMatchState;
    const reloaded = tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(state))) as unknown as TacticalMatchState;
    const reloadEqual = pr172Hash(stepTacticalMatchAfterDecisionProbe(normal)) === pr172Hash(stepTacticalMatchAfterDecisionProbe(reloaded));
    if (!reloadEqual) throw new Error('Controlled reload mismatch');
    combinations.push({ scenario, variant, initialHash: pr172Hash(f.state), finalHash: pr172Hash(state), maxProgress, losses,
      intentions: [...intentions.values()], passes: [...passes.values()], shots: [...shots.values()], rankingSamples, reloadEqual });
  }
const schema = z.object({ version: z.literal(1), manifest: z.unknown(), method: z.string(), rows: z.array(z.unknown()), central: z.array(z.unknown()), combinations: z.array(z.unknown()) });
writeFileSync('docs/performance/PR175-controlled-mechanisms.json', JSON.stringify(schema.parse({ version: 1, manifest: pr172Manifest(),
  method: '13 shot-state variants ×16 common seeds; one factor at a time, not natural frequencies. Prescribed physical shot, then up to 8 s canonical continuation. 20 team continuations up to12s, prescribed opening pass only; independent NPC decisions and defence. Shared-seed variants are dependent. No production coefficient changes.',
  rows, central: (['open', 'pressured', 'wide_competitor', 'gifted', 'ordinary'] as const).map(centralProbe), combinations,
}), null, 2) + '\n');
console.log(JSON.stringify({ shots: rows.length, released: rows.filter((r) => r.shotId).length, combinations: combinations.length }));
