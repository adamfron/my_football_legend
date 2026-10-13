import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { attacksRight, distance, type TeamOrientation, type TeamSide } from './matchSpace';
import { isRestartSetup } from './restartPhase';
import { calculateOffsideLine } from './tacticalPositioning';
import { evaluateShootingOpportunity } from './shootingOpportunity';
import { rankAvailableActionsForAI, npcPossessionDecisionDelay } from './matchActions';
import { canExecuteCanonicalShot } from './shootingOptions';
import { normalizeAngle } from './playerOrientation';

export const FUNNEL_VERSION = 3;
const countMap = z.record(z.string(), z.number().nonnegative().finite());
export const funnelTeamSchema = z.object({
  possessions: z.number().int().nonnegative(),
  stages: countMap,
  events: countMap,
  exits: countMap,
  seconds: countMap,
  roles: z.record(z.string(), countMap),
  network: countMap,
  spatial: z.record(z.string(), z.object({ n: z.number(), mean: z.number(), sd: z.number() })),
  conversions: z.record(z.string(), z.number().nullable()),
});
export const funnelSummarySchema = z.object({
  version: z.literal(FUNNEL_VERSION),
  teams: z.object({ home: funnelTeamSchema, away: funnelTeamSchema }),
  possessions: z
    .array(
      z.object({
        id: z.string(),
        side: z.enum(['home', 'away']),
        start: z.number(),
        end: z.number(),
        startDepth: z.number(),
        maxAdvance: z.number(),
        stages: z.array(z.string()),
        exit: z.string(),
      }),
    )
    .max(32),
  decisions: z
    .array(
      z.object({
        time: z.number(),
        actorId: z.string(),
        role: z.string(),
        side: z.enum(['home', 'away']),
        delay: z.number(),
        depth: z.number(),
        candidates: z.array(
          z.object({
            type: z.string(),
            intent: z.string().optional(),
            receiverId: z.string().optional(),
            score: z.number(),
            executable: z.boolean().optional(),
          }),
        ),
      }),
    )
    .max(32),
  spatialSamples: z
    .array(
      z.object({
        time: z.number(),
        side: z.enum(['home', 'away']),
        ballDepth: z.number(),
        lineDepth: z.number(),
        forwards: z.array(
          z.object({
            id: z.string(),
            depth: z.number(),
            targetDepth: z.number(),
            lineGap: z.number(),
          }),
        ),
      }),
    )
    .max(24),
});
export type FunnelSummary = z.infer<typeof funnelSummarySchema>;
type Totals = {
  possessions: number;
  stages: Record<string, number>;
  events: Record<string, number>;
  exits: Record<string, number>;
  seconds: Record<string, number>;
  roles: Record<string, Record<string, number>>;
  network: Record<string, number>;
};
const empty = (): Totals => ({
  possessions: 0,
  stages: {},
  events: {},
  exits: {},
  seconds: {},
  roles: {},
  network: {},
});
const bump = (map: Record<string, number>, key: string, value = 1) => {
  map[key] = (map[key] ?? 0) + value;
};
export const attackingDepth = (x: number, side: TeamOrientation) =>
  attacksRight(side) ? x : 105 - x;
export const pitchThird = (depth: number) =>
  depth < 35 ? 'defensive' : depth < 70 ? 'middle' : 'final';
export const playerRole = (player: MatchPlayerState) =>
  player.slot.position === 'goalkeeper'
    ? 'goalkeeper'
    : player.slot.position === 'center_back'
      ? 'centre_back'
      : /_back$/.test(player.slot.position)
        ? 'fullback'
        : /winger/.test(player.slot.position)
          ? 'winger'
          : player.slot.position === 'striker'
            ? 'striker'
            : 'midfield';
const inBox = (depth: number, y: number) => depth >= 88.5 && Math.abs(y - 34) <= 20.16;
type Possession = {
  id: string;
  side: TeamSide;
  start: number;
  startDepth: number;
  maxAdvance: number;
  stages: Set<string>;
  finalSeconds: number;
  outsideFinal: boolean;
  outsideBox: boolean;
  outsideCredible: boolean;
};

