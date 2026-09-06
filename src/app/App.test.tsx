// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildMatchLabUrl,
  buildStartMenuUrl,
  isDevToolsEnabled,
  isMatchLabEntryVisible,
} from './devTools';
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

  it('exposes the match lab entry only for an opted-in development build', () => {
    expect(isMatchLabEntryVisible('?devtools=1', true)).toBe(true);
    expect(isMatchLabEntryVisible('', true)).toBe(false);
    expect(isMatchLabEntryVisible('?devtools=1', false)).toBe(false);
  });

  it('enters and leaves the isolated match lab using only URL state', () => {
    const lab = buildMatchLabUrl('https://example.test/?devtools=1');
    expect(lab.searchParams.get('matchSandbox')).toBe('1');
    const menu = buildStartMenuUrl(lab.href);
    expect(menu.searchParams.get('matchSandbox')).toBeNull();
    expect(menu.searchParams.get('devtools')).toBe('1');
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

  it('places an explicitly enabled DEV match action before the project link', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <StartScreen
          canContinue
          onDismissNotice={() => undefined}
          onNewCareer={() => undefined}
          onContinue={() => undefined}
          matchLabAction={<button>Pojedynczy mecz [DEV]</button>}
        />,
      ),
    );
    const actions = [...container.querySelectorAll('.start-actions > *')].map(
      (node) => node.textContent,
    );
    expect(actions).toEqual(['Nowa kariera', 'Kontynuuj', 'Pojedynczy mecz [DEV]', 'O projekcie']);
    act(() => root.unmount());
  });
});
