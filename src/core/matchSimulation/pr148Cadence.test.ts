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
import { createMatchStatistics, observePlayerMatchStats } from './playerMatchStats';
import { collectContactEvidence } from './contactEvidence';
import { emitCanonicalActionEvents } from './actionEvents';
import {
  chooseNpcAction,
  chooseNpcRoutineAction,
  npcPossessionDecisionDelay,
  resolveMatchAction,
  scoreActionForAI,
} from './matchActions';
import { projectLocomotion, projectSprintEpisode } from './locomotion';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { projectPlayerAgency } from './playerDecision';
import { distance } from './matchSpace';

const world = createCanonicalWorldDatabase();
const fixture = (): TacticalMatchState => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr148-discrete-cadence',
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 10;
  state.actionCooldown = 100;
  state.players = state.players.map((player) => ({
    ...player,
    position: { x: player.team === 'home' ? 20 : 95, y: player.slotIndex * 5 + 4 },
    velocity: { x: 0, y: 0 },
  }));
  const actor = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  actor.position = { x: 40, y: 34 };
  state.ball = { ...actor.position, ownerId: actor.id, lastTouchPlayerId: actor.id };
  state.ballOwnershipStartedAt = state.time;
  state.currentPressure = 0;
  state.teams.home.phase = 'positional_attack';
  return state;
};

describe('PR148 discrete ball contact semantics', () => {
  it('does not infer touches from provenance updates or unchanged copied reception evidence', () => {
    const state = fixture();
    const actorId = state.ball.ownerId!;
    const provenance = {
      ...state,
      time: 11,
      ball: { ...state.ball, lastTouchPlayerId: state.players[2]!.id },
    };
    expect(collectContactEvidence(state, provenance)).toEqual([]);
    state.lastReceptionOutcome = {
      receiverId: actorId,
      kind: 'clean_control',
      contactPoint: { ...state.ball },
    };
    const copied = { ...structuredClone(state), time: 12 };
    expect(collectContactEvidence(state, copied)).toEqual([]);
    const other = state.players.find((player) => player.team === 'away')!;
    const acquired: TacticalMatchState = {
      ...copied,
      ball: { ...other.position, ownerId: other.id },
      onBallPreparation: {
        actorId: other.id,
        gainedAt: 12,
        readyAt: 12.5,
        kind: 'settling',
        incomingSpeed: 0,
      },
    };
    expect(collectContactEvidence(state, acquired).map((contact) => contact.playerId)).toEqual([
      other.id,
    ]);
  });

  it('counts one meaningful carry contact after movement, never ticks or intent selection', () => {
    const initial = fixture();
    const actorId = initial.ball.ownerId!;
    const selected = resolveMatchAction(initial, {
      type: 'carry',
      actorId,
      target: { x: 48, y: 34 },
    });
    let statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, selected);
    expect(statistics.players.find((player) => player.playerId === actorId)?.touches).toBe(0);
    const moved = {
      ...selected,
      time: 11,
      players: selected.players.map((player) =>
        player.id === actorId ? { ...player, position: { x: 41, y: 34 } } : player,
      ),
    };
    statistics = observePlayerMatchStats(statistics, selected, moved);
    expect(statistics.players.find((player) => player.playerId === actorId)?.touches).toBe(1);
    expect(statistics.players.find((player) => player.playerId === actorId)?.carries).toBe(1);
    const recorded = emitCanonicalActionEvents(selected, moved);
    expect(recorded.actionEvents?.filter((event) => event.kind === 'dribble')).toHaveLength(1);
    expect(recorded.actionEvents?.find((event) => event.kind === 'dribble')).toMatchObject({
      actorId,
      at: moved.time,
      team: 'home',
      outcome: 'controlled',
      position: { x: 41, y: 34 },
    });
    for (let tick = 1; tick <= 100; tick++) {
      const copied = { ...structuredClone(moved), time: moved.time + tick * FIXED_MATCH_DT };
      statistics = observePlayerMatchStats(statistics, moved, copied);
    }
    expect(statistics.players.find((player) => player.playerId === actorId)?.touches).toBe(1);
  });

  it('retains exact dismissal minutes and rejects all observer work after termination', () => {
    const previous = fixture();
    const dismissed = previous.ball.ownerId!;
    const next: TacticalMatchState = {
      ...previous,
      time: 10.025,
      players: previous.players.filter((player) => player.id !== dismissed),
      discipline: {
        [dismissed]: { yellowCards: 2, sentOff: true, sentOffAt: 10.025, team: 'home' },
      },
    };
    const statistics = observePlayerMatchStats(createMatchStatistics(previous), previous, next);
    expect(statistics.players.find((player) => player.playerId === dismissed)?.minutesPlayed).toBe(
      10.025 / 60,
    );
    const terminal: TacticalMatchState = { ...next, status: 'abandoned' };
    expect(observePlayerMatchStats(statistics, terminal, { ...terminal, time: 100 })).toBe(
      statistics,
    );
  });
});

