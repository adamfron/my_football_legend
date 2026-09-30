// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const render = vi.fn();
const setSize = vi.fn();
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class Renderer {
    domElement = document.createElement('canvas');
    outputColorSpace = '';
    setPixelRatio = vi.fn();
    setSize = setSize;
    render = render;
    dispose = vi.fn();
  }
  return { ...actual, WebGLRenderer: Renderer };
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

  it('can explicitly repaint a paused presentation without advancing a frame', () => {
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 800 },
      clientHeight: { get: () => 500 },
    });
    const renderer = new TacticalPitchRenderer(host, frame);
    expect(render).toHaveBeenCalledTimes(1);
    renderer.redraw();
    expect(render).toHaveBeenCalledTimes(2);
  });
  it('isolates middle-button gestures, cancellation and reset from football frames', () => {
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 800 },
      clientHeight: { get: () => 500 },
    });
    const snapshot = structuredClone(frame);
    const renderer = new TacticalPitchRenderer(host, frame);
    const canvas = renderer.getCanvas();
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => true);
    canvas.releasePointerCapture = vi.fn();
    const pointer = (type: string, button: number, x: number, shiftKey = false) => {
      const event = new MouseEvent(type, {
        button,
        clientX: x,
        clientY: 150,
        shiftKey,
        cancelable: true,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      canvas.dispatchEvent(event);
      return event;
    };
    expect(pointer('pointerdown', 1, 100).defaultPrevented).toBe(true);
    pointer('pointermove', 1, 140);
    pointer('pointermove', 1, 180, true);
    pointer('pointercancel', 1, 180);
    expect(renderer.consumeCameraClick()).toBe(true);
    pointer('pointerdown', 0, 180);
    expect(renderer.consumeCameraClick()).toBe(false);
    renderer.resetView();
    expect(frame).toEqual(snapshot);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
    renderer.dispose();
    const calls = render.mock.calls.length;
    pointer('pointerdown', 1, 100);
    pointer('pointermove', 1, 140);
    expect(render.mock.calls.length).toBe(calls);
  });
  it('maps the expanded interception marker to the existing canonical ball target', () => {
    const host = document.createElement('div');
    document.body.append(host);
    Object.defineProperties(host, {
      clientWidth: { get: () => 800 },
      clientHeight: { get: () => 500 },
    });
    const input = { ...frame, ball: { x: 30, y: 30 }, interceptionTarget: { x: 52.5, y: 34 } };
    const renderer = new TacticalPitchRenderer(host, input);
    renderer.getCanvas().getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 500 }) as DOMRect;
    expect(renderer.pick(413, 250)).toEqual({ kind: 'ball', point: { x: 30, y: 30 } });
    renderer.dispose();
  });
});
