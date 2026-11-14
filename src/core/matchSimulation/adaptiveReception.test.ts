// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createKickFixture } from './physicalKickLaboratory';
import { withHolisticDevelopment } from './holisticDevelopment';
import { stepTacticalMatch } from './matchSimulation';
import { economicalReceptionMovement, observedReceptionPlan } from './localReception';
import { tacticalMatchStateSchema } from './matchState';

const approachingReception = () => {
  const { state, receiver, actor } = createKickFixture({ seed: 'pr219-a' });
  receiver.position = { x: 41, y: 34 };
  receiver.target = receiver.neutralAnchor = receiver.position;
  receiver.facingAngle = -Math.PI / 2;
  receiver.profile.attributes.firstTouch = 60;
  const input = withHolisticDevelopment(state, 'state-value-v1', 'holistic-stance-foot-dev-v2');
  const player = input.players.find((p) => p.id === receiver.id)!;
  const { right } = player.articulatedStance!;
  input.playerAgencyEnabled = false;
  input.actionCooldown = 1;
  input.ball = {
    x: right.x - 1.85,
    y: right.y,
    height: 0.11,
    velocity: { x: 4, y: 0, z: 0 },
    travelKind: 'pass',
    lastTouchPlayerId: actor.id,
  };
  return { input, receiverId: receiver.id };
};

describe('v2 observed reception', () => {
  it('selects a finite alternative on the actual contact and preserves it on reload', () => {
    const { input, receiverId } = approachingReception();
    const outcomes = (['observed-reception-dev-v1', 'adaptive-reception-dev-v1'] as const).map(
      (edition) => {
        let state = { ...input, experimentalReceptionPreparation: edition };
        for (let tick = 0; tick < 24 && !state.lastGroundContact; tick++)
          state = stepTacticalMatch(state, 0.025) as typeof state;
        const reloaded = tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(state)));
        expect(state.safetyHalt).toBeUndefined();
        expect(reloaded.lastGroundContact).toEqual(
          JSON.parse(JSON.stringify(state.lastGroundContact)),
        );
        expect(state.lastGroundContact).toMatchObject({
          actorId: receiverId,
          executed: true,
          retained: true,
          region: 'right_foot',
          preparedReception: { support: 'left' },
        });
        expect(state.lastGroundContact!.preparedReception!.createdAt).toBeLessThan(
          state.lastGroundContact!.at - 0.1,
        );
        return state.lastGroundContact!.surfaceContact!;
      },
    );
    expect(outcomes.map((outcome) => outcome.executed)).toEqual(['cushion', 'inside']);
    expect(outcomes[0]!.outgoingVelocity).not.toEqual(outcomes[1]!.outgoingVelocity);
  });

  it('withdraws preparation when evidence ages or the actor has a human command', () => {
    const { input, receiverId } = approachingReception();
    let state = {
      ...input,
      experimentalReceptionPreparation: 'adaptive-reception-dev-v1' as const,
    };
    for (let tick = 0; tick < 9; tick++) state = stepTacticalMatch(state, 0.025) as typeof state;
    const player = state.players.find((p) => p.id === receiverId)!;
    expect(observedReceptionPlan(state, player)).toBeDefined();
    expect(economicalReceptionMovement(state, player)).toBeDefined();
    expect(
      economicalReceptionMovement({ ...state, time: state.time + 0.6 }, player),
    ).toBeUndefined();
    expect(
      economicalReceptionMovement(
        { ...state, playerAgencyEnabled: true, controlledFootballerId: receiverId },
        player,
      ),
    ).toBeUndefined();
  });
});
