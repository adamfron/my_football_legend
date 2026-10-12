import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PlayerModelResources } from '../match/tacticalRenderer/playerModel';
import { createPreviewModel, createPreviewScene, previewCamera } from './previewScene';
import { visualGalleryEntries } from './galleryExamples';
import { deriveAppearance } from '../../core/visualIdentity';

const entries = visualGalleryEntries();
/** Opt-in actual implementation gallery: one context, shared meshes, 12 deterministic identities/views. */
export const VisualGallery = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [diagnostics, setDiagnostics] = useState('Przygotowywanie modeli…');
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setScissorTest(true);
    renderer.info.autoReset = false;
    const resources = new PlayerModelResources();
    const scene = createPreviewScene();
    const models = entries.map(({ appearance }) => createPreviewModel(appearance, resources));
    for (const model of models) {
      scene.add(model.root);
      model.root.visible = false;
    }
    host.prepend(renderer.domElement);
    const paint = () => {
      const width = host.clientWidth || 1200;
      const height = host.clientHeight || 1020;
      renderer.setSize(width, height, false);
      renderer.info.reset();
      const startedAt = performance.now();
      entries.forEach(({ appearance }, index) => {
        const model = models[index]!;
        model.root.visible = true;
        const cellWidth = width / 4;
        const cellHeight = height / 3;
        const x = (index % 4) * cellWidth;
        const y = height - (Math.floor(index / 4) + 1) * cellHeight;
        for (const [offset, mode] of [
          [0, 'full'],
          [1, 'portrait'],
        ] as const) {
          const viewWidth = cellWidth / 2;
          const viewHeight = cellHeight - 64;
          renderer.setViewport(x + offset * viewWidth, y + 26, viewWidth, viewHeight);
          renderer.setScissor(x + offset * viewWidth, y + 26, viewWidth, viewHeight);
          renderer.render(scene, previewCamera(appearance, mode, viewWidth / viewHeight));
        }
        model.root.visible = false;
      });
      const metrics = {
        models: models.length,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        materials: resources.counts.materials,
        renderSubmitMs: Math.round((performance.now() - startedAt) * 100) / 100,
      };
      host.dataset.rendered = 'true';
      host.dataset.metrics = JSON.stringify(metrics);
      host.dataset.firstMetrics ??= JSON.stringify(metrics);
      setDiagnostics(
        `${metrics.models} modeli · ${metrics.geometries} wspólne geometrie · ${metrics.materials} materiałów · ${metrics.triangles} trójkątów w 24 widokach · ${metrics.renderSubmitMs} ms zgłoszenia klatki`,
      );
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(host);
    // Real requestAnimationFrame submissions of 22 bodies, without stadium/physics work.
    // Submission timings are CPU-side; they are deliberately not reported as GPU time.
    const startedGeneration = performance.now();
    const benchmarkScene = createPreviewScene();
    const benchmarkModels = Array.from({ length: 22 }, (_, index) => {
      const model = createPreviewModel(
        deriveAppearance(
          {
            id: `pr165-render-bench-${index}`,
            dateOfBirth: `${1990 + index}-04-14`,
            heightCm: 165 + index * 1.5,
            weightKg: 60 + index,
          },
          '2026-07-01',
        ),
        resources,
      );
      model.root.position.set(((index % 11) - 5) * 0.95, 0, Math.floor(index / 11) * -2);
      benchmarkScene.add(model.root);
      return model;
    });
    const generationMs = performance.now() - startedGeneration;
    const camera = new THREE.OrthographicCamera(-6.3, 6.3, 3, -3, 0.1, 30);
    camera.position.set(0, 3.4, 9);
    camera.lookAt(0, 0.8, -0.8);
    const samples: number[] = [];
    let firstFrameAt = 0;
    let animation = 0;
    const benchmark = (at: number) => {
      firstFrameAt ||= at;
      const width = host.clientWidth || 1200;
      const height = host.clientHeight || 1020;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.info.reset();
      const before = performance.now();
      renderer.render(benchmarkScene, camera);
      samples.push(performance.now() - before);
      if (samples.length < 60) {
        animation = requestAnimationFrame(benchmark);
        return;
      }
      const sorted = samples.slice(5).sort((a, b) => a - b);
      const geometryBufferBytes = [
        resources.box,
        resources.sphere,
        resources.cylinder,
        resources.picker,
      ].reduce(
        (bytes, geometry) =>
          bytes +
          Object.values(geometry.attributes).reduce(
            (sum, attribute) => sum + attribute.array.byteLength,
            0,
          ) +
          (geometry.index?.array.byteLength ?? 0),
        0,
      );
      const metrics = {
        kind: '22_player_models_without_stadium_or_physics',
        frames: samples.length,
        generationMs,
        firstSubmitMs: samples[0],
        medianSubmitMs: sorted[Math.floor(sorted.length / 2)],
        p95SubmitMs: sorted[Math.floor(sorted.length * 0.95)],
        rafElapsedMs: at - firstFrameAt,
        observedRafHz: 59000 / (at - firstFrameAt),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        materials: resources.counts.materials,
        geometryBufferBytes,
        programs: renderer.info.programs?.length,
        viewport: { width, height, pixelRatio: renderer.getPixelRatio() },
      };
      host.dataset.benchmark = JSON.stringify(metrics);
      for (const model of benchmarkModels) benchmarkScene.remove(model.root);
      renderer.setScissorTest(true);
      paint();
    };
    animation = requestAnimationFrame(benchmark);
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      resources.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <main className="visual-gallery">
      <h1>PR165 · Visual DNA</h1>
      <p>
        Modele wygenerowane przez renderer gry. Każdy portret i sylwetka używają tej samej twarzy i
        wspólnego modelu zawodnika.
      </p>
      <div className="gallery-stage" ref={hostRef}>
        <div className="gallery-captions">
          {entries.map(({ title, note }, index) => (
            <article key={index}>
              <header>
                <strong>{title}</strong>
                <span>{note}</span>
              </header>
              <footer>
                <span>Model meczowy</span>
                <span>Portret</span>
              </footer>
            </article>
          ))}
        </div>
      </div>
      <p role="status">{diagnostics}</p>
    </main>
  );
};