describe('PR148 sustained sprint episodes and locomotion', () => {
  it('keeps a scanning owner still while allowing an explicit carry to move the ball', () => {
    const initial = fixture();
    const actorId = initial.ball.ownerId!;
    const actor = initial.players.find((player) => player.id === actorId)!;
    actor.target = { x: 65, y: 34 };
    let scanning = initial;
    for (let tick = 0; tick < 40; tick++)
      scanning = stepTacticalMatchAfterDecisionProbe(scanning, FIXED_MATCH_DT);
    const still = scanning.players.find((player) => player.id === actorId)!;
    expect(still.position).toEqual(actor.position);
    expect(still.locomotionTelemetry?.distanceTotal).toBe(0);
    expect(scanning.ball.ownerId).toBe(actorId);
    // Finite physical touches keep the ball in the foot envelope rather than enforcing a
    // mathematically exact rigid-body offset on every tick.
    expect(
      Math.hypot(scanning.ball.x - still.position.x, scanning.ball.y - still.position.y),
    ).toBeGreaterThan(0.2);
    expect(
      Math.hypot(scanning.ball.x - still.position.x, scanning.ball.y - still.position.y),
    ).toBeLessThan(1.1);
    let carried = resolveMatchAction(initial, { type: 'carry', actorId, target: { x: 48, y: 34 } });
    for (let tick = 0; tick < 40; tick++)
      carried = stepTacticalMatchAfterDecisionProbe(carried, FIXED_MATCH_DT);
    expect(carried.players.find((player) => player.id === actorId)!.position.x).toBeGreaterThan(
      actor.position.x + 1,
    );
    const carrier = carried.players.find((player) => player.id === actorId)!;
    expect(
      Math.hypot(carried.ball.x - carrier.position.x, carried.ball.y - carrier.position.y),
    ).toBeLessThan(2.05);
    expect(carried.ball.velocity).toBeDefined();
    expect(carried.contactControlTelemetry!.physicalContacts).toBeGreaterThan(1);
  });

  it('jockeys a controlled owner with defensive cover instead of creating a routine tackle', () => {
    let state = fixture();
    const owner = state.players.find((player) => player.id === state.ball.ownerId)!;
    const defenders = state.players.filter(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    );
    const marker = defenders[0]!;
    marker.position = { x: owner.position.x + 2.3, y: owner.position.y };
    marker.target = { ...owner.position };
    marker.profile = {
      ...marker.profile,
      attributes: {
        ...marker.profile.attributes,
        aggression: 40,
        gameReading: 65,
        positioning: 65,
      },
    };
    defenders[1]!.position = { x: owner.position.x + 10, y: owner.position.y - 4 };
    defenders[2]!.position = { x: owner.position.x + 15, y: owner.position.y + 4 };
    state.nearestChallengerId = marker.id;
    for (let tick = 0; tick < 40; tick++)
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    const containing = state.players.find((player) => player.id === marker.id)!;
    expect(containing.position.x).toBeGreaterThan(owner.position.x + 1.9);
    expect(state.ball.ownerId).toBe(owner.id);
    expect(state.defensiveTelemetry?.attempted ?? 0).toBe(0);
    expect(projectLocomotion(state, containing).reason).toBe('contain');
  });

  it('closes down a consciously held ball and restores agency on physical pressure', () => {
    const initial = fixture();
    const owner = initial.players.find((player) => player.id === initial.ball.ownerId)!;
    initial.controlledFootballerId = owner.id;
    const defenders = initial.players.filter(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    );
    const marker = defenders[0]!;
    marker.position = { x: owner.position.x + 2.3, y: owner.position.y };
    marker.target = { ...owner.position };
    marker.profile = {
      ...marker.profile,
      attributes: {
        ...marker.profile.attributes,
        aggression: 40,
        gameReading: 65,
        positioning: 65,
      },
    };
    defenders[1]!.position = { x: owner.position.x + 10, y: owner.position.y - 4 };
    defenders[2]!.position = { x: owner.position.x + 15, y: owner.position.y + 4 };
    initial.nearestChallengerId = marker.id;
    let held = resolveMatchAction(initial, { type: 'hold', actorId: owner.id }, 'human_selected');
    // The selected scan has finished; ownership still belongs to the player's decision.
    held.actionCooldown = 0;
    expect(projectPlayerAgency(held).probe.blockedReason).toBe('possession_continuity');
    for (let tick = 0; tick < 120 && !projectPlayerAgency(held).opportunity; tick++)
      held = stepTacticalMatch(held, FIXED_MATCH_DT);
    const pressedOwner = held.players.find((player) => player.id === owner.id)!;
    const pressing = held.players.find((player) => player.id === marker.id)!;
    expect(distance(pressing.position, pressedOwner.position)).toBeLessThan(1.6);
    expect(distance(pressing.position, held.ball)).toBeLessThanOrEqual(1);
    expect(projectPlayerAgency(held).opportunity?.triggerReason).toBe('possession_contested');
    expect(held.latestAction?.type).toBe('hold');
    expect(held.latestActionSource).toBe('human_selected');
  });

  it('contains a completed duel instead of running back into its locked opponent', () => {
    const state = fixture();
    const defender = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const ownerId = state.ball.ownerId!;
    defender.position = { x: 42, y: 34 };
    defender.target = { x: 40.8, y: 34 };
    state.nearestChallengerId = defender.id;
    state.defensiveEpisodes = [
      {
        participants: [defender.id, ownerId],
        position: { x: 40, y: 34 },
        ballEpisode: state.ballEpisode ?? 0,
        resolvedAt: state.time,
      },
    ];
    expect(projectLocomotion(state, defender)).toMatchObject({
      intensity: 'walk',
      reason: 'contain',
    });
    state.ball.x = 48;
    expect(projectLocomotion(state, defender).reason).toBe('press_commit');
  });

  it('counts a sustained sprint once, ignores threshold flutter, and re-arms after recovery', () => {
    let player: Pick<
      MatchPlayerState,
      'sprintStartedAt' | 'sprintRecoveryStartedAt' | 'sprintBurstCounted'
    > = {};
    let bursts = 0;
    let time = 0;
    const run = (ratio: number, seconds: number) => {
      for (let tick = 0; tick < Math.round(seconds / FIXED_MATCH_DT); tick++) {
        const episode = projectSprintEpisode(player, ratio, time, FIXED_MATCH_DT);
        bursts += Number(episode.countBurst);
        player = {
          sprintBurstCounted: episode.sprintBurstCounted,
          ...(episode.sprintStartedAt !== undefined
            ? { sprintStartedAt: episode.sprintStartedAt }
            : {}),
          ...(episode.sprintRecoveryStartedAt !== undefined
            ? { sprintRecoveryStartedAt: episode.sprintRecoveryStartedAt }
            : {}),
        };
        time += FIXED_MATCH_DT;
      }
    };
    run(0.9, 0.25);
    expect(bursts).toBe(0);
    run(0.6, 0.1);
    expect(player.sprintStartedAt).toBeUndefined();
    run(0.9, 0.3);
    expect(bursts).toBe(0);
    run(0.9, 4);
    expect(bursts).toBe(1);
    run(0.69, 0.5);
    run(0.86, 3);
    expect(bursts).toBe(1);
    expect(player.sprintRecoveryStartedAt).toBeUndefined();
    run(0.3, 1.3);
    expect(player.sprintStartedAt).toBeUndefined();
    expect(player.sprintBurstCounted).toBe(false);
    run(0.9, 1);
    expect(bursts).toBe(2);
  });

  it('does not sprint nearby formation players merely because a pass is in flight', () => {
    const state = fixture();
    const player = state.players[1]!;
    player.position = { x: 40, y: 34 };
    player.target = { x: 44, y: 34 };
    state.ball = { x: 42, y: 34, travelKind: 'pass' };
    expect(projectLocomotion(state, player).intensity).toBe('jog');
    state.ball = { x: 42, y: 34, looseSince: state.time };
    expect(projectLocomotion(state, player).intensity).toBe('sprint');
  });

  it('accounts every integrated metre once across speed categories and preserves touch provenance', () => {
    let state = fixture();
    for (let tick = 0; tick < 100; tick++)
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    for (const player of state.players) {
      const running = player.locomotionTelemetry!;
      expect(
        running.distanceWalk + running.distanceJog + running.distanceRun + running.distanceSprint,
      ).toBeCloseTo(running.distanceTotal, 8);
    }
    expect(state.ball.lastTouchPlayerId).toBe(state.ball.ownerId);
  });
});

