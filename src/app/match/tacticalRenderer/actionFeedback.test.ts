// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { CanonicalActionEvent } from '../../../core/matchSimulation/actionEvents';
import { PresentationContextHistory } from './contextHistory';
import { PresentationFrameProjector } from './frameProjection';
import { sampleReplayFrame } from './replay';
import { tacticalFrameSchema, type TacticalFrame } from './model';
import { createCanonicalWorldDatabase } from '../../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../../../core/singleMatch';
import { createTacticalMatch } from '../../../core/matchSimulation/matchSimulation';
import { applyChallengeInfringement } from '../../../core/matchSimulation/matchRules';
import { emitCanonicalActionEvents } from '../../../core/matchSimulation/actionEvents';
import {
  actionFeedbackAnchor,
  actionFeedbackText,
  frameActionEvents,
  selectActionFeedback,
} from './actionFeedback';

const event = (
  kind: CanonicalActionEvent['kind'],
  overrides: Partial<CanonicalActionEvent> = {},
): CanonicalActionEvent => ({
  id: kind,
  sequence: 0,
  kind,
  at: 1,
  actorId: kind,
  team: 'home',
  position: { x: 52.5, y: 34 },
  outcome: 'released',
  cause: 'canonical_test',
  ...overrides,
});

describe('canonical micro-feedback projection', () => {
  it('uses only recorded events, Polish labels and canonical lifetimes', () => {
    expect(selectActionFeedback([], 1000)).toEqual([]);
    const heavy = event('heavy_touch');
    expect(selectActionFeedback([heavy], 999)).toEqual([]);
    expect(actionFeedbackText(selectActionFeedback([heavy], 1000)[0]!)).toBe('CIĘŻKIE PRZYJĘCIE');
    expect(selectActionFeedback([heavy], 2099)).toEqual([heavy]);
    expect(selectActionFeedback([heavy], 2100)).toEqual([]);
    expect(actionFeedbackText(event('card', { outcome: 'second_yellow_red' }))).toBe(
      'CZERWONA KARTKA',
    );
    expect(actionFeedbackText(event('slide_tackle'))).toBe('WŚLIZG');
  });

  it('prioritizes outcomes over routine releases, deduplicates and limits the pitch to three labels', () => {
    const inputs = [
      event('pass'),
      event('pass', { id: 'repeat', actorId: 'other', at: 1.1 }),
      event('heavy_touch'),
      event('shot'),
      event('save'),
      event('foul'),
    ];
    expect(selectActionFeedback(inputs, 1150).map((e) => e.kind)).toEqual(['foul', 'save', 'shot']);
    expect(selectActionFeedback([inputs[0]!, inputs[0]!, inputs[1]!], 1150)).toHaveLength(1);
    const actorEvents = [event('pass', { actorId: 'a' }), event('heavy_touch', { actorId: 'a' })];
    expect(selectActionFeedback(actorEvents, 1100).map((e) => e.kind)).toEqual(['heavy_touch']);
    expect(
      selectActionFeedback(
        [
          event('reception'),
          event('challenge', { outcome: 'missed' }),
          event('advantage', { outcome: 'realized' }),
        ],
        1100,
      ),
    ).toEqual([]);
  });

  it('anchors to the recorded actor, with event-position fallback after dismissal', () => {
    const heavy = event('heavy_touch', { actorId: 'a' });
    const frame: TacticalFrame = {
      timestampMs: 1100,
      ball: { x: 45, y: 30 },
      players: [{ id: 'a', team: 'home', x: 50, y: 33 }],
    };
    expect(actionFeedbackAnchor(heavy, frame)).toEqual({ x: 50, y: 33 });
    expect(actionFeedbackAnchor(heavy, { ...frame, players: [] })).toEqual(heavy.position);
  });

  it('reveals events between recorded samples exactly at canonical time in replay and lead-in', () => {
    const heavy = event('heavy_touch', { at: 1.075 });
    const before: TacticalFrame = {
      timestampMs: 1000,
      continuity: 'one',
      players: [],
      ball: { x: 52.5, y: 34 },
      actionEvents: [],
    };
    const after: TacticalFrame = { ...before, timestampMs: 1100, actionEvents: [heavy] };
    expect(sampleReplayFrame([before, after], 1074)!.actionEvents).toEqual([]);
    expect(sampleReplayFrame([before, after], 1075)!.actionEvents).toEqual([heavy]);
    expect(sampleReplayFrame([before, after], 1076)!.actionEvents).toEqual([heavy]);
    expect(tacticalFrameSchema.safeParse(sampleReplayFrame([before, after], 1076)).success).toBe(
      true,
    );

    const world = createCanonicalWorldDatabase();
    const state = createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed: 'pr147-context-feedback',
        control: { mode: 'spectator' },
      }),
    );
    const history = new PresentationContextHistory();
    const projector = new PresentationFrameProjector();
    history.observe({ ...state, time: 1, actionEvents: [] }, true);
    const withEvent = { ...state, time: 1.1, actionEvents: [heavy] };
    history.observe(withEvent, true);
    const leadIn = history.leadIn(1.1, 0.5);
    expect(sampleReplayFrame(leadIn, 1074)!.actionEvents).toEqual([]);
    expect(sampleReplayFrame(leadIn, 1075)!.actionEvents).toEqual([heavy]);
    expect(projector.frame(withEvent).actionEvents).toEqual([heavy]);
    expect(frameActionEvents([heavy], 3000)).toEqual([]);
  });

  it('retains pre-dismissal history and removes the actor at the canonical card boundary', () => {
    const world = createCanonicalWorldDatabase();
    const state = createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed: 'pr147-dismissal-history',
        control: { mode: 'spectator' },
      }),
    );
    state.time = 1;
    const actor = state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const opponent = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const contact = {
      id: 'actual-dismissal-contact',
      at: 1.075,
      actorId: actor.id,
      team: actor.team,
      opponentId: opponent.id,
      technique: 'slide' as const,
      source: 'human_selected' as const,
      position: opponent.position,
      outcome: 'foul' as const,
      ballFirst: true,
      opponentContact: true,
      ballDistance: 1,
      opponentDistance: 1,
      facingError: 0,
      relativeSpeed: 12,
      lateness: 0,
      force: 10,
      fromBehind: false,
    };
    const dismissed = emitCanonicalActionEvents(
      state,
      applyChallengeInfringement({ ...state, time: 1.075 }, contact),
    );
    expect(dismissed.lastCard?.kind).toBe('red');
    expect(dismissed.players.some((player) => player.id === actor.id)).toBe(false);
    const history = new PresentationContextHistory();
    const projector = new PresentationFrameProjector();
    history.observe(state, true);
    const recordedBefore = projector.frame(state);
    history.observe({ ...dismissed, time: 1.1 }, true);
    const frames = history.leadIn(1.1, 0.5);
    expect(frames[1]!.dismissals?.[actor.id]).toBe(1075);
    // Foul restart also changes presentation continuity. It cannot delay roster removal.
    expect(frames[1]!.continuity).not.toBe(frames[0]!.continuity);
    expect(sampleReplayFrame(frames, 1074)!.players.some((player) => player.id === actor.id)).toBe(
      true,
    );
    expect(sampleReplayFrame(frames, 1075)!.players.some((player) => player.id === actor.id)).toBe(
      false,
    );
    expect(sampleReplayFrame(frames, 1080)!.players.some((player) => player.id === actor.id)).toBe(
      false,
    );
    expect(projector.frame(dismissed).players.some((player) => player.id === actor.id)).toBe(false);
    expect(recordedBefore.players.some((player) => player.id === actor.id)).toBe(true);
    expect(frames[0]!.players.some((player) => player.id === actor.id)).toBe(true);
    expect(state.players.some((player) => player.id === actor.id)).toBe(true);
    // The same event gates a continuous replay too, independently of the restart jump.
    const continuous = frames.map((frame) => ({ ...frame, continuity: 'same' }));
    expect(
      sampleReplayFrame(continuous, 1074)!.players.some((player) => player.id === actor.id),
    ).toBe(true);
    expect(
      sampleReplayFrame(continuous, 1075)!.players.some((player) => player.id === actor.id),
    ).toBe(false);
  });

  it('keeps dismissal boundaries after feedback expires across a long replay discontinuity', () => {
    const previous: TacticalFrame = {
      timestampMs: 1000,
      continuity: 'before',
      players: [{ id: 'dismissed', team: 'home', x: 50, y: 34 }],
      ball: { x: 52, y: 34 },
      dismissals: {},
      actionEvents: [],
    };
    const next: TacticalFrame = {
      ...previous,
      timestampMs: 4000,
      continuity: 'after',
      players: [],
      dismissals: { dismissed: 1075 },
      actionEvents: [],
    };
    const frames = [previous, next];
    expect(sampleReplayFrame(frames, 1074)!.players.map((player) => player.id)).toEqual([
      'dismissed',
    ]);
    expect(sampleReplayFrame(frames, 1075)!.players).toEqual([]);
    expect(sampleReplayFrame(frames, 3200)!.players).toEqual([]);
    expect(sampleReplayFrame(frames, 3200)!.actionEvents).toEqual([]);
    expect(previous.players.map((player) => player.id)).toEqual(['dismissed']);
  });
});
