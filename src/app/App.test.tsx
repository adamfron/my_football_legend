// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isDevToolsEnabled } from './devTools';
import { StartScreen } from './StartScreen';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

describe('devtools visibility flag', () => {
  it('hides devtools without the query parameter', () => {
    expect(isDevToolsEnabled('')).toBe(false);
    expect(isDevToolsEnabled('?devtools=0')).toBe(false);
  });

  it('shows devtools with ?devtools=1', () => {
    expect(isDevToolsEnabled('?devtools=1')).toBe(true);
  });
});

describe('start screen', () => {
  it('uses the compact application shell and keeps the existing actions', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <StartScreen
          canContinue
          onDismissNotice={() => undefined}
          onNewCareer={() => undefined}
          onContinue={() => undefined}
        />,
      ),
    );
    expect(container.querySelector('.start-titlebar')?.textContent).toContain('MY FOOTBALL LEGEND');
    expect(container.querySelector('.hero')).toBeNull();
    expect(container.textContent).toContain('Nowa kariera');
    expect(container.textContent).toContain('Kontynuuj');
    expect(container.textContent).toContain('O projekcie');
    act(() => root.unmount());
  });
});
