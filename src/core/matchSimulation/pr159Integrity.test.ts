// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { awardNaturalRestart } from './restartScenarios';
import { advanceRestartPlacement, prepareRestartMovement } from './restartLifecycle';
import { legalizeRestartPlayerTarget } from './restartLaws';
import { enumerateRestartActions, resolveMatchAction } from './matchActions';
import { applyPlayerDecision, projectPlayerDecisionOpportunity } from './playerDecision';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { ContactTacticalTracker } from './contactTacticalDiagnostics';
import { PerformanceProfiler, withPerformanceProfiler } from './performanceProfiling';
import { PresentationFrameProjector } from '../../app/match/tacticalRenderer/frameProjection';

const world = createCanonicalWorldDatabase();
const physicallyPrepared = (
  scenario: 'free_kick_wide' | 'free_kick_close' = 'free_kick_wide',
): TacticalMatchState => {
  const initial = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr159-integrity-fixed-seed',
      control: { mode: 'spectator' },
    }),
  );
  let state = awardNaturalRestart({ ...initial, time: 100 }, scenario, {
    restartTeam: 'home',
    incidentId: 'integrity-foul-100',
    eventAt: 100,
    incidentPoint: scenario === 'free_kick_close' ? { x: 83, y: 34 } : { x: 78.125, y: 8.75 },
    cause: 'foul',
  });
  state = {
    ...state,
    playerAgencyEnabled: false,
    ball: {
      ...state.restart!.spot!,
      height: 0,
      velocity: { x: 0, y: 0, z: 0 },
      ownerId: state.restart!.takerId,
    },
    restart: {
      ...state.restart!,
      retrieval: { playerId: state.restart!.takerId, stage: 'placed' },
    },
    players: state.players.map((player) => ({
      ...player,
      position: legalizeRestartPlayerTarget(
        state,
        player,
        state.restart!.targets[player.id] ?? player.position,
      ),
      velocity: { x: 0, y: 0 },
    })),
  };
  return advanceRestartPlacement(state, 0);
};

