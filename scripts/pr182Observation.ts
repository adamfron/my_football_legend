import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { attacksRight, distance } from '../src/core/matchSimulation/matchSpace';
import { secondLastOpponentLine } from '../src/core/matchSimulation/offside';
import { projectMatchCentreStatistics } from '../src/core/matchSimulation/matchCentreStatistics';
import { isMatchGoalkeeper } from '../src/core/matchSimulation/matchGoalkeeper';

/** PR181 lineage rules, observed during the primary run rather than a second match.
 * Full physical pass diagnostics distinguish intended space from actual reception. */
export class PolicyLineageEvidence {
  shots = new Map<
    string,
    {
      shot: NonNullable<TacticalMatchState['lastShot']>;
      release: unknown;
      samples: unknown[];
      sampledAt: number;
    }
  >();
  crosses: unknown[] = [];
  crossCounts = {
    releases: 0,
    intendedPenaltyArea: 0,
    intendedOutsidePenaltyArea: 0,
    unknownTarget: 0,
    openPlay: 0,
    setPiece: 0,
    openPlayOutsidePenaltyArea: 0,
    setPieceOutsidePenaltyArea: 0,
    omittedDetails: 0,
  };
  passes = new Map<
    string,
    {
      team: string;
      passerId: string;
      intendedReceiverId: string;
      targetBehind: boolean;
      snapshotMatched: boolean;
      target: { x: number; y: number };
      line: number;
      dir: number;
      releasedAt: number;
      outcome?: string;
      actualReceiverId?: string;
      contactBeyondReleaseLine?: boolean;
      contactBeyondCurrentDefence?: boolean;
      contact?: { x: number; y: number };
      origin: { x: number; y: number };
      receiverPosition?: string;
      receiverRole?: string;
    }
  >();
  windows: {
    side: 'home' | 'away';
    at: number;
    decision: unknown;
    before: ReturnType<typeof projectMatchCentreStatistics>['home'];
    players: { id: string; position: { x: number; y: number }; target: { x: number; y: number } }[];
    after?: unknown;
  }[] = [];
  observe(previous: TacticalMatchState, state: TacticalMatchState) {
    const shot = state.ball.shot ?? state.lastShot;
    if (shot) {
      let row = this.shots.get(shot.shotId);
      if (!row) {
        const shooter =
          state.players.find((p) => p.id === shot.shooterId) ??
          previous.players.find((p) => p.id === shot.shooterId);
        row = {
          shot,
          release: {
            from: state.ball.from ?? previous.ball,
            shooter: shooter
              ? {
                  id: shooter.id,
                  position: shooter.position,
                  facing: shooter.facingAngle,
                  attributes: shooter.profile.attributes,
                }
              : null,
            keepers: previous.players.filter(isMatchGoalkeeper).map((p) => ({
              id: p.id,
              team: p.team,
              position: p.position,
              velocity: p.velocity,
              facing: p.facingAngle,
              attributes: p.profile.attributes,
            })),
            defenders: previous.players
              .filter((p) => p.team !== shooter?.team)
              .map((p) => ({ id: p.id, position: p.position, velocity: p.velocity })),
          },
          samples: [],
          sampledAt: -1,
        };
        this.shots.set(shot.shotId, row);
      }
      if (shot.outcome || !row.shot.outcome) row.shot = shot;
      if (
        state.ball.shot?.shotId === shot.shotId &&
        state.time - row.sampledAt >= 0.1 &&
        row.samples.length < 20
      ) {
        row.sampledAt = state.time;
        row.samples.push({
          at: state.time,
          ball: { x: state.ball.x, y: state.ball.y, height: state.ball.height },
          keepers: state.players.filter(isMatchGoalkeeper).map((p) => ({
            id: p.id,
            position: p.position,
            velocity: p.velocity,
            target: p.target,
          })),
          intervention: state.keeperIntervention,
        });
      }
    }
    for (const e of state.actionEvents ?? []) {
      if (e.sequence < (previous.actionEventSequence ?? 0) || e.kind !== 'cross') continue;
      this.crossCounts.releases++;
      const actor = previous.players.find((p) => p.id === e.actorId);
      const selected =
        state.latestAction?.type === 'cross' && state.latestAction.actorId === e.actorId
          ? state.latestAction
          : undefined;
      const target = selected?.target ?? state.ball.target;
      const setPiece = ['free_kick_delivery', 'corner_delivery'].includes(state.ball.travelKind ?? '') ||
        Boolean(previous.restart && previous.restart.phase !== 'release');
      if (setPiece) this.crossCounts.setPiece++; else this.crossCounts.openPlay++;
      const inBox =
        actor &&
        target &&
        (attacksRight(actor) ? target.x > 88.5 : target.x < 16.5) &&
        Math.abs(target.y - 34) < 20.16;
      if (!actor || !target) this.crossCounts.unknownTarget++;
      else if (inBox) this.crossCounts.intendedPenaltyArea++;
      else this.crossCounts.intendedOutsidePenaltyArea++;
      if (actor && target && !inBox) {
        if (setPiece) this.crossCounts.setPieceOutsidePenaltyArea++;
        else this.crossCounts.openPlayOutsidePenaltyArea++;
      }
      const receiver = state.players.find((p) => p.id === state.ball.intendedReceiverId);
      if (this.crosses.length < 256)
        this.crosses.push({
          id: e.id,
          at: e.at,
          from: e.position,
          intendedTarget: target,
          physicalTarget: state.ball.target,
          targetSource: selected ? 'selected_action' : 'physical_flight_fallback',
          scenario: previous.scenario,
          travelKind: state.ball.travelKind,
          setPiece,
          deliveryIntent: selected?.intent,
          intendedPenaltyArea: Boolean(inBox),
          receiver: receiver
            ? {
                id: receiver.id,
                role: state.rolePlan?.assignments[receiver.id],
                position: receiver.position,
                velocity: receiver.velocity,
                target: receiver.target,
              }
            : null,
        });
      else this.crossCounts.omittedDetails++;
    }
    for (const p of [state.lastPassDiagnostic, state.lastResolvedPass]) {
      if (!p) continue;
      let r = this.passes.get(p.passId);
      if (!r) {
        const actor =
          state.players.find((a) => a.id === p.passerId) ??
          previous.players.find((a) => a.id === p.passerId);
        if (!actor) throw Error('Unattributed pass');
        const dir = attacksRight(actor) ? 1 : -1;
        const snapshot = state.offsideSnapshot;
        const matched = Boolean(
          snapshot &&
            snapshot.passerId === p.passerId &&
            Math.abs(snapshot.releasedAt - p.releasedAt) < 1e-6,
        );
        const raw = matched
          ? snapshot!.offsideLineX
          : dir > 0
            ? Math.max(previous.ball.x, secondLastOpponentLine(previous, actor.team))
            : Math.min(previous.ball.x, secondLastOpponentLine(previous, actor.team));
        const line = dir > 0 ? Math.max(52.5, raw) : Math.min(52.5, raw);
        const target = p.physicalTarget ?? p.predictedReceptionPoint;
        r = {
          team: actor.team,
          passerId: actor.id,
          intendedReceiverId: p.intendedReceiverId,
          target,
          dir,
          line,
          releasedAt: p.releasedAt,
          origin: state.ball.from ?? actor.position,
          targetBehind: dir * (target.x - line) > 0.5,
          snapshotMatched: matched,
        };
        this.passes.set(p.passId, r);
      }
      if (p.finalResult && !r.outcome) {
        r.outcome = p.finalResult;
        if (p.actualReceiverId) {
          r.actualReceiverId = p.actualReceiverId;
          const receiver =
            state.players.find((a) => a.id === p.actualReceiverId) ??
            previous.players.find((a) => a.id === p.actualReceiverId);
          if (receiver) r.receiverPosition = receiver.slot.position;
          const role = state.rolePlan?.assignments[p.actualReceiverId];
          if (role) r.receiverRole = role;
        }
        if (p.actualContactPoint) {
          r.contact = p.actualContactPoint;
          r.contactBeyondReleaseLine = r.dir * (r.contact.x - r.line) > 0.5;
          r.contactBeyondCurrentDefence =
            r.dir * (r.contact.x - secondLastOpponentLine(state, r.team as 'home' | 'away')) > 0.5;
        }
      }
    }
    for (const side of ['home', 'away'] as const) {
      const decision = state.teams[side].coaching?.decisions.at(-1);
      const before = previous.teams[side].coaching?.decisions.at(-1);
      if (decision?.changed && decision.at !== before?.at && this.windows.length < 48)
        this.windows.push({
          side,
          at: state.time,
          decision,
          before: projectMatchCentreStatistics(previous)[side],
          players: state.players
            .filter((p) => p.team === side)
            .map((p) => ({ id: p.id, position: p.position, target: p.target })),
        });
    }
    for (const w of this.windows) {
      if (w.after || state.time - w.at < 30) continue;
      const after = projectMatchCentreStatistics(state)[w.side];
      w.after = {
        at: state.time,
        official: after,
        additionalShots: after.shots - w.before.shots,
        additionalPasses: after.passesAttempted - w.before.passesAttempted,
        players: w.players.map((p) => {
          const now = state.players.find((a) => a.id === p.id);
          return {
            id: p.id,
            position: now?.position,
            target: now?.target,
            displacement: now ? distance(p.position, now.position) : null,
          };
        }),
      };
    }
  }
  export(state: TacticalMatchState) {
    const records = [...this.passes.values()];
    const completed = records.filter(
      (r) => r.outcome === 'completed' && r.actualReceiverId !== r.passerId,
    );
    const targeted = records.filter((r) => r.targetBehind);
    const receptionsByPosition = Object.fromEntries(
      [...new Set(completed.map((r) => r.receiverPosition ?? 'unknown'))].map((key) => [
        key,
        completed.filter((r) => (r.receiverPosition ?? 'unknown') === key).length,
      ]),
    );
    const receptionsByRole = Object.fromEntries(
      [...new Set(completed.map((r) => r.receiverRole ?? 'unknown'))].map((key) => [
        key,
        completed.filter((r) => (r.receiverRole ?? 'unknown') === key).length,
      ]),
    );
    const official = projectMatchCentreStatistics(state);
    if (completed.length !== official.home.passesCompleted + official.away.passesCompleted)
      throw Error('Lineage/official completion mismatch');
    return {
      definitions:
        'PR181 >0.5m behind legal defender/ball/halfway release line; exclude self-recovery from official completion. Snapshot fallbacks are explicitly counted. Thirty-second post-change windows are temporal consequences, not causal treatment effects.',
      summary: {
        attempts: records.length,
        completed: completed.length,
        targetedBehind: targeted.length,
        completedBeyondReleaseLine: completed.filter(
          (r) => r.targetBehind && r.contactBeyondReleaseLine,
        ).length,
        completedBeforeReleaseLine: completed.filter(
          (r) => r.targetBehind && !r.contactBeyondReleaseLine,
        ).length,
        completedBeyondCurrentDefence: completed.filter(
          (r) => r.targetBehind && r.contactBeyondCurrentDefence,
        ).length,
        snapshotFallbacks: records.filter((r) => !r.snapshotMatched).length,
        failedTargeted: targeted.filter((r) => r.outcome && r.outcome !== 'completed').length,
        unresolvedTargeted: targeted.filter((r) => !r.outcome).length,
        controlledForwardMetres: completed.reduce(
          (n, r) => n + Math.max(0, r.dir * ((r.contact?.x ?? r.origin.x) - r.origin.x)),
          0,
        ),
        centralMidfieldReceptions: receptionsByPosition.central_midfielder ?? 0,
      },
      receptionsByPosition,
      receptionsByRole,
      targetedPasses: targeted,
      shotLineage: [...this.shots.values()],
      crossCounts: this.crossCounts,
      crosses: this.crosses,
      adaptationWindows: this.windows,
    };
  }
}
