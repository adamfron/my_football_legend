// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import { PressingTracker } from './pressingDiagnostics';
import * as defence from './defensiveChallenges';
import * as positioning from './tacticalPositioning';
import type { TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr157-observer',
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.currentPressure = 0.9;
  const carrier = state.players.find((p) => p.team === 'home' && p.slot.position !== 'goalkeeper')!;
  const primary = state.players.find((p) => p.team === 'away' && p.slot.position !== 'goalkeeper')!;
  carrier.position = { x: 50, y: 34 };
  carrier.velocity = { x: 0, y: 0 };
  primary.position = { x: 51.5, y: 34 };
  primary.velocity = { x: 0, y: 0 };
  primary.target = { ...primary.position };
  state.ball = { x: 50.3, y: 34, ownerId: carrier.id };
  const probes = {
    ...defence,
    ...positioning,
    derivePressingAssignment: () => ({ primary: primary.id, screen: [] }),
    deriveCooperativePress: () => undefined,
    rankAvailableActionsForAI: () => [],
    deriveBuildUpSupport: () => [],
  };
  return { state, carrier, primary, probes };
};
const advance = (state: TacticalMatchState, dt = 0.025) => ({ ...state, time: state.time + dt });
describe('bounded pressing lifecycle observer', () => {
  it('records the reproduced stationary press without altering any canonical input', () => {
    const { state, probes } = fixture();
    const original = JSON.stringify(state);
    const tracker = new PressingTracker(probes);
    let next = state;
    for (let i = 0; i < 140; i++) {
      const previous = next;
      next = advance(previous);
      tracker.observe(previous, next);
    }
    tracker.close(next);
    const report = tracker.snapshot();
    expect(report.staticEpisodes).toBe(1);
    expect(report.staticSeconds).toBeGreaterThan(2);
    expect(JSON.stringify(state)).toBe(original);
    expect(next.ball).toBe(state.ball);
    expect(report.retainedEpisodes[0]!.samples.length).toBeLessThanOrEqual(8);
  });
  it('recognises an evolving target and an active lateral contain as responsive', () => {
    for (const movement of [false, true]) {
      const { state, primary, probes } = fixture();
      let next = state;
      const tracker = new PressingTracker(probes, (s) => ({
        intention: 'contain',
        target: { x: 51.5, y: 34 + s.time },
      }));
      if (movement) primary.velocity = { x: 0, y: 0.6 };
      for (let i = 0; i < 160; i++) {
        const previous = next;
        next = advance(previous);
        tracker.observe(previous, next);
      }
      tracker.close(next);
      expect(tracker.snapshot().staticEpisodes).toBe(0);
    }
  });
  it('does not mistake repeated unchanged hold decisions for an evolving solution', () => {
    const { state, probes } = fixture();
    const tracker = new PressingTracker(probes);
    let next = state;
    for (let i = 0; i < 160; i++) {
      const previous = next;
      next = { ...advance(previous), decisionIndex: previous.decisionIndex + 1 };
      tracker.observe(previous, next);
    }
    tracker.close(next);
    expect(tracker.snapshot().staticEpisodes).toBe(1);
  });
  it('measures a controlled ball touch relative to the carrier without an explicit velocity', () => {
    const { state, probes } = fixture();
    const tracker = new PressingTracker(probes);
    let next = state;
    for (let i = 0; i < 160; i++) {
      const previous = next;
      next = { ...advance(previous), ball: { ...previous.ball, x: previous.ball.x + 0.02 } };
      tracker.observe(previous, next);
    }
    tracker.close(next);
    const report = tracker.snapshot();
    expect(report.staticEpisodes).toBe(0);
    expect(report.retainedEpisodes[0]!.samples[0]!.ballRelativeSpeed).toBeCloseTo(0.8);
  });
  it('starts during a closing approach and closes on release rather than proximity alone', () => {
    const { state, carrier, primary, probes } = fixture();
    primary.position = { x: 58, y: 34 };
    primary.velocity = { x: -2, y: 0 };
    const tracker = new PressingTracker(probes);
    const next = advance(state);
    tracker.observe(state, next);
    const released = advance(next);
    released.ball = { x: 50.3, y: 34 };
    tracker.observe(next, released);
    const report = tracker.snapshot();
    expect(report.episodes).toBe(1);
    expect(report.retainedEpisodes[0]!.carrier).toBe(carrier.id);
    expect(report.retainedEpisodes[0]!.initialDistance).toBe(8);
    expect(report.retainedEpisodes[0]!.samples[0]!.stage).toBe('approach');
  });
  it('retains at most 256 episode summaries while totals include older episodes', () => {
    const { state, carrier, probes } = fixture();
    const tracker = new PressingTracker(probes);
    let next = state;
    for (let i = 0; i < 300; i++) {
      const previous = next;
      next = { ...advance(previous), ball: { x: 50.3, y: 34, ownerId: carrier.id } };
      tracker.observe(previous, next);
      const controlled = next;
      next = { ...advance(controlled), ball: { x: 50.3, y: 34 } };
      tracker.observe(controlled, next);
    }
    const report = tracker.snapshot();
    expect(report.episodes).toBe(300);
    expect(report.retainedEpisodes).toHaveLength(256);
    expect(report.durationHistogram.reduce((s, n) => s + n, 0)).toBe(300);
  });
});
