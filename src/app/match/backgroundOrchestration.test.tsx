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
import { MatchReplayHistory } from '../../core/matchSimulation/matchReplay';
import { stepTacticalMatchAfterDecisionProbe } from '../../core/matchSimulation/matchSimulation';
import { applyRestartScenario } from '../../core/matchSimulation/restartScenarios';
import { requestSubstitutions } from '../../core/matchSimulation/substitutions';
import { isEligibleForNormalPosition } from '../../core/footballerWorld';

const observed = vi.hoisted(() => ({
  render: vi.fn(),
  presentationActive: vi.fn(),
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
    setDiagnostics() {}
    setStadiumDetail() {}
    setReplayCamera() {}
    setPresentationActive = observed.presentationActive;
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
    observed.presentationActive.mockClear();
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

  it('deactivates the viewer in background and passes current football before visibility restoration', () => {
    expect(observed.presentationActive).toHaveBeenLastCalledWith(false);
    act(() => vi.advanceTimersByTime(5));
    const current = controller.latestState;
    const policy = container.querySelector<HTMLSelectElement>('nav select')!;
    act(() => {
      policy.value = 'full_match';
      policy.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const activation = observed.presentationActive.mock.lastCall!;
    expect(activation[0]).toBe(true);
    expect(activation[1].timestampMs).toBeCloseTo(current.time * 1000);
    expect(activation[1].ball).toMatchObject({ x: current.ball.x, y: current.ball.y });
    expect(controller.latestState).toBe(current);
  });

  it('publishes hidden goals to Match Centre without rendering the missed football', () => {
    const actor = controller.latestState.players.find((player) => player.team === 'home')!;
    observed.step.mockImplementation((state, delta) => ({
      ...state,
      time: state.time + delta,
      score: { home: 1, away: 0 },
      matchEvents: [
        {
          id: 'hidden-goal',
          replayKey: 'hidden-goal',
          at: 0.025,
          kind: 'goal',
          team: 'home',
          actorId: actor.id,
          score: { home: 1, away: 0 },
        },
      ],
    }));
    act(() => vi.advanceTimersByTime(10));
    const centre = container.querySelector('[aria-label="Centrum meczu"]')!;
    expect(centre.querySelector('[data-event-kind="goal"]')!.textContent).toContain(
      actor.profile.lastName,
    );
    expect(centre.querySelector('.match-centre__score')!.textContent).toContain('1–0');
    expect(observed.render).not.toHaveBeenCalled();
  });

  it('advances real hidden football without renderer calls in normal, DEV and capture modes', () => {
    observed.step.mockImplementation(stepTacticalMatchAfterDecisionProbe);
    const initial = controller.latestState;
    const details = container.querySelector<HTMLDetailsElement>('.lab-diagnostics')!;
    act(() => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    const observer = [...container.querySelectorAll<HTMLSelectElement>('select')].find((select) =>
      [...select.options].some((option) => option.value === 'capture'),
    )!;
    for (const mode of ['normal', 'dev', 'capture']) {
      const before = controller.latestState;
      act(() => {
        observer.value = mode;
        observer.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(controller.latestState).toBe(before);
      act(() => vi.advanceTimersByTime(1));
      expect(controller.latestState.time).toBeGreaterThan(before.time);
      expect(observed.render).not.toHaveBeenCalled();
    }
    expect(
      controller.latestState.statistics?.players.some((player) => player.minutesPlayed > 0),
    ).toBe(true);
    expect(controller.latestState.ball).not.toEqual(initial.ball);
    expect(controller.crashPackage).toBeUndefined();
  });

  it('changing observation mode and every presentation policy preserves a paused canonical snapshot', () => {
    const pause = [...container.querySelectorAll<HTMLButtonElement>('nav button')].find(
      (button) => button.textContent === 'Pauza',
    )!;
    act(() => pause.click());
    const snapshot = structuredClone(controller.latestState);
    const details = container.querySelector<HTMLDetailsElement>('.lab-diagnostics')!;
    act(() => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    const observer = [...container.querySelectorAll<HTMLSelectElement>('select')].find((select) =>
      [...select.options].some((option) => option.value === 'capture'),
    )!;
    const policy = container.querySelector<HTMLSelectElement>('nav select')!;
    for (const mode of ['normal', 'dev', 'capture', 'release_minimal']) {
      act(() => {
        observer.value = mode;
        observer.dispatchEvent(new Event('change', { bubbles: true }));
      });
      for (const id of [
        'full_match',
        'extended_match',
        'key_match',
        'player_extended',
        'key_player',
      ]) {
        act(() => {
          policy.value = id;
          policy.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(controller.latestState).toEqual(snapshot);
      }
    }
    act(() => vi.advanceTimersByTime(50));
    expect(controller.latestState).toEqual(snapshot);
    expect(observed.step).not.toHaveBeenCalled();
  });

  it('keeps canonical background football running when the optional replay observer fails', () => {
    vi.spyOn(MatchReplayHistory.prototype, 'observe').mockImplementation(() => {
      throw new Error('replay observation failure');
    });
    act(() => vi.advanceTimersByTime(10));
    expect(controller.latestState.time).toBeGreaterThan(0);
    expect(controller.crashPackage).toBeUndefined();
    expect(
      controller.runtimeDiagnostics.some((entry) => entry.module === 'MatchReplayHistory.observe'),
    ).toBe(true);
    expect(observed.render).not.toHaveBeenCalled();
  });

  it.each([
    ['key_player', 'session'],
    ['full_match', 'session'],
    ['key_player', 'scenario'],
    ['full_match', 'scenario'],
  ] as const)(
    'resets %s presentation during an event replay when replacing the %s',
    (policyId, resetKind) => {
      const initial = controller.latestState;
      const goal = {
        id: 'reset-replay-goal',
        replayKey: 'reset-replay-goal',
        at: 0,
        kind: 'goal' as const,
        team: 'home' as const,
        score: { home: 1, away: 0 },
      };
      const recording = new MatchReplayHistory();
      recording.observe({ ...initial, matchEvents: [goal] });
      recording.observe({ ...initial, time: 0.2, matchEvents: [goal] });
      const recorded = recording.getWindow(goal.replayKey)!;
      vi.spyOn(MatchReplayHistory.prototype, 'hasWindow').mockReturnValue(true);
      vi.spyOn(MatchReplayHistory.prototype, 'getWindow').mockReturnValue({
        ...recorded,
        complete: true,
      });
      observed.step.mockImplementation((state, delta) => ({
        ...state,
        time: state.time + delta,
        score: { home: 1, away: 0 },
        matchEvents: [goal],
      }));
      const policy = container.querySelector<HTMLSelectElement>('nav select')!;
      act(() => {
        policy.value = policyId;
        policy.dispatchEvent(new Event('change', { bubbles: true }));
        vi.advanceTimersByTime(80);
      });
      const replay = container.querySelector<HTMLButtonElement>(
        '.match-centre button[aria-label^="Powtórka:"]',
      )!;
      expect(replay).not.toBeNull();
      act(() => replay.click());
      expect(container.querySelector('.match-status-title')!.textContent).toBe('POWTÓRKA');
      observed.step.mockImplementation((state, delta) => ({ ...state, time: state.time + delta }));
      if (resetKind === 'session') {
        act(() =>
          root.render(
            <RunningLab
              session={{ ...controller.session, setup: { ...controller.session.setup } }}
              diagnostics={controller}
              onSetup={() => undefined}
              onRestart={() => undefined}
              onRandomize={() => undefined}
            />,
          ),
        );
      } else {
        const diagnostics = container.querySelector<HTMLDetailsElement>('.lab-diagnostics')!;
        act(() => {
          diagnostics.open = true;
          diagnostics.dispatchEvent(new Event('toggle'));
        });
        const scenario = [
          ...container.querySelectorAll<HTMLButtonElement>('.scenario-picker button'),
        ].find((button) => button.textContent === 'Gra otwarta')!;
        act(() => scenario.click());
      }
      expect(container.querySelector('.match-status-title')!.textContent).toBe('GRA AUTONOMICZNA');
      expect(container.querySelector('.match-centre__events')).toBeNull();
      expect(policy.value).toBe(policyId);
      if (resetKind === 'scenario') {
        const play = [...container.querySelectorAll<HTMLButtonElement>('nav button')].find(
          (button) => button.textContent === 'Odtwórz',
        )!;
        act(() => play.click());
      }
      act(() => vi.advanceTimersByTime(80));
      expect(controller.latestState.time).toBeGreaterThan(0);
      expect(container.querySelector('.match-status-title')!.textContent).toBe('GRA AUTONOMICZNA');
    },
  );

  it('keeps football frozen through replay pause, speed, restart and camera changes, then resumes live', () => {
    const initial = controller.latestState;
    const goal = {
      id: 'viewer-goal',
      replayKey: 'viewer-goal',
      at: 0.2,
      kind: 'goal' as const,
      team: 'home' as const,
    };
    const recording = new MatchReplayHistory();
    recording.observe(initial);
    recording.observe({ ...initial, time: 0.2, matchEvents: [goal] });
    recording.observe({ ...initial, time: 0.4, matchEvents: [goal] });
    vi.spyOn(MatchReplayHistory.prototype, 'hasWindow').mockReturnValue(true);
    vi.spyOn(MatchReplayHistory.prototype, 'getWindow').mockReturnValue({
      ...recording.getWindow(goal.replayKey)!,
      complete: true,
    });
    observed.step.mockImplementation((state, delta) => ({
      ...state,
      time: state.time + delta,
      matchEvents: [goal],
    }));
    const policy = container.querySelector<HTMLSelectElement>('nav select')!;
    act(() => {
      policy.value = 'full_match';
      policy.dispatchEvent(new Event('change', { bubbles: true }));
      vi.advanceTimersByTime(80);
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>('.match-centre button[aria-label^="Powtórka:"]')!
        .click(),
    );
    const frozen = JSON.stringify(controller.latestState);
    const steps = observed.step.mock.calls.length;
    const buttons = () => [
      ...container.querySelectorAll<HTMLButtonElement>('.replay-controls button'),
    ];
    act(() =>
      buttons()
        .find((button) => button.textContent === 'Pauza powtórki')!
        .click(),
    );
    const speed = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Tempo powtórki"]',
    )!;
    act(() => {
      speed.value = '2';
      speed.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const camera = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Kamera powtórki"]',
    )!;
    act(() => {
      camera.value = 'actors';
      camera.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() =>
      buttons()
        .find((button) => button.textContent === 'Powtórka od początku')!
        .click(),
    );
    act(() => vi.advanceTimersByTime(1000));
    expect(JSON.stringify(controller.latestState)).toBe(frozen);
    expect(observed.step).toHaveBeenCalledTimes(steps);
    act(() =>
      buttons()
        .find((button) => button.textContent === 'Wróć do meczu')!
        .click(),
    );
    act(() => vi.advanceTimersByTime(80));
    expect(controller.latestState.time).toBeGreaterThan(JSON.parse(frozen).time);
  });

  it('shows the spectator transition after a real controlled-player substitution without transferring control', () => {
    const world = createCanonicalWorldDatabase();
    const setup = { homeClubId: 'pro_9', awayClubId: 'pro_1', seed: 'pr161-controlled-ui-sub' };
    const squad = createSingleMatchSession(world, { ...setup, control: { mode: 'spectator' } });
    const footballer = squad.home.players.find(
      (player) => player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const session = createSingleMatchSession(world, {
      ...setup,
      control: {
        mode: 'player',
        clubId: squad.home.club.id,
        footballerId: footballer.footballerId,
        forceIntoXI: false,
      },
    });
    controller = new MatchLabDiagnosticsController(
      session,
      createTacticalMatch(session),
      createMatchFlowTelemetry(),
    );
    act(() =>
      root.render(
        <RunningLab
          key="controlled-substitution"
          session={session}
          diagnostics={controller}
          onSetup={() => undefined}
          onRestart={() => undefined}
          onRandomize={() => undefined}
        />,
      ),
    );
    expect(container.textContent).not.toContain('Twój piłkarz zakończył udział');
    const controlledId = controller.latestState.controlledFootballerId!;
    let incomingId = '';
    let requested = false;
    observed.step.mockImplementation((state, delta) => {
      if (!requested) {
        // Deterministic legal stoppage/edge geometry; exit and entry use the real canonical step.
        state = applyRestartScenario(state, 'throw_in');
        const outgoing = state.players.find((player) => player.id === controlledId)!;
        const incoming = state.bench!.home.find((player) =>
          isEligibleForNormalPosition(player.profile, outgoing.slot.position),
        )!;
        incomingId = incoming.id;
        state = {
          ...state,
          playerAgencyEnabled: false,
          players: state.players.map((player) =>
            player.id === controlledId
              ? { ...player, position: { x: 52.5, y: 0.2 }, velocity: { x: 0, y: 0 } }
              : player,
          ),
        };
        state = requestSubstitutions(state, 'home', [{ outgoingId: controlledId, incomingId }]);
        expect(state.substitutionState!.pending).toHaveLength(1);
        requested = true;
      }
      return stepTacticalMatchAfterDecisionProbe(state, delta);
    });
    const policy = container.querySelector<HTMLSelectElement>('nav select')!;
    act(() => {
      policy.value = 'key_player';
      policy.dispatchEvent(new Event('change', { bubbles: true }));
    });
    act(() => vi.advanceTimersByTime(300));
    const final = controller.latestState;
    expect(
      final.substitutionState!.completed.some(
        (fact) => fact.outgoingId === controlledId && fact.incomingId === incomingId,
      ),
    ).toBe(true);
    expect(final.controlledFootballerId).toBe(controlledId);
    expect(final.players.some((player) => player.id === controlledId)).toBe(false);
    expect(final.players.some((player) => player.id === incomingId)).toBe(true);
    expect(container.querySelector('.match-centre [role="status"]')?.textContent).toContain(
      'Obserwujesz dalszy przebieg spotkania',
    );
    expect(container.querySelector('.match-moment-options')).toBeNull();
    const before = final.time;
    act(() => vi.advanceTimersByTime(20));
    expect(controller.latestState.time).toBeGreaterThan(before);
    expect(controller.latestState.controlledFootballerId).toBe(controlledId);
  }, 30_000);

  it('keeps a paused reset clock at zero when an old replay callback arrives before effect cleanup', () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
    const initial = controller.latestState;
    const goal = {
      id: 'paused-reset-goal',
      replayKey: 'paused-reset-goal',
      at: 2211,
      kind: 'goal' as const,
      team: 'home' as const,
      score: { home: 1, away: 0 },
    };
    const recording = new MatchReplayHistory();
    recording.observe({ ...initial, time: 2206 });
    recording.observe({ ...initial, time: 2211, matchEvents: [goal] });
    recording.observe({ ...initial, time: 2214, matchEvents: [goal] });
    vi.spyOn(MatchReplayHistory.prototype, 'hasWindow').mockReturnValue(true);
    vi.spyOn(MatchReplayHistory.prototype, 'getWindow').mockReturnValue(
      recording.getWindow(goal.replayKey),
    );
    observed.step.mockReturnValue({
      ...initial,
      time: 2700,
      status: 'half_time',
      score: goal.score,
      matchEvents: [goal],
    });
    act(() => vi.advanceTimersByTime(10));
    const pause = [...container.querySelectorAll<HTMLButtonElement>('nav button')].find(
      (button) => button.textContent === 'Pauza',
    )!;
    act(() => pause.click());
    const replay = container.querySelector<HTMLButtonElement>(
      '.match-centre button[aria-label^="Powtórka:"]',
    )!;
    act(() => replay.click());
    const playback = callbacks.at(-1)!;
    act(() => playback(performance.now()));
    expect(container.querySelector('header p')!.textContent).toContain('36:46');
    const queuedPlayback = callbacks.at(-1)!;
    const observe = MatchReplayHistory.prototype.observe;
    vi.spyOn(MatchReplayHistory.prototype, 'observe').mockImplementation(function (
      this: MatchReplayHistory,
      state,
    ) {
      observe.call(this, state);
      // Simulate an already dequeued frame delivered during reset, before effect cleanup.
      if (state.time === 0) queuedPlayback(performance.now() + 500);
    });
    act(() =>
      root.render(
        <RunningLab
          session={{ ...controller.session, setup: { ...controller.session.setup } }}
          diagnostics={controller}
          onSetup={() => undefined}
          onRestart={() => undefined}
          onRandomize={() => undefined}
        />,
      ),
    );
    expect(controller.latestState.time).toBe(0);
    expect(container.querySelector('header p')!.textContent).toContain('00:00');
    expect(container.querySelector('.background-presentation > strong')!.textContent).toBe('00:00');
    const renderCalls = observed.render.mock.calls.length;
    act(() => queuedPlayback(performance.now() + 1000));
    act(() => vi.advanceTimersByTime(50));
    expect(container.querySelector('header p')!.textContent).toContain('00:00');
    expect(controller.latestState.time).toBe(0);
    expect(observed.render).toHaveBeenCalledTimes(renderCalls);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>('nav button')].some(
        (button) => button.textContent === 'Odtwórz',
      ),
    ).toBe(true);
  });

  it('clears an old human decision when replacing the session', () => {
    const opportunity = {
      id: 'stale-reset-decision',
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
    observed.agency.mockReturnValue({
      probe: { candidate: false, blockedReason: 'no_controlled_player' },
    });
    act(() =>
      root.render(
        <RunningLab
          session={{ ...controller.session, setup: { ...controller.session.setup } }}
          diagnostics={controller}
          onSetup={() => undefined}
          onRestart={() => undefined}
          onRandomize={() => undefined}
        />,
      ),
    );
    expect(container.querySelector('.match-status-title')!.textContent).toBe('GRA AUTONOMICZNA');
    act(() => vi.advanceTimersByTime(10));
    expect(controller.latestState.time).toBeGreaterThan(0.1);
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
