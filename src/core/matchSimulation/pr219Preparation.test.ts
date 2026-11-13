// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createPr211Scene } from '../../../scripts/pr211Scenarios';
import { advanceLiveBallFlight } from './liveBallFlight';
import { withHolisticDevelopment } from './holisticDevelopment';
import { resolveMatchAction } from './matchActions';
import { stepTacticalMatch } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';

const reload = (state: TacticalMatchState) =>
  tacticalMatchStateSchema.parse(
    JSON.parse(JSON.stringify(state)),
  ) as unknown as TacticalMatchState;

const observedScene = (name: string, speed: number) => {
  const scene = createPr211Scene(name);
  const input = withHolisticDevelopment(
    scene.initial,
    'state-value-v1',
    'holistic-stance-foot-dev-v2',
  );
  input.experimentalObservedStrikePreparation = 'observed-low-pass-dev-v1';
  if (name !== 'defender-first' && name !== 'defender-late') {
    const player = input.players.find((p) => p.id === scene.actor.id)!;
    input.players = input.players.filter((p) => p.id !== scene.opponent.id);
    player.target = { ...player.position };
  }
  const velocity = { x: speed, y: name === 'crossing' ? 3 : 0, z: 0 };
  const prior = advanceLiveBallFlight({
    ...input,
    time: input.time - 0.025,
    ball: {
      ...input.ball,
      x: input.ball.x - velocity.x * 0.025,
      y: input.ball.y - velocity.y * 0.025,
    },
  });
  const previous = prior.liveBallFlightRuntime!.sensors[scene.actor.id]!;
  previous.nextAcquisitionAt = input.time;
  return {
    state: advanceLiveBallFlight({ ...prior, time: input.time, ball: { ...input.ball, velocity } }),
    action: scene.action,
  };
};

describe('observed preparation on canonical articulated v2', () => {
  it.each([
    ['ordinary', 0],
    ['ordinary', -1.5],
    ['ordinary', 1.5],
    ['crossing', 0],
    ['miss', 8],
    ['defender-first', 0.5],
    ['defender-late', 0.5],
  ] as const)('runs %s at %s m/s with one sample and native replay', (name, speed) => {
    const { state, action } = observedScene(name, speed);
    const committed = resolveMatchAction(state, action, 'human_selected');
    const pending = committed.pendingStrike;
    expect(pending).toBeDefined();
    expect(committed.ball).toEqual(state.ball);
    expect(pending!.path.duration).toBeGreaterThanOrEqual(0.05);
    expect(pending!.expiresAt - pending!.selectedAt).toBeLessThanOrEqual(0.17 + 1e-8);
    let a = committed;
    let b = reload(committed);
    for (let tick = 0; tick < 8; tick++) {
      a = stepTacticalMatch(a, 0.025);
      b = stepTacticalMatch(b, 0.025);
      expect(reload(a)).toEqual(reload(b));
      if (a.pendingStrike) expect(a.pendingStrike.perturbation).toEqual(pending!.perturbation);
    }
    expect(a.lastStrikeResolution?.id).toBe(pending!.id);
  });

  it('uses a remembered sighting for the same forecast across hidden spin and velocity changes', () => {
    const { state, action } = observedScene('ordinary', 1.5);
    const a = resolveMatchAction(state, action, 'human_selected').pendingStrike;
    const b = resolveMatchAction(
      {
        ...state,
        ball: { ...state.ball, velocity: { x: -9, y: 6, z: 0 }, spin: { x: 7, y: 9, z: 20 } },
      },
      action,
      'human_selected',
    ).pendingStrike;
    expect(a).toBeDefined();
    expect(b?.plan.plannedBallPoint).toEqual(a!.plan.plannedBallPoint);
    expect(b?.plan.foot).toEqual(a!.plan.foot);
  });
});
