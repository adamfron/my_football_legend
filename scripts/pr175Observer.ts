import { z } from 'zod';
import type { MatchAction, TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { shotDiagnosticSchema } from '../src/core/matchSimulation/matchState';
import type { RankedAiAction } from '../src/core/matchSimulation/matchActions';
import { evaluateShootingOpportunity, shootingOpportunitySchema } from '../src/core/matchSimulation/shootingOpportunity';
import { canExecuteCanonicalShot } from '../src/core/matchSimulation/shootingOptions';
import { attacksRight, distance } from '../src/core/matchSimulation/matchSpace';
import { isRestartSetup } from '../src/core/matchSimulation/restartPhase';

const side = z.enum(['home', 'away']);
const point = z.object({ x: z.number(), y: z.number() });
const counts = z.record(z.string(), z.number().finite());
const nullableId = z.string().nullable();
const actionSchema = z.object({ type: z.string(), actorId: z.string() }).passthrough();
const choiceSchema = z.object({
  id: z.string(), at: z.number(), decisionIndex: z.number(), actorId: z.string(), team: side,
  episodeId: nullableId, incoming: z.boolean(), controlled: z.boolean(), depth: z.number(),
  opportunity: shootingOpportunitySchema, count: z.number(), shotCandidates: z.number(),
  executableShots: z.number(), shotRank: z.number().nullable(), shotScore: z.number().nullable(),
  progressiveCandidates: z.number(), boxCandidates: z.number(), viablePasses: z.number(),
  selected: actionSchema.nullable(), selectedScore: z.number().nullable(),
  top: z.array(z.object({ action: actionSchema, score: z.number() })).max(4),
  gainedAt: z.number().nullable(), readyAt: z.number().nullable(),
  winnerTerms: z.unknown(), progressiveTerms: z.unknown(),
});
const episodeSchema = z.object({
  id: z.string(), team: side, start: z.number(), end: z.number(), startDepth: z.number(),
  maxDepth: z.number(), lastDepth: z.number(), exit: z.string(), stages: z.array(z.string()),
  passes: z.number(), reciprocal: z.number(), decisions: z.number(), credibleChoices: z.number(),
  shots: z.number(), combinationIds: z.array(z.string()),
});
const passSchema = z.object({
  id: z.string(), episodeId: nullableId, choiceId: nullableId, team: side, actorId: z.string(),
  receiverId: z.string(), releasedAt: z.number(), resolvedAt: z.number().nullable(),
  result: z.string().nullable(), contact: z.string().nullable(), actualReceiverId: nullableId,
  metres: z.number(), intendedProgress: z.number(), controlledProgress: z.number().nullable(),
  origin: point, target: point, receiverOrigin: point, receiverMovement: z.number().nullable(),
  controlAt: z.number().nullable(), readyAt: z.number().nullable(), decisionAt: z.number().nullable(),
  executionType: z.string().nullable(), nextReleaseAfterReception: z.number().nullable(),
  nextPassId: nullableId, flightSeconds: z.number().nullable(), reciprocal: z.boolean(),
});
const shotSchema = z.object({
  diagnostic: shotDiagnosticSchema, episodeId: nullableId, choiceId: nullableId,
  releasedAt: z.number(), resolvedAt: z.number().nullable(), team: side,
  sourceRestartId: nullableId, sourceRestart: z.string().nullable(), previousPassId: nullableId,
  combinationIds: z.array(z.string()), opportunity: shootingOpportunitySchema,
  shooterAttributes: counts, ball: z.unknown(), keeper: z.unknown(), lastTouch: nullableId,
});
const goalSchema = z.object({
  id: z.string(), at: z.number(), team: side, shotId: nullableId, shotOutcome: z.string().nullable(),
  source: z.string(), lastTouchPlayerId: nullableId, lastTouchTeam: side.nullable(),
  ballSource: z.string().nullable(), boundary: z.unknown(), restartRestriction: z.unknown(),
});
export const pr175ObservationSchema = z.object({
  version: z.literal(1), counts, choices: z.array(choiceSchema).max(50000),
  episodes: z.array(episodeSchema).max(20000), passes: z.array(passSchema).max(20000),
  shots: z.array(shotSchema).max(2000), goals: z.array(goalSchema).max(2000),
  combinations: z.array(z.object({ id: z.string(), episodeId: nullableId, kind: z.string(),
    at: z.number(), outcome: z.string(), retainedProgress: z.number(), subsequentChoiceIds: z.array(z.string()),
    subsequentShotIds: z.array(z.string()), participantIds: z.array(z.string()) })).max(10000),
  restarts: z.array(z.object({ id: z.string(), at: z.number(), scenario: z.string(), team: side,
    releaseAt: z.number().nullable(), lastTouch: nullableId, boundary: z.unknown() })).max(5000),
  memory: z.array(z.object({ at: z.number(), team: side, value: z.unknown() })).max(4000),
});
type Observation = z.infer<typeof pr175ObservationSchema>;
const shotAction = (a?: MatchAction) => a?.type === 'shot' || (a?.type === 'header' && a.intent === 'header_shot');
const stopped = (s: TacticalMatchState) => isRestartSetup(s) || !!s.postGoal || ['half_time', 'full_time', 'abandoned'].includes(s.status ?? '');

/** Offline research only. Actual ranker hooks reuse PR172; no production imports, RNG,
 * lookahead, frame history or mutations. Hard bounds fail loudly rather than truncate totals. */
export class Pr175Observer {
  readonly data: Observation = { version: 1, counts: {}, choices: [], episodes: [], passes: [], shots: [], goals: [], combinations: [], restarts: [], memory: [] };
  private active: Observation['episodes'][number] | undefined;
  private seen = new Set<string>();
  private passes = new Map<string, Observation['passes'][number]>();
  private shots = new Map<string, Observation['shots'][number]>();
  private lastChoice = new Map<string, Observation['choices'][number]>();
  private controls = new Map<string, { at: number; ready: number | null }>();
  private receptions = new Map<string, Observation['passes'][number]>();
  private previousPass: Observation['passes'][number] | undefined;
  private components = new Map<string, unknown>();
  private through = -1;
  private sequence = -1;
  private nextMemory = 0;
  private bump(k: string, n = 1) { this.data.counts[k] = (this.data.counts[k] ?? 0) + n; }
  private once(k: string) { if (this.seen.has(k)) return false; this.seen.add(k); return true; }
  private stage(k: string) {
    if (this.active && !this.active.stages.includes(k)) { this.active.stages.push(k); this.bump(`episode:${k}`); }
  }
  private close(s: TacticalMatchState, reason: string) {
    if (!this.active) return;
    this.active.end = s.time; this.active.exit = reason;
    this.data.episodes.push(this.active); this.active = undefined; this.previousPass = undefined;
  }
  private acquire(s: TacticalMatchState) {
    const owner = s.players.find((p) => p.id === s.ball.ownerId);
    if (!owner || stopped(s)) return;
    if (this.active?.team !== owner.team) this.close(s, s.lastPossessionChange?.cause ?? 'opponent_control');
    const depth = attacksRight(owner) ? s.ball.x : 105 - s.ball.x;
    if (!this.active) {
      this.active = { id: `${s.seed}:pr175:possession:${this.data.episodes.length}:${s.time}`, team: owner.team,
        start: s.time, end: s.time, startDepth: depth, maxDepth: depth, lastDepth: depth, exit: 'active',
        stages: ['controlled'], passes: 0, reciprocal: 0, decisions: 0, credibleChoices: 0, shots: 0, combinationIds: [] };
      this.bump('episode:controlled');
    }
    this.active.maxDepth = Math.max(this.active.maxDepth, depth); this.active.lastDepth = depth;
    if (depth - this.active.startDepth >= 5) this.stage('physical_progression');
    if (depth >= 70) this.stage('final_third_control');
    if (depth >= 88.5 && Math.abs(s.ball.y - 34) <= 20.16) this.stage('penalty_area_control');
    if (!this.controls.has(owner.id)) this.controls.set(owner.id, { at: s.ballOwnershipStartedAt ?? s.time, ready: s.onBallPreparation?.readyAt ?? null });
  }
  readonly component = (action: MatchAction, terms: unknown) => {
    if (this.components.size > 256) this.components.clear();
    this.components.set(JSON.stringify(action), structuredClone(terms));
  };
  decision = (s: TacticalMatchState, actorId: string, ranking: RankedAiAction[], selected: MatchAction | undefined, incoming = false) => {
    this.acquire(s);
    const actor = s.players.find((p) => p.id === actorId);
    if (!actor) return;
    const controlled = s.ball.ownerId === actorId && !stopped(s);
    const opportunity = evaluateShootingOpportunity(s, actor);
    const shots = ranking.filter((r) => shotAction(r.action));
    const progressive = ranking.filter((r) => (r.action.type === 'pass' || r.action.type === 'space_pass' || r.action.type === 'carry') &&
      (r.action.target.x - actor.position.x) * (attacksRight(actor) ? 1 : -1) > 5);
    const viable = ranking.filter((r) => r.action.type === 'pass' && r.score > 0);
    const p = this.active?.team === actor.team ? this.active : undefined;
    const entry: Observation['choices'][number] = {
      id: `${s.seed}:choice:${s.decisionIndex}:${s.time}:${this.data.choices.length}`, at: s.time,
      decisionIndex: s.decisionIndex, actorId, team: actor.team, episodeId: p?.id ?? null, incoming, controlled,
      depth: attacksRight(actor) ? actor.position.x : 105 - actor.position.x, opportunity,
      count: ranking.length, shotCandidates: shots.length,
      executableShots: shots.filter((r) => (r.action.type === 'shot' || r.action.type === 'header') && canExecuteCanonicalShot(s, r.action)).length,
      shotRank: shots.length ? ranking.indexOf(shots[0]!) + 1 : null, shotScore: shots[0]?.score ?? null,
      progressiveCandidates: progressive.length,
      boxCandidates: progressive.filter((r) => 'target' in r.action &&
        (attacksRight(actor) ? r.action.target.x : 105 - r.action.target.x) >= 88.5 && Math.abs(r.action.target.y - 34) <= 20.16).length,
      viablePasses: viable.length, selected: selected ? structuredClone(selected) : null,
      selectedScore: ranking.find((r) => r.action === selected)?.score ?? null,
      top: ranking.slice(0, 4).map((r) => ({ action: structuredClone(r.action), score: r.score })),
      gainedAt: this.controls.get(actorId)?.at ?? s.onBallPreparation?.gainedAt ?? null,
      readyAt: s.onBallPreparation?.readyAt ?? null,
      winnerTerms: selected ? this.components.get(JSON.stringify(selected)) ?? null : null,
      progressiveTerms: progressive[0] ? this.components.get(JSON.stringify(progressive[0].action)) ?? null : null,
    };
    this.data.choices.push(entry); this.lastChoice.set(actorId, entry); this.components.clear();
    this.bump(incoming ? 'incoming_rankings' : 'owner_rankings');
    if (controlled && p) {
      p.decisions++;
      if (viable.length) this.stage('generated_support');
      if (progressive.length) this.stage('progressive_candidate');
      if (selected && progressive.some((r) => r.action === selected)) this.stage('progressive_selected');
      if (entry.boxCandidates) this.stage('box_entry_candidate');
      if (['credible', 'high_value'].includes(opportunity.category)) { this.stage('credible_opportunity'); p.credibleChoices++; }
      if (shots.length) this.stage('shot_candidate');
      if (entry.executableShots) this.stage('executable_shot_candidate');
      if (shotAction(selected)) this.stage('shot_selected');
    }
    // Strict lineage: only the same uninterrupted possession and a participant's next choice.
    for (const c of this.data.combinations) if (c.outcome === 'completed' && c.episodeId === p?.id &&
      s.time >= c.at && c.participantIds.includes(actorId)) c.subsequentChoiceIds.push(entry.id);
  };
  observe(previous: TacticalMatchState, next: TacticalMatchState) {
    const seq = next.actionEventSequence ?? 0;
    if (next.time < this.through || (next.time === this.through && seq <= this.sequence)) return;
    this.through = next.time; this.sequence = seq;
    const dt = Math.max(0, next.time - previous.time);
    this.bump(stopped(previous) ? 'stoppedSeconds' : 'liveSeconds', dt);
    // Release/outcome attribution precedes goal/restart closure.
    for (const diagnostic of [next.ball.shot, next.lastShot]) {
      if (!diagnostic) continue;
      const actor = [...next.players, ...(next.departedPlayers ?? [])].find((p) => p.id === diagnostic.shooterId);
      if (!actor) continue;
      let shot = this.shots.get(diagnostic.shotId);
      if (!shot) {
        const choice = this.lastChoice.get(actor.id), ep = this.active?.team === actor.team ? this.active : undefined;
        const preceding = this.receptions.get(actor.id);
        const release = diagnostic.releasedAt ?? next.time;
        shot = { diagnostic: structuredClone(diagnostic), episodeId: ep?.id ?? null,
          choiceId: choice && shotAction(choice.selected as MatchAction | undefined) && choice.at <= release ? choice.id : null,
          releasedAt: release, resolvedAt: null, team: actor.team,
          sourceRestartId: previous.restart?.awardId ?? previous.restartTouchRestriction?.awardId ?? null,
          sourceRestart: previous.restartTouchRestriction?.scenario ?? (previous.scenario !== 'open_play' ? previous.scenario : null),
          previousPassId: preceding && preceding.episodeId === ep?.id ? preceding.id : null,
          combinationIds: [], opportunity: evaluateShootingOpportunity(previous, previous.players.find((p) => p.id === actor.id) ?? actor),
          shooterAttributes: { ...actor.profile.attributes }, ball: structuredClone(previous.ball),
          keeper: structuredClone(previous.players.find((p) => p.team !== actor.team && (p.goalkeeperRole || p.slot.position === 'goalkeeper')) ?? null),
          lastTouch: previous.ball.lastTouchPlayerId ?? null };
        this.shots.set(diagnostic.shotId, shot); this.data.shots.push(shot); this.bump('shot_releases');
        if (ep) { ep.shots++; this.stage('physical_shot_release'); }
        for (const c of this.data.combinations) if (c.outcome === 'completed' && c.episodeId === ep?.id &&
          c.participantIds.includes(actor.id) && release >= c.at && preceding &&
          (preceding.actualReceiverId === actor.id || preceding.receiverId === actor.id)) {
          shot.combinationIds.push(c.id); c.subsequentShotIds.push(diagnostic.shotId);
        }
      }
      shot.diagnostic = structuredClone(diagnostic);
      if (diagnostic.outcome && shot.resolvedAt === null) { shot.resolvedAt = next.time; this.bump(`shot_outcome:${diagnostic.outcome}`); }
    }
    for (const team of ['home', 'away'] as const) if (next.score[team] > previous.score[team]) {
      const diagnostic = previous.ball.shot ?? next.ball.shot ??
        (next.lastShot?.outcome === 'goal' && (next.lastShot.shotId !== previous.lastShot?.shotId || previous.lastShot?.outcome !== 'goal') ? next.lastShot : undefined);
      const relevant = diagnostic ? this.shots.get(diagnostic.shotId) : undefined;
      const toucher = [...previous.players, ...(previous.departedPlayers ?? [])].find((p) => p.id === (next.ball.lastTouchPlayerId ?? previous.ball.lastTouchPlayerId));
      const own = relevant ? relevant.team !== team : toucher?.team !== undefined && toucher.team !== team;
      const source = own ? 'own_goal' : relevant?.diagnostic.context === 'penalty' ? 'penalty' :
        relevant?.diagnostic.context === 'free_kick' ? 'direct_free_kick' : relevant?.sourceRestart ? 'set_piece_sequence' : relevant ? 'open_play' : 'other_canonical_boundary';
      this.data.goals.push({ id: next.postGoal?.goalId ?? `${next.seed}:score:${team}:${next.score[team]}`,
        at: next.time, team, shotId: relevant?.diagnostic.shotId ?? null, shotOutcome: relevant?.diagnostic.outcome ?? null,
        source, lastTouchPlayerId: toucher?.id ?? null, lastTouchTeam: toucher?.team ?? null,
        ballSource: previous.ball.sourceAction ?? previous.ball.travelKind ?? null, boundary: next.lastBoundaryCrossing ?? null,
        restartRestriction: previous.restartTouchRestriction ?? null });
    }
    if (stopped(next)) this.close(next, next.lastPossessionLoss?.at === next.time ? next.lastPossessionLoss.cause : next.postGoal ? 'goal' : next.status === 'half_time' || next.status === 'full_time' ? 'period_end' : next.scenario);
    if (next.ball.ownerId && next.ball.ownerId !== previous.ball.ownerId) {
      this.controls.set(next.ball.ownerId, { at: next.time, ready: next.onBallPreparation?.readyAt ?? null });
    }
    this.acquire(next);
    for (const diagnostic of [next.lastPassDiagnostic, next.lastResolvedPass]) {
      if (!diagnostic) continue;
      const actor = [...next.players, ...(next.departedPlayers ?? [])].find((p) => p.id === diagnostic.passerId);
      if (!actor) continue;
      let pass = this.passes.get(diagnostic.passId);
      if (!pass) {
        const origin = diagnostic.releasedAt >= previous.time && next.ball.from ? next.ball.from : previous.ball;
        const target = diagnostic.intendedTarget ?? diagnostic.predictedReceptionPoint;
        const choice = this.lastChoice.get(actor.id), control = this.controls.get(actor.id);
        const ep = this.active?.team === actor.team ? this.active : undefined;
        const reciprocal = this.previousPass?.team === actor.team && this.previousPass.receiverId === actor.id && this.previousPass.actorId === diagnostic.intendedReceiverId;
        pass = { id: diagnostic.passId, episodeId: ep?.id ?? null,
          choiceId: choice?.selected?.type === 'pass' && choice.at <= diagnostic.releasedAt ? choice.id : null,
          team: actor.team, actorId: actor.id, receiverId: diagnostic.intendedReceiverId, releasedAt: diagnostic.releasedAt,
          resolvedAt: null, result: null, contact: null, actualReceiverId: null, metres: distance(origin, target),
          intendedProgress: (target.x - origin.x) * (attacksRight(actor) ? 1 : -1), controlledProgress: null,
          origin: { x: origin.x, y: origin.y }, target, receiverOrigin: diagnostic.receiverPositionAtRelease, receiverMovement: null,
          controlAt: control?.at ?? null, readyAt: control?.ready ?? null, decisionAt: choice?.at ?? null,
          executionType: diagnostic.executionType ?? null, nextReleaseAfterReception: null, nextPassId: null, flightSeconds: null, reciprocal: !!reciprocal };
        this.passes.set(pass.id, pass); this.data.passes.push(pass); this.previousPass = pass;
        const received = this.receptions.get(actor.id);
        if (received?.resolvedAt !== null && received?.resolvedAt !== undefined && received.episodeId === ep?.id) {
          received.nextReleaseAfterReception = pass.releasedAt - received.resolvedAt; received.nextPassId = pass.id;
        }
        if (ep) { ep.passes++; if (reciprocal) ep.reciprocal++; }
      }
      if (diagnostic.finalResult && pass.result === null) {
        pass.result = diagnostic.finalResult; pass.resolvedAt = diagnostic.resolvedAt ?? next.time;
        pass.flightSeconds = pass.resolvedAt - pass.releasedAt; pass.contact = diagnostic.receptionOutcome ?? null;
        pass.actualReceiverId = diagnostic.actualReceiverId ?? null;
        if (diagnostic.actualContactPoint) {
          pass.controlledProgress = (diagnostic.actualContactPoint.x - pass.origin.x) * (attacksRight(actor) ? 1 : -1);
          pass.receiverMovement = distance(pass.receiverOrigin, diagnostic.actualContactPoint);
        }
        if (diagnostic.finalResult === 'completed') this.receptions.set(diagnostic.actualReceiverId ?? pass.receiverId, pass);
      }
    }
    const c = next.lastCombination;
    if (c && this.once(`combination:${c.id}`)) this.data.combinations.push({ id: c.id, episodeId: this.active?.id ?? null,
      kind: c.kind, at: c.endedAt, outcome: c.result,
      retainedProgress: (() => { const runner = next.players.find((p) => p.id === c.runnerId); return runner ? (runner.position.x - c.origin.x) * (attacksRight(runner) ? 1 : -1) : 0; })(),
      subsequentChoiceIds: [], subsequentShotIds: [], participantIds: [c.initiatorId, c.partnerId, c.runnerId] });
    const restart = next.restart;
    if (restart && this.once(`restart:${restart.awardId ?? restart.startedAt}`))
      this.data.restarts.push({ id: restart.awardId ?? `${next.seed}:restart:${restart.startedAt}`, at: restart.startedAt,
        scenario: next.scenario, team: restart.restartTeam, releaseAt: null, lastTouch: previous.ball.lastTouchPlayerId ?? null,
        boundary: next.lastBoundaryCrossing ?? null });
    const release = previous.restart && (!next.restart || next.restart.executedAt !== previous.restart.executedAt);
    if (release) {
      const r = this.data.restarts.findLast((r) => r.id === (previous.restart?.awardId ?? `${next.seed}:restart:${previous.restart?.startedAt}`));
      if (r && !isRestartSetup(next)) r.releaseAt = next.time;
    }
    if (next.time >= this.nextMemory) {
      this.nextMemory = next.time + 30;
      for (const team of ['home', 'away'] as const) this.data.memory.push({ at: next.time, team, value: structuredClone(next.teams[team].threatMemory ?? null) });
    }
  }
  snapshot(state: TacticalMatchState) {
    this.close(state, state.status ?? 'censored');
    return pr175ObservationSchema.parse(this.data);
  }
}