describe('PR159 restart integrity across observers, persistence and terminal decisions', () => {
  it('keeps identical fixed-seed football through normal, DEV and capture observers and both step entries', () => {
    const initial = physicallyPrepared();
    const action = enumerateRestartActions(initial).find(
      (candidate) => candidate.type === 'shot' && candidate.freeKickProfile === 'controlled_curl',
    )!;
    expect(action).toBeDefined();
    const selected = resolveMatchAction(initial, action, 'autonomous_npc');
    const modes = (['release_minimal', 'normal', 'dev', 'capture'] as const).map((mode) => ({
      mode,
      state: structuredClone(selected),
      profiler: new PerformanceProfiler({
        enabled: mode === 'dev' || mode === 'capture',
        sampleEveryTicks: 1,
      }),
      tracker: new ContactTacticalTracker(),
      frames: new PresentationFrameProjector(),
    }));
    let released = false;
    let spinning = false;
    for (let tick = 0; tick < 160; tick++) {
      for (const context of modes) {
        const previous = context.state;
        expect(projectPlayerDecisionOpportunity(previous)).toBeUndefined();
        context.profiler.beginTick(tick);
        const next = withPerformanceProfiler(context.profiler, () =>
          context.mode === 'normal' || context.mode === 'release_minimal'
            ? stepTacticalMatch(previous, FIXED_MATCH_DT)
            : stepTacticalMatchAfterDecisionProbe(previous, FIXED_MATCH_DT),
        );
        if (context.mode === 'dev' || context.mode === 'capture') {
          context.tracker.observe(previous, next);
          context.tracker.snapshot();
        }
        if (context.mode !== 'release_minimal')
          context.frames.frame(next, { includeAiCarryTarget: context.mode !== 'normal' });
        if (context.mode === 'capture') context.frames.frame(next);
        context.state = next;
      }
      expect(modes[1]!.state).toEqual(modes[0]!.state);
      expect(modes[2]!.state).toEqual(modes[0]!.state);
      expect(modes[3]!.state).toEqual(modes[0]!.state);
      released ||= modes[0]!.state.restart?.phase === 'release';
      spinning ||= Boolean(modes[0]!.state.ball.spin?.z);
    }
    expect(released).toBe(true);
    expect(spinning).toBe(true);
    expect(modes[2]!.profiler.snapshot().sampledTicks).toBe(160);
  });

  it('resumes signed physical transport after a schema-validated save with the same release and ledger', () => {
    const prepared = physicallyPrepared();
    const spot = prepared.restart!.spot!;
    const takerId = prepared.restart!.takerId;
    const offset = { x: -0.4, y: 0.2 };
    const position = { x: spot.x - 3, y: spot.y + 2 };
    const transporting: TacticalMatchState = {
      ...prepared,
      ball: {
        x: position.x + offset.x,
        y: position.y + offset.y,
        height: 0.5,
        velocity: { x: 0, y: 0, z: 0 },
      },
      players: prepared.players.map((player) =>
        player.id === takerId ? { ...player, position, velocity: { x: 0, y: 0 } } : player,
      ),
      restart: {
        ...prepared.restart!,
        phase: 'preparing',
        retrieval: { playerId: takerId, stage: 'transport', attachedOffset: offset },
      },
    };
    let live = transporting;
    let restored: TacticalMatchState = tacticalMatchStateSchema.parse(
      JSON.parse(JSON.stringify(transporting)),
    ) as unknown as TacticalMatchState;
    const awardId = live.restart!.awardId;
    let placed = false;
    for (let tick = 0; tick < 480 && live.restart?.phase !== 'release'; tick++) {
      live = stepTacticalMatch(live, FIXED_MATCH_DT);
      restored = stepTacticalMatchAfterDecisionProbe(restored, FIXED_MATCH_DT);
      expect(restored).toEqual(live);
      expect(live.lastRestartAward?.id).toBe(awardId);
      placed ||= live.restart?.retrieval?.stage === 'placed';
    }
    expect(placed).toBe(true);
    expect(live.restart?.phase).toBe('release');
    expect(live.stoppageLedger?.intervals).toHaveLength(1);
    expect(live.stoppageLedger?.intervals[0]?.endReason).toBe('execution');
    expect(restored.ball).toEqual(live.ball);
    expect(restored.stoppageLedger).toEqual(live.stoppageLedger);
  });

  it('freezes an unchosen human restart but terminates a queued choice at the full-time clock boundary identically', () => {
    const prepared = physicallyPrepared();
    const awaiting: TacticalMatchState = {
      ...prepared,
      time: 5399.99,
      status: 'second_half',
      playerAgencyEnabled: true,
      controlledFootballerId: prepared.restart!.takerId,
      restart: { ...prepared.restart!, phase: 'awaiting_decision' },
    };
    const earlier = { ...awaiting, time: 5399 };
    expect(stepTacticalMatch(earlier, FIXED_MATCH_DT)).toBe(earlier);
    expect(stepTacticalMatchAfterDecisionProbe(earlier, FIXED_MATCH_DT)).toBe(earlier);
    for (const step of [stepTacticalMatch, stepTacticalMatchAfterDecisionProbe]) {
      const whistle = step(awaiting, FIXED_MATCH_DT);
      expect(whistle.status).toBe('full_time');
      expect(whistle.time).toBe(5400);
      expect(whistle.restart).toBeUndefined();
      expect(whistle.decisionIndex).toBe(awaiting.decisionIndex);
      expect(whistle.stoppageLedger?.intervals.at(-1)?.endReason).toBe('period_end');
    }
    const opportunity = projectPlayerDecisionOpportunity(awaiting)!;
    expect(opportunity).toBeDefined();
    const option = opportunity.options.find(
      (candidate) => candidate.kind === 'action' && candidate.action.type === 'pass',
    )!;
    expect(option).toBeDefined();
    const queued = applyPlayerDecision(awaiting, opportunity, option.id);
    expect(queued.pendingPlayerDecision).toBeDefined();
    const normal = stepTacticalMatch(queued, FIXED_MATCH_DT);
    const probed = stepTacticalMatchAfterDecisionProbe(queued, FIXED_MATCH_DT);
    expect(probed).toEqual(normal);
    expect(normal.status).toBe('full_time');
    expect(normal.time).toBe(5400);
    expect(normal.restart).toBeUndefined();
    expect(normal.pendingPlayerDecision).toBeUndefined();
    expect(normal.decisionIndex).toBe(awaiting.decisionIndex);
    const actionStats = (state: TacticalMatchState) =>
      state.statistics!.players.map((player) => ({
        playerId: player.playerId,
        touches: player.touches,
        passesAttempted: player.passesAttempted,
        shots: player.shots,
      }));
    expect(actionStats(normal)).toEqual(actionStats(awaiting));
    expect(normal.actionEvents ?? []).toEqual(awaiting.actionEvents ?? []);
    expect(normal.stoppageLedger?.intervals.at(-1)?.endReason).toBe('period_end');
  });

  it('invalidates a removed receiver or a closed wall gap within the same award without choosing a replacement for the human', () => {
    const initial = physicallyPrepared();
    const controlled: TacticalMatchState = {
      ...initial,
      playerAgencyEnabled: true,
      controlledFootballerId: initial.restart!.takerId,
    };
    for (const type of ['pass', 'cross'] as const) {
      const action = enumerateRestartActions(controlled).find(
        (candidate) => candidate.type === type,
      )!;
      expect(action).toBeDefined();
      const receiverId =
        action.type === 'pass'
          ? action.receiverId
          : action.type === 'cross'
            ? action.intendedTargetId
            : undefined;
      expect(receiverId).toBeDefined();
      const selected = resolveMatchAction(controlled, action, 'human_selected');
      const changed = {
        ...selected,
        players: selected.players.filter((player) => player.id !== receiverId),
      };
      const invalidated = prepareRestartMovement(changed);
      expect(invalidated.restart?.selectedAction).toBeUndefined();
      expect(invalidated.restart?.selectedSource).toBeUndefined();
      expect(invalidated.restart?.preparationStartedAt).toBeUndefined();
      expect(invalidated.restart?.awardId).toBe(selected.restart?.awardId);
      expect(invalidated.lastRestartAward).toEqual(selected.lastRestartAward);
      expect(invalidated.ball).toEqual(changed.ball);
      expect(invalidated.statistics).toEqual(changed.statistics);
      expect(invalidated.decisionIndex).toBe(controlled.decisionIndex);
    }

    const central = physicallyPrepared('free_kick_close');
    const wall = central.players
      .filter((player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper')
      .slice(0, 2);
    const gapState: TacticalMatchState = {
      ...central,
      playerAgencyEnabled: true,
      controlledFootballerId: central.restart!.takerId,
      players: central.players.map((player) => {
        const index = wall.findIndex((candidate) => candidate.id === player.id);
        return index >= 0
          ? { ...player, position: { x: 92.15, y: 34 + (index === 0 ? -0.6 : 0.6) } }
          : player;
      }),
      restart: {
        ...central.restart!,
        roles: Object.fromEntries(
          Object.entries(central.restart!.roles).map(([id, role]) => [
            id,
            {
              ...role,
              key: wall.some((player) => player.id === id)
                ? 'wall'
                : role.key === 'wall'
                  ? 'zone'
                  : role.key,
            },
          ]),
        ),
      },
    };
    const gap = enumerateRestartActions(gapState).find(
      (candidate) => candidate.type === 'shot' && candidate.freeKickProfile === 'wall_gap',
    )!;
    expect(gap).toBeDefined();
    const closed: TacticalMatchState = {
      ...gapState,
      restart: {
        ...gapState.restart!,
        selectedAction: gap,
        selectedSource: 'human_selected',
        phase: 'kick_preparation',
      },
      players: gapState.players.map((player) => {
        const index = wall.findIndex((candidate) => candidate.id === player.id);
        return index >= 0
          ? { ...player, position: { x: 92.15, y: 34 + (index === 0 ? -0.3 : 0.3) } }
          : player;
      }),
    };
    const invalidated = prepareRestartMovement(closed);
    expect(invalidated.restart?.selectedAction).toBeUndefined();
    expect(invalidated.restart?.awardId).toBe(closed.restart?.awardId);
    expect(invalidated.decisionIndex).toBe(closed.decisionIndex);
    expect(invalidated.statistics).toEqual(closed.statistics);
  });
});
