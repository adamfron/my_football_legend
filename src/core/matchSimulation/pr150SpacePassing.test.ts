// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { chooseRestartAction, rankAvailableActionsForAI, resolveMatchAction } from './matchActions';
import { deriveSpacePassPlan, spacePassPlanSchema } from './spacePassing';
import { interpretPassExecution } from './passExecution';
import {
  awardOffsideRestart,
  captureOffsideSnapshot,
  findOffsideContestant,
  isOffsideOffence,
  registerOpponentTouch,
} from './offside';
import { emitCanonicalActionEvents } from './actionEvents';
import { emitMatchEvents } from './matchEventFeed';
import { matchActionSchema, tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { derivePassLaunchPlan } from './passLaunchPlan';
import { incomingBallIntentKey } from './playerDecision';
import { MatchReplayHistory } from './matchReplay';
import { resolvePendingPlayerDecision } from './decisionOutcome';
import { observePlayerMatchStats } from './playerMatchStats';

const world = createCanonicalWorldDatabase();
const fixture = (seed = 'pr150-space-pass') => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      control: { mode: 'spectator' },
      seed,
    }),
  );
  state.scenario = 'open_play';
  delete state.restart;
  state.time = 20;
  state.actionCooldown = 100;
  state.currentPressure = 0;
  state.players = state.players.map((player) => ({
    ...player,
    position: { x: player.team === 'home' ? 25 : 78, y: 58 },
    velocity: { x: 0, y: 0 },
    target: { x: player.team === 'home' ? 25 : 78, y: 58 },
  }));
  const passer = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  const runner = state.players.find(
    (player) =>
      player.team === passer.team &&
      player.id !== passer.id &&
      player.profile.primaryPosition !== 'goalkeeper',
  )!;
  passer.position = { x: 60, y: 34 };
  passer.target = { ...passer.position };
  passer.facingAngle = Math.PI / 2;
  passer.profile = {
    ...passer.profile,
    attributes: {
      ...passer.profile.attributes,
      passing: 85,
      technique: 85,
      gameReading: 85,
      composure: 85,
    },
  };
  runner.position = { x: 74, y: 34 };
  runner.velocity = { x: 5.5, y: 0 };
  runner.target = { x: 93, y: 34 };
  const keeper = state.players.find(
    (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
  )!;
  keeper.position = { x: 100, y: 34 };
  state.ball = { ...passer.position, ownerId: passer.id, lastTouchPlayerId: passer.id };
  state.possessionTeam = passer.team;
  return { state, passer, runner };
};

