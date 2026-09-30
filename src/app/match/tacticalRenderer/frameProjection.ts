import { matchStateToFrame } from '../../../core/matchSimulation/matchSimulation';
import type { TacticalMatchState } from '../../../core/matchSimulation/matchState';
import { CUE_DURATION_MS } from './animation';
import type { AnimationCue, TacticalFrame, TacticalPlayer } from './model';

/** Observe completed transitions, including contacts without their own timestamp. No resolvers. */
export const observeAnimationCues = (
  previous: TacticalMatchState | undefined,
  state: TacticalMatchState,
): Map<string, AnimationCue> => {
  const cues = new Map<string, AnimationCue>();
  const atMs = state.time * 1000;
  const ball = state.ball;
  if (
    ball.travelKind &&
    ball.lastTouchPlayerId &&
    ball.flightTime !== undefined &&
    (!previous ||
      previous.ball.launchVelocity !== ball.launchVelocity ||
      previous.ball.travelKind !== ball.travelKind)
  ) {
    const actor = state.players.find((p) => p.id === ball.lastTouchPlayerId);
    const shot = ball.shot?.shooterId === ball.lastTouchPlayerId ? ball.shot : undefined;
    const kind: AnimationCue['kind'] =
      ball.travelKind === 'throw_in'
        ? 'throw'
        : shot?.contact === 'header' || ball.sourceAction === 'header'
          ? 'header'
          : ball.sourceAction === 'shot'
            ? 'shot'
            : ball.sourceAction === 'cross'
              ? 'cross'
              : actor?.profile.primaryPosition === 'goalkeeper'
                ? 'distribution'
                : 'pass';
    cues.set(ball.lastTouchPlayerId, {
      kind,
      atMs: Math.max(0, atMs - ball.flightTime * 1000),
      // Canonical evidence also survives historical context/replay sampling. Later action
      // feedback may use kind; style/contact merely select a cosmetic follow-through.
      ...(shot
        ? {
            shotIntent: shot.intent,
            shotContact: shot.contact,
            firstTime: shot.firstTime,
            contactHeight: shot.ballHeightAtContact,
          }
        : {}),
    });
  }
  if (
    previous &&
    state.lastReceptionOutcome &&
    state.lastReceptionOutcome !== previous.lastReceptionOutcome &&
    !cues.has(state.lastReceptionOutcome.receiverId)
  ) {
    cues.set(state.lastReceptionOutcome.receiverId, {
      kind: 'receive',
      atMs: (state.lastPassDiagnostic?.resolvedAt ?? state.time) * 1000,
    });
  }
  const aerial = state.lastAerialContact;
  if (previous && aerial && aerial !== previous.lastAerialContact) {
    for (const id of aerial.contestantIds) {
      const keeper =
        state.players.find((p) => p.id === id)?.profile.primaryPosition === 'goalkeeper';
      const kind =
        id !== aerial.winnerId
          ? 'contest'
          : keeper
            ? state.lastAerialResult === 'keeper_claim'
              ? 'catch'
              : 'high_save'
            : 'header';
      cues.set(id, { ...cues.get(id), kind, atMs, contactHeight: aerial.ballHeight });
    }
  }
  const contact = state.lastBallContact;
  if (contact?.kind === 'goalkeeper' && contact.playerId && contact !== previous?.lastBallContact) {
    const keeper = state.players.find((p) => p.id === contact.playerId);
    const side = keeper
      ? Math.sign(
          (contact.point.x - keeper.position.x) * Math.cos(keeper.facingAngle) -
            (contact.point.y - keeper.position.y) * Math.sin(keeper.facingAngle),
        )
      : 0;
    cues.set(contact.playerId, {
      kind:
        state.lastShot?.goalkeeperAction === 'catch'
          ? 'catch'
          : contact.point.z < 0.8
            ? 'low_save'
            : 'high_save',
      atMs: contact.at * 1000,
      contactHeight: contact.point.z,
      side,
    });
  }
  return cues;
};

/** Bounded observation memory: one cue and gait accumulator per player. Saved into replay frames. */
export class PresentationFrameProjector {
  private previous: TacticalMatchState | undefined;
  private cues = new Map<string, AnimationCue>();
  private gait = new Map<string, { phase: number; speed: number }>();
  private continuity = 0;

  reset() {
    this.previous = undefined;
    this.cues.clear();
    this.gait.clear();
    this.continuity++;
  }

  observe(state: TacticalMatchState) {
    if (state === this.previous) return;
    if (
      this.previous &&
      (state.seed !== this.previous.seed ||
        state.time < this.previous.time ||
        state.time - this.previous.time > 0.15 ||
        (state.restart?.phase === 'setup' &&
          (state.restart.startedAt !== this.previous.restart?.startedAt ||
            this.previous.restart?.phase !== 'setup' ||
            state.scenario !== this.previous.scenario)))
    )
      this.reset();
    const dt = this.previous ? Math.max(0, Math.min(0.1, state.time - this.previous.time)) : 0;
    for (const [id, cue] of observeAnimationCues(this.previous, state)) this.cues.set(id, cue);
    for (const [id, cue] of this.cues)
      if (state.time * 1000 - cue.atMs > CUE_DURATION_MS) this.cues.delete(id);
    for (const player of state.players) {
      const speed = Math.hypot(player.velocity.x, player.velocity.y);
      const old = this.gait.get(player.id);
      // Phase integrates measured canonical speed, never moves a player. Cadence is metres/stride.
      this.gait.set(player.id, {
        phase:
          (old?.phase ?? 0) + ((dt * speed) / (1.25 + Math.min(speed, 8) * 0.18)) * Math.PI * 2,
        speed: old ? old.speed + (speed - old.speed) * (1 - Math.exp(-dt / 0.09)) : speed,
      });
    }
    this.previous = state;
  }

  frame(
    state: TacticalMatchState,
    options: { includeAiCarryTarget?: boolean } = {},
  ): TacticalFrame {
    this.observe(state);
    const frame = matchStateToFrame(state, options);
    return {
      ...frame,
      continuity: `${state.seed}:${this.continuity}`,
      players: frame.players.map((player, index): TacticalPlayer => {
        const canonical = state.players[index]!;
        const preparation =
          state.scenario === 'throw_in' &&
          state.restart?.phase === 'setup' &&
          state.restart.takerId === player.id
            ? 'throw'
            : state.keeperIntervention?.keeperId === player.id &&
                state.keeperIntervention.intention !== 'stay'
              ? state.ball.shot && Math.hypot(canonical.velocity.x, canonical.velocity.y) > 0.5
                ? (state.ball.height ?? 0) < 0.8
                  ? 'save_low'
                  : 'save_high'
                : 'claim'
              : state.receptionPreparation?.actorId === player.id &&
                  state.time >= state.receptionPreparation.awarenessAt
                ? 'receive'
                : undefined;
        return {
          ...player,
          velocity: { ...canonical.velocity },
          heightCm: canonical.profile.heightCm,
          weightKg: canonical.profile.weightKg,
          dominantFoot: canonical.profile.dominantFoot,
          gaitPhase: this.gait.get(player.id)?.phase ?? 0,
          gaitSpeed: this.gait.get(player.id)?.speed ?? 0,
          cue: this.cues.get(player.id),
          preparation,
          preparationSide: Math.sign(
            canonical.velocity.x * Math.cos(canonical.facingAngle) -
              canonical.velocity.y * Math.sin(canonical.facingAngle),
          ),
          preparationSinceMs: preparation === 'throw' ? state.restart!.startedAt * 1000 : undefined,
        };
      }),
    };
  }
}
