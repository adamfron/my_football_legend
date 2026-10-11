// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { awardNaturalRestart, applyRestartScenario } from './restartScenarios';
import { advanceRestartPlacement, prepareRestartMovement } from './restartLifecycle';
import { deriveRestartLegalReadiness, legalizeRestartPlayerTarget } from './restartLaws';
import { enumerateRestartActions, resolveMatchAction } from './matchActions';
import { projectPlayerAgency } from './playerDecision';
import { projectContextualInteractions } from './contextualInteractions';
import { findFreeKickWallGapTarget, enumerateFreeKickStrikeProfiles } from './shootingOptions';
import { freeKickStrikeProfileSchema } from './shotIntent';
import type { MatchAction, TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const prepared = (team: 'home' | 'away' = 'home') => {
  let state = awardNaturalRestart(
    createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed: 'lab-mv3zlmht-equivalent',
        control: { mode: 'spectator' },
      }),
    ),
    'free_kick_close',
    {
      restartTeam: team,
      incidentId: `pr164-${team}`,
      cause: 'foul',
      incidentPoint: { x: team === 'home' ? 83 : 22, y: 34 },
      ceremonial: true,
    },
  );
  state = {
    ...state,
    playerAgencyEnabled: true,
    controlledFootballerId: state.restart!.takerId,
    ball: { ...state.restart!.spot!, height: 0, velocity: { x: 0, y: 0, z: 0 } },
    restart: {
      ...state.restart!,
      retrieval: { playerId: state.restart!.takerId, stage: 'placed' },
    },
    players: state.players.map((p) => ({
      ...p,
      velocity: { x: 0, y: 0 },
      position: legalizeRestartPlayerTarget(state, p, state.restart!.targets[p.id] ?? p.position),
    })),
  };
  return advanceRestartPlacement(state, 0);
};
const release = (initial: TacticalMatchState, action: MatchAction) => {
  let state = resolveMatchAction(initial, action, 'human_selected');
  for (let i = 0; i < 200 && state.restart?.phase !== 'release'; i++)
    state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
  expect(state.restart?.phase).toBe('release');
  return state;
};

