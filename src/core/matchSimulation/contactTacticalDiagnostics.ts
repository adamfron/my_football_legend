import { z } from 'zod';
import type { TacticalMatchState, MatchPlayerState } from './matchState';
import { distance, type TeamSide } from './matchSpace';
import { normalizeAngle } from './playerOrientation';

export const TRANSITION_WINDOWS = ['0-1', '1-3', '3-5', '5-8', '8-10', '>10'] as const;
const histogram = () => [0, 0, 0, 0, 0, 0];
const count = z.number().int().nonnegative();
const metric = z.number().finite().nonnegative();
export const transitionClockSchema = z.object({
  lossToPressure: z.array(count).length(6),
  lossToRegain: z.array(count).length(6),
  pressureToRegain: z.array(count).length(6),
  regainToProgression: z.array(count).length(6),
  regainToShot: z.array(count).length(6),
  regainToGoal: z.array(count).length(6),
  losses: count,
  regains: count,
  incompleteLosses: count,
  censoredRegains: count,
});
export const workloadObservationSchema = z.object({
  playerId: z.string(),
  distance: metric,
  walking: metric,
  jogging: metric,
  running: metric,
  sprinting: metric,
  pressingDistance: metric,
  lowEffortSeconds: metric,
  accelerations: count,
  decelerations: count,
  sharpTurns: count,
  sprintStarts: count,
  repeatEffortsWithin5s: count,
  sprintIntervals: z.array(count).length(6),
  bodyContacts: count,
});
export const rotationTraceSchema = z.object({
  actorId: z.string(),
  startedAt: metric,
  endedAt: metric,
  absoluteRotation: metric,
  netDisplacement: metric,
  travelled: metric,
  ballTravelled: metric,
  maximumAngularVelocity: metric,
  relativeBallSpeed: metric,
  carryRevisions: count,
  outcome: z.string(),
});
export const contactTacticalSummarySchema = z.object({
  carrierEpisodes: count,
  rotationOver180LowProgress: count,
  rotationOver360LowProgress: count,
  turnAngles: z.array(count).length(4),
  headingReversals: count,
  carrySelections: count,
  challengeAttempts: count,
  resolvedChallenges: count,
  reachableAttempts: count,
  bodyContacts: count,
  adjacentTickFlips: count,
  possessionSpells: count,
  spellsUnderHalfSecond: count,
  pressureByThird: z.array(count).length(3),
  regainByThird: z.array(count).length(3),
  forwardOnCentreBackPresses: count,
  screenedCentralLaneSamples: count,
  exposedTransitionSamples: count,
  progressiveEscapes: count,
  releasesBeforeContact: count,
  clocks: z.record(z.enum(['home', 'away']), transitionClockSchema),
  workload: z.array(workloadObservationSchema).max(22),
  rotationTraces: z.array(rotationTraceSchema).max(12),
});
type Clocks = z.infer<typeof transitionClockSchema>;
type Workload = z.infer<typeof workloadObservationSchema>;
type Rotation = z.infer<typeof rotationTraceSchema>;
const clocks = (): Clocks => ({
  lossToPressure: histogram(),
  lossToRegain: histogram(),
  pressureToRegain: histogram(),
  regainToProgression: histogram(),
  regainToShot: histogram(),
  regainToGoal: histogram(),
  losses: 0,
  regains: 0,
  incompleteLosses: 0,
  censoredRegains: 0,
});
const bin = (seconds: number) =>
  seconds <= 1 ? 0 : seconds <= 3 ? 1 : seconds <= 5 ? 2 : seconds <= 8 ? 3 : seconds <= 10 ? 4 : 5;
const record = (values: number[], seconds: number) => {
  values[bin(Math.max(0, seconds))]!++;
};
const third = (x: number, side: TeamSide) =>
  Math.min(2, Math.floor((side === 'home' ? x : 105 - x) / 35));
const isForward = (p: MatchPlayerState) => /striker|winger|forward/.test(p.slot.position);

/** Read-only bounded observer. Its clocks, turn thresholds and effort bins never drive tactics.
 * At most 22 workloads, two pending transitions, one carrier and 12 representative traces. */
