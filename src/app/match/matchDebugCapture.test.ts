import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXED_MATCH_DT, type TacticalMatchState } from '../../core/matchSimulation';
import type { SingleMatchSession } from '../../core/singleMatch';
import {
  MatchDebugRecorder,
  projectDebugEvents,
  snapshotMatchState,
  ViewportVideoRecorder,
} from './matchDebugCapture';

const minimalState = (
  time: number,
  overrides: Partial<TacticalMatchState> = {},
): TacticalMatchState => ({
  seed: 'debug-test',
  time,
  decisionIndex: Math.round(time / FIXED_MATCH_DT),
  teams: {
    home: {
      side: 'home',
      clubId: 'h',
      formation: '4-4-2',
      style: 'balanced',
      phase: 'positional_attack',
      phaseElapsed: time,
    },
    away: {
      side: 'away',
      clubId: 'a',
      formation: '4-4-2',
      style: 'balanced',
      phase: 'defensive_block',
      phaseElapsed: time,
    },
  },
  players: [],
  ball: { x: 52, y: 34 },
  possessionTeam: 'home',
  timeSincePossessionChanged: time,
  actionCooldown: 0,
  scenario: 'open_play',
  score: { home: 0, away: 0 },
  currentPressure: 0,
  ...overrides,
});

describe('MatchDebugRecorder', () => {
  it('keeps a bounded canonical circular buffer and removes oldest frames', () => {
    const recorder = new MatchDebugRecorder();
    for (let index = 0; index <= 800; index += 1)
      recorder.record(minimalState(index * FIXED_MATCH_DT));
    expect(recorder.historyFrames.length).toBeLessThanOrEqual(402);
    expect(recorder.historyFrames[0]!.time).toBeGreaterThanOrEqual(10);
  });

  it('preserves pre-roll and ends at trigger plus ten canonical seconds', () => {
    const recorder = new MatchDebugRecorder();
    for (let index = 0; index <= 480; index += 1)
      recorder.record(minimalState(index * FIXED_MATCH_DT));
    recorder.trigger(12);
    for (let index = 481; index <= 880; index += 1)
      recorder.record(minimalState(index * FIXED_MATCH_DT));
    expect(recorder.historyFrames.at(-1)!.time).toBeCloseTo(22);
    expect(recorder.isComplete(22)).toBe(true);
  });

  it('reports a shorter real pre-roll for an early trigger', () => {
    const recorder = new MatchDebugRecorder();
    for (let index = 0; index <= 160; index += 1)
      recorder.record(minimalState(index * FIXED_MATCH_DT));
    recorder.trigger(4);
    for (let index = 161; index <= 560; index += 1)
      recorder.record(minimalState(index * FIXED_MATCH_DT));
    const trace = recorder.export(
      {
        setup: {
          seed: 'debug-test',
          homeClubId: 'h',
          awayClubId: 'a',
          control: { mode: 'spectator' },
        },
        home: { club: { id: 'h', name: 'Home' }, formation: '4-4-2', strength: 50, players: [] },
        away: { club: { id: 'a', name: 'Away' }, formation: '4-4-2', strength: 50, players: [] },
      } as unknown as SingleMatchSession,
      FIXED_MATCH_DT,
      { width: 100, height: 100 },
      false,
      15,
    );
    expect(trace.metadata.window.actualStart).toBe(0);
    expect(trace.metadata.window.actualEnd).toBeCloseTo(14);
  });

  it('records scenario harness interaction in uiEvents', () => {
    const recorder = new MatchDebugRecorder();
    recorder.record(minimalState(1));
    recorder.ui(1, 'scenario_button_clicked', { scenario: 'free_kick_far' });
    recorder.trigger(1);
    expect(
      (recorder as unknown as { capturedUi: { type: string }[] }).capturedUi.map(
        (event) => event.type,
      ),
    ).toContain('scenario_button_clicked');
  });

  it('projects possession, restart and goal without mutating either state', () => {
    const before = minimalState(1),
      after = minimalState(1.025, {
        possessionTeam: 'away',
        restart: {
          phase: 'setup',
          restartTeam: 'away',
          takerId: 'p',
          startedAt: 1.025,
          targets: {},
          executionChoices: [],
          roles: {},
        },
        score: { home: 0, away: 1 },
      });
    const frozen = structuredClone(after),
      events = projectDebugEvents(snapshotMatchState(before), snapshotMatchState(after));
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['possession_changed', 'restart_setup', 'goal']),
    );
    expect(after).toEqual(frozen);
  });

  it('observing every tick does not alter deterministic match state', () => {
    const canonicalStates = Array.from({ length: 100 }, (_, index) =>
      minimalState(index * FIXED_MATCH_DT),
    );
    const plain = structuredClone(canonicalStates),
      observed = structuredClone(canonicalStates);
    const recorder = new MatchDebugRecorder();
    observed.forEach((state) => recorder.record(state));
    expect(observed).toEqual(plain);
  });
});

describe('ViewportVideoRecorder fallbacks', () => {
  const originalMediaDevices = navigator.mediaDevices;
  afterEach(() =>
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    }),
  );
  it('allows JSON-only mode when screen capture API is absent', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    await expect(new ViewportVideoRecorder().enable(() => 0)).resolves.toBe(false);
  });
  it('handles denied permission without throwing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    await expect(new ViewportVideoRecorder().enable(() => 0)).resolves.toBe(false);
  });
  it('stops all capture tracks during cleanup', () => {
    const stop = vi.fn(),
      recorder = new ViewportVideoRecorder();
    (recorder as unknown as { stream: MediaStream }).stream = {
      getTracks: () => [{ stop }],
    } as unknown as MediaStream;
    recorder.dispose();
    expect(stop).toHaveBeenCalledOnce();
  });
});
