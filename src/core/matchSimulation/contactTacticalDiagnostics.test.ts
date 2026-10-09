// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { ContactTacticalTracker, contactTacticalSummarySchema } from './contactTacticalDiagnostics';
import { resolveMatchAction } from './matchActions';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr158-clock-observer',
      control: { mode: 'spectator' },
    }),
  );
  state.playerAgencyEnabled = false;
  state.scenario = 'open_play';
  delete state.restart;
  state.time = 100;
  const home = state.players.find((p) => p.team === 'home' && p.slot.position !== 'goalkeeper')!;
  const away = state.players.find((p) => p.team === 'away' && p.slot.position !== 'goalkeeper')!;
  home.position = { x: 50, y: 34 };
  away.position = { x: 52, y: 34 };
  state.ball = { x: 50.4, y: 34, ownerId: home.id };
  state.possessionTeam = 'home';
  state.actionCooldown = 20;
  return { state, home, away };
};

describe('PR158 bounded observational contact, transition and workload diagnostics', () => {
  it('does not change canonical state or RNG-driven football with observation enabled', () => {
    const { state } = fixture();
    let observed = structuredClone(state),
      plain = structuredClone(state);
    const tracker = new ContactTacticalTracker();
    for (let i = 0; i < 400; i++) {
      const previous = observed;
      observed = stepTacticalMatchAfterDecisionProbe(observed, 0.025);
      const before = JSON.stringify(observed);
      tracker.observe(previous, observed);
      expect(JSON.stringify(observed)).toBe(before);
      plain = stepTacticalMatchAfterDecisionProbe(plain, 0.025);
    }
    expect(observed).toEqual(plain);
    const summary = tracker.snapshot(observed);
    expect(contactTacticalSummarySchema.safeParse(summary).success).toBe(true);
    expect(summary.workload).toHaveLength(22);
    expect(summary.workload.reduce((sum, p) => sum + p.distance, 0)).toBeGreaterThan(0);
  });

  it('separates loss→pressure, loss→regain and pressure→regain clocks', () => {
    const { state, home, away } = fixture();
    const tracker = new ContactTacticalTracker();
    const lost = structuredClone(state);
    lost.time = 101;
    lost.possessionTeam = 'away';
    lost.ball.ownerId = away.id;
    lost.ball.x = 52;
    lost.nearestChallengerId = home.id;
    lost.lastPossessionLoss = {
      id: 'loss',
      at: 101,
      from: 'home',
      to: 'away',
      cause: 'tackle',
      position: { x: 52, y: 34 },
      loserId: home.id,
      winnerId: away.id,
    };
    tracker.observe(state, lost);
    const pressure = structuredClone(lost);
    pressure.time = 103;
    pressure.players.find((p) => p.id === home.id)!.locomotionReason = 'press_commit';
    tracker.observe(lost, pressure);
    const pressured = structuredClone(pressure);
    pressured.time = 103.025;
    tracker.observe(pressure, pressured);
    const regained = structuredClone(pressured);
    regained.time = 107;
    regained.ball.ownerId = home.id;
    regained.possessionTeam = 'home';
    regained.lastPossessionChange = {
      at: 107,
      from: 'away',
      to: 'home',
      cause: 'claim',
      winnerId: home.id,
    };
    tracker.observe(pressured, regained);
    const values = tracker.snapshot(regained).clocks.home;
    expect(values.lossToPressure).toEqual([0, 1, 0, 0, 0, 0]);
    expect(values.lossToRegain).toEqual([0, 0, 0, 1, 0, 0]);
    expect(values.pressureToRegain).toEqual([0, 0, 1, 0, 0, 0]);
    expect(values.regainToShot.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('records a post-regain shot separately from a goal and never treats xG as either', () => {
    const { state, home, away } = fixture();
    const tracker = new ContactTacticalTracker();
    const lost = structuredClone(state);
    lost.time = 101;
    lost.lastPossessionLoss = {
      id: 'loss',
      at: 101,
      from: 'home',
      to: 'away',
      cause: 'tackle',
      position: { x: 52, y: 34 },
      loserId: home.id,
      winnerId: away.id,
    };
    tracker.observe(state, lost);
    const regained = structuredClone(lost);
    regained.time = 102;
    regained.players.find((p) => p.id === home.id)!.position = { x: 94, y: 34 };
    regained.players.find((p) => p.id === home.id)!.facingAngle = Math.PI / 2;
    regained.ball = { x: 94.4, y: 34, ownerId: home.id };
    regained.lastPossessionChange = {
      at: 102,
      from: 'away',
      to: 'home',
      cause: 'claim',
      winnerId: home.id,
    };
    tracker.observe(lost, regained);
    const shot = resolveMatchAction(
      { ...regained, time: 104, actionCooldown: 0 },
      {
        type: 'shot',
        actorId: home.id,
        intent: 'driven',
        contact: 'settled',
        target: { x: 105, y: 34 },
      },
      'human_selected',
    );
    expect(shot.ball.shot).toBeDefined();
    tracker.observe(regained, shot);
    const values = tracker.snapshot().clocks.home;
    expect(values.regainToShot).toEqual([0, 1, 0, 0, 0, 0]);
    expect(values.regainToGoal.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('flags rotation with little net progress without banning a successful turn', () => {
    const { state, home } = fixture();
    const tracker = new ContactTacticalTracker();
    let previous = state;
    for (let i = 0; i < 12; i++) {
      const next = structuredClone(previous);
      next.time += 0.025;
      next.players.find((p) => p.id === home.id)!.facingAngle += Math.PI / 3;
      tracker.observe(previous, next);
      previous = next;
    }
    const summary = tracker.snapshot(previous);
    expect(summary.rotationOver180LowProgress).toBe(1);
    expect(summary.rotationOver360LowProgress).toBe(1);
    expect(previous.ball.ownerId).toBe(home.id);
    expect(summary.rotationTraces[0]!.absoluteRotation).toBeCloseTo(Math.PI * 4);
  });

  it('counts a rapid 90° movement turn spread across legal 25ms ticks once', () => {
    const { state, home } = fixture();
    state.players.find((p) => p.id === home.id)!.velocity = { x: 4, y: 0 };
    const tracker = new ContactTacticalTracker();
    let previous = state;
    for (let i = 1; i <= 20; i++) {
      const next = structuredClone(previous);
      next.time += 0.025;
      const angle = ((Math.PI / 2) * i) / 20;
      next.players.find((p) => p.id === home.id)!.velocity = {
        x: 4 * Math.cos(angle),
        y: 4 * Math.sin(angle),
      };
      tracker.observe(previous, next);
      previous = next;
    }
    expect(tracker.snapshot().workload.find((p) => p.playerId === home.id)!.sharpTurns).toBe(1);
  });
});
