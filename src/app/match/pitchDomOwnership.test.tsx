// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { PitchCanvasHost } from './TacticalMatchSandbox';

describe('pitch DOM ownership', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps an unmanaged renderer canvas connected when React opens decision overlays', () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const host = createRef<HTMLDivElement>();
    const view = (decisionOpen: boolean) => (
      <div className="pitch-stage">
        <PitchCanvasHost ref={host} />
        {decisionOpen && <div className="interaction-hint">Wybierz cel</div>}
        {decisionOpen && <section className="context-menu">Podaj</section>}
      </div>
    );
    act(() => root.render(view(false)));
    const canvas = document.createElement('canvas');
    host.current!.append(canvas);
    let renderCalls = 0;
    const renderer = { render: () => renderCalls++ };

    act(() => root.render(view(true)));
    renderer.render();

    expect(container.querySelector('.context-menu')).not.toBeNull();
    expect(canvas.isConnected).toBe(true);
    expect(canvas.parentElement).toBe(host.current);
    expect(renderCalls).toBe(1);
    act(() => root.unmount());
  });
});
