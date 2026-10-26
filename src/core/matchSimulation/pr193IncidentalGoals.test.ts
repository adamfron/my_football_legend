import { describe, it, expect } from 'vitest';
import { createTransitionFixture } from './transitionLaboratory';
import { stepTacticalMatchAfterDecisionProbe as step } from './matchSimulation';
import { tacticalMatchStateSchema } from './matchState';
const fixture = (own = false) => {
  const f = createTransitionFixture({ id: 'incidental-goal', scenario: 'deflection' }),
    s = f.state;
  s.players.forEach((p, i) => {
    p.position = { x: 25 + (i % 6) * 4, y: 5 + Math.floor(i / 6) * 14 };
    p.target = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  });
  s.ball = {
    x: 104.5,
    y: 34,
    height: 0.8,
    velocity: { x: 20, y: 0, z: 0 },
    airborne: true,
    looseSince: s.time,
    lastTouchPlayerId: own ? f.defenderId : f.carrierId,
  };
  delete s.onBallPreparation;
  if (own) s.possessionTeam = 'away';
  s.actionCooldown = 5;
  return { ...f, state: s };
};
const advance = (state: ReturnType<typeof fixture>['state']) => {
  let s = state;
  for (let i = 0; i < 12; i++) {
    s = step(s, 0.025);
    if (s.postGoal || s.restart) break;
  }
  return s;
};
describe('PR193 opt-in incidental goals', () => {
  it('requires a real whole-ball goal crossing and records a goal without a shot', () => {
    const f = fixture(),
      s = advance(f.state);
    expect(s.score.home).toBe(1);
    expect(s.lastIncidentalGoal?.creditedPlayerId).toBe(f.carrierId);
    expect(s.lastShot).toBeUndefined();
    expect(s.ball.shot).toBeUndefined();
    expect(s.statistics?.players.find((p) => p.playerId === f.carrierId)?.goals).toBe(1);
    expect(s.statistics?.players.reduce((n, p) => n + p.shots, 0)).toBe(1);
    expect(s.statistics?.observedShotIds).toEqual([]);
    const next = step(s, 0.025);
    expect(next.statistics?.players.reduce((n, p) => n + p.goals, 0)).toBe(1);
    expect(tacticalMatchStateSchema.safeParse(next).success).toBe(true);
  });
  it('keeps own-goal attribution separate from an attacking scorer and intentional shot', () => {
    const f = fixture(true),
      s = advance(f.state);
    expect(s.score.home).toBe(1);
    expect(s.lastIncidentalGoal?.ownGoalPlayerId).toBe(f.defenderId);
    expect(s.lastIncidentalGoal?.creditedPlayerId).toBeNull();
    expect(s.statistics?.players.find((p) => p.playerId === f.defenderId)?.ownGoals).toBe(1);
    expect(s.statistics?.players.reduce((n, p) => n + p.shots + p.goals, 0)).toBe(0);
  });
  it('does not score a wide ball or a direct throw-in into the opposing goal', () => {
    const wide = fixture();
    wide.state.ball.y = 39;
    expect(advance(wide.state).score.home).toBe(0);
    const direct = fixture();
    direct.state.restartTouchRestriction = {
      awardId: 'throw',
      scenario: 'throw_in',
      takerId: direct.carrierId,
      team: 'home',
      indirect: false,
      touchedByOther: false,
    };
    const s = advance(direct.state);
    expect(s.score.home).toBe(0);
    expect(s.scenario).toBe('goal_kick');
    expect(s.lastIncidentalGoal).toBeUndefined();
  });
  it('resolves the physical post before an own-goal crossing', () => {
    const f = fixture(true);
    f.state.ball.y = 30.5;
    const s = advance(f.state);
    expect(s.score.home).toBe(0);
    expect(s.lastBallContact?.kind).toBe('left_post');
    expect(s.ball.velocity!.x).toBeLessThan(0);
  });
  it('preserves the historical route when the experiment is absent', () => {
    const f = fixture();
    delete f.state.experimentalIncidentalGoals;
    const s = advance(f.state);
    expect(s.score.home).toBe(0);
    expect(s.lastIncidentalGoal).toBeUndefined();
    expect(s.statistics?.players.every((p) => p.ownGoals === undefined)).toBe(true);
  });
});