describe('PR148 contextual passing cadence', () => {
  it('values brief scanning but releases after scanning finishes instead of renewing hold forever', () => {
    const state = fixture();
    const actorId = state.ball.ownerId!;
    state.teams.home.style = 'possession';
    const hold = { type: 'hold' as const, actorId };
    const fresh = scoreActionForAI(state, actorId, hold);
    const ready = { ...state, time: state.time + 6 };
    expect(fresh - scoreActionForAI(ready, actorId, hold)).toBeGreaterThan(17);
    const stale = { ...state, time: state.time + 30 };
    expect(chooseNpcAction(stale, actorId)?.type).not.toBe('hold');
    const restart = {
      ...state,
      time: stale.time,
      restart: {
        phase: 'setup' as const,
        startedAt: state.time,
        restartTeam: 'home' as const,
        takerId: actorId,
        targets: {},
        executionChoices: [] as 'short_pass'[],
        roles: {},
      },
    };
    expect(scoreActionForAI(restart, actorId, hold)).toBe(fresh);
  });

  it('keeps a last-resort shield preferable to unsafe passes or running into elite markers', () => {
    const state = fixture();
    const actor = state.players.find((player) => player.id === state.ball.ownerId)!;
    state.time = 100;
    state.ballOwnershipStartedAt = 0;
    state.teams.home.style = 'balanced';
    actor.profile = {
      ...actor.profile,
      attributes: {
        ...actor.profile.attributes,
        passing: 1,
        technique: 1,
        firstTouch: 1,
        dribbling: 1,
        agility: 1,
        pace: 1,
        gameReading: 1,
        composure: 1,
        strength: 1,
        finishing: 1,
      },
    };
    for (const opponent of state.players.filter((player) => player.team !== actor.team))
      opponent.position = { x: actor.position.x + 0.5, y: actor.position.y };
    for (const mate of state.players.filter(
      (player) => player.team === actor.team && player.id !== actor.id,
    ))
      mate.position = { x: actor.position.x - 65, y: 0 };
    state.currentPressure = 1;
    expect(chooseNpcAction(state, actor.id)?.type).toBe('hold');
  });

  it('waits for ordinary scanning but allows pressured and transition possession to play quickly', () => {
    const state = fixture();
    const actor = state.players.find((player) => player.id === state.ball.ownerId)!;
    const scanning = npcPossessionDecisionDelay(state, actor);
    expect(scanning).toBeGreaterThan(2.8);
    expect(chooseNpcRoutineAction({ ...state, time: 11 }, actor.id)).toBeUndefined();
    state.currentPressure = 1;
    expect(npcPossessionDecisionDelay(state, actor)).toBeLessThan(1.4);
    expect(chooseNpcRoutineAction({ ...state, time: 11.5 }, actor.id)).toBeDefined();
    state.currentPressure = 0;
    state.teams.home.phase = 'attacking_transition';
    actor.position = { x: 78, y: 34 };
    state.timeSincePossessionChanged = 1;
    expect(npcPossessionDecisionDelay(state, actor)).toBeLessThan(1.2);
  });

  it('penalizes unchanged immediate returns while preserving forward wall-pass value', () => {
    const state = fixture();
    const actor = state.players.find((player) => player.id === state.ball.ownerId)!;
    const receiver = state.players.find(
      (player) =>
        player.team === actor.team &&
        player.id !== actor.id &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    receiver.position = { x: 42, y: 35 };
    const pass = {
      type: 'pass' as const,
      actorId: actor.id,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'support' as const,
    };
    const normal = scoreActionForAI(state, actor.id, pass);
    state.lastPassDiagnostic = {
      passId: 'previous',
      passerId: receiver.id,
      intendedReceiverId: actor.id,
      releasedAt: 8,
      resolvedAt: 9,
      receiverPositionAtRelease: actor.position,
      receiverVelocityAtRelease: actor.velocity,
      predictedReceptionPoint: actor.position,
      actualContactPoint: actor.position,
      awarenessDelay: 0,
      receiverArrivalEstimate: 1,
      bestDefenderArrivalEstimate: 5,
      leadDistance: 0,
      finalResult: 'completed',
    };
    expect(normal - scoreActionForAI(state, actor.id, pass)).toBeGreaterThan(25);
    receiver.position = { x: 54, y: 35 };
    const forward = { ...pass, target: receiver.position, intent: 'progressive' as const };
    const returned = scoreActionForAI(state, actor.id, forward);
    delete state.lastPassDiagnostic;
    expect(scoreActionForAI(state, actor.id, forward)).toBe(returned);
  });
});
