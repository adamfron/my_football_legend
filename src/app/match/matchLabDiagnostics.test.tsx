// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createMatchFlowTelemetry, createTacticalMatch } from '../../core/matchSimulation';
import { createSingleMatchSession } from '../../core/singleMatch';
import { MatchLabErrorBoundary } from './TacticalMatchSandbox';
import { MatchLabDiagnosticsController } from './matchLabDiagnostics';

const BrokenPresentation = () => {
  throw new Error('kontrolowany błąd prezentacji');
};

describe('Match Lab crash safety', () => {
  it('keeps a React failure visible and freezes downloadable past-only evidence', () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    const world = createCanonicalWorldDatabase();
    const session = createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'boundary-crash',
      control: { mode: 'spectator' },
    });
    const state = createTacticalMatch(session);
    const controller = new MatchLabDiagnosticsController(
      session,
      state,
      createMatchFlowTelemetry(),
    );
    controller.recorder.record(state);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    act(() =>
      root.render(
        <MatchLabErrorBoundary controller={controller} onSetup={() => undefined}>
          <BrokenPresentation />
        </MatchLabErrorBoundary>,
      ),
    );
    expect(container.textContent).toContain('Single Match Lab uległ awarii');
    expect(container.textContent).toContain('boundary-crash');
    expect(container.textContent).toContain('kontrolowany błąd prezentacji');
    expect(controller.crashPackage?.trace).toBeTruthy();
    expect(controller.crashPackage?.error.componentStack).toContain('BrokenPresentation');
    expect(container.querySelector<HTMLButtonElement>('button:last-of-type')?.disabled).toBe(false);
    act(() => root.unmount());
  });
});
