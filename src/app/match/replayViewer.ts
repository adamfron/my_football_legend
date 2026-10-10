import { z } from 'zod';

export const replaySpeedSchema = z.union([
  z.literal(0.25),
  z.literal(0.5),
  z.literal(1),
  z.literal(2),
]);
export type ReplaySpeed = z.infer<typeof replaySpeedSchema>;
export const replayViewerClockSchema = z.object({
  cursorMs: z.number().nonnegative(),
  lastWallMs: z.number().nonnegative(),
});
export type ReplayViewerClock = z.infer<typeof replayViewerClockSchema>;

/** Viewer wall time only advances a recorded cursor. It never steps canonical football. */
export const advanceReplayViewer = (
  clock: ReplayViewerClock,
  wallMs: number,
  endMs: number,
  speed: ReplaySpeed,
  playing: boolean,
): ReplayViewerClock => ({
  cursorMs: Math.min(
    endMs,
    clock.cursorMs + (playing ? Math.max(0, wallMs - clock.lastWallMs) * speed : 0),
  ),
  lastWallMs: wallMs,
});
