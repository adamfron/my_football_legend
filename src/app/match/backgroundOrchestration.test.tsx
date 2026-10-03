// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../../core/singleMatch';
import { createTacticalMatch, createMatchFlowTelemetry } from '../../core/matchSimulation';
import type { TacticalMatchState } from '../../core/matchSimulation/matchState';
import type { PlayerDecisionOpportunity } from '../../core/matchSimulation/playerDecision';
import { MatchLabDiagnosticsController } from './matchLabDiagnostics';
import { ViewportVideoRecorder } from './matchDebugCapture';
import { RunningLab } from './TacticalMatchSandbox';

const observed = vi.hoisted(() => ({
  render: vi.fn(),
  reportRenderer: undefined as ((error?: string) => void) | undefined,
  step: vi.fn<(state: TacticalMatchState, delta: number) => TacticalMatchState>(),
  agency: vi.fn<
    (state: TacticalMatchState) => {
      probe: { candidate: boolean; blockedReason: 'no_controlled_player' };
      opportunity?: PlayerDecisionOpportunity;
    }
  >(),
}));

vi.mock('../../core/matchSimulation', async (original) => {
  const actual = await original<typeof import('../../core/matchSimulation')>();
  return {
    ...actual,
    stepTacticalMatch: observed.step,
    stepTacticalMatchAfterDecisionProbe: observed.step,
    projectPlayerAgency: observed.agency,
    projectMatchMoment: () => ({
      kind: 'routine',
      importance: 0,
      actorIds: [],
      reasons: [],
      controlledPlayerInvolved: false,
      requiresHumanDecision: false,
      detectedAt: 0,
      suggestedLeadInSeconds: 0,
    }),
  };
});
vi.mock('./tacticalRenderer/TacticalPitchRenderer', () => ({
  TacticalPitchRenderer: class {
    constructor(_host: HTMLDivElement, _frame: unknown, report: (error?: string) => void) {
      observed.reportRenderer = report;
    }
    lifecycle = 'ready';
    render = observed.render;
    setCameraMode() {}
    setCameraPreferences() {}
    getCanvas() {
      return document.createElement('canvas');
    }
    dispose() {}
  },
}));

