import * as THREE from 'three';

// Highest grass band is at 0.005 m; the 2 mm epsilon avoids z-fighting while keeping rings grounded.
export const PLAYER_MARKER_HEIGHT = 0.007;
export const PLAYER_RING_RADII = {
  ball_owner: { inner: 0.72, outer: 0.86 },
  controlled_player: { inner: 0.87, outer: 1.02 },
} as const;

/** Fixed world-space indicators. Player meshes occlude them through the ordinary depth buffer. */
export const createPlayerRing = (kind: keyof typeof PLAYER_RING_RADII) => {
  const radius = PLAYER_RING_RADII[kind];
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius.inner, radius.outer, 24),
    new THREE.MeshBasicMaterial({
      color: kind === 'ball_owner' ? 0x42b5c5 : 0xffd447,
      transparent: kind === 'ball_owner',
      opacity: kind === 'ball_owner' ? 0.75 : 1,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = PLAYER_MARKER_HEIGHT;
  ring.userData.markerKind = kind;
  return ring;
};
