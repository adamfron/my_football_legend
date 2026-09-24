import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  deriveHumanLeadPass,
  derivePassLaunchPlan,
  enumerateAvailableActions,
  projectFutureBallTrajectory,
  rankAvailableActionsForAI,
} from '.';

const world = createCanonicalWorldDatabase();
const match = (seed: string) =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );

describe('PR136 interaction completeness', () => {
  it('offers the goalkeeper at their feet and suppresses a static keeper lead', () => {
    const state = match('keeper-back-pass');
    const passer = state.players.find((player) => player.id === state.ball.ownerId)!;
    const keeper = state.players.find(
      (player) => player.team === passer.team && player.profile.primaryPosition === 'goalkeeper',
    )!;
    keeper.position = { x: passer.position.x - (passer.team === 'home' ? 18 : -18), y: 34 };
    keeper.target = { ...keeper.position };
    keeper.velocity = { x: 0, y: 0 };
    const passes = enumerateAvailableActions(state, passer.id).filter(
      (action) => action.type === 'pass' && action.receiverId === keeper.id,
    );
    expect(passes.some((action) => action.type === 'pass' && action.intent !== 'lead')).toBe(true);
    expect(deriveHumanLeadPass(state, passer, keeper)).toBeUndefined();
    keeper.velocity = { x: 0, y: 4 };
    keeper.target = { x: keeper.position.x, y: keeper.position.y + 10 };
    expect(deriveHumanLeadPass(state, passer, keeper)).toBeDefined();
  });

  it('keeps tactical intent orthogonal while a lofted delivery rises and descends physically', () => {
    const state = match('lofted-flight');
    const passer = state.players.find((player) => player.id === state.ball.ownerId)!;
    const receiver = state.players.find(
      (player) => player.team === passer.team && player.id !== passer.id,
    )!;
    const target = { x: passer.position.x + (passer.team === 'home' ? 35 : -35), y: 50 };
    const plan = derivePassLaunchPlan(state, passer, receiver, target, 'progressive', 'lofted');
    const samples = projectFutureBallTrajectory(
      {
        position: { ...passer.position, z: 0.11 },
        velocity: plan.velocity,
        airborne: true,
        bounceCount: 0,
      },
      plan.predictedArrivalTime + 1,
      0.025,
    );
    const apex = Math.max(...samples.map((sample) => sample.ball.position.z));
    expect(plan.elevation).toBeGreaterThan(0.3);
    expect(apex).toBeGreaterThan(1.5);
    expect(samples.at(-1)!.ball.position.z).toBeLessThan(apex);
  });

  it('does not let the controlled flag alter an NPC receiver ranking', () => {
    const state = match('control-invariance');
    const actor = state.players.find((player) => player.id === state.ball.ownerId)!;
    const candidate = state.players.find(
      (player) => player.team === actor.team && player.id !== actor.id,
    )!;
    const baseline = rankAvailableActionsForAI(state, actor.id);
    const controlled = rankAvailableActionsForAI(
      { ...state, controlledFootballerId: candidate.id },
      actor.id,
    );
    expect(controlled).toEqual(baseline);
  });
});