describe('background Match Lab orchestration', () => {
  let root: Root;
  let container: HTMLDivElement;
  let controller: MatchLabDiagnosticsController;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    observed.render.mockClear();
    observed.step.mockReset();
    observed.step.mockImplementation((state, delta) => ({ ...state, time: state.time + delta }));
    observed.agency.mockReset();
    observed.agency.mockReturnValue({
      probe: { candidate: false, blockedReason: 'no_controlled_player' },
    });
    const world = createCanonicalWorldDatabase();
    const session = createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'background-orchestration',
      control: { mode: 'spectator' },
    });
    controller = new MatchLabDiagnosticsController(
      session,
      createTacticalMatch(session),
      createMatchFlowTelemetry(),
    );
    vi.spyOn(ViewportVideoRecorder.prototype, 'start');
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <RunningLab
          session={session}
          diagnostics={controller}
          onSetup={() => undefined}
          onRestart={() => undefined}
          onRandomize={() => undefined}
        />,
      ),
    );
    const policy = container.querySelector<HTMLSelectElement>('nav select')!;
    act(() => {
      policy.value = 'key_player';
      policy.dispatchEvent(new Event('change', { bubbles: true }));
    });
    observed.render.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps hidden rendering and capture off while coarse React updates cannot roll back canonical progress', () => {
    const capture = vi.spyOn(controller.recorder, 'record');
    act(() => vi.advanceTimersByTime(10));
    expect(controller.latestState.time).toBeGreaterThan(0);
    const boundary = controller.latestState.time;
    const details = container.querySelector<HTMLDetailsElement>('.lab-diagnostics')!;
    act(() => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    expect(controller.latestState.time).toBe(boundary);
    act(() => vi.advanceTimersByTime(10));
    expect(controller.latestState.time).toBeGreaterThan(boundary);
    expect(observed.render).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(ViewportVideoRecorder.prototype.start).not.toHaveBeenCalled();
  });

  it('stops at an exact decision before publishing its context and never runs another canonical tick', () => {
    const opportunity = {
      id: 'exact-decision',
      actorId: controller.latestState.players[1]!.id,
      kind: 'on_ball',
      options: [],
      situation: { kind: 'on_ball', importance: 1 },
      triggerReason: 'meaningful_test',
    } as unknown as PlayerDecisionOpportunity;
    observed.agency.mockImplementation((state) => ({
      probe: { candidate: false, blockedReason: 'no_controlled_player' },
      ...(state.time >= 0.1 ? { opportunity } : {}),
    }));
    act(() => vi.advanceTimersByTime(10));
    expect(controller.latestState.time).toBe(0.1);
    const ticks = observed.step.mock.calls.length;
    act(() => vi.advanceTimersByTime(30));
    expect(observed.step).toHaveBeenCalledTimes(ticks);
    expect(controller.latestState.time).toBe(0.1);
  });

  it('publishes a period boundary immediately and stops scheduling frozen period ticks', () => {
    observed.step.mockImplementation((state, delta) => ({
      ...state,
      time: state.time + delta,
      status: 'half_time',
    }));
    act(() => vi.advanceTimersByTime(10));
    expect(container.textContent).toContain('Rozpocznij drugą połowę');
    const ticks = observed.step.mock.calls.length;
    act(() => vi.advanceTimersByTime(30));
    expect(observed.step).toHaveBeenCalledTimes(ticks);
  });

  it('publishes abandonment with the actual score/time and stops all hidden work', () => {
    observed.step.mockImplementation((state, delta) => ({
      ...state,
      time: state.time + delta,
      score: { home: 2, away: 1 },
      status: 'abandoned',
      termination: {
        reason: 'insufficient_players',
        at: state.time + delta,
        team: 'away',
        activePlayers: 6,
      },
    }));
    act(() => vi.advanceTimersByTime(10));
    expect(controller.latestState).toMatchObject({
      status: 'abandoned',
      score: { home: 2, away: 1 },
      termination: { reason: 'insufficient_players', team: 'away', activePlayers: 6 },
    });
    expect(container.textContent).toContain('MECZ PRZERWANY');
    expect(container.textContent).toContain('goście');
    const frozen = controller.latestState;
    const ticks = observed.step.mock.calls.length;
    act(() => vi.advanceTimersByTime(300));
    expect(controller.latestState).toBe(frozen);
    expect(observed.step).toHaveBeenCalledTimes(ticks);
    expect(observed.render).not.toHaveBeenCalled();
  });

  it('freezes the last valid canonical tick when a failure occurs inside a hidden batch', () => {
    observed.step.mockImplementation((state, delta) => {
      if (state.time >= 0.1) throw new Error('canonical batch failure');
      return { ...state, time: state.time + delta };
    });
    act(() => vi.advanceTimersByTime(10));
    expect(controller.latestState.time).toBe(0.1);
    expect(controller.crashPackage?.error.atCanonicalTime).toBe(0.1);
    expect(controller.crashPackage?.latestCanonicalState).toBe(controller.latestState);
    const trace = controller.crashPackage?.trace as { frames: { time: number }[] };
    expect(trace.frames.at(-1)?.time).toBe(0.1);
    const ticks = observed.step.mock.calls.length;
    act(() => vi.advanceTimersByTime(30));
    expect(observed.step).toHaveBeenCalledTimes(ticks);
  });

  it('hides expected layout waiting only during background suppression while showing real errors', () => {
    const sidebar = container.querySelector<HTMLElement>('.decision-board')!;
    act(() => observed.reportRenderer?.('Renderer waiting_for_layout'));
    expect(sidebar.textContent).not.toContain('Renderer waiting_for_layout');
    expect(sidebar.textContent).not.toContain('Odtwórz renderer');

    act(() => observed.reportRenderer?.('Renderer context lost'));
    expect(sidebar.textContent).toContain('Renderer context lost');
    expect(sidebar.textContent).toContain('Odtwórz renderer');

    act(() => observed.reportRenderer?.('Renderer waiting_for_layout'));
    const policy = container.querySelector<HTMLSelectElement>('nav select')!;
    act(() => {
      policy.value = 'full_match';
      policy.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(sidebar.textContent).toContain('Renderer waiting_for_layout');
  });
});
