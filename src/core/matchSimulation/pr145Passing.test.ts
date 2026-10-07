import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  applyRestartScenario,
  applyPlayerDecision,
  applyThrowInContact,
  canContactAfterThrowIn,
  chooseRestartAction,
  createTacticalMatch,
  deriveHumanLeadPass,
  deriveLeadPass,
  distance,
  enumerateAvailableActions,
  enumerateRestartActions,
  estimatePlayerArrivalTime,
  FIXED_MATCH_DT,
  PASS_MEETING_CALIBRATION,
  observePlayerMatchStats,
  projectContextualInteractions,
  projectPassReception,
  projectPlayerDecisionOpportunity,
  resolveMatchAction,
  stepTacticalMatch,
  tacticalMatchStateSchema,
  type MatchAction,
  type TacticalMatchState,
} from '.';
import { hasActiveHumanPossession } from './possessionAgency';
import { integrateBallFlight } from './ballPhysics';

const world = createCanonicalWorldDatabase();
const fixture = (): TacticalMatchState => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr145-pass-restart',
      control: { mode: 'spectator' },
    }),
  );
  state.scenario = 'open_play';
  delete state.restart;
  state.players = state.players.map((player) => ({
    ...player,
    position: { x: player.team === 'home' ? 15 : 85, y: 60 },
    velocity: { x: 0, y: 0 },
  }));
  const passer = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  passer.position = { x: 40, y: 30 };
  passer.target = { ...passer.position };
  state.ball = { ...passer.position, ownerId: passer.id, lastTouchPlayerId: passer.id };
  state.possessionTeam = passer.team;
  return state;
};
const pair = (state: TacticalMatchState) => {
  const passer = state.players.find((player) => player.id === state.ball.ownerId)!;
  const receiver = state.players.find(
    (player) =>
      player.team === passer.team &&
      player.id !== passer.id &&
      player.profile.primaryPosition !== 'goalkeeper',
  )!;
  receiver.position = { x: 54, y: 20 };
  receiver.target = { x: 78, y: 20 };
  receiver.velocity = { x: 5, y: 0 };
  return { passer, receiver };
};

describe('PR145 contact-free delivery continuity', () => {
  const unclaimed = (speed: number, airborne: boolean) => {
    const state = fixture();
    const { passer, receiver } = pair(state);
    const release = resolveMatchAction(state, {
      type: 'pass',
      actorId: passer.id,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'support',
    });
    release.actionCooldown = 10;
    release.statistics = observePlayerMatchStats(release.statistics!, state, release);
    release.ball = {
      ...release.ball,
      x: 50,
      y: 30,
      height: airborne ? 2 : 0.11,
      airborne,
      bounceCount: 0,
      velocity: { x: speed, y: 0, z: airborne ? 3 : 0 },
      target: { x: 50.2, y: 30 },
    };
    return release;
  };

  it('rolls through the declared target without a scripted contact or speed reduction', () => {
    let state = unclaimed(8, false);
    const touches = state.statistics!.observedContactIds.length;
    let physical = {
      position: { x: state.ball.x, y: state.ball.y, z: 0.11 },
      velocity: { x: 8, y: 0, z: 0 },
      airborne: false,
      bounceCount: 0,
    };
    for (let tick = 0; tick < 8; tick++) {
      physical = integrateBallFlight(physical, FIXED_MATCH_DT);
      state = stepTacticalMatch(state, FIXED_MATCH_DT);
    }
    expect(state.ball.x).toBeGreaterThan(50.2);
    expect(state.ball.x).toBeCloseTo(physical.position.x, 8);
    expect(state.ball.velocity!.x).toBeCloseTo(physical.velocity.x, 8);
    expect(state.lastPassDiagnostic?.actualContactPoint).toBeUndefined();
    expect(state.lastPassDiagnostic?.finalResult).toBeUndefined();
    expect(state.statistics!.observedContactIds).toHaveLength(touches);
  });

  it.each([8, 0.1])('preserves an unclaimed aerial flight at horizontal speed %s', (speed) => {
    const state = unclaimed(speed, true);
    const physical = integrateBallFlight(
      {
        position: { x: 50, y: 30, z: 2 },
        velocity: { x: speed, y: 0, z: 3 },
        airborne: true,
        bounceCount: 0,
      },
      FIXED_MATCH_DT,
    );
    const next = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(next.ball.airborne).toBe(true);
    expect(next.ball.height).toBeCloseTo(physical.position.z, 8);
    expect(next.ball.velocity!.z).toBeCloseTo(physical.velocity.z, 8);
    expect(next.ball.velocity!.x).toBeCloseTo(physical.velocity.x, 8);
    expect(next.ball.looseSince).toBeUndefined();
  });

  it('ends a grounded delivery at rest without fabricating reception contact', () => {
    const state = unclaimed(0.2, false);
    const next = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(next.ball.looseSince).toBe(next.time);
    expect(next.ball.velocity!.x).toBeCloseTo(0.2 - 3.2 * FIXED_MATCH_DT, 8);
    expect(next.lastPassDiagnostic?.finalResult).toBe('unclaimed');
    expect(next.lastPassDiagnostic?.actualContactPoint).toBeUndefined();
    expect(next.statistics!.observedContactIds).toEqual(state.statistics!.observedContactIds);
  });
});

