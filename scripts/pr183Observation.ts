import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { attacksRight, distance } from '../src/core/matchSimulation/matchSpace';
import { isMatchGoalkeeper } from '../src/core/matchSimulation/matchGoalkeeper';

/** Read-only bounded aggregate and event observation. Never supplies simulation state or RNG. */
export class RealismEvidence {
  private windows = new Map<
    number,
    {
      attempts: number;
      forward: number;
      backward: number;
      lateral: number;
      metres: number;
      reciprocal: number;
      midfieldReceptions: number;
    }
  >();
  private passIds = new Set<string>();
  private lastPass?: { actor: string; receiver: string; at: number };
  private active?: {
    id: string;
    team: string;
    at: number;
    origin: { x: number; y: number };
    end: { x: number; y: number };
    dir: number;
    teammateMetres: number;
    speedSum: number;
    targetChanges: number;
    samples: number;
    pressureSum: number;
  };
  private retreats: object[] = [];
  private shots = new Map<string, Record<string, unknown>>();
  private challengeIds = new Set<string>();
  private challenges: object[] = [];
  private flips = 0;
  private pingPong = 0;
  private lastTransfer?: { from: string; to: string; at: number; point: { x: number; y: number } };
  private lastSample = -1;
  private sampledBodies = new Map<
    string,
    { position: { x: number; y: number }; target: { x: number; y: number } }
  >();
  private keeperMovement = 0;
  private finish(at: number) {
    const a = this.active;
    if (a && (a.origin.x - a.end.x) * a.dir > 6 && at - a.at >= 3)
      this.retreats.push({
        ...a,
        endAt: at,
        retreatMetres: (a.origin.x - a.end.x) * a.dir,
        meanTeammateSpeed: a.speedSum / Math.max(1, a.samples),
        meanPressure: a.pressureSum / Math.max(1, a.samples / 10),
      });
  }
  observe(previous: TacticalMatchState, next: TacticalMatchState) {
    const pass = next.lastPassDiagnostic;
    if (pass && !this.passIds.has(pass.passId)) {
      this.passIds.add(pass.passId);
      const index = Math.floor(pass.releasedAt / 300);
      const w = this.windows.get(index) ?? {
        attempts: 0,
        forward: 0,
        backward: 0,
        lateral: 0,
        metres: 0,
        reciprocal: 0,
        midfieldReceptions: 0,
      };
      const actor = previous.players.find((p) => p.id === pass.passerId);
      const action = next.latestAction;
      if (actor && action?.type === 'pass') {
        const delta = (action.target.x - actor.position.x) * (attacksRight(actor) ? 1 : -1);
        w.attempts++;
        w[delta > 3 ? 'forward' : delta < -3 ? 'backward' : 'lateral']++;
        w.metres += distance(actor.position, action.target);
        if (
          this.lastPass?.actor === action.receiverId &&
          this.lastPass.receiver === actor.id &&
          pass.releasedAt - this.lastPass.at < 10
        )
          w.reciprocal++;
        if (
          next.players.find((p) => p.id === action.receiverId)?.slot.position ===
          'central_midfielder'
        )
          w.midfieldReceptions++;
        this.lastPass = { actor: actor.id, receiver: action.receiverId, at: pass.releasedAt };
      }
      this.windows.set(index, w);
    }
    const owner = next.players.find((p) => p.id === next.ball.ownerId);
    if (owner?.id !== this.active?.id) {
      this.finish(previous.time);
      this.active = owner
        ? {
            id: owner.id,
            team: owner.team,
            at: next.time,
            origin: { ...owner.position },
            end: { ...owner.position },
            dir: attacksRight(owner) ? 1 : -1,
            teammateMetres: 0,
            speedSum: 0,
            targetChanges: 0,
            samples: 0,
            pressureSum: 0,
          }
        : undefined;
    }
    if (owner && this.active) this.active.end = { ...owner.position };
    if (next.time - this.lastSample >= 0.5) {
      this.lastSample = next.time;
      for (const p of next.players) {
        const old = this.sampledBodies.get(p.id);
        this.sampledBodies.set(p.id, { position: { ...p.position }, target: { ...p.target } });
        if (!old) continue;
        if (isMatchGoalkeeper(p)) this.keeperMovement += distance(old.position, p.position);
        if (this.active && p.id !== this.active.id && p.team === this.active.team) {
          this.active.teammateMetres += distance(old.position, p.position);
          this.active.speedSum += Math.hypot(p.velocity.x, p.velocity.y);
          this.active.targetChanges += distance(old.target, p.target) > 0.25 ? 1 : 0;
          this.active.samples++;
        }
      }
      if (this.active) this.active.pressureSum += next.currentPressure;
    }
    if (previous.ball.ownerId && next.ball.ownerId && previous.ball.ownerId !== next.ball.ownerId) {
      this.flips++;
      if (
        this.lastTransfer?.from === next.ball.ownerId &&
        this.lastTransfer.to === previous.ball.ownerId &&
        next.time - this.lastTransfer.at <= 0.1 &&
        distance(next.ball, this.lastTransfer.point) < 1
      )
        this.pingPong++;
      this.lastTransfer = {
        from: previous.ball.ownerId,
        to: next.ball.ownerId,
        at: next.time,
        point: { x: next.ball.x, y: next.ball.y },
      };
    }
    const challenge = next.lastChallenge;
    if (challenge && !this.challengeIds.has(challenge.id)) {
      this.challengeIds.add(challenge.id);
      this.challenges.push({ ...challenge, lastTouchPlayerId: next.ball.lastTouchPlayerId });
    }
    const shot =
      next.ball.shot ?? (next.lastShot?.releasedAt === next.time ? next.lastShot : undefined);
    if (shot && !this.shots.has(shot.shotId)) {
      const shooter = next.players.find((p) => p.id === shot.shooterId);
      const keeper = next.players.find((p) => p.team !== shooter?.team && isMatchGoalkeeper(p));
      this.shots.set(shot.shotId, {
        shot,
        shooterAttributes: shooter?.profile.attributes,
        keeperId: keeper?.id,
        keeperAttributes: keeper?.profile.attributes,
        keeperStart: keeper?.position,
        status: 'unresolved',
      });
    }
    if (next.lastShot && next.lastShot.outcome) {
      const r = this.shots.get(next.lastShot.shotId);
      if (r) {
        r.status = next.lastShot.outcome;
        r.result = next.lastShot;
        r.keeperEnd = next.players.find((p) => p.id === r.keeperId)?.position;
        r.contact = next.lastBallContact;
      }
    }
    if (previous.ball.shot && !next.ball.shot) {
      const r = this.shots.get(previous.ball.shot.shotId);
      if (r?.status === 'unresolved') {
        r.status = 'censored';
        r.interruption = next.scenario;
        r.at = next.time;
      }
    }
  }
  export(state: TacticalMatchState) {
    this.finish(state.time);
    return {
      definitions:
        'Whole-tick continuous owner episodes: >6m own-goal displacement and >=3s; adjacent ownership flips are descriptive, not automatic invalid-contact findings. Five-minute passes use release geometry; midfield invitations are not confirmed completions.',
      windows: [...this.windows].map(([index, data]) => ({ index, ...data })),
      retreats: this.retreats,
      ownership: {
        adjacentTickFlips: this.flips,
        stationaryPairReversalsWithin100ms: this.pingPong,
      },
      challenges: this.challenges,
      shots: [...this.shots.values()],
      keeperMovementSampledMetres: this.keeperMovement,
    };
  }
}
