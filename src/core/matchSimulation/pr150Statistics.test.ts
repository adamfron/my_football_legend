import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  chooseNpcAction,
  createTacticalMatch,
  enumerateAvailableActions,
  scoreActionForAI,
} from '.';

describe('PR150 canonical teammate neutrality', () => {
  it('does not change pass target rankings merely because a teammate is human-controlled', () => {
    const world = createCanonicalWorldDatabase();
    const original = createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed: 'pr150-control-target-neutrality',
        control: { mode: 'spectator' },
      }),
    );
    original.scenario = 'open_play';
    delete original.restart;
    original.time = 10;
    const passer = original.players.find((player) => player.id === original.ball.ownerId)!;
    const candidates = enumerateAvailableActions(original, passer.id).filter(
      (action) => action.type === 'pass',
    );
    expect(candidates.length).toBeGreaterThan(1);
    const reference = candidates.map((action) => scoreActionForAI(original, passer.id, action));
    for (const receiver of original.players.filter(
      (player) => player.team === passer.team && player.id !== passer.id,
    )) {
      const controlled = { ...original, controlledFootballerId: receiver.id };
      expect(candidates.map((action) => scoreActionForAI(controlled, passer.id, action))).toEqual(
        reference,
      );
      expect(chooseNpcAction(controlled, passer.id)).toEqual(chooseNpcAction(original, passer.id));
    }
  });
});