export class ContactTacticalTracker {
  private totals = {
    carrierEpisodes: 0,
    rotationOver180LowProgress: 0,
    rotationOver360LowProgress: 0,
    turnAngles: [0, 0, 0, 0],
    headingReversals: 0,
    carrySelections: 0,
    challengeAttempts: 0,
    resolvedChallenges: 0,
    reachableAttempts: 0,
    bodyContacts: 0,
    adjacentTickFlips: 0,
    possessionSpells: 0,
    spellsUnderHalfSecond: 0,
    pressureByThird: [0, 0, 0],
    regainByThird: [0, 0, 0],
    forwardOnCentreBackPresses: 0,
    screenedCentralLaneSamples: 0,
    exposedTransitionSamples: 0,
    progressiveEscapes: 0,
    releasesBeforeContact: 0,
  };
  private teamClocks = { home: clocks(), away: clocks() };
  private losses: Partial<Record<TeamSide, { at: number; pressureAt?: number }>> = {};
  private regains: Partial<
    Record<
      TeamSide,
      { at: number; originX: number; progress: boolean; shot: boolean; goal: boolean }
    >
  > = {};
  private workloads = new Map<string, Workload>();
  private lastSprints = new Map<string, number>();
  private turns = new Map<
    string,
    { radians: number; seconds: number; quiet: number; counted: boolean }
  >();
  private carrier:
    | (Rotation & { origin: { x: number; y: number }; lastHeading?: number })
    | undefined;
  private traces: Rotation[] = [];
  private pressures = new Map<
    string,
    { carrierId: string; controlKey: string; originX: number; contacted: boolean; escaped: boolean }
  >();
  private spellStartedAt: number | undefined;
  private lastFlipAt = -1;
  private lastProbeAt = -1;

  private censorTransitions(state: TacticalMatchState) {
    for (const side of ['home', 'away'] as const) {
      if (this.losses[side]) this.teamClocks[side].incompleteLosses++;
      if (this.regains[side]) this.teamClocks[side].censoredRegains++;
    }
    this.losses = {};
    this.regains = {};
    this.pressures.clear();
    this.spellStartedAt = undefined;
    this.lastFlipAt = -1;
    this.turns.clear();
    this.lastSprints.clear();
    this.finishCarrier(state, 'stoppage');
  }

  private finishCarrier(state: TacticalMatchState, outcome: string) {
    if (!this.carrier) return;
    const { origin, lastHeading: _heading, ...trace } = this.carrier;
    void _heading;
    const actor = state.players.find((p) => p.id === trace.actorId);
    trace.endedAt = state.time;
    trace.netDisplacement = actor ? distance(origin, actor.position) : trace.netDisplacement;
    trace.outcome = outcome;
    this.totals.carrierEpisodes++;
    // Diagnostics only: turning a body can be legitimate even with little forward progress.
    if (trace.netDisplacement < 2 && trace.absoluteRotation >= Math.PI)
      this.totals.rotationOver180LowProgress++;
    if (trace.netDisplacement < 2 && trace.absoluteRotation >= Math.PI * 2)
      this.totals.rotationOver360LowProgress++;
    const degrees = (trace.absoluteRotation * 180) / Math.PI;
    this.totals.turnAngles[degrees < 45 ? 0 : degrees < 180 ? 1 : degrees < 360 ? 2 : 3]!++;
    if (this.traces.length < 12) {
      this.traces.push(trace);
      this.traces.sort((a, b) => a.absoluteRotation - b.absoluteRotation);
    } else if (trace.absoluteRotation > this.traces[0]!.absoluteRotation) {
      this.traces[0] = trace;
      this.traces.sort((a, b) => a.absoluteRotation - b.absoluteRotation);
    }
    this.carrier = undefined;
  }

