import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { ResolvedAppearance } from '../../core/visualIdentity';
import { PlayerModelResources } from '../match/tacticalRenderer/playerModel';
import { createPreviewModel, createPreviewScene, previewCamera } from './previewScene';

export const PlayerPreview = ({
  appearance,
  mode = 'portrait',
  label = 'Portret zawodnika',
}: {
  appearance: ResolvedAppearance;
  mode?: 'portrait' | 'full';
  label?: string;
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    resources: PlayerModelResources;
  } | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      const message = document.createElement('span');
      message.className = 'preview-unavailable';
      message.textContent = 'Podgląd 3D jest niedostępny w tej przeglądarce.';
      host.append(message);
      return () => message.remove();
    }
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = createPreviewScene();
    const resources = new PlayerModelResources();
    runtimeRef.current = { renderer, scene, resources };
    host.append(renderer.domElement);
    return () => {
      runtimeRef.current = null;
      resources.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);
  useEffect(() => {
    const host = hostRef.current;
    const runtime = runtimeRef.current;
    if (!host || !runtime) return;
    const model = createPreviewModel(appearance, runtime.resources);
    runtime.scene.add(model.root);
    const paint = () => {
      const width = Math.max(1, host.clientWidth || 280);
      const height = Math.max(1, host.clientHeight || (mode === 'full' ? 360 : 240));
      runtime.renderer.setSize(width, height, false);
      runtime.renderer.render(runtime.scene, previewCamera(appearance, mode, width / height));
      host.dataset.rendered = 'true';
      host.dataset.faceSeed = appearance.faceSeed;
      host.dataset.renderGeometries = String(runtime.renderer.info.memory.geometries);
      host.dataset.renderTriangles = String(runtime.renderer.info.render.triangles);
      host.dataset.renderCalls = String(runtime.renderer.info.render.calls);
    };
    paint();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(paint);
    observer?.observe(host);
    return () => {
      observer?.disconnect();
      runtime.scene.remove(model.root);
    };
  }, [appearance, mode]);
  return (
    <div
      className={`player-preview player-preview-${mode}`}
      role="img"
      aria-label={label}
      ref={hostRef}
    ></div>
  );
};
