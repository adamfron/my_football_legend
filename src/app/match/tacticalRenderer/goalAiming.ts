import * as THREE from 'three';
import { goalWorldPointToIntent, shotAimIntentToGoalPoint, PITCH_LENGTH } from './model';

/** Screen -> world ray -> physical goal plane -> canonical team-space intent.
 * No screen-X/team sign heuristic: this also works from behind the goal or off-centre.
 */
export const screenToGoalIntent = (
  camera: THREE.Camera,
  team: 'home' | 'away',
  pointer: { x: number; y: number },
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
) => {
  if (rect.width <= 0 || rect.height <= 0) return undefined;
  camera.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(
    new THREE.Vector2(
      ((pointer.x - rect.left) / rect.width) * 2 - 1,
      -((pointer.y - rect.top) / rect.height) * 2 + 1,
    ),
    camera,
  );
  const goalX = shotAimIntentToGoalPoint(team, { horizontal: 0, vertical: 0 }).x - PITCH_LENGTH / 2;
  const point = raycaster.ray.intersectPlane(
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -goalX),
    new THREE.Vector3(),
  );
  return point ? goalWorldPointToIntent(team, point) : undefined;
};
