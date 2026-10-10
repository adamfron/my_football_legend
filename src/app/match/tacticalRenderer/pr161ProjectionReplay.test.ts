// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../../../core/singleMatch';
import {
  createTacticalMatch,
  stepTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
  FIXED_MATCH_DT,
} from '../../../core/matchSimulation/matchSimulation';
import {
  chooseRestartAction,
  enumerateRestartActions,
  resolveMatchAction,
} from '../../../core/matchSimulation/matchActions';
import { enumerateCanonicalShootingOptions } from '../../../core/matchSimulation/shootingOptions';
import { applyRestartScenario } from '../../../core/matchSimulation/restartScenarios';
import { isEligibleForNormalPosition } from '../../../core/footballerWorld';
import {
  advanceControlledBall,
  groundContactFactSchema,
} from '../../../core/matchSimulation/ballContactGeometry';
import {
  projectCanonicalPlayerPresentation,
  projectPresentationPlayers,
  RELEASE_PRESENTATION_DURATION_MS,
} from '../../../core/matchSimulation/canonicalPresentation';
import { createMatchFitness } from '../../../core/matchSimulation/matchFitness';
import {
  requestSubstitutions,
  advanceMatchSubstitutions,
} from '../../../core/matchSimulation/substitutions';
import {
  MatchReplayHistory,
  captureReplaySnapshot,
  replaySnapshotSchema,
  REPLAY_MAX_ROLLING_SAMPLES,
  REPLAY_MAX_WINDOW_SAMPLES,
  replayWindowMetadataSchema,
} from '../../../core/matchSimulation/matchReplay';
import type { TacticalMatchState } from '../../../core/matchSimulation/matchState';
import { PresentationFrameProjector } from './frameProjection';
import { PresentationContextHistory, CONTEXT_MAX_SAMPLES } from './contextHistory';
import { interpolatePresentationFrames, replaySnapshotToFrame, sampleReplayFrame } from './replay';
import { deriveOwnedBallPose, tacticalFrameSchema } from './model';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  let state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr161-presentation',
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 100;
  state.actionCooldown = 20;
  state.players.forEach((p, i) => {
    p.position = { x: p.team === 'home' ? 15 : 95, y: 4 + (i % 10) * 6 };
    p.target = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  });
  const carrier = state.players.find(
    (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
  )!;
  carrier.position = { x: 52, y: 34 };
  carrier.facingAngle = Math.PI / 2;
  state.ball = {
    x: 52.45,
    y: 34,
    height: 0,
    ownerId: carrier.id,
    lastTouchPlayerId: carrier.id,
    velocity: { x: 0, y: 0 },
  };
  state.possessionTeam = 'home';
  state.ballOwnershipStartedAt = state.time;
  state = resolveMatchAction(state, {
    type: 'carry',
    actorId: carrier.id,
    target: { x: 72, y: 34 },
  });
  return state;
};

const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
};
const recorded = (state: TacticalMatchState) =>
  replaySnapshotToFrame(captureReplaySnapshot(state, 0));