/** Standalone, mutable observer. No canonical imports this tracker. Retained traces are bounded;
 * totals continue after trace caps. Flight/loose claims alone never initiate possession. */
export class AttackingFunnelTracker {
  private totals = { home: empty(), away: empty() };
  private active: Possession | undefined;
  private seen = new Set<string>();
  private passOrigins = new Map<string, { x: number; y: number; line: number }>();
  private possessions: FunnelSummary['possessions'] = [];
  private decisions: FunnelSummary['decisions'] = [];
  private spatialSamples: FunnelSummary['spatialSamples'] = [];
  private moments = {
    home: new Map<string, { n: number; sum: number; square: number }>(),
    away: new Map<string, { n: number; sum: number; square: number }>(),
  };
  private nextSpatial = 0;
  private nextDecision = 0;
  private rotation:
    | {
        actorId: string;
        origin: { x: number; y: number };
        angle: number;
        absolute: number;
        contacts: number;
      }
    | undefined;
  constructor(
    private readonly probes: {
      ranking: typeof rankAvailableActionsForAI;
      opportunity: typeof evaluateShootingOpportunity;
      executable: typeof canExecuteCanonicalShot;
      delay: typeof npcPossessionDecisionDelay;
    } = {
      ranking: rankAvailableActionsForAI,
      opportunity: evaluateShootingOpportunity,
      executable: canExecuteCanonicalShot,
      delay: npcPossessionDecisionDelay,
    },
    private readonly detailed = true,
  ) {}
  private once(id: string) {
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    return true;
  }
  private stage(key: string) {
    if (!this.active) return;
    const totals = this.totals[this.active.side];
    bump(totals.events, key);
    if (!this.active.stages.has(key)) {
      this.active.stages.add(key);
      bump(totals.stages, key);
    }
    if (key === 'shot')
      for (const earlier of ['final_entry', 'box_entry']) {
        const joint = earlier === 'final_entry' ? 'shot_after_final' : 'shot_after_box';
        if (this.active.stages.has(earlier) && !this.active.stages.has(joint)) {
          this.active.stages.add(joint);
          bump(totals.stages, joint);
        }
      }
  }
  private close(at: number, exit: string) {
    if (!this.active) return;
    const p = this.active;
    bump(this.totals[p.side].exits, exit);
    if (this.possessions.length < 32)
      this.possessions.push({
        id: p.id,
        side: p.side,
        start: p.start,
        end: at,
        startDepth: p.startDepth,
        maxAdvance: p.maxAdvance,
        stages: [...p.stages],
        exit,
      });
    this.active = undefined;
  }
  private moment(side: TeamSide, key: string, value: number) {
    const m = this.moments[side].get(key) ?? { n: 0, sum: 0, square: 0 };
    m.n++;
    m.sum += value;
    m.square += value * value;
    this.moments[side].set(key, m);
  }
  observe(previous: TacticalMatchState, next: TacticalMatchState) {
    const dt = Math.max(0, next.time - previous.time);
    // A launch clears ownership; its eventual goal/save can also close the sequence.
    // Attribute the canonical release before either transition, not at lastShot settlement.
    for (const shot of [next.ball.shot, next.lastShot]) {
      if (!shot) continue;
      const shooter = [...next.players, ...(next.departedPlayers ?? [])].find(
        (p) => p.id === shot.shooterId,
      );
      if (!shooter) continue;
      const totals = this.totals[shooter.team];
      if (this.once(`shot:${shot.shotId}`)) {
        bump(totals.events, 'shot_release');
        if (this.active?.side === shooter.team) this.stage('shot');
      }
      if (shot.outcome && this.once(`shot-outcome:${shot.shotId}`)) {
        bump(totals.events, `shot_${shot.outcome}`);
        if (shot.reboundSource) bump(totals.events, `rebound_${shot.reboundSource}`);
      }
    }
    const stopped =
      isRestartSetup(next) ||
      Boolean(next.postGoal) ||
      ['half_time', 'full_time', 'abandoned'].includes(next.status ?? '');
    const actor = next.players.find((p) => p.id === next.ball.ownerId);
    const loss = next.lastPossessionLoss;
    if (stopped)
      this.close(
        next.time,
        loss && loss.at >= previous.time
          ? loss.cause
          : next.status === 'full_time' || next.status === 'half_time'
            ? 'period_end'
            : (next.scenario ?? 'stoppage'),
      );
    if (actor && !stopped) {
      if (this.active && actor.team !== this.active.side)
        this.close(next.time, next.lastPossessionChange?.cause ?? 'opponent_control');
      if (!this.active) {
        const depth = attackingDepth(next.ball.x, actor);
        const t = this.totals[actor.team];
        t.possessions++;
        this.active = {
          id: `${next.seed}:controlled:${actor.id}:${next.ballOwnershipStartedAt ?? next.time}`,
          side: actor.team,
          start: next.time,
          startDepth: depth,
          maxAdvance: 0,
          stages: new Set(),
          finalSeconds: 0,
          outsideFinal: depth < 70,
          outsideBox: !inBox(depth, next.ball.y),
          outsideCredible: true,
        };
        bump(t.events, `start_${pitchThird(depth)}`);
        this.stage('controlled');
        if (depth < 70) this.stage('starts_outside_final');
      }
      const p = this.active!;
      const depth = attackingDepth(next.ball.x, actor);
      p.maxAdvance = Math.max(p.maxAdvance, depth - p.startDepth);
      for (const metres of [5, 10, 20, 30])
        if (p.maxAdvance >= metres && !p.stages.has(`advance_${metres}`))
          this.stage(`advance_${metres}`);
      bump(this.totals[actor.team].seconds, 'controlled', dt);
      bump(this.totals[actor.team].seconds, `third_${pitchThird(depth)}`, dt);
      if (depth >= 70) {
        if (p.outsideFinal) {
          this.stage('final_entry');
          if (p.startDepth < 70 && !p.stages.has('entered_from_outside'))
            this.stage('entered_from_outside');
        }
        p.finalSeconds += dt;
        if (p.finalSeconds >= 2 && !p.stages.has('sustained_final')) this.stage('sustained_final');
      }
      p.outsideFinal = depth < 70;
      const box = inBox(depth, next.ball.y);
      if (box && p.outsideBox) this.stage('box_entry');
      p.outsideBox = !box;
      if (box && actor.id !== previous.ball.ownerId)
        bump(this.totals[actor.team].events, 'box_controls');
      if (depth >= 60 && next.time >= this.nextDecision) {
        const opportunity = this.probes.opportunity(next, actor);
        const credible = ['credible', 'high_value'].includes(opportunity.category);
        if (credible && p.outsideCredible) this.stage('credible_position');
        p.outsideCredible = !credible;
      }
      if (next.time >= this.nextDecision && next.actionCooldown <= 0 && !next.periodEndPending) {
        this.nextDecision = next.time + 2;
        const ranking = this.probes.ranking(next, actor.id);
        const shots = ranking.filter(
          ({ action }) =>
            action.type === 'shot' || (action.type === 'header' && action.intent === 'header_shot'),
        );
        bump(this.totals[actor.team].events, 'sampled_decisions');
        if (shots.length) this.stage('sampled_shot_candidate');
        const executable = shots.filter(
          ({ action }) =>
            (action.type === 'shot' || action.type === 'header') &&
            this.probes.executable(next, action),
        );
        if (executable.length) this.stage('sampled_executable_shot');
        const first = ranking[0]?.action;
        if (
          first?.type === 'shot' ||
          (first?.type === 'header' && first.intent === 'header_shot')
        ) {
          this.stage('sampled_shot_ranked_first');
          if (this.probes.executable(next, first))
            this.stage('sampled_executable_shot_ranked_first');
        }
        bump(this.totals[actor.team].events, 'sampled_shot_candidates', shots.length);
        for (const { action } of ranking)
          if (action.type === 'pass') {
            const receiver = next.players.find((p) => p.id === action.receiverId);
            if (receiver?.slot.position === 'striker')
              bump(this.totals[actor.team].events, 'sampled_striker_candidates');
            if (action.intent === 'through')
              bump(this.totals[actor.team].events, 'sampled_through_candidates');
          }
        if (this.detailed && this.decisions.length < 32)
          this.decisions.push({
            time: next.time,
            actorId: actor.id,
            role: playerRole(actor),
            side: actor.team,
            delay: this.probes.delay(next, actor),
            depth,
            candidates: [
              ...ranking.slice(0, 4),
              ...shots.slice(0, 1),
              ...ranking
                .filter(
                  ({ action }) =>
                    action.type === 'pass' &&
                    next.players.find((p) => p.id === action.receiverId)?.slot.position ===
                      'striker',
                )
                .slice(0, 1),
            ]
              .filter(({ score }) => Number.isFinite(score))
              .map(({ action, score }) => ({
                type: action.type,
                ...('intent' in action ? { intent: action.intent } : {}),
                ...('receiverId' in action ? { receiverId: action.receiverId } : {}),
                score,
                ...(action.type === 'shot'
                  ? { executable: this.probes.executable(next, action) }
                  : {}),
              })),
          });
      }
    }
    // Canonical event IDs deduplicate actual releases and results, even after a first-time action.
    for (const pass of [next.lastPassDiagnostic, next.lastResolvedPass]) {
      if (!pass) continue;
      const passer = [...next.players, ...(next.departedPlayers ?? [])].find(
        (p) => p.id === pass.passerId,
      );
      const receiver = [...next.players, ...(next.departedPlayers ?? [])].find(
        (p) => p.id === (pass.actualReceiverId ?? pass.intendedReceiverId),
      );
      if (!passer) continue;
      const t = this.totals[passer.team];
      if (this.once(`release:${pass.passId}`)) {
        const origin = previous.ball;
        this.passOrigins.set(pass.passId, {
          x: origin.x,
          y: origin.y,
          line: calculateOffsideLine(previous, passer.team),
        });
        const progress =
          attackingDepth(pass.predictedReceptionPoint.x, passer) - attackingDepth(origin.x, passer);
        bump(
          t.events,
          progress > 5 ? 'progressive_pass' : progress < -2 ? 'backward_pass' : 'lateral_pass',
        );
        if (pass.intent === 'through') bump(t.events, 'through_attempt');
        if (receiver?.slot.position === 'striker') bump(t.events, 'striker_pass_attempt');
        if (pass.executionType === 'first_time') bump(t.events, 'first_time_pass');
      }
      if (pass.finalResult && this.once(`result:${pass.passId}`)) {
        bump(t.events, `pass_${pass.finalResult}`);
        if (pass.finalResult === 'completed' && pass.actualContactPoint && receiver) {
          const role = playerRole(receiver);
          const r = (t.roles[role] ??= {});
          bump(r, 'receptions');
          bump(r, pitchThird(attackingDepth(pass.actualContactPoint.x, passer)));
          bump(t.network, `${playerRole(passer)}>${role}`);
          if (pass.intent === 'through') bump(t.events, 'through_completed');
          const origin = this.passOrigins.get(pass.passId);
          if (
            this.active?.side === passer.team &&
            origin &&
            attackingDepth(pass.actualContactPoint.x, passer) - attackingDepth(origin.x, passer) > 5
          ) {
            bump(t.events, 'progressive_completed');
            this.stage('progressive_reception');
          }
          if (
            origin &&
            attackingDepth(pass.receiverPositionAtRelease.x, passer) <=
              attackingDepth(origin.line, passer) &&
            attackingDepth(pass.actualContactPoint.x, passer) >
              attackingDepth(origin.line, passer) + 1
          )
            bump(t.events, 'received_behind_release_line');
        }
        this.passOrigins.delete(pass.passId);
      }
    }
    if (next.lastChallenge && this.once(`challenge:${next.lastChallenge.id}`)) {
      const c = next.lastChallenge;
      bump(
        this.totals[c.team].events,
        `challenge_${c.outcome}_${pitchThird(attackingDepth(c.position.x, next.teams[c.team]))}`,
      );
    }
    if (loss && this.once(`loss:${loss.id}`)) {
      bump(
        this.totals[loss.from].events,
        `loss_${loss.cause}_${pitchThird(attackingDepth(loss.position.x, next.teams[loss.from]))}`,
      );
    }
    // All-player spatial observations at 0.1 Hz; online moments, bounded representative samples.
    if (!stopped && next.time >= this.nextSpatial) {
      this.nextSpatial = next.time + 10;
      for (const side of ['home', 'away'] as const) {
        const players = next.players.filter(
          (p) => p.team === side && p.slot.position !== 'goalkeeper',
        );
        if (!players.length) continue;
        const xs = players.map((p) => attackingDepth(p.position.x, next.teams[side]));
        const ys = players.map((p) => p.position.y);
        this.moment(side, 'width', Math.max(...ys) - Math.min(...ys));
        this.moment(side, 'depth', Math.max(...xs) - Math.min(...xs));
        const lineDepth = attackingDepth(calculateOffsideLine(next, side), next.teams[side]);
        const forwards = players.filter((p) => p.slot.position === 'striker');
        for (const p of players) {
          this.moment(side, `${p.id}:depth`, attackingDepth(p.position.x, next.teams[side]));
          this.moment(side, 'anchor_distance', distance(p.position, p.neutralAnchor));
          this.moment(side, 'target_distance', distance(p.position, p.idealTarget));
        }
        for (const p of forwards)
          this.moment(
            side,
            next.possessionTeam === side
              ? 'attacking_forward_line_gap'
              : 'defending_forward_line_gap',
            lineDepth - attackingDepth(p.position.x, next.teams[side]),
          );
        if (this.detailed && this.spatialSamples.length < 24)
          this.spatialSamples.push({
            time: next.time,
            side,
            ballDepth: attackingDepth(next.ball.x, next.teams[side]),
            lineDepth,
            forwards: forwards.map((p) => ({
              id: p.id,
              depth: attackingDepth(p.position.x, next.teams[side]),
              targetDepth: attackingDepth(p.idealTarget.x, next.teams[side]),
              lineGap: lineDepth - attackingDepth(p.position.x, next.teams[side]),
            })),
          });
      }
    }
    if (actor && !stopped) {
      if (this.rotation?.actorId !== actor.id)
        this.rotation = {
          actorId: actor.id,
          origin: actor.position,
          angle: actor.facingAngle,
          absolute: 0,
          contacts: 0,
        };
      const r = this.rotation!;
      r.absolute += Math.abs(normalizeAngle(actor.facingAngle - r.angle));
      r.angle = actor.facingAngle;
      if (
        next.controlledBallContact?.lastContactAt !== previous.controlledBallContact?.lastContactAt
      )
        r.contacts++;
      if (r.absolute > Math.PI * 2 && distance(r.origin, actor.position) < 3)
        bump(this.totals[actor.team].seconds, 'rotation_over360_low_progress', dt);
    } else this.rotation = undefined;
  }
  snapshot(at: number): FunnelSummary {
    const teams = Object.fromEntries(
      (['home', 'away'] as const).map((side) => {
        const t = this.totals[side];
        const rate = (numerator: number, denominator: number) =>
          denominator ? numerator / denominator : null;
        return [
          side,
          {
            ...t,
            spatial: Object.fromEntries(
              [...this.moments[side]].map(([key, m]) => [
                key,
                {
                  n: m.n,
                  mean: m.sum / m.n,
                  sd: Math.sqrt(Math.max(0, m.square / m.n - (m.sum / m.n) ** 2)),
                },
              ]),
            ),
            conversions: {
              final_after_outside: rate(
                t.stages.entered_from_outside ?? 0,
                t.stages.starts_outside_final ?? 0,
              ),
              shot_after_final: rate(t.stages.shot_after_final ?? 0, t.stages.final_entry ?? 0),
              shot_after_box: rate(t.stages.shot_after_box ?? 0, t.stages.box_entry ?? 0),
              sampled_shot_ranked_when_executable: rate(
                t.events.sampled_executable_shot_ranked_first ?? 0,
                t.events.sampled_executable_shot ?? 0,
              ),
            },
          },
        ];
      }),
    );
    return funnelSummarySchema.parse({
      version: FUNNEL_VERSION,
      teams,
      possessions: this.possessions,
      decisions: this.decisions,
      spatialSamples: this.spatialSamples,
      observedThrough: at,
    });
  }
}
