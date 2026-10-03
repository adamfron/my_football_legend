// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { emitMatchEvents, matchEventSchema } from './matchEventFeed';
import { emitCanonicalActionEvents } from './actionEvents';
import { resolveMatchAction } from './matchActions';
import { projectMatchCentreStatistics } from './matchCentreStatistics';
import {
  MatchReplayHistory,
  matchReplayWindowSchema,
  REPLAY_MAX_ROLLING_SAMPLES,
  REPLAY_MAX_WINDOWS,
  REPLAY_MAX_WINDOW_SAMPLES,
} from './matchReplay';
import type { TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = () =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr149-events',
      control: { mode: 'spectator' },
    }),
  );

describe('permanent canonical match feed and recorded replay', () => {
  it('records a physical goal with the scorer, score and exact shot reference across the following kickoff', () => {
    const initial = fixture();
    const shooter = initial.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
    )!;
    initial.players = initial.players.map((player) => ({
      ...player,
      position: player.id === shooter.id ? { x: 94, y: 34 } : { x: 30, y: 8 },
      velocity: { x: 0, y: 0 },
    }));
    initial.ball = { x: 94, y: 34, ownerId: shooter.id };
    let state = resolveMatchAction(initial, {
      type: 'shot',
      actorId: shooter.id,
      target: { x: 105, y: 34 },
      intent: 'placed',
    });
    expect(state.ball.shot).toBeDefined();
    const shotId = state.ball.shot!.shotId;
    // A well-directed released flight crosses the real goal plane; no score/event is injected.
    state.ball = {
      ...state.ball,
      height: 0.11,
      airborne: true,
      velocity: { x: 27, y: 0.8, z: 3 },
      launchVelocity: { x: 27, y: 0.8, z: 3 },
    };
    const history = new MatchReplayHistory();
    history.observe(initial);
    for (let tick = 0; tick < 180; tick++) {
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      history.observe(state);
    }
    expect(state.lastBallContact?.kind).toBe('goal_plane');
    expect(state.score).toEqual({ home: 1, away: 0 });
    const goals = state.matchEvents!.filter((event) => event.kind === 'goal');
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({
      actorId: shooter.id,
      team: 'home',
      score: state.score,
      actionEventId: `${state.seed}:action:shot:${shotId}`,
    });
    expect(state.matchEvents?.some((event) => event.kind === 'kick_off')).toBe(true);
    expect(projectMatchCentreStatistics(state).home).toMatchObject({
      goals: 1,
      shots: 1,
      shotsOnTarget: 1,
    });
    expect(history.hasWindow(goals[0]!.replayKey)).toBe(true);
    expect(matchReplayWindowSchema.safeParse(history.getWindow(goals[0]!.replayKey)).success).toBe(
      true,
    );
  });

  it('links each delayed card to its own canonical action when one player receives both cautions', () => {
    const previous = fixture();
    const actor = previous.players[1]!;
    const cards = (['yellow', 'second_yellow_red'] as const).map((kind, index) => ({
      id: `delayed-card-${index}`,
      foulId: `delayed-foul-${index}`,
      at: 10,
      foulAt: 7 + index,
      actorId: actor.id,
      team: actor.team,
      position: actor.position,
      kind,
      reason: 'reckless_challenge',
      delayed: true,
    }));
    const next = emitMatchEvents(
      previous,
      emitCanonicalActionEvents(previous, {
        ...previous,
        time: 10,
        recentCards: cards,
        lastCard: cards[1]!,
      }),
    );
    expect(next.matchEvents?.map((event) => event.actionEventId)).toEqual(
      cards.map((card) => `${next.seed}:action:card:${card.id}`),
    );
  });

  it('keeps goals, card subtypes and penalties after action evidence expires, exactly once', () => {
    const previous = fixture();
    const actor = previous.players[1]!;
    const victim = previous.players[12]!;
    const foul = {
      id: 'foul-1',
      challengeId: 'contact-1',
      at: 4,
      actorId: actor.id,
      team: actor.team,
      opponentId: victim.id,
      awardedTeam: victim.team,
      position: actor.position,
      severity: 'reckless' as const,
      tactical: false,
      promisingAttack: false,
      dogso: false,
      penalty: true,
      card: 'yellow' as const,
    };
    const cards = (['yellow', 'second_yellow_red', 'red'] as const).map((kind, i) => ({
      id: `card-${i}`,
      foulId: foul.id,
      at: 4 + i,
      foulAt: 4,
      actorId: actor.id,
      team: actor.team,
      position: actor.position,
      kind,
      reason: 'canonical_contact',
      delayed: i > 0,
    }));
    const next = emitMatchEvents(previous, {
      ...previous,
      time: 6,
      score: { home: 1, away: 0 },
      lastFoul: foul,
      lastPenaltyAwardId: foul.id,
      recentCards: cards,
      lastCard: cards[2]!,
    });
    expect(next.matchEvents?.map((e) => e.kind)).toEqual([
      'goal',
      'foul',
      'yellow_card',
      'second_yellow_red',
      'red_card',
      'penalty',
    ]);
    expect(next.matchEvents?.find((e) => e.kind === 'goal')?.score).toEqual(next.score);
    expect(next.matchEvents?.find((e) => e.kind === 'penalty')?.team).toBe(victim.team);
    expect(next.matchEvents?.every((e) => matchEventSchema.safeParse(e).success)).toBe(true);
    expect(emitMatchEvents(previous, next).matchEvents).toBe(next.matchEvents);
    const later = emitMatchEvents(next, { ...next, time: 200, actionEvents: [] });
    expect(later.matchEvents).toBe(next.matchEvents);
  });

  it('recording canonical samples cannot change live football, stats or choices', () => {
    let observed = fixture(),
      headless = fixture();
    const history = new MatchReplayHistory();
    for (let i = 0; i < 320; i++) {
      observed = stepTacticalMatchAfterDecisionProbe(observed, FIXED_MATCH_DT);
      const before = JSON.stringify(observed);
      history.observe(observed);
      expect(JSON.stringify(observed)).toBe(before);
      headless = stepTacticalMatchAfterDecisionProbe(headless, FIXED_MATCH_DT);
    }
    expect(observed).toEqual(headless);
    expect(history.snapshot().rollingSamples).toBeGreaterThan(1);
  });

  it('bounds samples and event windows, preserves incident roster and protects live state from replay edits', () => {
    let state = fixture();
    const actor = state.players[1]!;
    const history = new MatchReplayHistory();
    history.observe(state);
    for (let i = 1; i <= 1800; i++) {
      state = { ...state, time: i / 5 };
      if (i % 100 === 0) {
        const event = {
          id: `red-${i}`,
          replayKey: `red-${i}`,
          kind: 'red_card' as const,
          at: state.time,
          team: actor.team,
          actorId: actor.id,
        };
        state = { ...state, matchEvents: [...(state.matchEvents ?? []), event] };
      }
      if (i === 1800)
        state = {
          ...state,
          players: state.players.filter((p) => p.id !== actor.id),
          discipline: {
            [actor.id]: { team: actor.team, yellowCards: 0, sentOff: true, sentOffAt: state.time },
          },
        };
      history.observe(state);
    }
    const metrics = history.snapshot();
    expect(metrics.rollingSamples).toBeLessThanOrEqual(REPLAY_MAX_ROLLING_SAMPLES);
    expect(metrics.windows).toBe(REPLAY_MAX_WINDOWS);
    expect(history.getWindow('red-100')).toBeUndefined();
    const window = history.getWindow('red-1800')!;
    expect(window.frames.length).toBeLessThanOrEqual(REPLAY_MAX_WINDOW_SAMPLES);
    expect(matchReplayWindowSchema.safeParse(window).success).toBe(true);
    expect(window.frames[0]!.players.some((p) => p.id === actor.id)).toBe(true);
    expect(window.frames.at(-1)!.players.some((p) => p.id === actor.id)).toBe(false);
    expect(window.frames.at(-1)!.dismissals[actor.id]).toBe(state.time * 1000);
    window.frames[0]!.players[0]!.x = 0;
    expect(history.getWindow('red-1800')!.frames[0]!.players[0]!.x).not.toBe(0);
    expect(state.matchEvents).toHaveLength(18);
    expect(metrics.retainedSamples).toBeLessThanOrEqual(
      REPLAY_MAX_ROLLING_SAMPLES + REPLAY_MAX_WINDOWS * REPLAY_MAX_WINDOW_SAMPLES,
    );
    expect(metrics.estimatedBytes).toBeGreaterThan(0);
    const terminal: TacticalMatchState = {
      ...state,
      time: state.time + 0.025,
      status: 'full_time',
    };
    history.observe(terminal);
    expect(history.getWindow('red-1800')!.complete).toBe(true);
  });

  it('resets replay recordings when a different match or rewind is observed', () => {
    const state = fixture();
    const history = new MatchReplayHistory();
    history.observe({ ...state, time: 20 });
    history.observe({ ...state, time: 21 });
    history.observe({ ...state, time: 1 });
    expect(history.snapshot().rollingSamples).toBe(1);
    history.observe({ ...state, seed: 'another', time: 0 });
    expect(history.snapshot().windows).toBe(0);
    expect(history.snapshot().rollingSamples).toBe(1);
  });

  it('never offers an old unrecorded incident as a replay of later unrelated frames', () => {
    const initial = fixture();
    const history = new MatchReplayHistory();
    const event = {
      id: 'old-goal',
      replayKey: 'old-goal',
      kind: 'goal' as const,
      at: 5,
      team: 'home' as const,
      score: { home: 1, away: 0 },
    };
    history.observe(initial);
    const loaded = { ...initial, time: 20, matchEvents: [event] };
    history.observe(loaded);
    history.observe({ ...loaded, time: 20.2 });
    expect(history.getWindow(event.replayKey)).toBeUndefined();
    expect(history.hasWindow(event.replayKey)).toBe(false);
    expect(loaded.matchEvents).toEqual([event]);
  });

  it('resets even a rewind inside the sampling interval and replaces repeated incident snapshots', () => {
    const initial = fixture();
    const history = new MatchReplayHistory();
    history.observe(initial);
    history.observe({ ...initial, time: 0.1 });
    history.observe({ ...initial, time: 0.05 });
    expect(history.snapshot().rollingSamples).toBe(1);
    const event = {
      id: 'same-clock-goal',
      replayKey: 'same-clock-goal',
      kind: 'goal' as const,
      at: 0.25,
      team: 'home' as const,
      score: { home: 1, away: 0 },
    };
    const scored = { ...initial, time: 0.25, matchEvents: [event] };
    history.observe(scored);
    history.observe({
      ...scored,
      ball: { x: 104, y: 34 },
      matchEvents: [
        event,
        {
          id: 'same-clock-card',
          replayKey: 'same-clock-card',
          kind: 'red_card',
          at: scored.time,
          team: 'home',
          actorId: initial.players[1]!.id,
        },
      ],
    });
    expect(history.getWindow(event.replayKey)!.frames.at(-1)!.ball.x).toBe(104);
    expect(scored.ball.x).not.toBe(104);
  });
});
