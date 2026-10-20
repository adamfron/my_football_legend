// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createReformFixture } from '../../../scripts/pr177Fixtures';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { assertMatchStatisticsInvariants } from './playerMatchStats';

const fixture = (handling: number, seed: number) => {
  const { state, actor } = createReformFixture('moderate-shot');
  state.seed = `pr178-keeper-traffic:${handling}:${seed}`;
  state.actionCooldown = 10;
  const keeper = state.players.find(
    (p) => p.team === 'away' && p.profile.primaryPosition === 'goalkeeper',
  )!;
  const attacker = state.players.find(
    (p) => p.team === 'home' && p.id !== actor.id && p.profile.primaryPosition !== 'goalkeeper',
  )!;
  for (const player of state.players) {
    player.position = { x: 20, y: 65 };
    player.target = { ...player.position };
    player.velocity = { x: 0, y: 0 };
  }
  actor.position = { x: 75, y: 34 };
  actor.target = { ...actor.position };
  keeper.position = { x: 103, y: 34 };
  keeper.target = { ...keeper.position };
  keeper.facingAngle = -Math.PI / 2;
  Object.assign(keeper.profile.attributes, {
    handling,
    concentration: handling,
    positioning: 80,
    reflexes: 99,
    agility: 80,
    oneOnOnes: 80,
  });
  attacker.position = { x: 100, y: 37.5 };
  attacker.target = { ...attacker.position };
  const shotId = `${state.seed}:shot`;
  state.ball = {
    x: 75,
    y: 34,
    from: { x: 75, y: 34 },
    target: { x: 107, y: 34 },
    height: 0.11,
    airborne: true,
    velocity: { x: 27, y: 0.8, z: 3 },
    launchVelocity: { x: 27, y: 0.8, z: 3 },
    launchSpeed: 27.18,
    launchElevation: 0.11,
    flightTime: 0,
    distanceTravelled: 0,
    bounceCount: 0,
    travelKind: 'shot',
    shot: {
      shotId,
      shooterId: actor.id,
      context: 'open_play',
      distance: 30,
      angle: 1,
      pressure: 0,
      blockingDefenders: 0,
      baseXg: 0.1,
      effectiveScoringExpectation: 0.1,
      shooterExecutionQuality: 0.8,
      intendedTarget: { horizontal: 0, vertical: 0.3 },
      actualTarget: { horizontal: 0, vertical: 0.3 },
      error: { horizontal: 0, vertical: 0 },
      speed: 27.18,
      classification: 'on_target',
    },
  };
  return { state, actor, attacker, keeper, shotId };
};

describe.each(['legacy-pr176', 'state-value-v1'] as const)('PR178 keeper traffic: %s', (policy) => {
  it.each([
    { handling: 20, seed: 3, outcome: 'parry_away' },
    { handling: 99, seed: 0, outcome: 'catch' },
  ])(
    'preserves a real $outcome and credits its physical continuation once',
    ({ handling, seed, outcome }) => {
      const input = fixture(handling, seed);
      const run = () => {
        let state = structuredClone(input.state);
        state.decisionPolicy = policy;
        let saved = false,
          attackerTouched = false;
        for (let tick = 0; tick < 800; tick++) {
          state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
          const keeperStats = state.statistics!.players.find(
            (p) => p.playerId === input.keeper.id,
          )!;
          if (!saved && keeperStats.saves) {
            saved = true;
            expect(state.lastShot?.shotId).toBe(input.shotId);
            expect(state.lastShot?.goalkeeperAction).toBe(outcome);
            expect(state.lastBallContact?.playerId).toBe(input.keeper.id);
            expect(state.ball.ownerId).toBe(outcome === 'catch' ? input.keeper.id : undefined);
          }
          attackerTouched ||=
            (state.statistics!.players.find((p) => p.playerId === input.attacker.id)?.touches ??
              0) > 0;
          if (saved && (outcome === 'catch' || attackerTouched)) break;
        }
        expect(saved).toBe(true);
        if (outcome === 'parry_away') expect(attackerTouched).toBe(true);
        expect(state.statistics!.players.find((p) => p.playerId === input.keeper.id)).toMatchObject(
          {
            saves: 1,
            catches: outcome === 'catch' ? 1 : 0,
            parries: outcome === 'catch' ? 0 : 1,
          },
        );
        expect(state.statistics!.players.find((p) => p.playerId === input.actor.id)?.shots).toBe(1);
        assertMatchStatisticsInvariants(state.statistics!);
        return state;
      };
      expect(run()).toEqual(run());
    },
  );
});
