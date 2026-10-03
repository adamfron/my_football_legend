import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import {
  applyContextualInteraction,
  projectContextualInteractions,
} from './contextualInteractions';
import type { PlayerDecisionOpportunity } from './playerDecision';

describe('PR150 contextual space choices', () => {
  it('offers play into space only where a teammate can reach without changing the clicked goal', () => {
    const world = createCanonicalWorldDatabase();
    const state = createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed: 'pr150-menu',
        control: { mode: 'spectator' },
      }),
    );
    delete state.restart;
    state.scenario = 'open_play';
    const actor = state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    state.controlledFootballerId = actor.id;
    actor.position = { x: 10, y: 15 };
    state.ball = { ...actor.position, ownerId: actor.id };
    state.currentPressure = 0.1;
    for (const player of state.players.filter((player) => player.id !== actor.id)) {
      player.position = { x: 3, y: 3 };
      player.velocity = { x: 0, y: 0 };
    }
    const opportunity = {
      actorId: actor.id,
      kind: 'on_ball',
      openedAt: state.time,
      options: [],
    } as unknown as PlayerDecisionOpportunity;
    const emptyTarget = { kind: 'space' as const, point: { x: 78, y: 15 } };
    expect(
      projectContextualInteractions(state, opportunity, emptyTarget).some(
        (choice) => choice.labelKey === 'play_here',
      ),
    ).toBe(false);
    expect(
      applyContextualInteraction(state, opportunity, {
        id: 'stale-space',
        target: emptyTarget,
        labelKey: 'play_here',
        resolution: {
          kind: 'action',
          action: { type: 'space_pass', actorId: actor.id, target: emptyTarget.point },
        },
      }),
    ).toBe(state);
    const runner = state.players.find(
      (player) => player.team === actor.team && player.id !== actor.id,
    )!;
    runner.position = { x: 65, y: 15 };
    runner.velocity = { x: 6, y: 0 };
    const before = structuredClone(state);
    const choices = projectContextualInteractions(state, opportunity, emptyTarget);
    const selected = choices.find((choice) => choice.labelKey === 'play_here')!;
    expect(selected.resolution).toEqual({
      kind: 'action',
      action: { type: 'space_pass', actorId: actor.id, target: emptyTarget.point },
    });
    expect(choices.some((choice) => choice.labelKey === 'sprint_here')).toBe(true);
    expect(choices.some((choice) => choice.labelKey === 'retain_here')).toBe(false);
    expect(state).toEqual(before);
  });
});
