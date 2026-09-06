// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  buildMatchLabUrl,
  buildStartMenuUrl,
  isDevToolsEnabled,
  isMatchLabEntryVisible,
  isMatchSandboxEnabled,
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

  it('exposes the match lab entry in development and production builds without opt-in', () => {
    expect(isMatchLabEntryVisible()).toBe(true);
  });

  it('enables only the match lab without globally enabling developer tools', () => {
    expect(isMatchSandboxEnabled('?matchSandbox=1')).toBe(true);
    expect(isMatchSandboxEnabled('?devtools=1&matchSandbox=1')).toBe(true);
    expect(isMatchSandboxEnabled('?devtools=1')).toBe(false);
    expect(isDevToolsEnabled('?matchSandbox=1')).toBe(false);
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
  it('always shows the match lab in the expected menu order', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <StartScreen
          canContinue
          onDismissNotice={() => undefined}
          onNewCareer={() => undefined}
          onContinue={() => undefined}
          onOpenMatchLab={() => undefined}
        />,
      ),
    );
    expect(container.querySelector('.start-titlebar')?.textContent).toContain('MY FOOTBALL LEGEND');
    expect(container.querySelector('.hero')).toBeNull();
    expect(container.textContent).toContain('Nowa kariera');
    expect(container.textContent).toContain('Kontynuuj');
    const actions = [...container.querySelectorAll('.start-actions > *')].map(
      (node) => node.textContent,
    );
    expect(actions).toEqual(['Nowa kariera', 'Kontynuuj', 'Pojedynczy mecz [DEV]', 'O projekcie']);
    act(() => root.unmount());
  });

  it('opens the generated Match Lab URL when its action is clicked', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    let destination = '';
    act(() =>
      root.render(
        <StartScreen
          canContinue
          onDismissNotice={() => undefined}
          onNewCareer={() => undefined}
          onContinue={() => undefined}
          onOpenMatchLab={() => {
            destination = buildMatchLabUrl('https://example.test/').href;
          }}
        />,
      ),
    );
    const matchLabButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Pojedynczy mecz [DEV]',
    );
    act(() => matchLabButton?.click());
    expect(destination).toBe('https://example.test/?devtools=1&matchSandbox=1');
    act(() => root.unmount());
  });
});
