import { describe, expect, it } from 'vitest';
import { Pr175Observer } from './pr175Observer';
import { shotProbeFixture } from './pr171Probes';
import { rankAvailableActionsForAI, resolveMatchAction } from '../src/core/matchSimulation/matchActions';

describe('PR175 offline causal observations', () => {
  it('retains exact choice and release identities without mutating a frozen state', () => {
    const { state, actorId } = shotProbeFixture('unmarked_striker', 'pr175-observer');
    const before = JSON.stringify(state), observer = new Pr175Observer();
    const ranking = rankAvailableActionsForAI(state, actorId);
    const shot = ranking.find((r) => r.action.type === 'shot')!.action;
    observer.decision(state, actorId, ranking, shot);
    const next = resolveMatchAction(state, shot);
    observer.observe(state, next);
    observer.observe(state, next);
    const result = observer.snapshot(next);
    expect(JSON.stringify(state)).toBe(before);
    expect(result.shots).toHaveLength(1);
    expect(result.shots[0]?.choiceId).toBe(result.choices[0]?.id);
    expect(result.shots[0]?.diagnostic.shotId).toBe(next.ball.shot?.shotId);
    expect(result.episodes[0]?.stages).toContain('physical_shot_release');
  });
  it('does not turn a rejected incoming proposal into a selected action', () => {
    const { state, actorId } = shotProbeFixture('first_time', 'pr175-incoming');
    const observer = new Pr175Observer();
    observer.decision(state, actorId, rankAvailableActionsForAI(state, actorId), undefined, true);
    expect(observer.snapshot(state).choices[0]?.selected).toBeNull();
  });
  it('does not attach an old retained scoring shot to a new unrelated boundary goal', () => {
    const { state, actorId } = shotProbeFixture('unmarked_striker', 'pr175-goal');
    const action = rankAvailableActionsForAI(state, actorId).find((r) => r.action.type === 'shot')!.action;
    const launched = resolveMatchAction(state, action);
    const old = { ...launched.ball.shot!, outcome: 'goal' as const };
    const previous = { ...state, lastShot: old };
    const next = { ...previous, time: previous.time + 0.025, score: { home: 1, away: 0 } };
    const observer = new Pr175Observer();
    observer.observe(previous, next);
    expect(observer.snapshot(next).goals[0]?.shotId).toBeNull();
  });
});