describe('PR161 canonical presentation evidence', () => {
  it.each([false, true])(
    'preserves a real goal response and %s urgency through live, context and replay until actual kickoff retrieval',
    (urgent) => {
      let state = fixture();
      const actorId = state.ball.ownerId!;
      state.time = urgent ? 87 * 60 : 20 * 60;
      state.status = urgent ? 'second_half' : 'first_half';
      state.score = urgent ? { home: 0, away: 2 } : { home: 2, away: 0 };
      state.players = state.players.map((player, index) => ({
        ...player,
        position: player.id === actorId ? { x: 99, y: 34 } : { x: 20 + index, y: 60 },
        target: player.id === actorId ? { x: 99, y: 34 } : { x: 20 + index, y: 60 },
        velocity: { x: 0, y: 0 },
      }));
      state.ball = { x: 99.3, y: 34, ownerId: actorId, lastTouchPlayerId: actorId };
      state = resolveMatchAction(state, {
        type: 'shot',
        actorId,
        target: { x: 105, y: 34 },
        intent: 'placed',
        goalTarget: { horizontal: 0, vertical: 0.2 },
      });
      // Same deterministic released-flight geometry as the existing PR159 real goal regression.
      state.ball = {
        ...state.ball,
        x: 104.9,
        y: 34,
        height: 0.4,
        velocity: { x: 25, y: 0, z: 0 },
        airborne: true,
      };
      const beforeGoal = recorded(state);
      expect(beforeGoal.players.every((player) => !player.goalResponse)).toBe(true);
      for (let tick = 0; tick < 8 && !state.postGoal; tick++)
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      expect(state.postGoal?.urgent).toBe(urgent);
      expect(state.lastBallContact?.kind).toBe('goal_plane');
      expect(state.lastShot?.outcome).toBe('goal');
      const original = structuredClone(state),
        projector = new PresentationFrameProjector(),
        context = new PresentationContextHistory();
      const live = projector.frame(freeze(state));
      context.observe(state, true);
      const replay = recorded(state),
        hidden = context.sample(state.time * 1000)!;
      const response = live.players.find((player) => player.id === actorId)!.goalResponse!;
      expect(response).toMatchObject({
        goalId: state.postGoal!.goalId,
        role: 'scorer',
        phase: urgent ? 'urgent_retrieval' : 'celebration',
        urgent,
        scorerId: actorId,
        retrieverId: state.postGoal!.retrieverId,
        startedAtMs: state.postGoal!.startedAt * 1000,
        reactionUntilMs: state.postGoal!.reactionUntil * 1000,
      });
      expect(hidden.players.find((player) => player.id === actorId)!.goalResponse).toEqual(
        response,
      );
      expect(replay.players.find((player) => player.id === actorId)!.goalResponse).toEqual(
        response,
      );
      expect(live.players.find((player) => player.team === 'away')!.goalResponse!.role).toBe(
        'conceded',
      );
      expect(tacticalFrameSchema.safeParse(live).success).toBe(true);
      expect(
        interpolatePresentationFrames(beforeGoal, replay, beforeGoal.timestampMs + 1).players.every(
          (player) => !player.goalResponse,
        ),
      ).toBe(true);
      expect(state).toEqual(original);
      for (let tick = 0; tick < 640 && state.postGoal; tick++)
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      expect(state.restart?.origin).toBe('live_event');
      expect(state.scenario).toBe('kick_off');
      const returned = recorded(state).players.find(
        (player) => player.id === actorId,
      )!.goalResponse!;
      expect(returned.phase).toBe('return_to_kickoff');
      expect(returned.goalId).toBe(response.goalId);
      expect(returned.urgent).toBeUndefined();
      if (urgent) expect(returned.retrievalStage).toBe('transport');
    },
  );

  it('projects measured acceleration, turning, physical and tactical coordinates without moving bodies', () => {
    const before = fixture(),
      after = structuredClone(before);
    after.time += FIXED_MATCH_DT;
    const player = after.players[2]!,
      old = before.players[2]!;
    player.velocity = { x: 0.1, y: -0.05 };
    player.facingAngle += 0.04;
    player.target = { x: 33, y: 24 };
    player.neutralAnchor = { x: 30, y: 23 };
    player.idealTarget = { x: 32, y: 22 };
    player.movementMode = 'shuffle';
    player.locomotionReason = 'contain';
    player.fitness = { ...createMatchFitness(70), burstReadiness: 0.15 };
    const projector = new PresentationFrameProjector();
    projector.frame(freeze(before));
    const original = structuredClone(after),
      frame = projector.frame(freeze(after));
    const presented = frame.players.find((p) => p.id === player.id)!;
    expect(presented).toMatchObject({
      x: player.position.x,
      y: player.position.y,
      target: player.target,
      anchor: player.neutralAnchor,
      idealTarget: player.idealTarget,
      role: player.slot.position,
      duty: player.duty,
      movementMode: 'shuffle',
      defensive: { intent: 'contain' },
      fitness: { capacity: 0.7, burstReadiness: 0.15 },
    });
    expect(presented.acceleration?.x).toBeCloseTo(
      (player.velocity.x - old.velocity.x) / FIXED_MATCH_DT,
    );
    expect(presented.angularVelocity).toBeCloseTo(1.6);
    expect(after).toEqual(original);
    expect(tacticalFrameSchema.safeParse(frame).success).toBe(true);
  });

  it('leaves acceleration unobservable across a hidden observation gap', () => {
    const state = fixture(),
      later = { ...state, time: state.time + 3 };
    expect(
      projectCanonicalPlayerPresentation(later, state.players[1]!, state).acceleration,
    ).toBeUndefined();
  });

  it('records actual finite-contact impulse and planned next touch as different evidence', () => {
    const state = fixture(),
      actor = state.players.find((p) => p.id === state.ball.ownerId)!;
    const result = advanceControlledBall(freeze(state), actor, FIXED_MATCH_DT).state;
    const fact = result.lastGroundContact!;
    expect(fact.executed).toBe(true);
    expect(fact.at).toBe(result.controlledBallContact!.lastContactAt);
    expect(fact.physicalCount).toBe(1);
    expect(fact.incomingVelocity).toEqual({ x: 0, y: 0 });
    expect(Math.hypot(fact.outgoingVelocity.x, fact.outgoingVelocity.y)).toBeGreaterThan(0);
    expect(groundContactFactSchema.safeParse(fact).success).toBe(true);
    const frame = recorded(result),
      contact = frame.players.find((p) => p.id === actor.id)!.contact!;
    expect(contact.lastAtMs).toBe(fact.at * 1000);
    expect(contact.plannedAtMs).toBeGreaterThan(contact.lastAtMs!);
    expect(contact.quality).toBe(fact.quality);
    expect(contact.retained).toBe(true);
    expect(deriveOwnedBallPose(frame)).toEqual(frame.ball);
  });

  it('records a failed unreachable next plan without claiming an executed foot contact', () => {
    const state = fixture();
    state.ball.x = 55;
    const actor = state.players.find((p) => p.id === state.ball.ownerId)!;
    const result = advanceControlledBall(state, actor, FIXED_MATCH_DT);
    expect(result.looseVelocity).toBeDefined();
    expect(result.state.lastGroundContact).toMatchObject({
      executed: false,
      retained: false,
      physicalCount: 0,
    });
    const contact = recorded(result.state).players.find((p) => p.id === actor.id)!.contact!;
    expect(contact.nextFailed).toBe(true);
    expect(contact.quality).toBeUndefined();
    expect(contact.lastAtMs).toBeUndefined();
    expect(contact.failedAtMs).toBe(state.time * 1000);
  });

  it('records the reachable foot when the older planned foot became unreachable after a turn', () => {
    const state = fixture(),
      actor = state.players.find((p) => p.id === state.ball.ownerId)!;
    actor.facingAngle = 0;
    actor.velocity = { x: 1, y: 0 };
    delete state.ballCarrierIntent;
    delete state.onBallPreparation;
    state.ball = { ...state.ball, x: actor.position.x + 0.98, y: actor.position.y + 0.2 };
    state.controlledBallContact = {
      actorId: actor.id,
      ownershipStartedAt: 100,
      lastContactAt: 99,
      physicalContacts: 0,
      lastDirection: { x: 1, y: 0 },
      lastBodyOrientation: 0,
      balance: 1,
      nextContact: {
        actorId: actor.id,
        region: 'left_foot',
        intendedPosition: { x: state.ball.x, y: state.ball.y },
        earliestAt: 100,
        expectedOrientation: Math.PI / 2,
        reachableRadius: 0.82,
        outgoingDirection: { x: 1, y: 0 },
        difficulty: 0,
      },
    };
    const result = advanceControlledBall(state, actor, FIXED_MATCH_DT).state;
    expect(result.lastGroundContact).toMatchObject({
      executed: true,
      region: 'right_foot',
      intendedRegion: 'left_foot',
    });
    expect(recorded(result).players.find((p) => p.id === actor.id)!.contact).toMatchObject({
      lastRegion: 'right_foot',
      lastIntendedRegion: 'left_foot',
      regionEvidence: 'reachable_geometry',
    });
  });

  it('keeps legal partly-outside ball geometry visible and never attaches it to an owner visually', () => {
    const state = fixture();
    state.ball = { x: 45.0816, y: -0.0324, height: 0 };
    const projector = new PresentationFrameProjector(),
      context = new PresentationContextHistory();
    const frame = projector.frame(state);
    context.observe(state, true);
    expect(frame.ball).toMatchObject({ x: 45.0816, y: -0.0324, radius: 0.11 });
    expect(context.sample(state.time * 1000)!.ball).toEqual(frame.ball);
    expect(tacticalFrameSchema.safeParse(frame).success).toBe(true);
    expect(frame.restart).toBeUndefined();
  });

  it('exposes actual defensive commitments and missed challenges without a successful pose fact', () => {
    const state = fixture(),
      defender = state.players.find((p) => p.team === 'away')!;
    defender.locomotionReason = 'press_commit';
    state.defensiveChallenge = {
      id: 'actual-challenge',
      actorId: defender.id,
      opponentId: state.ball.ownerId!,
      technique: 'slide',
      source: 'autonomous_npc',
      startedAt: 99.9,
      expiresAt: 101,
      target: { x: 52, y: 34 },
    };
    expect(projectCanonicalPlayerPresentation(state, defender).defensive).toMatchObject({
      intent: 'engage',
      technique: 'slide',
      targetId: state.ball.ownerId,
    });
    expect(projectCanonicalPlayerPresentation(state, defender).markingTargetId).toBeUndefined();
  });

  it('projects actual wall jump height identically in live, context and replay frames', () => {
    const state = fixture(),
      wall = state.players.find((p) => p.team === 'away')!;
    wall.restartWallResponse = {
      awardId: 'wall-fixture',
      choice: 'jump',
      startedAt: 99.8,
      reactionAt: 99.9,
      jumpHeight: 0.23,
      previousJumpHeight: 0.18,
    };
    const live = new PresentationFrameProjector().frame(state),
      context = new PresentationContextHistory();
    context.observe(state, true);
    for (const frame of [live, context.sample(100_000)!, recorded(state)])
      expect(frame.players.find((p) => p.id === wall.id)!.wallResponse).toEqual({
        choice: 'jump',
        jumpHeight: 0.23,
        reactionAtMs: 99_900,
      });
  });

  it('shows a temporary goalkeeper role and penalty readiness without changing permanent profile', () => {
    const state = fixture(),
      player = state.players.find(
        (p) => p.team === 'home' && p.profile.primaryPosition !== 'goalkeeper',
      )!;
    player.goalkeeperRole = true;
    state.scenario = 'penalty';
    const original = structuredClone(player.profile);
    expect(projectCanonicalPlayerPresentation(state, player).goalkeeperIntervention?.kind).toBe(
      'penalty_ready',
    );
    expect(recorded(state).players.find((p) => p.id === player.id)!.goalkeeper).toBe(true);
    const projector = new PresentationFrameProjector(),
      context = new PresentationContextHistory();
    context.observe(state, true);
    expect(
      context.sample(state.time * 1000)!.players.find((p) => p.id === player.id)!.goalkeeper,
    ).toBe(true);
    expect(projector.frame(state).players.find((p) => p.id === player.id)!.goalkeeper).toBe(true);
    expect(player.profile).toEqual(original);
  });

  it.each(['catch', 'parry', 'failed_save', 'no_chance'] as const)(
    'projects canonical keeper %s without turning misses into catches',
    (kind) => {
      let state = fixture();
      const shooter = state.players.find((p) => p.id === state.ball.ownerId)!;
      state = resolveMatchAction(state, {
        type: 'shot',
        actorId: shooter.id,
        target: { x: 105, y: 34 },
        intent: 'placed',
      });
      const shot = state.ball.shot!,
        keeper = state.players.find(
          (p) => p.team === 'away' && p.profile.primaryPosition === 'goalkeeper',
        )!;
      state.lastShot = {
        ...shot,
        keeperId: keeper.id,
        goalkeeperAction: kind,
        releasedAt: 100,
        outcome: kind === 'catch' || kind === 'parry' ? 'save' : 'miss',
      };
      if (kind === 'catch' || kind === 'parry')
        state.lastBallContact = {
          kind: 'goalkeeper',
          point: { x: keeper.position.x, y: keeper.position.y, z: kind === 'catch' ? 1.8 : 0.3 },
          at: state.time,
          playerId: keeper.id,
          segmentFraction: 0.5,
          preContactSpeed: 20,
          postContactSpeed: kind === 'catch' ? 0 : 8,
        };
      const projected = projectCanonicalPlayerPresentation(state, keeper).goalkeeperIntervention!;
      expect(projected.kind).toBe(kind);
      expect(projected.atMs).toBe(kind === 'catch' || kind === 'parry' ? 100_000 : undefined);
    },
  );
});

