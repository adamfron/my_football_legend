import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import type { RankedAiAction } from './matchActions';
import { evaluatePassDecision } from './passDecision';
import { attacksRight, distance } from './matchSpace';
import { isRestartSetup } from './restartPhase';

const numbers = z.record(z.string(), z.number().finite());
const sample = z.object({
  at: z.number(),
  actorId: z.string(),
  team: z.enum(['home', 'away']),
  phase: z.string(),
  pressure: z.number(),
  possessionId: z.string().nullable(),
  bestType: z.string().nullable(),
  bestScore: z.number().nullable(),
  shotScore: z.number().nullable(),
  central: z
    .array(
      z.object({
        id: z.string(),
        distance: z.number(),
        generated: z.boolean(),
        rank: z.number().nullable(),
        score: z.number().nullable(),
        forecast: z
          .object({
            expectedCompletion: z.number(),
            receiverEta: z.number(),
            defenderEta: z.number(),
            laneOccupation: z.number(),
            receiverLateBy: z.number(),
          })
          .nullable(),
      }),
    )
    .max(10),
});
export const attackingAuditSchema = z.object({
  version: z.literal(1),
  sampling: z.literal('canonical owner at most once per two seconds; cooldown <= 0'),
  periods: z.record(z.string(), numbers),
  players: z.record(z.string(), numbers),
  samples: z.array(sample).max(64),
  shotResolutions: z
    .array(
      z.object({
        id: z.string(),
        team: z.enum(['home', 'away']),
        at: z.number(),
        distance: z.number(),
        pressure: z.number(),
        baseXg: z.number(),
        outcome: z.string(),
        classification: z.string(),
        goalkeeperAction: z.string().nullable(),
        reboundSource: z.string().nullable(),
      }),
    )
    .max(128),
  closedPossessions: z.number(),
  possessionHistograms: z.record(z.string(), numbers),
  retainedIdentityCount: z.number().int().max(512),
});

const increment = (map: Record<string, number>, key: string, value = 1) => {
  map[key] = (map[key] ?? 0) + value;
};
const shooting = (type: string, intent?: string) =>
  type === 'shot' || (type === 'header' && intent === 'header_shot');

/** Extension of the existing attacking funnel, enabled only by explicit research runners.
 * Ordered transitions are required. Repeated transitions are inert. No canonical writes,
 * full-frame history or shared RNG; all growing traces and identity caches have hard caps. */
