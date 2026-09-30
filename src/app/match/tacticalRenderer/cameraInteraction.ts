import { z } from 'zod';
import type { MatchCameraPreferences } from './model';

export const cameraOffsetSchema = z.object({
  yaw: z.number().finite(),
  elevation: z.number().min(0.3).max(1.35),
  panX: z.number().min(-52.5).max(52.5),
  panZ: z.number().min(-34).max(34),
});
export type CameraOffset = z.infer<typeof cameraOffsetSchema>;
export const resetCameraOffset = (): CameraOffset => ({
  yaw: -Math.PI / 4,
  elevation: Math.atan(1 / Math.hypot(0.88, 0.88)),
  panX: 0,
  panZ: 0,
});
export const cameraGestureSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('orbit'), dx: z.number().finite(), dy: z.number().finite() }),
  z.object({ kind: z.literal('pan'), dx: z.number().finite(), dy: z.number().finite() }),
]);
export type CameraGesture = z.infer<typeof cameraGestureSchema>;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Input-neutral deltas: a future two-finger adapter can use these same operations. */
export const applyCameraGesture = (offset: CameraOffset, gesture: CameraGesture): CameraOffset => {
  if (gesture.kind === 'orbit')
    return {
      ...offset,
      yaw: (offset.yaw - gesture.dx * 0.006) % (Math.PI * 2),
      elevation: clamp(offset.elevation + gesture.dy * 0.006, 0.3, 1.35),
    };
  const rightX = Math.cos(offset.yaw),
    rightZ = -Math.sin(offset.yaw);
  return {
    ...offset,
    panX: clamp(offset.panX - gesture.dx * rightX - gesture.dy * Math.sin(offset.yaw), -52.5, 52.5),
    panZ: clamp(offset.panZ - gesture.dx * rightZ - gesture.dy * Math.cos(offset.yaw), -34, 34),
  };
};

export const zoomFromWheel = (zoom: number, delta: number, deltaMode = 0) =>
  clamp(
    zoom - clamp(delta * (deltaMode === 1 ? 16 : deltaMode === 2 ? 240 : 1), -240, 240) * 0.0015,
    0,
    1,
  );

export const resetViewPreferences = (
  preferences: MatchCameraPreferences,
): MatchCameraPreferences => ({
  preset: preferences.preset,
  zoom: 0.35,
});

/** Always orbit the current tracking pivot plus bounded pan, never the world origin. */
export const offsetCameraPose = (
  base: {
    position: { x: number; y: number; z: number };
    lookAt: { x: number; y: number; z: number };
  },
  offset: CameraOffset,
) => {
  const radius = Math.hypot(
    base.position.x - base.lookAt.x,
    base.position.y - base.lookAt.y,
    base.position.z - base.lookAt.z,
  );
  const lookAt = {
    x: base.lookAt.x + offset.panX,
    y: base.lookAt.y,
    z: base.lookAt.z + offset.panZ,
  };
  return {
    lookAt,
    position: {
      x: lookAt.x + radius * Math.cos(offset.elevation) * Math.sin(offset.yaw),
      y: lookAt.y + radius * Math.sin(offset.elevation),
      z: lookAt.z + radius * Math.cos(offset.elevation) * Math.cos(offset.yaw),
    },
  };
};

/** Orthographic modes need different spans as distance alone cannot change their magnification. */
export const cameraViewSpan = (preset: MatchCameraPreferences['preset'], aspect: number) => {
  const [width, height] =
    preset === 'overview' ? [168, 108] : preset === 'action' ? [96, 70] : [64, 48];
  const horizontal = Math.max(width!, height! * Math.max(0.1, aspect));
  return { horizontal, vertical: horizontal / Math.max(0.1, aspect) };
};