describe('PR145 reachable pass meeting semantics', () => {
  it.each([
    ['forward', { x: 5, y: 0 }, { x: 54, y: 20 }],
    ['diagonal', { x: 4, y: -3 }, { x: 54, y: 20 }],
    ['winger down touch', { x: 6, y: 0 }, { x: 54, y: 1.2 }],
    ['striker across box', { x: 0, y: 5 }, { x: 86, y: 24 }],
  ] as const)(
    'predicts %s along movement despite opposite body facing',
    (_label, velocity, position) => {
      const state = fixture();
      const { passer, receiver } = pair(state);
      receiver.position = { ...position };
      receiver.velocity = { ...velocity };
      receiver.target = { x: position.x + velocity.x * 3, y: position.y + velocity.y * 3 };
      receiver.facingAngle = Math.atan2(-velocity.y, -velocity.x);
      const projection = projectPassReception(state, passer, receiver, 'lead');
      expect(projection.semanticIntent).toBe('lead');
      expect(
        (projection.releaseTarget.x - position.x) * velocity.x +
          (projection.releaseTarget.y - position.y) * velocity.y,
      ).toBeGreaterThan(0);
      const eta = estimatePlayerArrivalTime(state, receiver, projection.releaseTarget, 'intercept');
      expect(eta.estimatedTime).toBeLessThanOrEqual(
        projection.estimatedBallArrival + PASS_MEETING_CALIBRATION.arrivalToleranceSeconds,
      );
      expect(projection.predictionHorizon).toBeLessThanOrEqual(
        PASS_MEETING_CALIBRATION.maximumHorizonSeconds,
      );
    },
  );

  it('keeps a stationary receiver at feet and reclassifies absent path intent', () => {
    const state = fixture();
    const { passer, receiver } = pair(state);
    receiver.velocity = { x: 0, y: 0 };
    receiver.target = { ...receiver.position };
    const projection = projectPassReception(state, passer, receiver, 'through');
    expect(projection.semanticIntent).toBe('support');
    expect(projection.releaseTarget).toEqual(receiver.position);
    expect(deriveHumanLeadPass(state, passer, receiver)).toBeUndefined();
  });

  it('uses support for checking toward the passer in both human and AI menus', () => {
    const state = fixture();
    const { passer, receiver } = pair(state);
    receiver.position = { x: 54, y: 30 };
    receiver.velocity = { x: -5, y: 0 };
    receiver.target = passer.position;
    expect(projectPassReception(state, passer, receiver, 'lead').semanticIntent).toBe('support');
    expect(deriveLeadPass(state, passer, receiver)).toBeUndefined();
    expect(deriveHumanLeadPass(state, passer, receiver)).toBeUndefined();
    expect(
      enumerateAvailableActions(state, passer.id).filter(
        (action) =>
          action.type === 'pass' &&
          action.receiverId === receiver.id &&
          ['lead', 'through'].includes(action.intent),
      ),
    ).toEqual([]);
  });

  it('clips an outward path legally while keeping the along-channel movement', () => {
    const state = fixture();
    const { passer, receiver } = pair(state);
    receiver.position = { x: 96, y: 0.8 };
    receiver.target = { x: 120, y: -10 };
    receiver.velocity = { x: 7, y: -4 };
    const projection = projectPassReception(state, passer, receiver, 'through');
    expect(projection.releaseTarget.x).toBeGreaterThan(receiver.position.x);
    expect(projection.releaseTarget.x).toBeLessThanOrEqual(104.6);
    expect(projection.releaseTarget.y).toBeGreaterThanOrEqual(0.4);
    expect(projection.predictionHorizon).toBeLessThanOrEqual(2.5);
  });

  it('does not label a slow check-back as lead when its tactical target still points forward', () => {
    const state = fixture();
    const { passer, receiver } = pair(state);
    receiver.position = { x: 54, y: 30 };
    receiver.velocity = { x: -0.5, y: 0 };
    receiver.target = { x: 74, y: 30 };
    const projection = projectPassReception(state, passer, receiver, 'through');
    expect(projection.semanticIntent).toBe('support');
    expect(deriveHumanLeadPass(state, passer, receiver)).toBeUndefined();
    expect(deriveLeadPass(state, passer, receiver)).toBeUndefined();
  });

  it('solves a selected lofted path pass against its aerial arrival instead of a ground ETA', () => {
    const state = fixture();
    const { passer, receiver } = pair(state);
    const ground = projectPassReception(state, passer, receiver, 'lead');
    const lofted = projectPassReception(state, passer, receiver, 'lead', 'lofted');
    expect(lofted.estimatedBallArrival).toBeGreaterThan(ground.estimatedBallArrival);
    expect(lofted.releaseTarget.x).toBeGreaterThan(ground.releaseTarget.x);
    const release = resolveMatchAction(state, {
      type: 'pass',
      actorId: passer.id,
      receiverId: receiver.id,
      target: ground.releaseTarget,
      intent: 'lead',
      delivery: 'lofted',
    });
    expect(release.lastPassDiagnostic?.intendedTarget).toEqual(lofted.releaseTarget);
    expect(release.ball.target).toEqual(release.lastPassDiagnostic?.physicalTarget);
    expect(release.ball.launchVelocity?.z).toBeGreaterThan(0);
    expect(release.lastPassDiagnostic?.selectionQuality?.ballEta).toBeCloseTo(
      lofted.estimatedBallArrival,
      6,
    );
  });

  it('launches from the real ball contact point when it is ahead of the passer body', () => {
    const state = fixture();
    const { passer, receiver } = pair(state);
    state.ball = { ...state.ball, x: passer.position.x + 1.15, y: passer.position.y + 0.3 };
    const projection = projectPassReception(state, passer, receiver, 'lead');
    const release = resolveMatchAction(state, {
      type: 'pass',
      actorId: passer.id,
      receiverId: receiver.id,
      target: projection.releaseTarget,
      intent: 'lead',
    });
    const dx = release.ball.target!.x - state.ball.x,
      dy = release.ball.target!.y - state.ball.y;
    expect(release.ball.from).toEqual({ x: state.ball.x, y: state.ball.y });
    expect(release.ball.launchVelocity!.x * dy - release.ball.launchVelocity!.y * dx).toBeCloseTo(
      0,
      8,
    );
  });

  it('shares meeting geometry between human and autonomous releases without duplicate ground path options', () => {
    const state = fixture();
    const { passer, receiver } = pair(state);
    const human = deriveHumanLeadPass(state, passer, receiver)!;
    const npc = deriveLeadPass(state, passer, receiver)!;
    expect(human.projection.releaseTarget).toEqual(npc.projection.releaseTarget);
    const action: MatchAction = {
      type: 'pass',
      actorId: passer.id,
      receiverId: receiver.id,
      target: human.projection.releaseTarget,
      intent: 'lead',
    };
    expect(resolveMatchAction(state, action, 'human_selected').ball.velocity).toEqual(
      resolveMatchAction(state, action, 'autonomous_npc').ball.velocity,
    );
    const options = enumerateAvailableActions(state, passer.id).filter(
      (entry) =>
        entry.type === 'pass' && entry.receiverId === receiver.id && entry.delivery !== 'lofted',
    );
    for (let a = 0; a < options.length; a += 1)
      for (let b = a + 1; b < options.length; b += 1) {
        const first = options[a]!,
          second = options[b]!;
        if (first.type === 'pass' && second.type === 'pass')
          expect(distance(first.target, second.target)).toBeGreaterThanOrEqual(1.6);
      }
  });
});

