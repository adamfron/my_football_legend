// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createReformFixture } from '../../../scripts/pr177Fixtures';
import { startSecondHalf, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { assertMatchStatisticsInvariants } from './playerMatchStats';

describe.each(['legacy-pr176', 'state-value-v1'] as const)(
  'PR178 physical contact laws: %s',
  (policy) => {
    describe.each([false, true])('ends switched: %s', (endsSwitched) => {
      const fixture = () => {
        let { state } = createReformFixture('clearance');
        if (endsSwitched) {
          state = startSecondHalf({ ...state, status: 'half_time', time: 2700 });
          delete state.restart;
          delete state.restartTouchRestriction;
          state.scenario = 'open_play';
        }
        state.decisionPolicy = policy;
        state.time = endsSwitched ? 3000 : 30;
        state.actionCooldown = 10;
        for (const player of state.players) {
          player.position = { x: 25, y: 8 };
          player.target = { ...player.position };
          player.velocity = { x: 0, y: 0 };
        }
        return state;
      };
      it.each(['attacker', 'defender'] as const)(
        'attributes goal-line departure after last %s touch',
        (lastTouch) => {
          const state = fixture();
          const attacking = endsSwitched ? 'away' : 'home';
          const defending = endsSwitched ? 'home' : 'away';
          const team = lastTouch === 'attacker' ? attacking : defending;
          const actor = state.players.find((player) => player.team === team)!;
          state.ball = {
            x: 104.9,
            y: 50,
            height: 0.6,
            velocity: { x: 15, y: 0, z: 0 },
            airborne: true,
            bounceCount: 0,
            looseSince: state.time - 1,
            lastTouchPlayerId: actor.id,
          };
          const next = stepTacticalMatchAfterDecisionProbe(state, 0.025);
          expect(next.scenario).toBe(lastTouch === 'attacker' ? 'goal_kick' : 'corner');
          expect(next.restart?.restartTeam).toBe(lastTouch === 'attacker' ? defending : attacking);
          expect(next.score).toEqual(state.score);
          expect(next.ball.ownerId).toBeUndefined();
          assertMatchStatisticsInvariants(next.statistics!);
          expect(stepTacticalMatchAfterDecisionProbe(state, 0.025)).toEqual(next);
        },
      );
      it('keeps actual touchline attribution after an airborne clearance continuation', () => {
        const state = fixture();
        const actor = state.players.find((player) => player.team === 'away')!;
        state.ball = {
          x: 50,
          y: 67.9,
          height: 0.6,
          velocity: { x: 0, y: 15, z: 0 },
          airborne: true,
          bounceCount: 0,
          looseSince: state.time - 1,
          sourceAction: 'pass',
          lastTouchPlayerId: actor.id,
        };
        const next = stepTacticalMatchAfterDecisionProbe(state, 0.025);
        expect(next.scenario).toBe('throw_in');
        expect(next.restart?.restartTeam).toBe('home');
        expect(next.score).toEqual(state.score);
        expect(next.ball.ownerId).toBeUndefined();
        assertMatchStatisticsInvariants(next.statistics!);
        expect(stepTacticalMatchAfterDecisionProbe(state, 0.025)).toEqual(next);
      });
    });
  },
);
