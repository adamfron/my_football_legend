import type { TacticalMatchState } from '../../../core/matchSimulation/matchState';
import {
  canonicalBallPresentation,
  projectPresentationPlayers,
  projectCanonicalPlayerPresentation,
  presentationDiscontinuity,
  ballPresentationDiscontinuity,
  importantPresentationChange,
  RELEASE_PRESENTATION_DURATION_MS,
} from '../../../core/matchSimulation/canonicalPresentation';
import { captureReplaySnapshot } from '../../../core/matchSimulation/matchReplay';
import { isMatchGoalkeeper } from '../../../core/matchSimulation/matchGoalkeeper';
import {
  observeAnimationCues,
  projectPlayerPreparation,
  projectRestartPresentation,
} from './frameProjection';
import type { AnimationCue, TacticalFrame } from './model';
import { sampleReplayFrame, replaySnapshotToFrame } from './replay';
import { frameActionEvents, frameDismissals } from './actionFeedback';

export const CONTEXT_SAMPLE_SECONDS = 0.1;
export const CONTEXT_HISTORY_SECONDS = 6;
export const CONTEXT_MAX_SAMPLES = 128;

/** Lightweight observation, including hidden ticks. No renderer, posing, gait integration or RNG.
 * Only one previous canonical reference and <=128 compact frames are retained. */
export class PresentationContextHistory {
  private frames: TacticalFrame[] = [];
  private previous: TacticalMatchState | undefined;
  private cues = new Map<string, AnimationCue>();
  private continuity = 0;
  samplesWritten = 0;
  sampleWorkMs = 0;

  observe(state: TacticalMatchState, force = false) {
    let previous = this.previous;
    let last = this.frames.at(-1);
    if (this.previous && (state.seed !== this.previous.seed || state.time < this.previous.time)) {
      this.frames = [];
      this.cues.clear();
      this.continuity++;
      this.previous = undefined;
      previous = undefined;
      last = undefined;
    }
    const keyframe = importantPresentationChange(this.previous, state);
    const previousCues = keyframe ? new Map(this.cues) : undefined;
    for (const [id, cue] of observeAnimationCues(this.previous, state)) this.cues.set(id, cue);
    for (const [id, cue] of this.cues)
      if (state.time * 1000 - cue.atMs >= RELEASE_PRESENTATION_DURATION_MS) this.cues.delete(id);
    if (
      !force &&
      !keyframe &&
      last &&
      state.time * 1000 - last.timestampMs < CONTEXT_SAMPLE_SECONDS * 1000 - 0.01
    ) {
      this.previous = state;
      return;
    }
    const started = performance.now();
    if (
      this.previous &&
      (state.time - this.previous.time > 0.15 ||
        state.players.length !== this.previous.players.length ||
        (state.restart?.phase === 'setup' &&
          (state.restart.startedAt !== this.previous.restart?.startedAt ||
            this.previous.restart?.phase !== 'setup')))
    )
      this.continuity++;
    if (
      keyframe &&
      previous &&
      previous.time < state.time &&
      last?.timestampMs !== previous.time * 1000
    ) {
      const before = replaySnapshotToFrame(
        captureReplaySnapshot(previous, this.continuity, undefined, true),
      );
      this.frames.push({
        ...before,
        players: before.players.map((player) => {
          const cue = previousCues?.get(player.id);
          return cue &&
            cue.atMs <= before.timestampMs &&
            before.timestampMs - cue.atMs < RELEASE_PRESENTATION_DURATION_MS
            ? { ...player, cue: { ...cue } }
            : player;
        }),
        continuity: `context:${state.seed}:${this.continuity}:${presentationDiscontinuity(previous)}`,
      });
    }
    const frame: TacticalFrame = {
      timestampMs: state.time * 1000,
      actionEvents: structuredClone(frameActionEvents(state.actionEvents ?? [], state.time * 1000)),
      dismissals: frameDismissals(state),
      continuity: `context:${state.seed}:${this.continuity}:${presentationDiscontinuity(state)}`,
      ballContinuity: ballPresentationDiscontinuity(state),
      keyframe,
      ...projectRestartPresentation(state),
      ball: canonicalBallPresentation(state),
      players: projectPresentationPlayers(state).map((player) => {
        return {
          id: player.id,
          team: player.team,
          x: player.position.x,
          y: player.position.y,
          facing: player.facingAngle,
          protagonist: player.id === state.controlledFootballerId,
          goalkeeper: isMatchGoalkeeper(player),
          displayNumber: player.slotIndex + 1,
          velocity: { ...player.velocity },
          target: { ...player.target },
          anchor: { ...player.neutralAnchor },
          idealTarget: { ...player.idealTarget },
          ...projectCanonicalPlayerPresentation(state, player, previous),
          heightCm: player.profile.heightCm,
          weightKg: player.profile.weightKg,
          dominantFoot: player.profile.dominantFoot,
          cue: this.cues.get(player.id),
          ...projectPlayerPreparation(state, player.id),
          canonicalBallPlacement: true,
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