  observe(previous: TacticalMatchState, next: TacticalMatchState) {
    const dt = Math.max(0, next.time - previous.time);
    if (dt <= 0) {
      if (
        next.scenario !== 'open_play' ||
        ['half_time', 'full_time', 'abandoned'].includes(next.status ?? '')
      )
        this.censorTransitions(previous);
      return;
    }
    const openInterval = previous.scenario === 'open_play' && next.scenario === 'open_play';
    if (openInterval && this.spellStartedAt === undefined) this.spellStartedAt = previous.time;
    const nextPlayers = new Map(next.players.map((p) => [p.id, p]));
    for (const p of previous.players) {
      const q = nextPlayers.get(p.id);
      if (!q) continue;
      let w = this.workloads.get(p.id);
      if (!w) {
        w = {
          playerId: p.id,
          distance: 0,
          walking: 0,
          jogging: 0,
          running: 0,
          sprinting: 0,
          pressingDistance: 0,
          lowEffortSeconds: 0,
          accelerations: 0,
          decelerations: 0,
          sharpTurns: 0,
          sprintStarts: 0,
          repeatEffortsWithin5s: 0,
          sprintIntervals: histogram(),
          bodyContacts: 0,
        };
        this.workloads.set(p.id, w);
      }
      if (!openInterval || previous.discipline?.[p.id]?.sentOff || next.discipline?.[p.id]?.sentOff)
        continue;
      const moved = distance(p.position, q.position);
      const speed = Math.hypot(q.velocity.x, q.velocity.y);
      const oldSpeed = Math.hypot(p.velocity.x, p.velocity.y);
      const intensity =
        q.locomotionIntensity ??
        (speed < 2 ? 'walk' : speed < 4 ? 'jog' : speed < 6 ? 'run' : 'sprint');
      w.distance += moved;
      w[
        intensity === 'walk'
          ? 'walking'
          : intensity === 'jog'
            ? 'jogging'
            : intensity === 'run'
              ? 'running'
              : 'sprinting'
      ] += moved;
      if (q.locomotionReason === 'press_commit' && speed >= 4) w.pressingDistance += moved;
      if (speed < 2) w.lowEffortSeconds += dt;
      // Count threshold crossings, not every 25ms sample of one continuous effort.
      if (speed >= 4 && oldSpeed < 4) w.accelerations++;
      if (speed < 2 && oldSpeed >= 2) w.decelerations++;
      const turn = this.turns.get(p.id) ?? { radians: 0, seconds: 0, quiet: 0, counted: false };
      const headingChange =
        oldSpeed > 1 && speed > 1
          ? Math.abs(
              normalizeAngle(
                Math.atan2(q.velocity.y, q.velocity.x) - Math.atan2(p.velocity.y, p.velocity.x),
              ),
            )
          : 0;
      turn.quiet = headingChange / dt < 0.2 ? turn.quiet + dt : 0;
      if (speed <= 1 || turn.quiet >= 0.25) {
        turn.radians = 0;
        turn.seconds = 0;
        turn.counted = false;
      } else {
        turn.radians = Math.min(Math.PI * 4, turn.radians + headingChange);
        turn.seconds += dt;
        if (!turn.counted && turn.radians >= Math.PI / 3 && turn.radians / turn.seconds >= 0.8) {
          w.sharpTurns++;
          turn.counted = true;
        }
      }
      this.turns.set(p.id, turn);
      if ((q.sprintStartedAt ?? -1) > (p.sprintStartedAt ?? -1)) {
        w.sprintStarts++;
        const last = this.lastSprints.get(p.id);
        if (last !== undefined) {
          record(w.sprintIntervals, next.time - last);
          if (next.time - last <= 5) w.repeatEffortsWithin5s++;
        }
        this.lastSprints.set(p.id, next.time);
      }
    }
    const owner = previous.players.find((p) => p.id === previous.ball.ownerId);
    const movedOwner = owner && nextPlayers.get(owner.id);
    if (owner && movedOwner && openInterval) {
      if (this.carrier?.actorId !== owner.id) {
        this.finishCarrier(previous, 'new_owner');
        this.carrier = {
          actorId: owner.id,
          startedAt: previous.time,
          endedAt: previous.time,
          absoluteRotation: 0,
          netDisplacement: 0,
          travelled: 0,
          ballTravelled: 0,
          maximumAngularVelocity: 0,
          relativeBallSpeed: 0,
          carryRevisions: 0,
          outcome: 'continuing',
          origin: { ...owner.position },
        };
      }
      const c = this.carrier!;
      const rotation = Math.abs(normalizeAngle(movedOwner.facingAngle - owner.facingAngle));
      c.absoluteRotation += rotation;
      c.maximumAngularVelocity = Math.max(c.maximumAngularVelocity, rotation / dt);
      c.travelled += distance(owner.position, movedOwner.position);
      if (next.ball.ownerId === owner.id) {
        c.ballTravelled += distance(previous.ball, next.ball);
        c.relativeBallSpeed = Math.max(
          c.relativeBallSpeed,
          Math.hypot(
            (next.ball.x - previous.ball.x) / dt - movedOwner.velocity.x,
            (next.ball.y - previous.ball.y) / dt - movedOwner.velocity.y,
          ),
        );
      }
      const intent = next.ballCarrierIntent;
      if (
        intent?.actorId === owner.id &&
        intent.startedAt !== previous.ballCarrierIntent?.startedAt
      )
        this.totals.carrySelections++;
      if (intent?.actorId === owner.id) {
        const target = intent.localTarget ?? intent.target;
        const heading = Math.atan2(
          target.y - movedOwner.position.y,
          target.x - movedOwner.position.x,
        );
        if (
          c.lastHeading !== undefined &&
          Math.abs(normalizeAngle(heading - c.lastHeading)) > Math.PI / 2
        ) {
          c.carryRevisions++;
          this.totals.headingReversals++;
        }
        c.lastHeading = heading;
      }
    } else this.finishCarrier(previous, 'released');
    if (owner && next.ball.ownerId !== owner.id)
      this.finishCarrier(
        next,
        next.lastPossessionLoss?.cause ?? (next.ball.travelKind ? 'release' : 'loose'),
      );

    if (previous.possessionTeam !== next.possessionTeam && openInterval) {
      this.totals.possessionSpells++;
      if (next.time - this.spellStartedAt! < 0.5) this.totals.spellsUnderHalfSecond++;
      if (next.time - this.lastFlipAt <= dt + 1e-6) this.totals.adjacentTickFlips++;
      this.spellStartedAt = next.time;
      this.lastFlipAt = next.time;
    }
    const loss = next.lastPossessionLoss;
    if (loss && loss.id !== previous.lastPossessionLoss?.id && openInterval) {
      if (this.losses[loss.from]) this.teamClocks[loss.from].incompleteLosses++;
      this.teamClocks[loss.from].losses++;
      this.losses[loss.from] = { at: loss.at };
      if (this.regains[loss.from]) this.teamClocks[loss.from].censoredRegains++;
      delete this.regains[loss.from];
    }
    const liveCarrier = nextPlayers.get(next.ball.ownerId ?? owner?.id ?? '');
    if (openInterval && liveCarrier) {
      const controlKey = `${liveCarrier.id}:${next.ballOwnershipStartedAt ?? next.ballEpisode ?? 0}`;
      const ballPoint = next.ball.ownerId ? next.ball : (next.ball.from ?? previous.ball);
      const candidates = next.players.filter(
        (p) =>
          p.team !== liveCarrier.team &&
          !next.discipline?.[p.id]?.sentOff &&
          distance(p.position, ballPoint) <= 12 &&
          (p.locomotionReason === 'press_commit' || next.defensiveChallenge?.actorId === p.id),
      );
      const activeIds = new Set(candidates.map((p) => p.id));
      for (const [id, episode] of this.pressures)
        if (!activeIds.has(id) || episode.controlKey !== controlKey) this.pressures.delete(id);
      for (const p of candidates) {
        if (this.pressures.has(p.id)) continue;
        this.pressures.set(p.id, {
          carrierId: liveCarrier.id,
          controlKey,
          originX: liveCarrier.position.x,
          contacted: false,
          escaped: false,
        });
        this.totals.pressureByThird[third(p.position.x, p.team)]!++;
        if (isForward(p) && liveCarrier.slot.position === 'center_back')
          this.totals.forwardOnCentreBackPresses++;
        const pending = this.losses[p.team];
        if (pending && pending.pressureAt === undefined) {
          pending.pressureAt = next.time;
          record(this.teamClocks[p.team].lossToPressure, next.time - pending.at);
        }
      }
    }
    const recovery = next.lastPossessionChange;
    if (
      openInterval &&
      recovery?.winnerId &&
      recovery !== previous.lastPossessionChange &&
      (recovery.at !== previous.lastPossessionChange?.at ||
        recovery.winnerId !== previous.lastPossessionChange?.winnerId)
    ) {
      const pending = this.losses[recovery.to];
      if (pending) {
        const values = this.teamClocks[recovery.to];
        values.regains++;
        record(values.lossToRegain, recovery.at - pending.at);
        if (pending.pressureAt !== undefined)
          record(values.pressureToRegain, recovery.at - pending.pressureAt);
        delete this.losses[recovery.to];
        this.regains[recovery.to] = {
          at: recovery.at,
          originX: next.ball.x,
          progress: false,
          shot: false,
          goal: false,
        };
        this.totals.regainByThird[third(next.ball.x, recovery.to)]!++;
      }
    }
    for (const side of ['home', 'away'] as const) {
      const regain = this.regains[side];
      if (!regain) continue;
      const pass = next.lastPassDiagnostic;
      const passer = pass && nextPlayers.get(pass.passerId);
      const carry = next.ballCarrierIntent;
      const passTarget = pass?.intendedTarget ?? pass?.physicalTarget ?? next.ball.target;
      const passOrigin =
        next.ball.from ?? previous.players.find((p) => p.id === pass?.passerId)?.position;
      const direction = side === 'home' ? 1 : -1;
      if (
        !regain.progress &&
        ((pass?.passId !== previous.lastPassDiagnostic?.passId &&
          passer?.team === side &&
          pass &&
          pass.releasedAt >= regain.at &&
          passTarget &&
          passOrigin &&
          direction * (passTarget.x - passOrigin.x) >= 3) ||
          (carry &&
            nextPlayers.get(carry.actorId)?.team === side &&
            next.ball.ownerId === carry.actorId &&
            direction * (nextPlayers.get(carry.actorId)!.position.x - regain.originX) >= 3))
      ) {
        record(this.teamClocks[side].regainToProgression, next.time - regain.at);
        regain.progress = true;
      }
      const releasedShot =
        next.ball.shot && next.ball.shot.shotId !== previous.ball.shot?.shotId
          ? next.ball.shot
          : next.lastShot?.shotId !== previous.lastShot?.shotId
            ? next.lastShot
            : undefined;
      const releaseAt = releasedShot?.releasedAt;
      if (
        !regain.shot &&
        releasedShot &&
        releaseAt !== undefined &&
        releaseAt >= regain.at &&
        releaseAt >= previous.time &&
        releaseAt <= next.time &&
        nextPlayers.get(releasedShot.shooterId)?.team === side
      ) {
        record(this.teamClocks[side].regainToShot, releaseAt - regain.at);
        regain.shot = true;
      }
      if (!regain.goal && next.score[side] > previous.score[side]) {
        record(this.teamClocks[side].regainToGoal, next.time - regain.at);
        regain.goal = true;
      }
    }
    const challenge = next.lastChallenge;
    this.totals.challengeAttempts += Math.max(
      0,
      (next.defensiveTelemetry?.attempted ?? 0) - (previous.defensiveTelemetry?.attempted ?? 0),
    );
    if (challenge && challenge.id !== previous.lastChallenge?.id) {
      this.totals.resolvedChallenges++;
      if (challenge.ballReachable ?? challenge.ballDistance <= 0.95)
        this.totals.reachableAttempts++;
      if (challenge.opponentContact) {
        this.totals.bodyContacts++;
        const w = this.workloads.get(challenge.actorId);
        if (w) w.bodyContacts++;
      }
      if (challenge.opponentContact || challenge.ballFirst) {
        const episode = this.pressures.get(challenge.actorId);
        if (episode?.carrierId === challenge.opponentId) episode.contacted = true;
      }
    }
    const released = next.lastPassDiagnostic;
    if (
      openInterval &&
      released &&
      released.passId !== previous.lastPassDiagnostic?.passId &&
      [...this.pressures.values()].some((p) => p.carrierId === released.passerId) &&
      ![...this.pressures.values()].some((p) => p.carrierId === released.passerId && p.contacted)
    )
      this.totals.releasesBeforeContact++;
    if (openInterval && next.ball.ownerId)
      for (const [id, episode] of this.pressures) {
        const carrier = nextPlayers.get(episode.carrierId),
          defender = nextPlayers.get(id);
        if (
          !episode.escaped &&
          carrier &&
          defender &&
          next.ball.ownerId === carrier.id &&
          (carrier.team === 'home' ? 1 : -1) * (carrier.position.x - episode.originX) >= 3 &&
          distance(defender.position, next.ball) > 3.5
        ) {
          episode.escaped = true;
          this.totals.progressiveEscapes++;
        }
      }
    if (next.time - this.lastProbeAt >= 0.5 && next.scenario === 'open_play' && next.ball.ownerId) {
      this.lastProbeAt = next.time;
      const carrier = nextPlayers.get(next.ball.ownerId)!;
      const side = carrier.team === 'home' ? 'away' : 'home';
      const direction = carrier.team === 'home' ? 1 : -1;
      const defenders = next.players.filter(
        (p) =>
          p.team === side && p.slot.position !== 'goalkeeper' && !next.discipline?.[p.id]?.sentOff,
      );
      // Proxy for central-lane containment, not proof of an intercepted pass.
      if (
        defenders.some(
          (p) =>
            p.locomotionReason === 'contain' &&
            Math.abs(p.position.y - 34) <= 10 &&
            direction * (p.position.x - carrier.position.x) > 0 &&
            distance(p.position, carrier.position) <= 18,
        )
      )
        this.totals.screenedCentralLaneSamples++;
      if (
        next.teams[side].phase === 'defensive_transition' &&
        defenders.filter(
          (p) =>
            direction * (p.position.x - carrier.position.x) > 0 &&
            Math.abs(p.position.y - carrier.position.y) < 15,
        ).length <= 1
      )
        this.totals.exposedTransitionSamples++;
    }
    if (!openInterval || ['half_time', 'full_time', 'abandoned'].includes(next.status ?? '')) {
      this.censorTransitions(previous);
    }
  }

