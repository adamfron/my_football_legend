import * as THREE from 'three';
import type { ResolvedAppearance } from '../../core/visualIdentity';
import { PlayerModel, PlayerModelResources } from '../match/tacticalRenderer/playerModel';
import { DEFAULT_KITS } from '../match/tacticalRenderer/model';
export const createPreviewModel = (
  appearance: ResolvedAppearance,
  resources: PlayerModelResources,
) =>
  new PlayerModel(
    {
      id: appearance.identityId,
      team: 'home',
      x: 0,
      y: 0,
      heightCm: appearance.heightCm,
      weightKg: appearance.weightKg,
      appearance,
    },
    DEFAULT_KITS.home,
    resources,
  );

export const createPreviewScene = () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d5dedc');
  scene.add(new THREE.HemisphereLight('#fff4dd', '#44535c', 2.5));
  const light = new THREE.DirectionalLight('#ffffff', 3);
  light.position.set(-2.5, 4, 4);
  scene.add(light);
  return scene;
};

/** Fixed camera and lighting; no animation loop, random calls, raster cache or portrait assets. */
export const previewCamera = (
  appearance: ResolvedAppearance,
  mode: 'portrait' | 'full',
  aspect: number,
) => {
  const height = appearance.heightCm / 100;
  const targetHeight = mode === 'portrait' ? height * 0.858 : height * 0.5;
  const extent = mode === 'portrait' ? 0.36 : 1.18;
  const camera = new THREE.OrthographicCamera(
    -extent * aspect,
    extent * aspect,
    extent,
    -extent,
    0.1,
    20,
  );
  camera.position.set(0.18, targetHeight + 0.035, 4);
  camera.lookAt(0, targetHeight, 0);
  camera.updateProjectionMatrix();
  return camera;
};