const throwFixture = () =>
  applyRestartScenario(fixture(), 'throw_in', {
    restartTeam: 'home',
    restartPoint: { x: 45, y: 0 },
  });
const selectedThrow = (state: TacticalMatchState) =>
  enumerateRestartActions(state).find((action) => action.type === 'pass') as Extract<
    MatchAction,
    { type: 'pass' }
  >;
describe('PR145 throw target and contact integrity', () => {
  it.each(['home', 'away'] as const)(
    'starts the %s throw preset on its canonical touchline',
    (restartTeam) => {
      const state = applyRestartScenario(fixture(), 'throw_in', { restartTeam });
      expect(state.ball.y).toBe(restartTeam === 'home' ? 0 : 68);
      const release = resolveMatchAction(state, chooseRestartAction(state)!);
      expect(release.ball.from?.y).toBe(state.ball.y);
      expect(release.ball.intendedReceiverId).not.toBe(state.restart!.takerId);
    },
  );
  it.each(['human_selected', 'autonomous_npc'] as const)(
    'directs %s release to its selected legal teammate',
    (source) => {
      const state = throwFixture();
      const action = selectedThrow(state);
      const release = resolveMatchAction(state, action, source);
      const dx = release.ball.target!.x - release.ball.from!.x,
        dy = release.ball.target!.y - release.ball.from!.y;
      const vector = release.ball.launchVelocity!;
      expect(vector.x * dy - vector.y * dx).toBeCloseTo(0, 8);
      expect(vector.x * dx + vector.y * dy).toBeGreaterThan(0);
      expect(release.ball.intendedReceiverId).toBe(action.receiverId);
      expect(release.ball.target).toEqual(action.target);
      expect(release.currentAction?.type).toBe('pass');
      expect(release.throwInRestriction?.throwerId).toBe(action.actorId);
      expect(tacticalMatchStateSchema.safeParse(release).success).toBe(true);
    },
  );

  it('delivers to the selected teammate through actual canonical contact', () => {
    const state = throwFixture();
    const action = selectedThrow(state);
    state.players = state.players.map((player) =>
      player.id === action.actorId || player.id === action.receiverId
        ? player
        : { ...player, position: { x: 90, y: 60 }, target: { x: 90, y: 60 } },
    );
    let next = resolveMatchAction(state, action);
    for (let tick = 0; tick < 120 && !next.lastThrowInDiagnostic?.nextContactPlayerId; tick += 1)
      next = stepTacticalMatch(next, FIXED_MATCH_DT);
    expect(next.lastThrowInDiagnostic?.nextContactPlayerId).toBe(action.receiverId);
    expect(next.throwInRestriction).toBeUndefined();
  });

  it('tracks receiver movement between selection and release', () => {
    const state = throwFixture();
    const action = selectedThrow(state);
    const receiver = state.players.find((player) => player.id === action.receiverId)!;
    receiver.position = { x: receiver.position.x + 2, y: receiver.position.y + 1.5 };
    const release = resolveMatchAction(state, action);
    expect(release.ball.target).toEqual(receiver.position);
    expect(release.lastThrowInDiagnostic?.requestedTarget).toEqual(action.target);
    expect(release.lastThrowInDiagnostic?.releaseTarget).toEqual(receiver.position);
  });

  it('uses one legal fallback when the selected receiver disappears', () => {
    const state = throwFixture();
    const action = selectedThrow(state);
    state.players = state.players.filter((player) => player.id !== action.receiverId);
    const release = resolveMatchAction(state, action, 'human_selected');
    expect(release.lastThrowInDiagnostic?.fallbackReason).toBe('receiver_missing');
    expect(release.ball.intendedReceiverId).not.toBe(action.receiverId);
    expect(release.ball.intendedReceiverId).not.toBe(action.actorId);
    expect(release.ball.travelKind).toBe('throw_in');
    expect(release.decisionIndex).toBe(state.decisionIndex + 1);
  });

  it('rejects self throws and carry without consuming the restart', () => {
    const state = throwFixture();
    const action = selectedThrow(state);
    expect(resolveMatchAction(state, { ...action, receiverId: action.actorId })).toBe(state);
    expect(
      resolveMatchAction(state, { type: 'carry', actorId: action.actorId, target: action.target }),
    ).toBe(state);
    expect(
      enumerateAvailableActions(state, action.actorId).every(
        (entry) => entry.type === 'pass' && entry.receiverId !== action.actorId,
      ),
    ).toBe(true);
    state.controlledFootballerId = action.actorId;
    const opportunity = {
      actorId: action.actorId,
      kind: 'restart',
      options: enumerateRestartActions(state).map((entry, index) => ({
        id: String(index),
        kind: 'action',
        action: entry,
      })),
    } as unknown as Parameters<typeof projectContextualInteractions>[1];
    expect(
      projectContextualInteractions(state, opportunity, { kind: 'space', point: action.target }),
    ).toEqual([]);
  });

  it('excludes the thrower from immediate loose-ball ownership and actions', () => {
    const state = throwFixture();
    const action = selectedThrow(state);
    let release = resolveMatchAction(state, action);
    const thrower = release.players.find((player) => player.id === action.actorId)!;
    release.players = release.players.map((player) =>
      player.id === thrower.id
        ? player
        : { ...player, position: { x: 90, y: 60 }, target: { x: 90, y: 60 } },
    );
    release.ball = { ...thrower.position, velocity: { x: 0, y: 0 }, looseSince: release.time - 1 };
    release = stepTacticalMatch(release, FIXED_MATCH_DT);
    expect(release.ball.ownerId).not.toBe(thrower.id);
    expect(canContactAfterThrowIn(release, thrower.id)).toBe(false);
    const forgedControl = { ...release, ball: { ...release.ball, ownerId: thrower.id } };
    expect(resolveMatchAction(forgedControl, { type: 'hold', actorId: thrower.id })).toBe(
      forgedControl,
    );
  });

  it('does not clear the restriction merely because a selected high reception is waiting for foot height', () => {
    const state = throwFixture();
    const action = selectedThrow(state);
    const release = resolveMatchAction(state, action);
    release.players = release.players.map((player) => ({
      ...player,
      position: player.id === action.receiverId ? { x: 52, y: 5 } : { x: 90, y: 60 },
      target: player.id === action.receiverId ? { x: 52, y: 5 } : { x: 90, y: 60 },
      velocity: { x: 0, y: 0 },
    }));
    release.ball = {
      ...release.ball,
      x: 52,
      y: 5,
      height: 1.9,
      airborne: true,
      velocity: { x: 0, y: 0, z: 0 },
    };
    release.scenario = 'open_play';
    delete release.restart;
    release.pendingReceptionIntent = {
      actorId: action.receiverId,
      action: { type: 'hold', actorId: action.receiverId },
      createdAt: release.time,
      expiresAt: release.time + 2,
      ballEpisode: 'high-selected-throw',
      sourceAction: 'pass',
    };
    const waiting = stepTacticalMatch(release, FIXED_MATCH_DT);
    expect(waiting.lastAerialContact).toBeUndefined();
    expect(
      waiting.aerialContactLocks?.some((lock) => lock.playerId === action.receiverId),
    ).not.toBe(true);
    expect(waiting.ball.ownerId).toBeUndefined();
    expect(waiting.lastThrowInDiagnostic?.nextContactPlayerId).toBeUndefined();
    expect(canContactAfterThrowIn(waiting, action.actorId)).toBe(false);
    expect(
      waiting.statistics?.players.find((player) => player.playerId === action.receiverId)?.touches,
    ).toBe(0);
  });

  it('preserves a controlled receiver selection and terminal ownership during released throw play', () => {
    const state = applyRestartScenario(fixture(), 'throw_in', {
      restartTeam: 'home',
      restartPoint: { x: 80, y: 0 },
    });
    const action = selectedThrow(state);
    const receiver = state.players.find((player) => player.id === action.receiverId)!;
    receiver.position = { x: 87, y: 25 };
    receiver.target = { ...receiver.position };
    receiver.facingAngle = Math.atan2(-25, -7);
    receiver.profile = {
      ...receiver.profile,
      attributes: {
        ...receiver.profile.attributes,
        firstTouch: 95,
        technique: 95,
        composure: 95,
        gameReading: 95,
        concentration: 95,
        agility: 95,
        heading: 95,
        jumping: 95,
        strength: 95,
        finishing: 95,
      },
    };
    action.target = { ...receiver.position };
    action.receiverPositionAtSelection = { ...receiver.position };
    state.players = state.players.map((player) =>
      player.id === action.actorId || player.id === receiver.id
        ? player
        : {
            ...player,
            position: { x: player.team === 'home' ? 45 : 100, y: 60 },
            target: { x: player.team === 'home' ? 45 : 100, y: 60 },
          },
    );
    state.controlledFootballerId = receiver.id;
    let released = resolveMatchAction(state, action, 'autonomous_npc');
    let opportunity = projectPlayerDecisionOpportunity(released);
    for (let tick = 0; tick < 80 && opportunity?.kind !== 'incoming_ball'; tick += 1) {
      released = stepTacticalMatch(released, FIXED_MATCH_DT);
      opportunity = projectPlayerDecisionOpportunity(released);
    }
    expect(released.restart?.phase).toBe('release');
    expect(opportunity?.kind).toBe('incoming_ball');
    const selected = applyPlayerDecision(released, opportunity!, 'control');
    let received = stepTacticalMatch(selected, FIXED_MATCH_DT);
    if (!received.lastThrowInDiagnostic?.nextContactPlayerId)
      expect(received.pendingReceptionIntent?.actorId).toBe(receiver.id);
    for (let tick = 0; tick < 120 && !received.ball.ownerId; tick += 1)
      received = stepTacticalMatch(received, FIXED_MATCH_DT);
    expect(received.ball.ownerId).toBe(receiver.id);
    expect(received.latestAction).toEqual({ type: 'hold', actorId: receiver.id });
    expect(received.lastThrowInDiagnostic?.nextContactPlayerId).toBe(receiver.id);
    expect(received.scenario).toBe('open_play');
    expect(received.restart).toBeUndefined();
    expect(hasActiveHumanPossession(received)).toBe(true);
    // PR150: the chosen incoming control owns this touch; clean reception alone is not another menu.
    expect(projectPlayerDecisionOpportunity(received)).toBeUndefined();
    const carry = resolveMatchAction(
      received,
      { type: 'carry', actorId: receiver.id, target: { x: 93, y: 25 } },
      'human_selected',
    );
    const following = stepTacticalMatch(carry, FIXED_MATCH_DT);
    expect(hasActiveHumanPossession(following)).toBe(true);
    expect(following.latestAction?.type).toBe('carry');
  });

  it('clears the restriction after any other contact, including an immediate opponent contest', () => {
    const state = throwFixture();
    const action = selectedThrow(state);
    const release = resolveMatchAction(state, action);
    const opponent = release.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    release.players = release.players.map((player) => ({
      ...player,
      position: player.id === opponent.id ? { x: 45.4, y: 3 } : { x: 90, y: 60 },
      velocity: { x: 0, y: 0 },
    }));
    release.ball = {
      ...release.ball,
      x: 45,
      y: 3,
      height: 0.11,
      airborne: false,
      velocity: { x: 8, y: 0, z: 0 },
    };
    const contacted = stepTacticalMatch(release, FIXED_MATCH_DT);
    expect(contacted.lastThrowInDiagnostic?.nextContactPlayerId).toBe(opponent.id);
    expect(canContactAfterThrowIn(contacted, action.actorId)).toBe(true);
    const teammate = state.players.find((player) => player.id === action.receiverId)!;
    expect(
      canContactAfterThrowIn(
        applyThrowInContact(resolveMatchAction(state, action), teammate.id),
        action.actorId,
      ),
    ).toBe(true);
  });

  it('uses a legal autonomous receiver and keeps restriction past presentation restart expiry', () => {
    const state = throwFixture();
    const action = chooseRestartAction(state)!;
    expect(action.type).toBe('pass');
    if (action.type !== 'pass') throw new Error('expected throw action');
    expect(action.receiverId).not.toBe(action.actorId);
    const release = resolveMatchAction(state, action);
    const expired = { ...release, time: release.time + 5 };
    delete expired.restart;
    expired.scenario = 'open_play';
    expect(canContactAfterThrowIn(expired, action.actorId)).toBe(false);
  });
});
