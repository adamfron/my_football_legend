import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { isRestartSetup } from './restartPhase';
import { measureEffectivePlayingTime } from './effectivePlayingTime';

const counts = z.record(z.string(), z.number().nonnegative());
export const naturalMatchFlowDiagnosticsSchema = z.object({
  ticks: z.number().int().nonnegative(),
  boundaryCounts: counts,
  awards: counts,
  contacts: counts,
  challenges: counts,
  retrievalStageSeconds: counts,
  readinessBlockerSeconds: counts,
  preparationPhaseSeconds: counts,
  restarts: z.array(
    z.object({
      id: z.string(),
      scenario: z.string(),
      seconds: z.number().nonnegative(),
      ballReadySeconds: z.number().nonnegative().nullable(),
      legalReadySeconds: z.number().nonnegative().nullable(),
      executionAfterLegalSeconds: z.number().nonnegative().nullable(),
    }),
  ),
  boundaryReceipts: z
    .array(
      z.object({
        at: z.number(),
        boundary: z.string(),
        lastTouch: z.string().nullable(),
        restart: z.string(),
        restartTeam: z.string(),
        previous: z.object({ x: z.number(), y: z.number() }),
        point: z.object({ x: z.number(), y: z.number() }),
      }),
    )
    .max(512),
});

/** Passive, bounded development observer. All timings describe actual states;
 * blocker times overlap and must never be summed as a partition of dead time. */
export class NaturalMatchFlowDiagnostics {
  private value: z.infer<typeof naturalMatchFlowDiagnosticsSchema> = {
    ticks: 0,
    boundaryCounts: {},
    awards: {},
    contacts: {},
    challenges: {},
    retrievalStageSeconds: {},
    readinessBlockerSeconds: {},
    preparationPhaseSeconds: {},
    restarts: [],
    boundaryReceipts: [],
  };
  private seen = new Set<string>();
  private count(
    kind:
      | 'boundaryCounts'
      | 'awards'
      | 'contacts'
      | 'challenges'
      | 'retrievalStageSeconds'
      | 'readinessBlockerSeconds'
      | 'preparationPhaseSeconds',
    key: string,
    amount = 1,
  ) {
    this.value[kind][key] = (this.value[kind][key] ?? 0) + amount;
  }
  private once(key: string) {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }
  observe(before: TacticalMatchState, after: TacticalMatchState) {
    this.value.ticks++;
    const dt = Math.max(0, after.time - before.time),
      restart = before.restart;
    if (restart && isRestartSetup(before)) {
      this.count('preparationPhaseSeconds', `${before.scenario}:${restart.phase}`, dt);
      if (restart.retrieval)
        this.count('retrievalStageSeconds', `${before.scenario}:${restart.retrieval.stage}`, dt);
      for (const blocker of restart.readiness?.blockers ?? [])
        this.count('readinessBlockerSeconds', `${before.scenario}:${blocker}`, dt);
    }
    const award = after.lastRestartAward;
    if (award && award.origin === 'live_event' && this.once('award:' + award.id)) {
      this.count('awards', award.scenario);
      const crossing = after.lastBoundaryCrossing;
      if (award.cause === 'boundary' && crossing) {
        this.count('boundaryCounts', crossing.boundary);
        this.value.boundaryReceipts.push({
          at: award.eventAt ?? after.time,
          boundary: crossing.boundary,
          lastTouch: crossing.lastTouchPlayerId ?? null,
          restart: award.scenario,
          restartTeam: crossing.restartTeam,
          previous: { ...crossing.previous },
          point: { ...crossing.point },
        });
        this.value.boundaryReceipts = this.value.boundaryReceipts.slice(-512);
      }
    }
    const contact = after.lastBallContact;
    if (contact && this.once('ball:' + contact.at + ':' + contact.kind + ':' + contact.playerId))
      this.count('contacts', contact.kind);
    const ground = after.lastGroundContact;
    if (ground?.executed && this.once('foot:' + ground.at + ':' + ground.actorId))
      this.count('contacts', 'foot');
    const body = after.experimentalBodyContacts?.last;
    if (body?.executed && this.once('surface:' + body.at + ':' + body.playerId))
      this.count('contacts', body.actualSurface ?? 'unknown');
    const challenge = after.lastChallenge;
    if (challenge && this.once('challenge:' + challenge.id))
      this.count(
        'challenges',
        `${challenge.technique}:${challenge.outcome}:${challenge.fromBehind ? 'behind' : 'front'}:${challenge.ballReachable ? 'reachable' : 'unreachable'}`,
      );
    const ended = after.stoppageLedger?.intervals.at(-1);
    if (ended?.endedAt !== undefined && this.once('interval:' + ended.id))
      this.value.restarts.push({
        id: ended.id,
        scenario: ended.reasons[0] ?? 'unknown',
        seconds: ended.endedAt - ended.startedAt,
        ballReadySeconds:
          ended.ballReadyAt === undefined ? null : ended.ballReadyAt - ended.startedAt,
        legalReadySeconds:
          ended.legalReadyAt === undefined ? null : ended.legalReadyAt - ended.startedAt,
        executionAfterLegalSeconds:
          ended.executedAt === undefined || ended.legalReadyAt === undefined
            ? null
            : Math.max(0, ended.executedAt - ended.legalReadyAt),
      });
  }
  snapshot() {
    return naturalMatchFlowDiagnosticsSchema.parse(structuredClone(this.value));
  }
  report(state: TacticalMatchState) {
    const time = measureEffectivePlayingTime(state, 0),
      rows = state.statistics?.players ?? [];
    const shots = rows.reduce((n, p) => n + p.shots, 0),
      passes = rows.reduce((n, p) => n + p.passesAttempted, 0),
      minutes = time.ballInPlaySeconds / 60;
    return {
      diagnostics: this.snapshot(),
      time,
      rates: {
        passAttemptsPerInPlayMinute: minutes ? passes / minutes : null,
        shotsPerInPlayMinute: minutes ? shots / minutes : null,
        restartsPerCanonicalMinute: state.time
          ? Object.values(this.value.awards).reduce((n, v) => n + v, 0) / (state.time / 60)
          : null,
      },
      limitation:
        'Passive engineering diagnostics; blocker durations overlap; no event targets or statistical correction.',
    };
  }
}