describe('PR164 executed restart ownership and ceremonial choice', () => {
  it.each(['home', 'away'] as const)(
    'releases every physically available profile toward %s without self-invalidation',
    (team) => {
      for (const profile of freeKickStrikeProfileSchema.options) {
        let state = prepared(team);
        let aim = { horizontal: 0, vertical: 0.05 };
        if (profile === 'wall_gap') {
          const gap = findFreeKickWallGapTarget(state, state.restart!.takerId);
          expect(gap).toBeDefined();
          aim = gap!;
        } else if (profile === 'under_wall') {
          const wall = state.players.find((p) => state.restart!.roles[p.id]?.key === 'wall')!;
          const spot = state.restart!.spot!;
          const goalY =
            spot.y +
            ((wall.position.y - spot.y) * ((team === 'home' ? 105 : 0) - spot.x)) /
              (wall.position.x - spot.x);
          aim = { horizontal: ((goalY - 34) / 3.66) * (team === 'home' ? 1 : -1), vertical: 0.04 };
        }
        expect(enumerateFreeKickStrikeProfiles(state, state.restart!.takerId, aim)).toContain(
          profile,
        );
        const action: MatchAction = {
          type: 'shot',
          actorId: state.restart!.takerId,
          target: {
            x: team === 'home' ? 105 : 0,
            y: 34 + aim.horizontal * 3.66 * (team === 'home' ? 1 : -1),
          },
          intent: ['power_bend', 'under_wall'].includes(profile) ? 'driven' : 'placed',
          freeKickProfile: profile,
          contact: 'settled',
          goalTarget: aim,
        };
        const roles = structuredClone(state.restart!.roles);
        expect(state.restart!.authorisedAt).toBe(0);
        expect(state.stoppageLedger!.active).toBeDefined();
        const selected = resolveMatchAction(state, action, 'human_selected');
        expect(selected.restart!.roles).toEqual(roles);
        state = release(state, action);
        const shotId = state.ball.shot!.shotId;
        const awardId = state.restart!.awardId;
        const ball = structuredClone(state.ball);
        const selectedAction = structuredClone(state.restart!.selectedAction);
        const index = state.decisionIndex;
        expect(prepareRestartMovement(state)).toBe(state);
        expect(state.ball).toEqual(ball);
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
        expect(state.ball.x).not.toBe(ball.x);
        expect(state.restart?.phase).not.toBe('preparing');
        expect(state.restart?.selectedAction).toEqual(selectedAction);
        expect(state.decisionIndex).toBe(index);
        for (let i = 0; i < 400 && !state.lastShot?.outcome; i++) {
          state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
          if (state.restart?.awardId === awardId) expect(state.restart?.phase).toBe('release');
        }
        expect(state.lastShot?.shotId).toBe(shotId);
        expect(state.lastShot?.outcome).toBeDefined();
        expect(state.statistics!.observedShotIds.filter((id) => id === shotId)).toHaveLength(1);
        expect(
          state.stoppageLedger!.intervals.filter((interval) => interval.awardId === awardId),
        ).toHaveLength(1);
        expect(
          state.stoppageLedger!.intervals.find((interval) => interval.awardId === awardId)
            ?.endReason,
        ).toBe('execution');
      }
    },
  );
  it('waits for the real wall, records permission and freezes canonical time during human input', () => {
    const ready = prepared();
    const wall = ready.players.find((p) => ready.restart!.roles[p.id]?.key === 'wall')!;
    const moving = {
      ...ready,
      restart: { ...ready.restart!, phase: 'preparing' as const, authorisedAt: undefined },
      players: ready.players.map((p) =>
        p.id === wall.id
          ? { ...p, position: { x: p.position.x + 1, y: p.position.y }, velocity: { x: 1, y: 0 } }
          : p,
      ),
    };
    const next = advanceRestartPlacement(moving, 0);
    expect(next.restart?.authorisedAt).toBeUndefined();
    expect(projectPlayerAgency(next).opportunity).toBeUndefined();
    expect(projectPlayerAgency(ready).opportunity?.kind).toBe('restart');
    expect(stepTacticalMatchAfterDecisionProbe(ready, FIXED_MATCH_DT).time).toBe(ready.time);
    expect(ready.stoppageLedger!.completedCount).toBe(0);
    expect(ready.stoppageLedger!.active).toBeDefined();
  });
  it('preserves the quick-kick exception while opponents are still retreating', () => {
    const ready = prepared();
    const quick = {
      ...ready,
      restart: { ...ready.restart!, ceremonial: false },
      players: ready.players.map((p) =>
        p.team === 'away' && p.slotIndex !== 0
          ? { ...p, position: { x: 86 + p.slotIndex, y: 34 } }
          : p,
      ),
    };
    expect(deriveRestartLegalReadiness(quick).quickRestart).toBe(true);
    const noWall = {
      ...quick,
      restart: {
        ...quick.restart,
        roles: Object.fromEntries(
          Object.entries(quick.restart.roles).map(([id, role]) => [id, { ...role, key: 'zone' }]),
        ),
      },
    };
    expect(deriveRestartLegalReadiness(noWall).opponentsReady).toBe(true);
    const action = enumerateRestartActions(noWall).find((a) => a.type === 'pass')!;
    expect(release(noWall, action).restart?.ceremonial).toBe(false);
    const shot: MatchAction = {
      type: 'shot',
      actorId: quick.restart.takerId,
      target: { x: 105, y: 34 },
      intent: 'placed',
      contact: 'settled',
      goalTarget: { horizontal: 0, vertical: 0.2 },
    };
    expect(release(quick, shot).restart?.ceremonial).toBe(false);
  });
  it('offers techniques only for the selected goal target and the Easter egg only for a real wall', () => {
    const state = prepared();
    const opportunity = projectPlayerAgency(state).opportunity!;
    const goal = projectContextualInteractions(state, opportunity, {
      kind: 'goal',
      side: 'away',
      aim: { horizontal: 0, vertical: 0.8 },
    });
    expect(
      goal.every((i) => i.resolution.kind === 'action' && i.resolution.action.type === 'shot'),
    ).toBe(true);
    expect(goal.some((i) => i.labelKey === 'free_kick_under_wall')).toBe(false);
    const wall = state.players.find((p) => state.restart!.roles[p.id]?.key === 'wall')!;
    const egg = projectContextualInteractions(state, opportunity, {
      kind: 'player',
      playerId: wall.id,
    });
    expect(egg[0]?.labelKey).toBe('free_kick_wall_power');
    const action = egg[0]!.resolution.kind === 'action' ? egg[0]!.resolution.action : undefined;
    const launched = release(state, action!);
    expect(launched.ball.shot).toBeDefined();
    expect(launched.ball.launchSpeed).toBeGreaterThan(13);
    const normal = applyRestartScenario(state, 'free_kick_far', {
      restartTeam: 'home',
      ceremonial: false,
    });
    const unassigned = { ...normal, restart: { ...normal.restart!, roles: {} } };
    expect(
      projectContextualInteractions(unassigned, opportunity, { kind: 'player', playerId: wall.id }),
    ).toEqual([]);
    const cross = enumerateRestartActions(state).find((a) => a.type === 'cross')!;
    if (cross.type === 'cross')
      expect(
        projectContextualInteractions(state, opportunity, {
          kind: 'space',
          point: cross.target,
        }).some((i) => i.resolution.kind === 'action' && i.resolution.action.type === 'cross'),
      ).toBe(true);
  });
});
