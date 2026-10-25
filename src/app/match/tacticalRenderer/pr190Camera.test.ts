import { describe, expect, it } from 'vitest';
import { matchCameraPreferencesSchema } from './model';
import {
  cameraZoom,
  deriveInteractiveCameraPose,
  resetCameraOffset,
  resetViewPreferences,
} from './cameraInteraction';

describe('PR190 close contact camera', () => {
  it.each(['overview', 'action', 'player_focus', 'overhead'] as const)(
    'preserves %s saved views and projects finite close poses',
    (preset) => {
      for (const zoom of [0, 0.35, 1, 1.5]) {
        const p = matchCameraPreferencesSchema.parse(JSON.parse(JSON.stringify({ preset, zoom })));
        expect(cameraZoom(p)).toBe(preset === 'overhead' ? 0.75 + zoom * 0.7 : 0.75 + zoom * 1.5);
        const pose = deriveInteractiveCameraPose(p, resetCameraOffset(), { x: 105, y: 68 });
        expect(Object.values(pose.position).every(Number.isFinite)).toBe(true);
        expect(resetViewPreferences(p)).toEqual({ preset, zoom: 0.35 });
      }
      expect(matchCameraPreferencesSchema.safeParse({ preset, zoom: 1.5001 }).success).toBe(false);
    },
  );
});
