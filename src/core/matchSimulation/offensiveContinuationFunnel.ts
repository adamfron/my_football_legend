import { attacksRight } from './matchSpace';
import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { distance, signedForwardDistance } from './matchSpace';
import { classifyPass } from './passClassification';
import { shouldLetPassRun } from './receptionContinuation';
import { normalizeAngle } from './playerOrientation';

const counts = z.record(z.string(), z.number().finite().nonnegative());
export const firstTouchContinuitySchema = z.object({
  passId: z.string(),
  receiverId: z.string(),
  at: z.number().nonnegative(),
  kind: z.string(),
  incomingSpeed: z.number().nonnegative(),
  speedBefore: z.number().nonnegative(),
  speedAfter: z.number().nonnegative(),
  orientationChange: z.number().nonnegative(),
  controlRetained: z.boolean(),
  nextActionDelay: z.number().nonnegative().optional(),
  nextAction: z.string().optional(),
});
export const offensiveContinuationFunnelSchema = z.object({
  version: z.literal(2),
  counts,
  byLength: z.record(z.string(), counts),
  momentumAtRelease: z.array(z.number().nonnegative()).max(32),
  momentumAtReception: z.array(z.number().nonnegative()).max(32),
  continuationLatency: z.array(z.number().nonnegative()).max(32),
  firstTouches: z.array(firstTouchContinuitySchema).max(32).optional(),
  traces: z
    .array(
      z.object({
        passId: z.string(),
        stage: z.string(),
        at: z.number(),
        speed: z.number().nonnegative().optional(),
        advance: z.number().optional(),
      }),
    )
    .max(32),
});

/** Independent bounded observer. A flight/non-contact never becomes a reception. One pending
 * passage and online totals survive trace caps; pass/contact/action identities deduplicate ticks. */
