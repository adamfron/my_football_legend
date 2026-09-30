import { describe, expect, it } from 'vitest';
import { createPlayerRing, PLAYER_MARKER_HEIGHT, PLAYER_RING_RADII } from './playerMarkers';

describe('pitch-plane player markers', () => {
  it('places the controlled ring immediately outside the owner ring with similar widths', () => {
    const owner = PLAYER_RING_RADII.ball_owner;
    const controlled = PLAYER_RING_RADII.controlled_player;
    expect(controlled.inner).toBeGreaterThanOrEqual(owner.outer);
    expect(controlled.inner - owner.outer).toBeLessThanOrEqual(0.02);
    expect(controlled.outer - controlled.inner).toBeCloseTo(owner.outer - owner.inner, 1);
    expect(controlled.outer).toBeLessThan(1.1);
  });

  it.each(['controlled_player', 'ball_owner'] as const)(
    'keeps %s on the grass with ordinary depth occlusion and fixed world geometry',
    (kind) => {
      const ring = createPlayerRing(kind);
      expect(ring.userData.markerKind).toBe(kind);
      expect(ring.rotation.x).toBe(-Math.PI / 2);
      expect(ring.position.y).toBe(PLAYER_MARKER_HEIGHT);
      expect(ring.position.y).toBeGreaterThan(0.005);
      expect(ring.position.y).toBeLessThan(0.01);
      expect(ring.material.depthTest).toBe(true);
      expect(ring.material.depthWrite).toBe(false);
      expect(ring.renderOrder).toBe(0);
      expect(ring.geometry.parameters.innerRadius).toBe(PLAYER_RING_RADII[kind].inner);
      expect(ring.geometry.parameters.outerRadius).toBe(PLAYER_RING_RADII[kind].outer);
      expect(ring.scale.toArray()).toEqual([1, 1, 1]);
    },
  );
});