describe('PR161 recorded replay boundaries and identities', () => {
  it.each(['throw', 'distribution', 'header', 'volley', 'half_volley', 'first_time'] as const)(
    'preserves a real %s release with its contact metadata in live, context and sampled replay',
    (contact) => {
      let before = fixture();
      let actorId: string;
      let state: TacticalMatchState;
      if (contact === 'throw' || contact === 'distribution') {
        before = applyRestartScenario(before, contact === 'throw' ? 'throw_in' : 'goal_kick');
        const action =
          contact === 'throw'
            ? chooseRestartAction(before)!
            : enumerateRestartActions(before).find(
                (candidate) => candidate.type === 'pass' && candidate.delivery === 'lofted',
              )!;
        actorId = action.actorId;
        state = resolveMatchAction(before, action);
        expect(state.ball.travelKind).toBe(contact === 'throw' ? 'throw_in' : 'long_distribution');
      } else {
        const actor = before.players.find(
          (p) => p.team === 'home' && p.profile.primaryPosition === 'striker',
        )!;
        actorId = actor.id;
        actor.position = { x: 91, y: 34 };
        actor.target = { ...actor.position };
        actor.facingAngle = Math.PI / 2;
        actor.profile = {
          ...actor.profile,
          attributes: {
            ...actor.profile.attributes,
            finishing: 90,
            technique: 90,
            composure: 90,
            firstTouch: 90,
            agility: 90,
            heading: 100,
            jumping: 100,
          },
        };
        const passer = before.players.find((p) => p.team === 'home' && p.id !== actorId)!;
        const height =
          contact === 'header'
            ? 1.8
            : contact === 'volley'
              ? 0.95
              : contact === 'half_volley'
                ? 0.4
                : 0.11;
        before.ball = {
          x: 90.45,
          y: 34,
          height,
          from: { x: 84, y: 34 },
          target: { ...actor.position },
          velocity: { x: 12, y: 0, z: 0 },
          airborne: height > 0.11,
          intendedReceiverId: actorId,
          lastTouchPlayerId: passer.id,
          travelKind: 'cross',
          sourceAction: 'cross',
          bounceCount: 0,
        };
        before.currentActorId = passer.id;
        before.actionCooldown = 0;
        const action = enumerateCanonicalShootingOptions(before, actorId)[0]!;
        expect(action).toBeDefined();
        state = resolveMatchAction(before, action);
        expect(state.ball.shot?.contact).toBe(contact);
      }
      const canonical = structuredClone(state);
      const projector = new PresentationFrameProjector();
      const context = new PresentationContextHistory();
      projector.frame(before);
      context.observe(before);
      const initial = projector.frame(state).players.find((p) => p.id === actorId)!.cue!;
      expect(initial.kind).toBe(
        ['throw', 'header', 'distribution'].includes(contact) ? contact : 'shot',
      );
      expect(initial.atMs).toBeLessThanOrEqual(state.time * 1000);
      const snapshot = captureReplaySnapshot(state, 0);
      expect(replaySnapshotSchema.safeParse(snapshot).success).toBe(true);
      expect(snapshot.players.find((p) => p.id === actorId)!.releaseCue).toBeDefined();
      const frames = [replaySnapshotToFrame(snapshot)];
      context.observe(state, true);
      expect(context.sample(state.time * 1000)!.players.find((p) => p.id === actorId)!.cue).toEqual(
        initial,
      );
      expect(frames[0]!.players.find((p) => p.id === actorId)!.cue).toEqual(initial);
      expect(state).toEqual(canonical);
      for (let tick = 0; tick < 4; tick++) {
        const previous = state;
        state = stepTacticalMatch(state, FIXED_MATCH_DT);
        const expected = projector.frame(state).players.find((p) => p.id === actorId)!.cue;
        context.observe(state, true);
        const frame = replaySnapshotToFrame(captureReplaySnapshot(state, 0, previous));
        frames.push(frame);
        expect(frame.players.find((p) => p.id === actorId)!.cue).toEqual(expected);
        expect(
          context.sample(state.time * 1000)!.players.find((p) => p.id === actorId)!.cue,
        ).toEqual(expected);
      }
      expect(
        replaySnapshotToFrame({ ...snapshot, timestampMs: initial.atMs - 1 }).players.find(
          (p) => p.id === actorId,
        )!.cue,
      ).toBeUndefined();
      expect(
        replaySnapshotToFrame({
          ...snapshot,
          timestampMs: initial.atMs + RELEASE_PRESENTATION_DURATION_MS,
        }).players.find((p) => p.id === actorId)!.cue,
      ).toBeUndefined();
      const oldSnapshot = structuredClone(snapshot);
      oldSnapshot.players.forEach((p) => {
        delete p.releaseCue;
      });
      expect(replaySnapshotSchema.safeParse(oldSnapshot).success).toBe(true);
      if (contact === 'header') {
        // The observed source diagnostics can advance to a second actor before A's pose expires.
        // This is a recorded-transition fixture; both distinct releases use the real resolver.
        const first = structuredClone(state);
        first.matchEvents = [
          {
            id: 'release-retention-marker',
            replayKey: 'release-retention-marker',
            at: first.time,
            kind: 'substitution',
            actorId,
            team: 'home',
          },
        ];
        const history = new MatchReplayHistory();
        history.observe(first);
        const next = structuredClone(first);
        next.time += FIXED_MATCH_DT;
        const secondActor = next.players.find(
          (p) =>
            p.team === 'home' && p.id !== actorId && p.profile.primaryPosition !== 'goalkeeper',
        )!;
        secondActor.position = { x: 91, y: 34 };
        secondActor.target = { ...secondActor.position };
        secondActor.facingAngle = Math.PI / 2;
        secondActor.profile = {
          ...secondActor.profile,
          attributes: {
            ...secondActor.profile.attributes,
            finishing: 90,
            technique: 90,
            composure: 90,
            firstTouch: 90,
            agility: 90,
          },
        };
        next.ball = {
          x: 90.45,
          y: 34,
          height: 0.95,
          from: { x: 84, y: 34 },
          target: { ...secondActor.position },
          velocity: { x: 12, y: 0, z: 0 },
          airborne: true,
          bounceCount: 0,
          intendedReceiverId: secondActor.id,
          lastTouchPlayerId: actorId,
          travelKind: 'cross',
          sourceAction: 'cross',
        };
        next.actionCooldown = 0;
        const action = enumerateCanonicalShootingOptions(next, secondActor.id)[0]!;
        const second = resolveMatchAction(next, action);
        expect(second.ball.shot?.shooterId).toBe(secondActor.id);
        second.lastShot = { ...second.ball.shot!, outcome: 'block' };
        const canonicalSecond = structuredClone(second);
        history.observe(second);
        const retained = history.getWindow('release-retention-marker')!.frames.at(-1)!;
        expect(replaySnapshotToFrame(retained).players.find((p) => p.id === actorId)!.cue).toEqual(
          projector.frame(first).players.find((p) => p.id === actorId)!.cue,
        );
        expect(
          replaySnapshotToFrame(retained).players.find((p) => p.id === secondActor.id)!.cue
            ?.shotContact,
        ).toBe('volley');
        expect(second).toEqual(canonicalSecond);
        const expired = {
          ...second,
          time: initial.atMs / 1000 + RELEASE_PRESENTATION_DURATION_MS / 1000 + FIXED_MATCH_DT,
        };
        history.observe(expired);
        expect(
          history
            .getWindow('release-retention-marker')!
            .frames.at(-1)!
            .players.find((p) => p.id === actorId)!.releaseCue,
        ).toBeUndefined();
      }
    },
  );

  it('does not interpolate a ball or reveal future contact evidence across an actual contact keyframe', () => {
    const before = fixture(),
      after = structuredClone(before);
    after.time += 0.025;
    const actor = after.players.find((p) => p.id === after.ball.ownerId)!;
    const contacted = advanceControlledBall(after, actor, FIXED_MATCH_DT).state;
    const previousFrame = recorded(before),
      nextFrame = recorded(contacted);
    const halfway = interpolatePresentationFrames(previousFrame, nextFrame, 100_012.5);
    expect(halfway.ball).toEqual(previousFrame.ball);
    expect(halfway.players.find((p) => p.id === actor.id)!.contact?.lastAtMs).toBeUndefined();
    expect(interpolatePresentationFrames(previousFrame, nextFrame, 100_025).ball).toEqual(
      nextFrame.ball,
    );
  });

  it.each(['owner', 'period', 'goal', 'restart', 'roster'] as const)(
    'holds recorded states across %s discontinuity',
    (kind) => {
      const before = fixture(),
        after = structuredClone(before);
      after.time += 0.2;
      after.ball.x += 10;
      if (kind === 'owner') after.ball.ownerId = after.players.find((p) => p.team === 'away')!.id;
      if (kind === 'period') after.status = 'half_time';
      if (kind === 'goal') after.score.home++;
      if (kind === 'restart') after.scenario = 'throw_in';
      if (kind === 'roster') after.players.pop();
      const previous = recorded(before),
        next = recorded(after);
      expect(interpolatePresentationFrames(previous, next, 100_100).ball).toEqual(previous.ball);
      expect(interpolatePresentationFrames(previous, next, 100_200).ball).toEqual(next.ball);
    },
  );

  it('records departing and staged substitute identities outside the pitch, followed by legal entry', () => {
    let state = createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: 'pro_9',
        awayClubId: 'pro_1',
        seed: 'pr161-replay-sub',
        control: { mode: 'spectator' },
      }),
    );
    state = applyRestartScenario(state, 'throw_in');
    const outgoing = state.players.find(
      (p) => p.team === 'home' && p.profile.primaryPosition !== 'goalkeeper',
    )!;
    const incoming = state.bench!.home.find((p) =>
      isEligibleForNormalPosition(p.profile, outgoing.slot.position),
    )!;
    state.controlledFootballerId = outgoing.id;
    state.time = 200;
    outgoing.position = { x: 52.5, y: 0.2 };
    outgoing.velocity = { x: 0, y: 0 };
    state = requestSubstitutions(state, 'home', [
      { outgoingId: outgoing.id, incomingId: incoming.id },
    ]);
    expect(state.substitutionState!.pending).toHaveLength(1);
    const history = new MatchReplayHistory();
    history.observe(state);
    const staging = recorded(state);
    expect(staging.players.find((p) => p.id === outgoing.id)).toMatchObject({
      participation: 'departing',
      protagonist: true,
    });
    expect(staging.players.find((p) => p.id === incoming.id)).toMatchObject({
      participation: 'staged',
      x: 52.5,
      y: -0.35,
      protagonist: false,
    });
    expect(replaySnapshotSchema.safeParse(captureReplaySnapshot(state, 0)).success).toBe(true);
    for (let tick = 0; tick < 300 && state.substitutionState!.pending.length; tick++) {
      const previous = state;
      state = { ...state, time: state.time + FIXED_MATCH_DT };
      state = advanceMatchSubstitutions(previous, state, FIXED_MATCH_DT);
      history.observe(state);
    }
    const entered = recorded(state);
    expect(state.substitutionState!.completed).toHaveLength(1);
    expect(entered.players.some((p) => p.id === outgoing.id)).toBe(false);
    expect(entered.players.find((p) => p.id === incoming.id)).toMatchObject({
      participation: 'active',
      protagonist: false,
    });
    expect(state.controlledFootballerId).toBe(outgoing.id);
    expect(projectPresentationPlayers(state).filter((p) => p.id === incoming.id)).toHaveLength(1);
  });

  it('captures physical micro-contacts between sparse samples with bounded retention', () => {
    let state = fixture();
    state.matchEvents = [
      {
        id: 'fixture-window',
        replayKey: 'fixture-window',
        at: state.time,
        team: 'home',
        kind: 'injury',
        actorId: state.players[1]!.id,
      },
    ];
    const history = new MatchReplayHistory(),
      context = new PresentationContextHistory();
    history.observe(state);
    context.observe(state);
    for (let tick = 0; tick < 500; tick++) {
      state = stepTacticalMatch(state, FIXED_MATCH_DT);
      history.observe(state);
      context.observe(state);
    }
    const window = history.getWindow('fixture-window')!;
    const contacts = window.frames.flatMap((frame) =>
      frame.players.flatMap((p) =>
        p.contact?.lastAtMs !== undefined && p.contact.lastAtMs === frame.timestampMs
          ? [p.contact.lastAtMs]
          : [],
      ),
    );
    expect(new Set(contacts).size).toBeGreaterThan(3);
    expect(history.snapshot().keyframes).toBeGreaterThan(0);
    expect(history.snapshot().rollingSamples).toBeLessThanOrEqual(REPLAY_MAX_ROLLING_SAMPLES);
    expect(window.frames.length).toBeLessThanOrEqual(REPLAY_MAX_WINDOW_SAMPLES);
    expect(context.snapshot().samplesRetained).toBeLessThanOrEqual(CONTEXT_MAX_SAMPLES);
    expect(window.frames.every((frame) => replaySnapshotSchema.safeParse(frame).success)).toBe(
      true,
    );
    const metadata = history.listWindows()[0]!;
    expect(replayWindowMetadataSchema.safeParse(metadata).success).toBe(true);
    const frames = window.frames.map(replaySnapshotToFrame),
      canonical = structuredClone(state);
    for (let at = frames[0]!.timestampMs; at <= frames.at(-1)!.timestampMs; at += 17)
      sampleReplayFrame(frames, at);
    expect(state).toEqual(canonical);
  });

  it('retains exact full-state parity with live projection, hidden context and replay observers', () => {
    let observed = fixture(),
      headless = structuredClone(observed);
    const projector = new PresentationFrameProjector(),
      history = new MatchReplayHistory(),
      context = new PresentationContextHistory();
    for (let tick = 0; tick < 200; tick++) {
      observed = stepTacticalMatch(observed, FIXED_MATCH_DT);
      headless = stepTacticalMatch(headless, FIXED_MATCH_DT);
      const canonical = structuredClone(observed),
        frozen = freeze(observed);
      projector.frame(frozen);
      context.observe(frozen);
      history.observe(frozen);
      expect(observed).toEqual(canonical);
    }
    expect(observed).toEqual(headless);
  });

  it('resets hidden context on a new seed without inserting frames from the previous match', () => {
    const before = fixture(),
      after = structuredClone(before);
    after.seed = 'new-presentation-match';
    after.time += 1;
    const context = new PresentationContextHistory();
    context.observe(before);
    context.observe(after);
    expect(context.snapshot().samplesRetained).toBe(1);
    expect(
      context.leadIn(after.time, 6).every((frame) => frame.continuity?.includes(after.seed)),
    ).toBe(true);
  });

  it('isolates mutable projected targets and action labels from canonical football', () => {
    const state = fixture(),
      actor = state.players[1]!;
    state.actionEvents = [
      {
        id: 'read-only-label',
        sequence: 0,
        at: state.time,
        kind: 'pass',
        actorId: actor.id,
        team: actor.team,
        position: { ...actor.position },
        outcome: 'released',
        cause: 'support',
      },
    ];
    const before = structuredClone(state),
      frame = new PresentationFrameProjector().frame(state);
    frame.players[1]!.target!.x += 20;
    frame.players[1]!.anchor!.y += 3;
    frame.actionEvents![0]!.position.x += 30;
    if (frame.carryTarget) frame.carryTarget.x += 10;
    expect(state).toEqual(before);
  });

  it('selects evidenced dangerous shots and saves while excluding ordinary passes and low-danger shots', () => {
    let state = fixture();
    const actor = state.players.find((p) => p.id === state.ball.ownerId)!;
    state = resolveMatchAction(state, {
      type: 'shot',
      actorId: actor.id,
      target: { x: 105, y: 34 },
      intent: 'placed',
    });
    const shot = { ...state.ball.shot!, effectiveScoringExpectation: 0.3 };
    state.ball = { ...state.ball, shot };
    state.actionEvents = [
      {
        id: 'dangerous-shot',
        sequence: 0,
        at: 100,
        kind: 'shot',
        actorId: actor.id,
        team: actor.team,
        position: { ...actor.position },
        outcome: 'released',
        cause: 'placed',
      },
    ];
    const history = new MatchReplayHistory();
    history.observe(state);
    state = {
      ...state,
      time: 100.2,
      actionEvents: [
        ...state.actionEvents!,
        {
          id: 'routine-pass',
          sequence: 1,
          at: 100.2,
          kind: 'pass',
          actorId: actor.id,
          team: actor.team,
          position: { ...actor.position },
          outcome: 'released',
          cause: 'support',
        },
      ],
    };
    history.observe(state);
    const keeper = state.players.find(
      (p) => p.team === 'away' && p.profile.primaryPosition === 'goalkeeper',
    )!;
    state = {
      ...state,
      time: 100.4,
      actionEvents: [
        ...state.actionEvents!,
        {
          id: 'recorded-save',
          sequence: 2,
          at: 100.3,
          kind: 'save',
          actorId: keeper.id,
          team: keeper.team,
          position: { ...keeper.position },
          outcome: 'save',
          cause: 'goalkeeper',
        },
      ],
    };
    history.observe(state);
    state = {
      ...state,
      time: 100.6,
      ball: { ...state.ball, shot: { ...shot, effectiveScoringExpectation: 0.01 } },
      actionEvents: [
        ...state.actionEvents!,
        {
          id: 'low-danger-shot',
          sequence: 3,
          at: 100.6,
          kind: 'shot',
          actorId: actor.id,
          team: actor.team,
          position: { ...actor.position },
          outcome: 'released',
          cause: 'placed',
        },
      ],
    };
    history.observe(state);
    expect(history.listWindows().map((window) => window.replayKey)).toEqual([
      'dangerous-shot',
      'recorded-save',
    ]);
    expect(history.listWindows().map((window) => window.kind)).toEqual(['dangerous_shot', 'save']);
    const before = structuredClone(state);
    history.observe({ ...state, time: 103.6, status: 'full_time' });
    expect(history.listWindows().every((window) => window.complete)).toBe(true);
    for (const metadata of history.listWindows()) {
      const frames = history.getWindow(metadata.replayKey)!.frames;
      expect(
        frames.every(
          (frame, index) => index === 0 || frame.timestampMs >= frames[index - 1]!.timestampMs,
        ),
      ).toBe(true);
    }
    expect(state).toEqual(before);
  });
});