export class AttackingFunnelAudit {
  private periods: Record<string, Record<string, number>> = {};
  private players: Record<string, Record<string, number>> = {};
  private samples: z.infer<typeof sample>[] = [];
  private shots: z.infer<typeof attackingAuditSchema>['shotResolutions'] = [];
  private seen = new Set<string>();
  private through = -1;
  private sequence = -1;
  private decision = -1;
  private closed = 0;
  private histograms: Record<string, Record<string, number>> = {};
  private active:
    | { id: string; team: 'home' | 'away'; period: number; start: number; passes: number }
    | undefined;
  private lastPass: { actor: string; target: string; team: string } | undefined;
  private releasedAt = -1;
  private releasedIds = new Set<string>();
  private once(id: string) {
    if (this.seen.has(id)) {
      this.seen.delete(id);
      this.seen.add(id);
      return false;
    }
    this.seen.add(id);
    if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
    return true;
  }
  private bucket(team: string, period: number) {
    return (this.periods[`${team}:${period}`] ??= {});
  }
  private player(id: string) {
    return (this.players[id] ??= {});
  }
  private close(at: number, reason: string) {
    if (!this.active) return;
    const p = this.active;
    const hist = (this.histograms[`${p.team}:${p.period}`] ??= {});
    increment(hist, `passes:${Math.min(64, p.passes)}`);
    increment(hist, `seconds:${Math.min(600, Math.floor(Math.max(0, at - p.start)))}`);
    increment(this.bucket(p.team, p.period), `exit:${reason}`);
    this.closed++;
    this.active = undefined;
    this.lastPass = undefined;
  }
  observe(previous: TacticalMatchState, next: TacticalMatchState) {
    const seq = next.actionEventSequence ?? 0;
    if (
      next.time < this.through ||
      (next.time === this.through && seq <= this.sequence && next.decisionIndex <= this.decision)
    )
      return;
    this.through = next.time;
    this.sequence = seq;
    this.decision = next.decisionIndex;
    const period = next.endsSwitched ? 2 : 1;
    const dt = Math.max(0, next.time - previous.time);
    const stopped =
      isRestartSetup(previous) ||
      Boolean(previous.postGoal) ||
      ['half_time', 'full_time', 'abandoned'].includes(previous.status ?? '');
    for (const team of ['home', 'away'] as const) {
      increment(
        this.bucket(team, previous.endsSwitched ? 2 : 1),
        stopped ? 'stoppedSeconds' : 'liveSeconds',
        dt,
      );
    }
    const ended =
      isRestartSetup(next) ||
      Boolean(next.postGoal) ||
      ['half_time', 'full_time', 'abandoned'].includes(next.status ?? '');
    if (ended)
      this.close(
        next.time,
        next.lastPossessionLoss?.at === next.time
          ? next.lastPossessionLoss.cause
          : (next.scenario ?? next.status ?? 'stoppage'),
      );
    const owner = next.players.find((p) => p.id === next.ball.ownerId);
    if (owner && !ended) {
      if (this.active && this.active.team !== owner.team)
        this.close(next.time, next.lastPossessionChange?.cause ?? 'opponent_control');
      if (!this.active) {
        this.active = {
          id: `${next.seed}:audit:${this.closed}:${next.time}`,
          team: owner.team,
          period,
          start: next.time,
          passes: 0,
        };
        increment(this.bucket(owner.team, period), 'possessions');
      }
      increment(this.player(owner.id), 'controlledSeconds', dt);
    }
    if (!stopped)
      for (const p of previous.players) {
        increment(this.player(p.id), 'liveSeconds', dt);
      }
    for (const event of next.actionEvents ?? []) {
      if (event.sequence < (previous.actionEventSequence ?? 0) || !this.once(event.id)) continue;
      const b = this.bucket(event.team, period);
      increment(b, `event:${event.kind}`);
      increment(b, `event:${event.kind}:${event.outcome}`);
      increment(this.player(event.actorId), `event:${event.kind}`);
      if (event.kind === 'pass' || event.kind === 'through_pass') {
        const pass = next.lastPassDiagnostic;
        // The presentation ledger may republish a diagnostic after its 12s retention
        // window. Its new sequence is not a new physical pass. Use the canonical
        // release identity/time, just like the existing continuation observer.
        if (
          !pass ||
          !event.id.endsWith(`pass:${pass.passId}`) ||
          pass.releasedAt < this.releasedAt ||
          (pass.releasedAt === this.releasedAt && this.releasedIds.has(pass.passId))
        ) {
          increment(b, 'republishedPassEvents');
          continue;
        }
        if (pass.releasedAt > this.releasedAt) {
          this.releasedAt = pass.releasedAt;
          this.releasedIds.clear();
        }
        this.releasedIds.add(pass.passId);
        if (this.releasedIds.size > 2)
          throw new Error('More than two canonical releases at one timestamp');
        if (this.active?.team === event.team) this.active.passes++;
        const actor = next.players.find((p) => p.id === event.actorId);
        if (actor) {
          const origin = event.position,
            target = pass.intendedTarget ?? pass.predictedReceptionPoint;
          const metres = distance(origin, target);
          const progress = (target.x - origin.x) * (attacksRight(actor) ? 1 : -1);
          increment(b, 'passReleases');
          increment(b, 'progressMetres', progress);
          increment(b, metres < 18 ? 'passShort' : metres < 30 ? 'passMedium' : 'passLong');
          increment(
            b,
            progress > 5 ? 'passForward' : progress < -2 ? 'passBackward' : 'passLateral',
          );
          if (
            this.lastPass?.team === event.team &&
            this.lastPass.actor === event.targetId &&
            this.lastPass.target === event.actorId
          )
            increment(b, 'reciprocalConsecutivePass');
          this.lastPass = { actor: event.actorId, target: event.targetId ?? '', team: event.team };
        }
      }
    }
    if (
      next.latestAction !== previous.latestAction &&
      next.decisionIndex !== previous.decisionIndex &&
      next.latestAction
    ) {
      const a = next.latestAction;
      const actor = next.players.find((p) => p.id === a.actorId);
      if (actor && shooting(a.type, 'intent' in a ? a.intent : undefined))
        increment(this.bucket(actor.team, period), 'shotSelectionsObserved');
    }
    for (const shot of [next.ball.shot, next.lastShot]) {
      if (!shot?.outcome || !this.once(`result:${shot.shotId}`)) continue;
      const actor = [...next.players, ...(next.departedPlayers ?? [])].find(
        (p) => p.id === shot.shooterId,
      );
      if (!actor) continue;
      increment(this.bucket(actor.team, period), `shotResult:${shot.outcome}`);
      if (shot.goalkeeperAction)
        increment(this.bucket(actor.team, period), `keeper:${shot.goalkeeperAction}`);
      if (this.shots.length < 128)
        this.shots.push({
          id: shot.shotId,
          team: actor.team,
          at: next.time,
          distance: shot.distance,
          pressure: shot.pressure,
          baseXg: shot.baseXg,
          outcome: shot.outcome,
          classification: shot.classification,
          goalkeeperAction: shot.goalkeeperAction ?? null,
          reboundSource: shot.reboundSource ?? null,
        });
    }
  }
  observeRanking(state: TacticalMatchState, ranking: RankedAiAction[]) {
    const actor = state.players.find((p) => p.id === state.ball.ownerId);
    if (!actor) return;
    const b = this.bucket(actor.team, state.endsSwitched ? 2 : 1);
    increment(b, 'rankingSamples');
    const shot = ranking.find((r) =>
      shooting(r.action.type, 'intent' in r.action ? r.action.intent : undefined),
    );
    if (shot) {
      increment(b, 'samplesWithShot');
      if (ranking[0]?.action.type === 'pass') increment(b, 'samplesShotBelowPass');
    }
    const central = state.players
      .filter(
        (p) =>
          p.team === actor.team && p.id !== actor.id && p.slot.position === 'central_midfielder',
      )
      .map((p) => {
        const index = ranking.findIndex(
          (r) => r.action.type === 'pass' && r.action.receiverId === p.id,
        );
        const ranked = ranking[index];
        const a = ranked?.action;
        const q =
          a?.type === 'pass'
            ? evaluatePassDecision(state, actor, p, a.target, a.intent, a.delivery)
            : undefined;
        const counter = this.player(p.id);
        increment(counter, 'teammateOwnerSamples');
        increment(counter, index >= 0 ? 'generatedSamples' : 'notGeneratedSamples');
        if (index === 0) increment(counter, 'rankedFirstSamples');
        if (q && q.laneOccupation === 0 && q.receiverLateBy < 0.3 && q.expectedCompletion > 0.5)
          increment(counter, 'credibleGeneratedSamples');
        return {
          id: p.id,
          distance: distance(actor.position, p.position),
          generated: index >= 0,
          rank: index < 0 ? null : index + 1,
          score: ranked?.score ?? null,
          forecast: q
            ? {
                expectedCompletion: q.expectedCompletion,
                receiverEta: q.receiverEta,
                defenderEta: q.defenderEta,
                laneOccupation: q.laneOccupation,
                receiverLateBy: q.receiverLateBy,
              }
            : null,
        };
      });
    // First 64 eligible observations, not a random or population-representative trace sample.
    if (this.samples.length < 64)
      this.samples.push({
        at: state.time,
        actorId: actor.id,
        team: actor.team,
        phase: state.teams[actor.team].phase,
        pressure: state.currentPressure,
        possessionId: this.active?.id ?? null,
        bestType: ranking[0]?.action.type ?? null,
        bestScore: ranking[0]?.score ?? null,
        shotScore: shot?.score ?? null,
        central,
      });
  }
  snapshot() {
    return attackingAuditSchema.parse({
      version: 1,
      sampling: 'canonical owner at most once per two seconds; cooldown <= 0',
      periods: this.periods,
      players: this.players,
      samples: this.samples,
      shotResolutions: this.shots,
      closedPossessions: this.closed,
      possessionHistograms: this.histograms,
      retainedIdentityCount: this.seen.size,
    });
  }
}
