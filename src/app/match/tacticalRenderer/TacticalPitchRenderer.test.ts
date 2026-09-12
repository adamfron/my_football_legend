// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const render = vi.fn();
const setSize = vi.fn();
vi.mock('three', () => {
  class Object3D {
    position = { set: vi.fn() };
    rotation = { x: 0 };
    userData: Record<string, unknown> = {};
    visible = true;
    parent: Object3D | null = null;
    add = vi.fn();
  }
  class Mesh extends Object3D {
    geometry = { dispose: vi.fn() };
    material = { dispose: vi.fn() };
  }
  class Scene extends Object3D {
    background: unknown;
    traverse = vi.fn();
  }
  class Camera extends Object3D {
    left = 0;
    right = 0;
    top = 0;
    bottom = 0;
    near = 0;
    far = 0;
    lookAt = vi.fn();
    updateProjectionMatrix = vi.fn();
  }
  class Renderer {
    domElement = document.createElement('canvas');
    outputColorSpace = '';
    setPixelRatio = vi.fn();
    setSize = setSize;
    render = render;
    dispose = vi.fn();
  }
  const geometry = class {
    dispose = vi.fn();
    constructor() {}
    setFromPoints() {
      return this;
    }
  };
  const material = class {
    dispose = vi.fn();
    constructor() {}
  };
  return {
    WebGLRenderer: Renderer,
    Scene,
    OrthographicCamera: Camera,
    Mesh,
    Group: Object3D,
    HemisphereLight: Object3D,
    Line: Mesh,
    LineLoop: Mesh,
    LineSegments: Mesh,
    PlaneGeometry: geometry,
    SphereGeometry: geometry,
    CylinderGeometry: geometry,
    RingGeometry: geometry,
    CircleGeometry: geometry,
    BoxGeometry: geometry,
    EdgesGeometry: geometry,
    BufferGeometry: geometry,
    MeshStandardMaterial: material,
    MeshBasicMaterial: material,
    LineBasicMaterial: material,
    Color: class {},
    Vector3: class {
      constructor() {}
    },
    Vector2: class {
      constructor() {}
    },
    Raycaster: class {
      setFromCamera = vi.fn();
      intersectObject = vi.fn(() => []);
      intersectObjects = vi.fn(() => []);
    },
    EllipseCurve: class {
      getPoints() {
        return [{ x: 0, y: 0 }];
      }
    },
    DoubleSide: 1,
    SRGBColorSpace: 'srgb',
  };
});

import { TacticalPitchRenderer } from './TacticalPitchRenderer';
import type { TacticalFrame } from './model';

let resizeCallback: () => void;
class TestResizeObserver {
  constructor(callback: () => void) {
    resizeCallback = callback;
  }
  observe() {}
  disconnect() {}
}

const frame: TacticalFrame = { timestampMs: 0, players: [], ball: { x: 52, y: 34 } };

describe('TacticalPitchRenderer viewport lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    vi.stubGlobal('devicePixelRatio', 1);
  });

  it('waits for initial layout and paints the stored frame when dimensions become valid', () => {
    const host = document.createElement('div');
    document.body.append(host);
    let width = 0,
      height = 0;
    Object.defineProperties(host, {
      clientWidth: { get: () => width },
      clientHeight: { get: () => height },
    });
    const diagnostics: (string | undefined)[] = [];
    const renderer = new TacticalPitchRenderer(host, frame, (value) => diagnostics.push(value));
    expect(renderer.lifecycle).toBe('waiting_for_layout');
    expect(render).not.toHaveBeenCalled();
    width = 800;
    height = 500;
    resizeCallback();
    expect(renderer.lifecycle).toBe('ready');
    expect(render).toHaveBeenCalledTimes(1);
    expect(diagnostics).toContain('Renderer waiting_for_layout');
  });

  it('repaints the latest frame after an ordinary resize', () => {
    const host = document.createElement('div');
    document.body.append(host);
    let width = 800;
    Object.defineProperties(host, {
      clientWidth: { get: () => width },
      clientHeight: { get: () => 500 },
    });
    new TacticalPitchRenderer(host, frame);
    expect(render).toHaveBeenCalledTimes(1);
    width = 900;
    resizeCallback();
    expect(setSize).toHaveBeenLastCalledWith(900, 500, false);
    expect(render).toHaveBeenCalledTimes(2);
  });
});