describe('PR150 first-class spatial intent and canonical execution', () => {
  it('resolves the original spatial delivery before a first-time receiver continuation finishes', () => {
    const { state, passer, runner } = fixture();
    state.pendingPlayerDecision = {
      decisionId: 'space-before-continuation',
      actorId: passer.id,
      selectedAt: state.time,
      decisionKind: 'on_ball',
      selectedIntent: 'space_pass',
      startContext: {
        phase: 'positional_attack',
        pressure: 0,
        fieldProgress: 0.6,
        possession: 'home',
      },
    };
    const released = resolveMatchAction(
      state,
      { type: 'space_pass', actorId: passer.id, target: { x: 85, y: 34 } },
      'human_selected',
    );
    const continuing: TacticalMatchState = {
      ...released,
      time: state.time + 1,
      lastResolvedPass: {
        ...released.lastPassDiagnostic!,
        actualReceiverId: runner.id,
        resolvedAt: state.time + 1,
        finalResult: 'completed',
      },
      lastPassDiagnostic: {
        ...released.lastPassDiagnostic!,
        passId: 'immediate-next-pass',
        passerId: runner.id,
        intendedReceiverId: passer.id,
        releasedAt: state.time + 1,
      },
      ball: { ...released.ball, travelKind: 'pass', lastTouchPlayerId: runner.id },
    };
    const resolved = resolvePendingPlayerDecision(continuing);
    expect(resolved.pendingPlayerDecision).toBeUndefined();
    expect(resolved.lastPlayerDecisionOutcome?.result).toMatchObject({
      kind: 'pass_completed',
      passCompleted: true,
      teamRetainedPossession: true,
      turnover: false,
    });
    const stale = {
      ...continuing,
      lastResolvedPass: { ...continuing.lastResolvedPass!, releasedAt: state.time - 1 },
    };
    expect(resolvePendingPlayerDecision(stale).pendingPlayerDecision).toBeDefined();
  });

  it.each([true, false])(
    'resolves a completed=%s spatial pass decision from canonical contact',
    (completed) => {
      const { state, passer, runner } = fixture(`pr150-space-outcome:${completed}`);
      runner.facingAngle = -Math.PI / 2;
      runner.profile = {
        ...runner.profile,
        attributes: {
          ...runner.profile.attributes,
          firstTouch: 95,
          technique: 95,
          concentration: 95,
          composure: 95,
          agility: 95,
          gameReading: 95,
          pace: 95,
        },
      };
      const target = { x: 85, y: 34 };
      if (!completed) runner.position.x = 82;
      state.pendingPlayerDecision = {
        decisionId: 'spatial-decision',
        actorId: passer.id,
        selectedAt: state.time,
        decisionKind: 'on_ball',
        selectedIntent: 'space_pass',
        selectedTarget: target,
        startContext: {
          phase: 'positional_attack',
          pressure: 0,
          fieldProgress: 0.6,
          possession: 'home',
        },
      };
      let next = resolveMatchAction(
        state,
        { type: 'space_pass', actorId: passer.id, target },
        'human_selected',
      );
      expect(resolvePendingPlayerDecision(next).pendingPlayerDecision).toBeDefined();
      if (!completed)
        next = {
          ...next,
          ball: {
            ...next.ball,
            x: 81.7,
            y: 34,
            velocity: { x: 15, y: 0, z: 0 },
            airborne: false,
            height: 0.11,
            flightTime: 1,
          },
          actionCooldown: 100,
        };
      for (let tick = 0; tick < 240 && !next.lastPlayerDecisionOutcome; tick++)
        next = stepTacticalMatchAfterDecisionProbe(next, FIXED_MATCH_DT);
      expect(next.pendingPlayerDecision).toBeUndefined();
      expect(next.lastPlayerDecisionOutcome).toMatchObject({
        selectedIntent: 'space_pass',
        result: {
          kind: completed ? 'pass_completed' : 'pass_failed',
          passCompleted: completed,
          teamRetainedPossession: completed,
          turnover: !completed,
        },
      });
      expect(resolvePendingPlayerDecision(next).lastPlayerDecisionOutcome).toBe(
        next.lastPlayerDecisionOutcome,
      );
      if (completed)
        expect(next.lastPassDiagnostic).toMatchObject({
          actualReceiverId: runner.id,
          finalResult: 'completed',
        });
      else expect(next.lastOffsideOffence?.playerId).toBe(runner.id);
    },
  );

  it('chooses an already moving runner and preserves the human space independently of player control', () => {
    const { state, passer, runner } = fixture();
    const target = { x: 85, y: 34 };
    const before = structuredClone(state);
    const plan = deriveSpacePassPlan(state, passer, target)!;
    expect(plan).toMatchObject({
      receiverId: runner.id,
      requestedSpace: target,
      intent: 'through',
      delivery: 'ground',
    });
    expect(spacePassPlanSchema.safeParse(plan).success).toBe(true);
    expect(state).toEqual(before);
    expect(
      deriveSpacePassPlan({ ...state, controlledFootballerId: runner.id }, passer, target),
    ).toEqual(plan);
    const action = matchActionSchema.parse({ type: 'space_pass', actorId: passer.id, target });
    const released = resolveMatchAction(state, action, 'human_selected');
    expect(released.ball).toMatchObject({
      intendedReceiverId: runner.id,
      sourceAction: 'space_pass',
      travelKind: 'through_ball',
      executionType: 'ground_through',
    });
    expect(released.lastPassDiagnostic).toMatchObject({
      requestedSpace: target,
      intent: 'through',
      executionType: 'ground_through',
    });
    expect(released.actionEvents?.at(-1)).toMatchObject({
      kind: 'through_pass',
      executionType: 'ground_through',
    });
    expect(tacticalMatchStateSchema.safeParse(released).success).toBe(true);
  });

  it('does not introduce a controlled-player pass-target preference in canonical AI ranking', () => {
    const { state, passer, runner } = fixture();
    const ranked = rankAvailableActionsForAI(state, passer.id);
    expect(
      rankAvailableActionsForAI({ ...state, controlledFootballerId: runner.id }, passer.id),
    ).toEqual(ranked);
    expect(
      rankAvailableActionsForAI({ ...state, controlledFootballerId: passer.id }, passer.id),
    ).toEqual(ranked);
  });

  it('preserves a selected near-touchline coordinate rather than applying a player movement margin', () => {
    const { state, passer, runner } = fixture();
    runner.position = { x: 76, y: 8 };
    const target = { x: 80, y: 0.01 };
    const plan = deriveSpacePassPlan(state, passer, target)!;
    expect(plan.requestedSpace).toEqual(target);
    expect(plan.launchPlan.target).toEqual(target);
    const release = resolveMatchAction(
      state,
      { type: 'space_pass', actorId: passer.id, target },
      'human_selected',
    );
    expect(release.lastPassDiagnostic?.requestedSpace).toEqual(target);
    expect(release.lastPassDiagnostic?.predictedReceptionPoint).toEqual(target);
    expect(release.actionEvents?.at(-1)?.requestedSpace).toEqual(target);
    expect(deriveSpacePassPlan(state, passer, { x: 80, y: -0.1 })).toBeUndefined();
  });

  it('interprets a blocked ground lane and high line as a lofted through ball when ability supports it', () => {
    const { state, passer, runner } = fixture();
    const marker = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    marker.position = { x: 70, y: 34 };
    const plan = deriveSpacePassPlan(state, passer, { x: 86, y: 34 })!;
    expect(plan).toMatchObject({
      receiverId: runner.id,
      intent: 'through',
      delivery: 'lofted',
      groundLaneRisk: 1,
    });
    const released = resolveMatchAction(
      state,
      { type: 'space_pass', actorId: passer.id, target: plan.requestedSpace },
      'human_selected',
    );
    expect(released.ball.executionType).toBe('lofted_through');
    expect(released.ball.launchVelocity!.z).toBeGreaterThan(2);
    expect(released.ball.airborne).toBe(true);
    expect(released.offsideSnapshot?.releasedAt).toBe(state.time);
    passer.profile = {
      ...passer.profile,
      attributes: { ...passer.profile.attributes, passing: 30, technique: 30, gameReading: 30 },
    };
    expect(deriveSpacePassPlan(state, passer, plan.requestedSpace)!.delivery).toBe('ground');
  });

  it('keeps a genuine ground through-ball plan on the ground even at long range', () => {
    const { state, passer, runner } = fixture();
    const plan = derivePassLaunchPlan(state, passer, runner, { x: 97, y: 34 }, 'through', 'ground');
    expect(plan.elevation).toBe(0);
    expect(plan.velocity.z).toBe(0);
  });

  it('runs a lofted through ball to an actual moving-receiver contact through canonical physics', () => {
    const { state, passer, runner } = fixture('pr150-lofted-run-contact');
    state.players
      .filter((player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper')
      .forEach((player) => {
        player.position.x = 81;
      });
    const marker = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    marker.position = { x: 70, y: 34 };
    runner.position.x = 80;
    runner.facingAngle = Math.PI / 2;
    runner.profile = {
      ...runner.profile,
      attributes: {
        ...runner.profile.attributes,
        firstTouch: 95,
        technique: 95,
        concentration: 95,
        composure: 95,
        agility: 95,
        gameReading: 95,
        pace: 95,
      },
    };
    const origin = { ...runner.position };
    const target = { x: 86, y: 34 };
    const release = resolveMatchAction(
      state,
      { type: 'space_pass', actorId: passer.id, target },
      'human_selected',
    );
    const passId = release.lastPassDiagnostic!.passId;
    expect(release.ball).toMatchObject({
      executionType: 'lofted_through',
      travelKind: 'through_ball',
      airborne: true,
      intendedReceiverId: runner.id,
    });
    expect(release.receptionPreparation).toMatchObject({
      actorId: runner.id,
      movement: 'run_onto_ball',
      expectedContactPoint: target,
    });
    expect(isOffsideOffence(release.offsideSnapshot, runner.id)).toBe(false);
    let next = release;
    let maximumHeight = 0;
    let maximumRunProgress = 0;
    for (let tick = 0; tick < 240; tick++) {
      next = stepTacticalMatchAfterDecisionProbe(next, FIXED_MATCH_DT);
      maximumHeight = Math.max(maximumHeight, next.ball.height ?? 0);
      const movingRunner = next.players.find((player) => player.id === runner.id)!;
      maximumRunProgress = Math.max(maximumRunProgress, movingRunner.position.x - origin.x);
      if (next.lastResolvedPass?.passId === passId && next.lastResolvedPass.finalResult) break;
      if (next.lastBoundaryCrossing) break;
    }
    expect(maximumHeight).toBeGreaterThan(2);
    expect(maximumRunProgress).toBeGreaterThan(4);
    expect(next.lastOffsideOffence).toBeUndefined();
    expect(next.lastResolvedPass).toMatchObject({
      passId,
      actualReceiverId: runner.id,
      finalResult: 'completed',
    });
    expect(next.lastResolvedPass?.actualContactPoint?.x).toBeGreaterThan(origin.x + 4);
    expect(
      next.actionEvents?.some(
        (event) =>
          event.kind === 'reception' &&
          event.actorId === runner.id &&
          event.parentId === `${state.seed}:action:pass:${passId}`,
      ),
    ).toBe(true);
  });

  it('selects a backheel or a turn from body geometry, pressure and technique', () => {
    const { state, passer } = fixture();
    const defender = state.players.find((player) => player.team !== passer.team)!;
    defender.position = { x: 62, y: 34 };
    const target = { x: 53, y: 34 };
    const technical = interpretPassExecution(state, passer, target, 'support', 'ground', {
      spatial: true,
    });
    expect(technical.type).toBe('backheel');
    passer.profile = {
      ...passer.profile,
      attributes: { ...passer.profile.attributes, technique: 25, passing: 25 },
    };
    const unskilled = interpretPassExecution(state, passer, target, 'support', 'ground', {
      spatial: true,
    });
    expect(unskilled.type).toBe('turning_pass');
    expect(unskilled.quality).toBeLessThan(technical.quality);
    expect(unskilled.physicalTarget).not.toEqual(technical.physicalTarget);
  });

  it('preserves deterministic physical inaccuracies outside the touchline', () => {
    const { state, passer } = fixture('pr150-natural-exit');
    passer.position = { x: 40, y: 5 };
    const target = { x: 75, y: 0.01 };
    passer.profile = {
      ...passer.profile,
      attributes: {
        ...passer.profile.attributes,
        passing: 20,
        technique: 20,
        gameReading: 20,
        composure: 20,
      },
    };
    let escaped = false;
    for (let index = 0; index < 20; index++) {
      state.decisionIndex = index;
      const a = interpretPassExecution(state, passer, target, 'through', 'ground', {
        spatial: true,
      });
      expect(
        interpretPassExecution(state, passer, target, 'through', 'ground', { spatial: true }),
      ).toEqual(a);
      escaped ||= a.physicalTarget.y < 0;
    }
    expect(escaped).toBe(true);
  });

  it('produces a real throw-in when a spatial execution error escapes the touchline', () => {
    const { state, passer, runner } = fixture('pr150-natural-spatial-throw');
    passer.position = { x: 40, y: 4 };
    passer.profile = {
      ...passer.profile,
      attributes: {
        ...passer.profile.attributes,
        passing: 20,
        technique: 20,
        gameReading: 20,
        composure: 20,
      },
    };
    runner.position = { x: 76, y: 15 };
    runner.velocity = { x: 0, y: 0 };
    state.ball = { ...passer.position, ownerId: passer.id, lastTouchPlayerId: passer.id };
    let release: TacticalMatchState | undefined;
    for (let index = 0; index < 30; index++) {
      state.decisionIndex = index;
      const candidate = resolveMatchAction(
        state,
        { type: 'space_pass', actorId: passer.id, target: { x: 75, y: 0.4 } },
        'human_selected',
      );
      if ((candidate.ball.target?.y ?? 0) < 0) {
        release = candidate;
        break;
      }
    }
    expect(release).toBeDefined();
    let next = release!;
    for (let tick = 0; tick < 200 && !next.lastBoundaryCrossing; tick++)
      next = stepTacticalMatchAfterDecisionProbe(next, FIXED_MATCH_DT);
    expect(next.lastBoundaryCrossing).toMatchObject({
      boundary: 'touchline_top',
      lastTouchPlayerId: passer.id,
      restartTeam: 'away',
    });
    expect(next.scenario).toBe('throw_in');
    expect(next.statistics?.teamAccounting?.away.throwIns).toBe(1);
    const failedPassId = release!.lastPassDiagnostic!.passId;
    expect(next.lastPassDiagnostic).toMatchObject({
      passId: failedPassId,
      resolvedAt: next.time,
      finalResult: 'unclaimed',
    });
    expect(next.lastResolvedPass).toEqual(next.lastPassDiagnostic);
    expect(next.lastResolvedPass?.actualContactPoint).toBeUndefined();
    expect(next.statistics?.players.find((entry) => entry.playerId === passer.id)).toMatchObject({
      passesAttempted: 1,
      passesCompleted: 0,
    });
    expect(next.statistics?.observedPassResultIds.filter((id) => id === failedPassId)).toHaveLength(
      1,
    );
    expect(observePlayerMatchStats(next.statistics!, next, { ...next })).toEqual(next.statistics);
    const restartAction = chooseRestartAction(next)!;
    const thrown = resolveMatchAction(next, restartAction);
    expect(thrown.lastPassDiagnostic?.passId).not.toBe(failedPassId);
    expect(thrown.lastResolvedPass).toEqual(next.lastResolvedPass);
    const observed = stepTacticalMatchAfterDecisionProbe(thrown, FIXED_MATCH_DT);
    expect(observed.lastResolvedPass?.passId).toBe(failedPassId);
    expect(
      observed.statistics?.players.find((entry) => entry.playerId === passer.id),
    ).toMatchObject({ passesAttempted: 1, passesCompleted: 0 });
    expect(
      observed.statistics?.observedPassResultIds.filter((id) => id === failedPassId),
    ).toHaveLength(1);
    expect(observed.statistics?.teamAccounting?.away.throwIns).toBe(1);
  });
});

describe('PR150 launch-time active offside and restart evidence', () => {
  it.each(['ground', 'lofted'] as const)(
    'preserves a %s release judgement when defenders step and the runner returns',
    (delivery) => {
      const { state, passer, runner } = fixture();
      runner.position.x = 82;
      const released = resolveMatchAction(state, {
        type: 'pass',
        actorId: passer.id,
        receiverId: runner.id,
        target: { x: 90, y: 34 },
        intent: 'through',
        delivery,
      });
      expect(isOffsideOffence(released.offsideSnapshot, runner.id)).toBe(true);
      released.players.find((player) => player.id === runner.id)!.position.x = 70;
      released.players
        .filter((player) => player.team === 'away')
        .forEach((player) => {
          player.position.x = 92;
        });
      expect(isOffsideOffence(released.offsideSnapshot, runner.id)).toBe(true);
      const stopped = awardOffsideRestart(released, runner.id, { x: 70, y: 34 });
      expect(stopped).toMatchObject({
        scenario: 'free_kick_far',
        possessionTeam: 'away',
        restart: { phase: 'setup', restartTeam: 'away', indirect: true },
        lastOffsideOffence: { playerId: runner.id, releasedAt: state.time, offsideLineX: 78 },
      });
      expect(stopped.ball.x).toBeCloseTo(70);
      expect(stopped.offsideSnapshot).toBeUndefined();
      const evidence = emitMatchEvents(released, emitCanonicalActionEvents(released, stopped));
      expect(evidence.matchEvents?.at(-1)).toMatchObject({
        kind: 'offside',
        team: 'home',
        actorId: runner.id,
        relatedPlayerId: passer.id,
      });
      expect(evidence.actionEvents?.find((fact) => fact.kind === 'offside')?.parentId).toBe(
        `${state.seed}:action:pass:${released.lastPassDiagnostic!.passId}`,
      );
      expect(emitMatchEvents(evidence, { ...evidence }).matchEvents).toHaveLength(1);
    },
  );

  it('keeps an onside launch legal after the receiver runs beyond defenders', () => {
    const { state, passer, runner } = fixture();
    const snapshot = captureOffsideSnapshot(state, {
      type: 'pass',
      actorId: passer.id,
      receiverId: runner.id,
      target: { x: 90, y: 34 },
      intent: 'through',
    });
    runner.position.x = 90;
    state.players
      .filter((player) => player.team === 'away')
      .forEach((player) => {
        player.position.x = 60;
      });
    expect(isOffsideOffence(snapshot, runner.id)).toBe(false);
    expect(
      awardOffsideRestart({ ...state, offsideSnapshot: snapshot! }, runner.id, runner.position)
        .restart,
    ).toBeUndefined();
  });

  it('flags a different offside attacker only when they physically compete/contact', () => {
    const { state, passer, runner } = fixture();
    const other = state.players.find(
      (player) => player.team === 'home' && player.id !== passer.id && player.id !== runner.id,
    )!;
    other.position.x = 84;
    const snapshot = captureOffsideSnapshot(state, {
      type: 'pass',
      actorId: passer.id,
      receiverId: runner.id,
      target: { x: 90, y: 34 },
      intent: 'through',
    });
    expect(snapshot!.relevantAttackerIds).toEqual([runner.id]);
    expect(isOffsideOffence(snapshot, other.id)).toBe(true);
    expect(state.lastOffsideOffence).toBeUndefined();
    expect(registerOpponentTouch(snapshot, 'deflection')).toMatchObject({
      offsidePlayerIds: [other.id],
    });
    expect(registerOpponentTouch(snapshot, 'deliberate_play')).toBeUndefined();
    expect(
      findOffsideContestant({ ...state, offsideSnapshot: snapshot! }, [other.id, runner.id]),
    ).toBeUndefined();
    const defender = state.players.find((player) => player.team === 'away')!;
    expect(
      findOffsideContestant({ ...state, offsideSnapshot: snapshot! }, [other.id, defender.id]),
    ).toBe(other.id);
  });

  it.each(['goal_kick', 'gk_short', 'corner', 'throw_in'] as const)(
    'exempts direct %s reception',
    (scenario) => {
      const { state, passer, runner } = fixture();
      runner.position.x = 90;
      state.scenario = scenario;
      state.restart = {
        phase: 'setup',
        restartTeam: 'home',
        startedAt: state.time,
        takerId: passer.id,
        targets: {},
        roles: {},
        executionChoices: [],
      };
      expect(
        captureOffsideSnapshot(state, {
          type: 'pass',
          actorId: passer.id,
          receiverId: runner.id,
          target: runner.position,
          intent: 'support',
        }),
      ).toMatchObject({ exemptRestart: true, offsidePlayerIds: [] });
    },
  );

  it('rejects a direct terminal shot at the indirect restart commit boundary', () => {
    const { state, passer, runner } = fixture();
    runner.position.x = 82;
    const released = resolveMatchAction(state, {
      type: 'pass',
      actorId: passer.id,
      receiverId: runner.id,
      target: { x: 90, y: 34 },
      intent: 'through',
    });
    const stopped = awardOffsideRestart(released, runner.id, { x: 70, y: 34 });
    const takerId = stopped.restart!.takerId;
    expect(
      resolveMatchAction(
        stopped,
        {
          type: 'shot',
          actorId: takerId,
          target: { x: 0, y: 34 },
          intent: 'driven',
        },
        'human_selected',
      ),
    ).toMatchObject({ restart: { phase: 'setup', indirect: true } });
    expect(
      resolveMatchAction(
        stopped,
        {
          type: 'header',
          actorId: takerId,
          target: { x: 0, y: 34 },
          intent: 'header_shot',
        },
        'human_selected',
      ).ball.shot,
    ).toBeUndefined();
    const teammate = stopped.players.find(
      (player) => player.team === 'away' && player.id !== takerId,
    )!;
    const laidOff = resolveMatchAction(stopped, {
      type: 'pass',
      actorId: takerId,
      receiverId: teammate.id,
      target: teammate.position,
      intent: 'support',
    });
    expect(laidOff.restart?.phase).toBe('release');
    expect(laidOff.ball.ownerId).toBeUndefined();
  });

  it('captures a fresh offside phase at the actual first-time layoff and preserves incoming evidence', () => {
    const { state, passer, runner } = fixture();
    runner.velocity = { x: 0, y: 0 };
    const target = state.players.find(
      (player) =>
        player.team === 'home' &&
        player.id !== passer.id &&
        player.id !== runner.id &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    target.position = { x: 76, y: 42 };
    const release = resolveMatchAction(state, {
      type: 'pass',
      actorId: passer.id,
      receiverId: runner.id,
      target: runner.position,
      intent: 'support',
    });
    expect(isOffsideOffence(release.offsideSnapshot, target.id)).toBe(false);
    const atContact: TacticalMatchState = {
      ...release,
      players: release.players.map((player) =>
        player.id === target.id
          ? { ...player, position: { x: 84, y: 42 }, target: { x: 84, y: 42 } }
          : player,
      ),
      ball: {
        ...release.ball,
        x: runner.position.x - 0.2,
        y: runner.position.y,
        velocity: { x: 10, y: 0, z: 0 },
        height: 0.11,
        airborne: false,
        flightTime: 1,
      },
      actionCooldown: 100,
    };
    atContact.pendingReceptionIntent = {
      actorId: runner.id,
      action: {
        type: 'pass',
        actorId: runner.id,
        receiverId: target.id,
        target: { x: 84, y: 42 },
        intent: 'support',
        firstTime: true,
      },
      createdAt: state.time,
      expiresAt: state.time + 3,
      ballEpisode: incomingBallIntentKey(atContact),
      actionSource: 'human_selected',
    };
    const next = stepTacticalMatchAfterDecisionProbe(atContact, FIXED_MATCH_DT);
    expect(next.lastResolvedPass).toMatchObject({
      passerId: passer.id,
      actualReceiverId: runner.id,
      finalResult: 'completed',
    });
    expect(next.lastPassDiagnostic).toMatchObject({
      passerId: runner.id,
      intendedReceiverId: target.id,
      executionType: 'first_time',
    });
    expect(next.offsideSnapshot).toMatchObject({ passerId: runner.id, releasedAt: next.time });
    expect(isOffsideOffence(next.offsideSnapshot, target.id)).toBe(true);
    const reception = next.actionEvents?.find(
      (event) => event.kind === 'reception' && event.actorId === runner.id,
    );
    expect(reception?.parentId).toBe(
      `${state.seed}:action:pass:${release.lastPassDiagnostic!.passId}`,
    );
    expect(
      next.actionEvents?.find((event) => event.kind === 'pass' && event.actorId === runner.id),
    ).toMatchObject({ targetId: target.id, executionType: 'first_time' });
  });

  it('retains space intent and execution evidence in the offside replay without changing canonical state', () => {
    const { state, passer, runner } = fixture();
    runner.position.x = 82;
    const released = resolveMatchAction(
      state,
      {
        type: 'space_pass',
        actorId: passer.id,
        target: { x: 90, y: 34 },
      },
      'human_selected',
    );
    const incident = emitMatchEvents(
      released,
      emitCanonicalActionEvents(
        released,
        awardOffsideRestart({ ...released, time: state.time + 0.2 }, runner.id, { x: 84, y: 34 }),
      ),
    );
    const before = structuredClone(incident);
    const history = new MatchReplayHistory();
    history.observe(state);
    history.observe(released);
    history.observe(incident);
    history.observe({ ...incident, time: incident.time + 3, status: 'half_time' });
    const event = incident.matchEvents!.find((fact) => fact.kind === 'offside')!;
    expect(history.hasWindow(event.replayKey)).toBe(true);
    const window = history.getWindow(event.replayKey)!;
    const delivery = window.frames
      .flatMap((frame) => frame.actionEvents)
      .find((action) => action.actorId === passer.id && action.kind === 'through_pass');
    expect(delivery).toMatchObject({
      requestedSpace: { x: 90, y: 34 },
      executionType: 'ground_through',
      targetId: runner.id,
    });
    expect(
      window.frames
        .flatMap((frame) => frame.actionEvents)
        .some((action) => action.id === event.actionEventId),
    ).toBe(true);
    window.frames[0]!.ball.x = 0;
    expect(incident).toEqual(before);
    expect(history.getWindow(event.replayKey)!.frames[0]!.ball.x).not.toBe(0);
  });

  it.each(['goal_kick', 'gk_short'] as const)(
    'ends the direct %s exemption at a first-time teammate layoff',
    (scenario) => {
      const { state, passer, runner } = fixture();
      runner.velocity = { x: 0, y: 0 };
      const target = state.players.find(
        (player) =>
          player.team === 'home' &&
          player.id !== passer.id &&
          player.id !== runner.id &&
          player.profile.primaryPosition !== 'goalkeeper',
      )!;
      target.position = { x: 84, y: 42 };
      target.target = { ...target.position };
      state.scenario = scenario;
      state.restart = {
        phase: 'setup',
        restartTeam: 'home',
        startedAt: state.time,
        takerId: passer.id,
        targets: {},
        roles: {},
        executionChoices: [],
      };
      const release = resolveMatchAction(state, {
        type: 'pass',
        actorId: passer.id,
        receiverId: runner.id,
        target: runner.position,
        intent: 'support',
      });
      expect(release.offsideSnapshot).toMatchObject({ exemptRestart: true, offsidePlayerIds: [] });
      const atContact: TacticalMatchState = {
        ...release,
        ball: {
          ...release.ball,
          x: runner.position.x - 0.2,
          y: runner.position.y,
          velocity: { x: 10, y: 0, z: 0 },
          height: 0.11,
          airborne: false,
          flightTime: 1,
        },
        actionCooldown: 100,
      };
      atContact.pendingReceptionIntent = {
        actorId: runner.id,
        action: {
          type: 'pass',
          actorId: runner.id,
          receiverId: target.id,
          target: target.position,
          intent: 'support',
          firstTime: true,
        },
        createdAt: state.time,
        expiresAt: state.time + 3,
        ballEpisode: incomingBallIntentKey(atContact),
        actionSource: 'human_selected',
      };
      const next = stepTacticalMatchAfterDecisionProbe(atContact, FIXED_MATCH_DT);
      expect(next.scenario).toBe('open_play');
      expect(next.restart).toBeUndefined();
      expect(next.ball).toMatchObject({
        travelKind: 'pass',
        executionType: 'first_time',
        airborne: false,
      });
      expect(next.ball.launchVelocity?.z).toBe(0);
      expect(next.lastResolvedPass).toMatchObject({
        passerId: passer.id,
        actualReceiverId: runner.id,
        finalResult: 'completed',
      });
      expect(next.offsideSnapshot).toMatchObject({ passerId: runner.id, exemptRestart: false });
      expect(isOffsideOffence(next.offsideSnapshot, target.id)).toBe(true);
    },
  );

  it('awards an indirect restart, statistic and feed fact from actual continuous ground contact', () => {
    const { state, passer, runner } = fixture();
    runner.position.x = 82;
    runner.velocity = { x: 0, y: 0 };
    let released: TacticalMatchState = resolveMatchAction(state, {
      type: 'pass',
      actorId: passer.id,
      receiverId: runner.id,
      target: { x: 90, y: 34 },
      intent: 'through',
    });
    released = {
      ...released,
      actionCooldown: 100,
      ball: {
        ...released.ball,
        x: 81.7,
        y: 34,
        velocity: { x: 15, y: 0, z: 0 },
        airborne: false,
        flightTime: 1,
      },
    };
    const next = stepTacticalMatchAfterDecisionProbe(released, FIXED_MATCH_DT);
    expect(next.lastOffsideOffence?.playerId).toBe(runner.id);
    expect(next.restart).toMatchObject({ phase: 'setup', restartTeam: 'away', indirect: true });
    expect(next.statistics?.teamAccounting?.home.offsides).toBe(1);
    expect(next.statistics?.teamAccounting?.away.freeKicks).toBe(1);
    expect(next.matchEvents?.at(-1)?.kind).toBe('offside');
  });
});
