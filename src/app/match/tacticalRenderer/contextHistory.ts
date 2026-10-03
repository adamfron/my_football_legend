import type { TacticalMatchState } from '../../../core/matchSimulation/matchState';
import { observeAnimationCues, projectPlayerPreparation } from './frameProjection';
import type { AnimationCue, TacticalFrame } from './model';
import { sampleReplayFrame } from './replay';
import { frameActionEvents, frameDismissals } from './actionFeedback';

export const CONTEXT_SAMPLE_SECONDS = 0.1;
export const CONTEXT_HISTORY_SECONDS = 6;
export const CONTEXT_MAX_SAMPLES = 62;

/** Lightweight observation, including hidden ticks. No renderer, posing, gait integration or RNG.
 * Only one previous canonical reference and <=62 compact frames are retained. */
export class PresentationContextHistory {
  private frames: TacticalFrame[] = [];
  private previous: TacticalMatchState | undefined;
  private cues = new Map<string, AnimationCue>();
  private continuity = 0;
  samplesWritten = 0;
  sampleWorkMs = 0;

  observe(state: TacticalMatchState, force = false) {
    const last = this.frames.at(-1);
    if (this.previous && (state.seed !== this.previous.seed || state.time < this.previous.time)) {
      this.frames = [];
      this.cues.clear();
      this.continuity++;
    }
    if (
      !force &&
      last &&
      state.time * 1000 - last.timestampMs < CONTEXT_SAMPLE_SECONDS * 1000 - 0.01
    )
      return;
    const started = performance.now();
    if (
      this.previous &&
      (state.time - this.previous.time > 0.15 ||
        (state.restart?.phase === 'setup' &&
          (state.restart.startedAt !== this.previous.restart?.startedAt ||
            this.previous.restart?.phase !== 'setup')))
    )
      this.continuity++;
    for (const [id, cue] of observeAnimationCues(this.previous, state)) this.cues.set(id, cue);
    for (const [id, cue] of this.cues) if (state.time * 1000 - cue.atMs > 900) this.cues.delete(id);
    const frame: TacticalFrame = {
      timestampMs: state.time * 1000,
      actionEvents: frameActionEvents(state.actionEvents ?? [], state.time * 1000),
      dismissals: frameDismissals(state),
      continuity: `context:${state.seed}:${this.continuity}`,
      ball: {
        x: state.ball.x,
        y: state.ball.y,
        height: state.ball.height ?? 0,
        ownerId: state.ball.ownerId,
      },
      players: state.players.map((player) => {
        return {
          id: player.id,
          team: player.team,
          x: player.position.x,
          y: player.position.y,
          facing: player.facingAngle,
          protagonist: player.id === state.controlledFootballerId,
          goalkeeper: player.profile.primaryPosition === 'goalkeeper',
          displayNumber: player.slotIndex + 1,
          velocity: { ...player.velocity },
          heightCm: player.profile.heightCm,
          weightKg: player.profile.weightKg,
          dominantFoot: player.profile.dominantFoot,
          cue: this.cues.get(player.id),
          ...projectPlayerPreparation(state, player.id),
        };
      }),
    };
    if (this.frames.at(-1)?.timestampMs === frame.timestampMs)
      this.frames[this.frames.length - 1] = frame;
    else this.frames.push(frame);
    while (
      this.frames.length > CONTEXT_MAX_SAMPLES ||
      (this.frames.length > 1 &&
        frame.timestampMs - this.frames[0]!.timestampMs > CONTEXT_HISTORY_SECONDS * 1000)
    )
      this.frames.shift();
    this.previous = state;
    this.samplesWritten++;
    this.sampleWorkMs += performance.now() - started;
  }
  leadIn(boundaryTime: number, requestedSeconds: number): TacticalFrame[] {
    const startMs = (boundaryTime - requestedSeconds) * 1000;
    const first = this.frames.findIndex((f) => f.timestampMs >= startMs);
    return this.frames
      .slice(Math.max(0, first - 1))
      .filter((f) => f.timestampMs <= boundaryTime * 1000);
  }
  sample(atMs: number) {
    return sampleReplayFrame(this.frames, atMs);
  }
  snapshot() {
    return {
      samplesRetained: this.frames.length,
      samplesWritten: this.samplesWritten,
      sampleWorkMs: this.sampleWorkMs,
      sampleHz: 10,
      capacity: CONTEXT_MAX_SAMPLES,
    };
  }
}
