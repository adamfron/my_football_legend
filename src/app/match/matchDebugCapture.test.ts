import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXED_MATCH_DT, type TacticalMatchState } from '../../core/matchSimulation';
import type { SingleMatchSession } from '../../core/singleMatch';
import {
  MatchDebugRecorder,
  isCaptureTriggerDisabled,
  projectDebugEvents,
  saveDebugPackage,
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

  it('can complete and reset captures repeatedly without losing its rolling history', () => {
    const recorder = new MatchDebugRecorder();
    for (let index = 0; index <= 200; index += 1)
      recorder.record(minimalState(index * FIXED_MATCH_DT));
    expect(recorder.trigger(10)).toBe(true);
    recorder.record(minimalState(20));
    expect(recorder.isComplete(20)).toBe(true);
    recorder.resetCapture();
    expect(recorder.triggerTime).toBeUndefined();
    recorder.record(minimalState(21));
    expect(recorder.trigger(21)).toBe(true);
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

describe('ViewportVideoRecorder', () => {
  const originalMediaDevices = navigator.mediaDevices;
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
  });

  it('starts directly from the pitch canvas without requesting screen permission', () => {
    vi.useFakeTimers();
    const getDisplayMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia },
    });
    const source = document.createElement('canvas');
    source.width = 320;
    source.height = 180;
    const recorder = new ViewportVideoRecorder();
    expect(recorder.start(source, () => 0)).toBe(true);
    expect(getDisplayMedia).not.toHaveBeenCalled();
    recorder.dispose();
  });

  it('keeps sampling enabled while finish encodes a snapshot for reuse', async () => {
    const recorder = new ViewportVideoRecorder();
    (recorder as unknown as { timer: number; frames: unknown[] }).timer = 1;
    (recorder as unknown as { frames: unknown[] }).frames = [];
    await expect(recorder.finish()).resolves.toBeUndefined();
    expect(recorder.active).toBe(true);
    recorder.dispose();
  });

  it('bounds the visual pre-buffer to approximately ten wall-clock seconds', async () => {
    const recorder = new ViewportVideoRecorder();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    Object.assign(recorder as unknown as Record<string, unknown>, {
      timer: 1,
      source: { width: 320, height: 180 },
      canvas: {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['frame'])),
      },
    });
    const sample = (
      recorder as unknown as { sample(canonicalTime: number): Promise<void> }
    ).sample.bind(recorder);
    for (let index = 0; index < 200; index += 1) {
      now = index * 100;
      await sample(index / 10);
    }
    expect(recorder.bufferedSeconds).toBeCloseTo(10);
    expect(recorder.bufferedFrameCount).toBeLessThanOrEqual(101);
    recorder.dispose();
  });
});

describe('debug capture UX and package saving', () => {
  it('disables the trigger only while capturing or processing', () => {
    expect(isCaptureTriggerDisabled('capturing')).toBe(true);
    expect(isCaptureTriggerDisabled('processing')).toBe(true);
    expect(isCaptureTriggerDisabled('idle')).toBe(false);
    expect(isCaptureTriggerDisabled('ready')).toBe(false);
    expect(isCaptureTriggerDisabled('saved')).toBe(false);
  });

  it('writes JSON and WebM through a directory picker', async () => {
    const writes: [string, Blob][] = [];
    const picker = vi.fn(async () => ({
      name: 'debugi',
      getFileHandle: async (name: string) => ({
        createWritable: async () => ({
          write: async (blob: Blob) => void writes.push([name, blob]),
          close: async () => undefined,
        }),
      }),
    }));
    const result = await saveDebugPackage(
      { basename: 'capture', json: new Blob(['{}']), video: new Blob(['video']) },
      picker,
    );
    expect(writes.map(([name]) => name)).toEqual(['capture.json', 'capture.webm']);
    expect(result).toEqual({ status: 'saved', message: 'Zapisano JSON + WebM w: debugi' });
  });

  it('keeps a prepared package intact when folder selection is cancelled', async () => {
    const pkg = { basename: 'capture', json: new Blob(['{}']) };
    const picker = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError');
    });
    await expect(saveDebugPackage(pkg, picker)).resolves.toEqual({ status: 'cancelled' });
    await expect(saveDebugPackage(pkg, picker)).resolves.toEqual({ status: 'cancelled' });
  });

  it('falls back to browser downloads and supports JSON-only packages', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const result = await saveDebugPackage(
      { basename: 'capture', json: new Blob(['{}']) },
      undefined,
    );
    expect(click).toHaveBeenCalledOnce();
    expect(createUrl).toHaveBeenCalledOnce();
    expect(result.status).toBe('downloaded');
    click.mockRestore();
    createUrl.mockRestore();
  });
});