  snapshot(state?: TacticalMatchState) {
    const totals = structuredClone(this.totals);
    const traces = this.traces.slice();
    if (state && this.carrier) {
      const { origin, lastHeading: _heading, ...active } = this.carrier;
      void _heading;
      const actor = state.players.find((p) => p.id === active.actorId);
      const trace = {
        ...active,
        endedAt: state.time,
        netDisplacement: actor ? distance(origin, actor.position) : active.netDisplacement,
        outcome: 'observation_end',
      };
      totals.carrierEpisodes++;
      if (trace.netDisplacement < 2 && trace.absoluteRotation >= Math.PI)
        totals.rotationOver180LowProgress++;
      if (trace.netDisplacement < 2 && trace.absoluteRotation >= Math.PI * 2)
        totals.rotationOver360LowProgress++;
      const degrees = (trace.absoluteRotation * 180) / Math.PI;
      totals.turnAngles[degrees < 45 ? 0 : degrees < 180 ? 1 : degrees < 360 ? 2 : 3]!++;
      traces.push(trace);
      traces.sort((a, b) => b.absoluteRotation - a.absoluteRotation);
      traces.splice(12);
    }
    const clockValues = structuredClone(this.teamClocks);
    for (const side of ['home', 'away'] as const)
      if (this.losses[side]) clockValues[side].incompleteLosses++;
    return contactTacticalSummarySchema.parse({
      ...totals,
      clocks: clockValues,
      workload: [...this.workloads.values()],
      rotationTraces: traces,
    });
  }
}