export class OffensiveContinuationTracker {
  private detailed: boolean;
  private firstTouches: z.infer<typeof firstTouchContinuitySchema>[] = [];
  constructor(detailed = false) {
    this.detailed = detailed;
  }
  private totals: Record<string, number> = {};
  private lengths: Record<string, Record<string, number>> = {};
  private releaseSpeeds: number[] = [];
  private receptionSpeeds: number[] = [];
  private latencies: number[] = [];
  private traces: z.infer<typeof offensiveContinuationFunnelSchema>['traces'] = [];
  private passId = '';
  private resolvedAt = -Infinity;
  private resolvedIds = new Set<string>();
  private anticipatedId = '';
  private bypassId = '';
  private runOnId = '';
  private opportunityId = '';
  private length = 'short';
  private releaseLengths = new Map<string, string>();
  private actionKey = '';
  private crossReleaseKey = '';
  private pending:
    | {
        id: string;
        actorId: string;
        at: number;
        origin: { x: number; y: number };
        side: 'home' | 'away';
        useful: boolean;
        retained: boolean;
        finalThird: boolean;
        crossingArea: boolean;
      }
    | undefined;
  private add(key: string) {
    this.totals[key] = (this.totals[key] ?? 0) + 1;
  }
  private trace(
    id: string,
    stage: string,
    state: TacticalMatchState,
    speed?: number,
    advance?: number,
  ) {
    if (this.traces.length < 32)
      this.traces.push({
        passId: id,
        stage,
        at: state.time,
        ...(speed !== undefined ? { speed } : {}),
        ...(advance !== undefined ? { advance } : {}),
      });
  }
  observe(previous: TacticalMatchState, state: TacticalMatchState) {
    const pass = state.lastPassDiagnostic;
    if (pass && pass.passId !== this.passId) {
      this.passId = pass.passId;
      this.add('released');
      if (pass.incomingSpeed !== undefined) this.add('first_time_pass');
      const actor = state.players.find((p) => p.id === pass.passerId);
      const receiver = state.players.find((p) => p.id === pass.intendedReceiverId);
      if (actor) {
        const classification = classifyPass(
          previous.ball,
          pass.intendedTarget ?? pass.predictedReceptionPoint,
          actor,
          pass.intent ?? 'support',
          pass.delivery,
          Boolean(pass.requestedSpace),
        );
        this.length = classification.length;
        this.releaseLengths.set(pass.passId, this.length);
        if (this.releaseLengths.size > 2)
          this.releaseLengths.delete(this.releaseLengths.keys().next().value!);
        const bin = (this.lengths[this.length] ??= { attempts: 0, completed: 0, predictedSum: 0 });
        bin.attempts = (bin.attempts ?? 0) + 1;
        if (pass.selectionQuality) {
          bin.predictedSum = (bin.predictedSum ?? 0) + pass.selectionQuality.expectedCompletion;
          bin.predictedN = (bin.predictedN ?? 0) + 1;
        }
        this.add(classification.direction);
        if (classification.direction === 'backward' && classification.purpose === 'switch')
          this.add('backward_switch');
      }
      if (pass.requestedSpace) this.add('space_pass');
      if (pass.intent === 'lead' || pass.intent === 'through') this.add(pass.intent);
      const speed = receiver ? Math.hypot(receiver.velocity.x, receiver.velocity.y) : 0;
      if (this.releaseSpeeds.length < 32) this.releaseSpeeds.push(speed);
      this.trace(pass.passId, 'released', state, speed);
    }
    if (state.ball.sourceAction === 'cross' && state.ball.flightTime === 0) {
      const key = `${state.decisionIndex}:${state.ball.lastTouchPlayerId}`;
      if (key !== this.crossReleaseKey) {
        this.crossReleaseKey = key;
        this.add('cross_released');
        if (state.latestAction?.type === 'cross' && state.latestAction.intent === 'cutback')
          this.add('cutback_released');
      }
    }
    const preparation = state.receptionPreparation;
    if (preparation && state.time >= preparation.awarenessAt) {
      const receiver = state.players.find((p) => p.id === preparation.actorId);
      if (receiver) {
        if (
          this.anticipatedId !== preparation.ballEpisode &&
          Math.hypot(receiver.velocity.x, receiver.velocity.y) > 0.7
        ) {
          this.anticipatedId = preparation.ballEpisode;
          this.add('anticipating_run');
        }
        if (preparation.runOn && this.runOnId !== preparation.ballEpisode) {
          this.runOnId = preparation.ballEpisode;
          this.add('run_on_planned');
        }
        if (
          !state.ball.ownerId &&
          (state.ball.height ?? 0) <= 0.65 &&
          distance(receiver.position, state.ball) <= 1.05
        ) {
          if (this.opportunityId !== preparation.ballEpisode) {
            this.opportunityId = preparation.ballEpisode;
            this.add('first_legal_opportunity');
          }
          if (
            this.bypassId !== preparation.ballEpisode &&
            shouldLetPassRun(state, receiver, state.ball)
          ) {
            this.bypassId = preparation.ballEpisode;
            this.add('bypassed_early_contact');
            this.trace(preparation.ballEpisode, 'intentional_non_contact', state);
          }
        }
      }
    }
    const results = [state.lastResolvedPass, pass]
      .filter((p) => p?.finalResult)
      .sort((a, b) => (a!.resolvedAt ?? a!.releasedAt) - (b!.resolvedAt ?? b!.releasedAt));
    for (const result of results) {
      if (!result?.finalResult) continue;
      const at = result.resolvedAt ?? result.releasedAt;
      if (at < this.resolvedAt || (at === this.resolvedAt && this.resolvedIds.has(result.passId)))
        continue;
      if (at > this.resolvedAt) {
        this.resolvedAt = at;
        this.resolvedIds.clear();
      }
      this.resolvedIds.add(result.passId);
      if (this.resolvedIds.size > 2)
        throw new Error('More than two pass results at one canonical timestamp');
      const selfReclaim =
        result.finalResult === 'completed' &&
        (result.actualReceiverId ?? result.intendedReceiverId) === result.passerId;
      if (
        this.detailed &&
        !selfReclaim &&
        this.firstTouches.length < 32 &&
        result.actualReceiverId
      ) {
        const before = previous.players.find((p) => p.id === result.actualReceiverId),
          after = state.players.find((p) => p.id === result.actualReceiverId);
        if (before && after)
          this.firstTouches.push(
            firstTouchContinuitySchema.parse({
              passId: result.passId,
              receiverId: after.id,
              at,
              kind: result.receptionOutcome ?? 'first_time_release',
              incomingSpeed: Math.hypot(
                previous.ball.velocity?.x ?? 0,
                previous.ball.velocity?.y ?? 0,
                previous.ball.velocity?.z ?? 0,
              ),
              speedBefore: Math.hypot(before.velocity.x, before.velocity.y),
              speedAfter: Math.hypot(after.velocity.x, after.velocity.y),
              orientationChange: Math.abs(normalizeAngle(after.facingAngle - before.facingAngle)),
              controlRetained: state.ball.ownerId === after.id,
            }),
          );
      }
      this.add(selfReclaim ? 'passer_reclaimed' : `result_${result.finalResult}`);
      if (result.requestedSpace) {
        this.add(`space_pass_result_${selfReclaim ? 'self_reclaim' : result.finalResult}`);
        if (
          !selfReclaim &&
          result.finalResult === 'completed' &&
          result.actualReceiverId === result.intendedReceiverId
        )
          this.add('space_pass_intended_completed');
      }
      if (
        this.opportunityId !== result.passId &&
        (result.finalResult === 'completed' || result.finalResult === 'technical_error')
      ) {
        // A settled contact is definitive evidence when the canonical step has already
        // cleared preparation. Unsettled radius samples alone miss immediate controls.
        this.opportunityId = result.passId;
        this.add('first_legal_opportunity');
      }
      if (result.finalResult === 'completed' && result.actualReceiverId && !selfReclaim) {
        const receiver = state.players.find((p) => p.id === result.actualReceiverId);
        if (receiver) {
          const speed = Math.hypot(receiver.velocity.x, receiver.velocity.y);
          if (this.receptionSpeeds.length < 32) this.receptionSpeeds.push(speed);
          this.add(
            result.receptionOutcome === 'directional_control'
              ? 'directional_reception'
              : 'control_to_feet',
          );
          if (this.bypassId === result.passId) this.add('run_on_completed');
          const bin = this.lengths[this.releaseLengths.get(result.passId) ?? this.length];
          if (bin) bin.completed = (bin.completed ?? 0) + 1;
          if (this.pending) {
            if (!this.pending.useful) this.add('no_useful_continuation');
            this.add('continuation_superseded');
          }
          this.pending = {
            id: result.passId,
            actorId: receiver.id,
            at: result.resolvedAt ?? state.time,
            origin: { ...receiver.position },
            side: receiver.team,
            useful: false,
            retained: false,
            finalThird: false,
            crossingArea: false,
          };
          this.trace(result.passId, 'real_reception', state, speed);
        }
      } else {
        if (result.finalResult === 'technical_error') this.add('first_touch_failure');
        if (this.bypassId === result.passId) this.add('run_on_failed');
      }
    }
    const passage = this.pending;
    if (this.detailed && state.decisionIndex !== previous.decisionIndex && state.latestAction) {
      const touch = [...this.firstTouches]
        .reverse()
        .find(
          (t) =>
            t.receiverId === state.latestAction!.actorId &&
            t.nextActionDelay === undefined &&
            state.time >= t.at,
        );
      if (touch) {
        touch.nextActionDelay = state.time - touch.at;
        touch.nextAction = state.latestAction.type;
      }
    }
    if (passage) {
      const receiver = state.players.find((p) => p.id === passage.actorId);
      const elapsed = state.time - passage.at;
      const advance = receiver
        ? signedForwardDistance(passage.origin, receiver.position, receiver)
        : 0;
      if (!passage.retained && elapsed >= 1 && state.ball.ownerId === passage.actorId) {
        passage.retained = true;
        this.add('retained_after_one_second');
      }
      if (!passage.useful && state.ball.ownerId === passage.actorId && advance >= 5) {
        passage.useful = true;
        this.add('useful_forward_continuation');
        if (this.latencies.length < 32) this.latencies.push(elapsed);
        this.trace(passage.id, 'useful_continuation', state, undefined, advance);
      }
      const depth = receiver
        ? attacksRight(receiver)
          ? receiver.position.x
          : 105 - receiver.position.x
        : 0;
      const originDepth = attacksRight(passage.side, state)
        ? passage.origin.x
        : 105 - passage.origin.x;
      if (receiver && state.ball.ownerId === passage.actorId && advance >= 5) {
        if (!passage.finalThird && originDepth < 70 && depth >= 70) {
          passage.finalThird = true;
          this.add('carry_entering_final_third');
        }
        if (!passage.crossingArea && depth >= 82 && Math.abs(receiver.position.y - 34) >= 15) {
          passage.crossingArea = true;
          this.add('wide_continuation_to_crossing_area');
        }
      }
      const action = state.latestAction;
      const key = `${state.decisionIndex}:${state.latestActionSource}:${JSON.stringify(action)}`;
      if (action && key !== this.actionKey) {
        this.actionKey = key;
        if (action.actorId === passage.actorId) {
          if (
            action.type === 'carry' &&
            receiver &&
            signedForwardDistance(receiver.position, action.target, receiver) > 2
          )
            this.add(action.movementMode === 'sprint' ? 'sprint_carry' : 'forward_carry');
          else if (action.type === 'cross')
            this.add(action.intent === 'cutback' ? 'cutback' : 'cross');
          else if (action.type === 'shot') this.add('shot');
          else if (
            action.type === 'pass' &&
            receiver &&
            signedForwardDistance(receiver.position, action.target, receiver) > 5
          )
            this.add('progressive_followup');
        }
      }
      if (elapsed > 5 || state.possessionTeam !== passage.side || state.scenario !== 'open_play') {
        if (!passage.useful) this.add('no_useful_continuation');
        if (state.possessionTeam !== passage.side) this.add('defensive_recovery');
        this.pending = undefined;
      }
    }
  }
  snapshot() {
    return offensiveContinuationFunnelSchema.parse({
      version: 2,
      counts: this.totals,
      byLength: this.lengths,
      momentumAtRelease: this.releaseSpeeds,
      momentumAtReception: this.receptionSpeeds,
      continuationLatency: this.latencies,
      ...(this.detailed ? { firstTouches: this.firstTouches } : {}),
      traces: this.traces,
    });
  }
}
