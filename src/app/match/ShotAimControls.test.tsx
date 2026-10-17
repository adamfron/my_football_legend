// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShotAimControls } from './ShotAimControls';

describe('goal point, technique and explicit shot confirmation', () => {
  let host: HTMLDivElement, root: Root;
  const confirm = vi.fn(),
    cancel = vi.fn(),
    change = vi.fn();
  const techniques = [
    { id: 'placed', label: 'Strzał techniczny' },
    { id: 'driven', label: 'Strzał mocny' },
  ];
  const render = (aim = { horizontal: 0.4, vertical: 0.7 }, items = techniques) =>
    act(() =>
      root.render(
        <ShotAimControls
          aim={aim}
          techniques={items}
          onAimChange={change}
          onConfirm={confirm}
          onCancel={cancel}
        />,
      ),
    );
  const button = (label: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === label)!;
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
    render();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  it('keeps technique selection paused and executes only on confirmation', () => {
    expect(button('Wykonaj strzał').disabled).toBe(true);
    act(() => button('Strzał techniczny').click());
    expect(button('Strzał techniczny').getAttribute('aria-pressed')).toBe('true');
    expect(confirm).not.toHaveBeenCalled();
    expect(button('Wykonaj strzał').disabled).toBe(false);
    act(() => button('Wykonaj strzał').click());
    expect(confirm).toHaveBeenCalledExactlyOnceWith('placed');
  });
  it('retains the technique while changing the current horizontal and vertical target', () => {
    act(() => button('Strzał mocny').click());
    render({ horizontal: -0.6, vertical: 0.2 });
    const horizontal = host.querySelector<HTMLInputElement>('[aria-label="Kierunek strzału"]')!;
    const vertical = host.querySelector<HTMLInputElement>('[aria-label="Wysokość strzału"]')!;
    expect(horizontal.type).toBe('range');
    expect(horizontal.value).toBe('-0.6');
    expect(vertical.type).toBe('range');
    expect(vertical.value).toBe('0.2');
    act(() => button('Wykonaj strzał').click());
    expect(confirm).toHaveBeenCalledExactlyOnceWith('driven');
  });
  it('cancels through a button and Escape without executing', () => {
    act(() => button('Strzał mocny').click());
    act(() => button('Anuluj').click());
    act(() =>
      button('Strzał mocny').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    );
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
  });
  it('does not confirm a technique that is no longer available', () => {
    act(() => button('Strzał techniczny').click());
    render({ horizontal: 0, vertical: 0.5 }, [techniques[1]!]);
    expect(button('Wykonaj strzał').disabled).toBe(true);
    act(() => button('Wykonaj strzał').click());
    expect(confirm).not.toHaveBeenCalled();
  });
});
