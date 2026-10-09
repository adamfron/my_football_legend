// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import {
  deriveOnBallPreparation,
  onBallPreparationSchema,
  projectPossessionMicroBehaviour,
} from './onBallPreparation';
import { resolveReceptionOutcome, receptionOutcomeSchema } from './passReception';
import {
  chooseNpcRoutineAction,
  npcPossessionDecisionDelay,
  resolveMatchAction,
} from './matchActions';
import { distance } from './matchSpace';
import { collectContactEvidence } from './contactEvidence';
import { projectPlayerDecisionOpportunity } from './playerDecision';
import type { MatchPlayerState, TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr149-possession',
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.time = 10;
  state.actionCooldown = 100;
  state.scenario = 'open_play';
  state.currentPressure = 0;
  state.players = state.players.map((player) => ({
    ...player,
    position: { x: player.team === 'home' ? 20 : 95, y: player.slotIndex * 5 + 4 },
    velocity: { x: 0, y: 0 },
  }));
  const actor = state.players.find((player) => player.id === state.ball.ownerId)!;
  actor.position = { x: 40, y: 34 };
  actor.facingAngle = -Math.PI / 2;
  state.ball = { ...actor.position, ownerId: actor.id };
  state.ballOwnershipStartedAt = state.time;
  state.teams.home.phase = 'positional_attack';
  return state;
};
const skill = (actor: MatchPlayerState, value: number) => {
  actor.profile = {
    ...actor.profile,
    attributes: {
      ...actor.profile.attributes,
      firstTouch: value,
      technique: value,
      composure: value,
      agility: value,
      concentration: value,
      gameReading: value,
    },
  };
};
const owner = (state: TacticalMatchState) =>
  state.players.find((player) => player.id === state.ball.ownerId)!;

describe('PR149 canonical possession micro-behaviour', () => {
  it('keeps PR148 scanning time while moving the body and ball through bounded preparation', () => {
    const initial = fixture();
    const actor = owner(initial);
    initial.ball.velocity = { x: 8, y: 0 };
    initial.onBallPreparation = deriveOnBallPreparation(initial, actor, 'clean_control');
    delete initial.ball.velocity;
    expect(npcPossessionDecisionDelay(initial, actor)).toBeGreaterThan(5.5);
    expect(chooseNpcRoutineAction(initial, actor.id)).toBeUndefined();
    const phases = new Set<string>();
    let state = initial;
    for (let tick = 0; tick < 200; tick++) {
      const next = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      phases.add(next.onBallPreparation!.micro!.phase);
      // PR158 records real finite foot contacts while the same public control episode continues.
      expect(
        collectContactEvidence(state, next).filter(
          (contact) => contact.source !== 'physical_control',
        ),
      ).toEqual([]);
      state = next;
    }
    const prepared = owner(state);
    expect(phases.has('controlling')).toBe(true);
    expect(phases.has('adjusting')).toBe(true);
    expect(phases.has('scanning')).toBe(true);
    expect(distance(prepared.position, actor.position)).toBeGreaterThan(0.3);
    expect(distance(prepared.position, actor.position)).toBeLessThan(1.1);
    expect(prepared.facingAngle).not.toBe(actor.facingAngle);
    expect(state.ball.ownerId).toBe(actor.id);
    expect(state.contactControlTelemetry!.physicalContacts).toBeGreaterThan(1);
    expect(distance(state.ball, initial.ball)).toBeGreaterThan(0.2);
    expect(state.decisionIndex).toBe(initial.decisionIndex);
    expect(chooseNpcRoutineAction(state, actor.id)).toBeUndefined();
    expect(onBallPreparationSchema.safeParse(state.onBallPreparation).success).toBe(true);
  });

  it('protects the actual ball away from nearby pressure and keeps phase identity stable', () => {
    const state = fixture();
    const actor = owner(state);
    const marker = state.players.find((player) => player.team !== actor.team)!;
    marker.position = { x: 41.8, y: 34 };
    state.currentPressure = 0.8;
    state.onBallPreparation = deriveOnBallPreparation(state, actor, 'clean_control');
    state.time = state.onBallPreparation.readyAt + 0.1;
    const shield = projectPossessionMicroBehaviour(state, actor, state.onBallPreparation);
    expect(shield.phase).toBe('shielding');
    expect(shield.ballOffset.x).toBeLessThan(0);
    expect(shield.localTarget.x).toBeLessThan(actor.position.x);
    state.onBallPreparation.micro = shield;
    state.time += FIXED_MATCH_DT;
    expect(projectPossessionMicroBehaviour(state, actor, state.onBallPreparation).startedAt).toBe(
      shield.startedAt,
    );
  });

  it.each(['carry', 'movement'] as const)(
    'rebases local preparation after committed %s without restarting possession readiness',
    (mode) => {
      let state = fixture();
      const actor = owner(state);
      state.onBallPreparation = deriveOnBallPreparation(state, actor, 'clean_control');
      const gainedAt = state.onBallPreparation.gainedAt;
      const readyAt = state.onBallPreparation.readyAt;
      const ownershipStartedAt = state.ballOwnershipStartedAt;
      const receptionOrigin = { ...actor.position };
      if (mode === 'carry')
        state = resolveMatchAction(
          state,
          { type: 'carry', actorId: actor.id, target: { x: 48, y: 34 } },
          'autonomous_npc',
        );
      else
        state.playerMovementIntent = {
          actorId: actor.id,
          type: 'attack_space',
          target: { x: 48, y: 34 },
          startedAt: state.time,
          expiresAt: state.time + 2.5,
        };
      state.actionCooldown = 100;
      let sawMovement = false;
      for (
        let tick = 0;
        tick < 200 && (state.ballCarrierIntent || state.playerMovementIntent);
        tick++
      ) {
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
        sawMovement ||= distance(owner(state).position, receptionOrigin) > 3;
      }
      expect(sawMovement).toBe(true);
      expect(state.ballCarrierIntent).toBeUndefined();
      expect(state.playerMovementIntent).toBeUndefined();
      const stoppedAt = { ...owner(state).position };
      expect(state.onBallPreparation!.micro!.origin.x).toBeGreaterThan(receptionOrigin.x + 3);
      expect(distance(state.onBallPreparation!.micro!.localTarget, stoppedAt)).toBeLessThan(1.2);
      expect(state.onBallPreparation!.gainedAt).toBe(gainedAt);
      expect(state.onBallPreparation!.readyAt).toBe(readyAt);
      expect(state.ballOwnershipStartedAt).toBe(ownershipStartedAt);
      for (let tick = 0; tick < 80; tick++)
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      expect(owner(state).position.x).toBeGreaterThan(stoppedAt.x - 1.2);
    },
  );

  it('does not turn an accepted human hold into more first-touch/body-adjustment menus', () => {
    let state = fixture();
    const actor = owner(state);
    state.controlledFootballerId = actor.id;
    state.onBallPreparation = deriveOnBallPreparation(state, actor, 'clean_control');
    state = resolveMatchAction(state, { type: 'hold', actorId: actor.id }, 'human_selected');
    expect(state.humanPossessionEpisode).toBeDefined();
    for (let tick = 0; tick < 160; tick++) {
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      expect(projectPlayerDecisionOpportunity(state)).toBeUndefined();
    }
    expect(state.ball.ownerId).toBe(actor.id);
    expect(distance(owner(state).position, actor.position)).toBeLessThan(1.1);
  });
});

describe('PR149 context-based reception quality', () => {
  it('records height, concentration and weak-side contact as separate canonical quality costs', () => {
    const state = fixture();
    const actor = owner(state);
    skill(actor, 65);
    actor.profile.dominantFoot = 'right';
    actor.profile.weakFootProficiency = 90;
    state.ball = { ...actor.position, velocity: { x: 7, y: 0 }, height: 0.11 };
    const contact = { x: actor.position.x, y: actor.position.y - 0.5 };
    const comfortable = resolveReceptionOutcome(state, actor, contact);
    actor.profile.weakFootProficiency = 10;
    const weaker = resolveReceptionOutcome(state, actor, contact);
    expect(weaker.quality!.weakFootDifficulty).toBe(0.9);
    expect(weaker.quality!.score).toBeLessThan(comfortable.quality!.score - 0.07);
    actor.profile.attributes.concentration = 20;
    state.ball.height = 1.2;
    const awkward = resolveReceptionOutcome(state, actor, contact);
    expect(awkward.quality!.incomingHeight).toBe(1.2);
    expect(awkward.quality!.score).toBeLessThan(weaker.quality!.score - 0.18);
  });

  it('usually controls an easy professional pass and deteriorates with speed, pressure and orientation', () => {
    const state = fixture();
    const actor = owner(state);
    skill(actor, 90);
    state.ball = { ...actor.position, velocity: { x: 7, y: 0 }, height: 0.11 };
    const easy = resolveReceptionOutcome(state, actor, actor.position);
    expect(easy.kind).toBe('clean_control');
    expect(easy.quality!.score).toBeGreaterThan(0.85);
    state.currentPressure = 0.9;
    actor.facingAngle = Math.PI / 2;
    state.ball.velocity = { x: 21, y: 0, z: -3 };
    state.ball.height = 1.2;
    const difficult = resolveReceptionOutcome(state, actor, actor.position);
    expect(difficult.quality!.score).toBeLessThan(easy.quality!.score - 0.4);
    expect(['heavy_touch', 'failed_control']).toContain(difficult.kind);
    skill(actor, 20);
    const poor = resolveReceptionOutcome(state, actor, actor.position);
    expect(poor.kind).toBe('failed_control');
    expect(distance(poor.resultingPoint!, poor.contactPoint)).toBeGreaterThan(2);
    expect(receptionOutcomeSchema.safeParse(poor).success).toBe(true);
    expect(resolveReceptionOutcome(state, actor, actor.position)).toEqual(poor);
  });

  const physicalContact = (receiverSkill: number, incomingSpeed: number) => {
    let state = fixture();
    const passer = owner(state);
    const receiver = state.players.find(
      (player) =>
        player.team === passer.team &&
        player.id !== passer.id &&
        player.profile.primaryPosition !== 'goalkeeper',
    )!;
    passer.position = { x: 25, y: 30 };
    receiver.position = { x: 40, y: 30 };
    receiver.facingAngle = -Math.PI / 2;
    skill(receiver, receiverSkill);
    state.ball = { ...passer.position, ownerId: passer.id };
    state = resolveMatchAction(state, {
      type: 'pass',
      actorId: passer.id,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'support',
    });
    state.time += 1;
    state.actionCooldown = 100;
    state.ball = {
      ...state.ball,
      x: 38.99,
      y: 30,
      velocity: { x: incomingSpeed, y: 0, z: 0 },
      height: 0.11,
      airborne: false,
      flightTime: 0.7,
    };
    state.receptionPreparation!.awarenessAt = state.time;
    return {
      receiver,
      before: state,
      next: stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT),
    };
  };

  it('lets a prepared professional cushion a firm ordinary ground pass', () => {
    const { before } = physicalContact(70, 18);
    before.receptionPreparation!.awarenessAt = before.time - 1.2;
    const next = stepTacticalMatchAfterDecisionProbe(before, FIXED_MATCH_DT);
    expect(next.lastReceptionOutcome?.kind).toBe('clean_control');
    expect(next.lastReceptionOutcome!.quality!.incomingSpeed).toBeGreaterThan(17.8);
    expect(next.lastReceptionOutcome!.quality!.score).toBeGreaterThan(0.65);
    expect(next.ball.ownerId).toBe(next.lastReceptionOutcome!.receiverId);
  });

  it('keeps a forward directional touch when the receiver faces back toward the passer', () => {
    const { receiver, before } = physicalContact(90, 7);
    const movingReceiver = before.players.find((player) => player.id === receiver.id)!;
    movingReceiver.velocity = { x: 3, y: 0 };
    movingReceiver.facingAngle = -Math.PI / 2;
    before.receptionPreparation!.awarenessAt = before.time - 1.2;
    before.receptionPreparation!.movement = 'run_onto_ball';
    const contact = stepTacticalMatchAfterDecisionProbe(before, FIXED_MATCH_DT);
    expect(contact.lastReceptionOutcome?.kind).toBe('directional_control');
    expect(contact.ball.ownerId).toBe(receiver.id);
    expect(contact.ball.x).toBeGreaterThan(contact.lastReceptionOutcome!.contactPoint.x);
    expect(owner(contact).facingAngle).toBeLessThan(0);
    const gainedAt = contact.onBallPreparation!.gainedAt;
    const readyAt = contact.onBallPreparation!.readyAt;
    const ownershipStartedAt = contact.ballOwnershipStartedAt;
    const maintained = stepTacticalMatchAfterDecisionProbe(contact, FIXED_MATCH_DT);
    expect(maintained.onBallPreparation!.micro!.phase).toBe('directional_touch');
    expect(maintained.onBallPreparation!.micro!.touchDirection!.x).toBeGreaterThan(0.9);
    expect(maintained.ball.x).toBeGreaterThanOrEqual(contact.ball.x);
    // Continuous reception can occur behind the moving body. A directional impulse overtakes
    // it according to physics; the ball cannot instantly teleport to a forward body offset.
    expect(maintained.ball.velocity!.x).toBeGreaterThan(owner(maintained).velocity.x);
    let advanced = maintained;
    for (let tick = 0; tick < 6; tick++)
      advanced = stepTacticalMatchAfterDecisionProbe(advanced, FIXED_MATCH_DT);
    expect(advanced.ball.x).toBeGreaterThan(owner(advanced).position.x);
    expect(maintained.onBallPreparation!.gainedAt).toBe(gainedAt);
    expect(maintained.onBallPreparation!.readyAt).toBe(readyAt);
    expect(maintained.ballOwnershipStartedAt).toBe(ownershipStartedAt);
    expect(maintained.decisionIndex).toBe(contact.decisionIndex);
    expect(npcPossessionDecisionDelay(maintained, owner(maintained))).toBeGreaterThan(5.5);
  });

  it('records the actual successful teammate receiver even when the intended target differs', () => {
    const { receiver, before } = physicalContact(90, 7);
    const intended = before.players.find(
      (player) =>
        player.team === receiver.team &&
        player.id !== receiver.id &&
        player.id !== before.lastPassDiagnostic!.passerId,
    )!;
    before.lastPassDiagnostic!.intendedReceiverId = intended.id;
    before.receptionPreparation!.actorId = intended.id;
    const next = stepTacticalMatchAfterDecisionProbe(before, FIXED_MATCH_DT);
    expect(next.lastResolvedPass?.intendedReceiverId).toBe(intended.id);
    expect(next.lastResolvedPass?.actualReceiverId).toBe(receiver.id);
    expect(next.lastResolvedPass?.finalResult).toBe('completed');
    expect(next.ball.ownerId).toBe(receiver.id);
  });

  it.each([
    [45, 12, 'still_recovering'],
    [10, 18, 'recovery_elapsed'],
  ] as const)(
    'rebases %s-skill recovery after a %s m/s poor touch when %s',
    (receiverSkill, incomingSpeed, recovery) => {
      const { receiver, before } = physicalContact(receiverSkill, incomingSpeed);
      if (receiverSkill === 10) {
        const movingReceiver = before.players.find((player) => player.id === receiver.id)!;
        movingReceiver.profile.attributes.agility = 100;
        movingReceiver.velocity = { x: 3, y: 0 };
        movingReceiver.facingAngle = Math.PI / 2;
      }
      const next = stepTacticalMatchAfterDecisionProbe(before, FIXED_MATCH_DT);
      let state = next;
      const gainedAt = next.onBallPreparation!.gainedAt;
      const readyAt = next.onBallPreparation!.readyAt;
      const originalOrigin = { ...next.onBallPreparation!.micro!.origin };
      for (let tick = 0; tick < 100 && !state.ball.ownerId; tick++)
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      expect(state.ball.ownerId).toBe(receiver.id);
      const claimedPosition = { ...owner(state).position };
      expect(distance(claimedPosition, originalOrigin)).toBeGreaterThan(0.05);
      if (recovery === 'still_recovering') {
        expect(state.time).toBeLessThan(readyAt);
        expect(state.onBallPreparation!.gainedAt).toBe(gainedAt);
        expect(state.onBallPreparation!.readyAt).toBe(readyAt);
      } else {
        // A real foot contact can occur after the original recovery has elapsed.
        // It starts ordinary preparation instead of resurrecting that old clock.
        expect(state.time).toBeGreaterThan(readyAt);
        expect(state.onBallPreparation!.gainedAt).toBe(state.time);
        expect(state.onBallPreparation!.readyAt).toBeGreaterThan(state.time);
      }
      const claimedGainedAt = state.onBallPreparation!.gainedAt;
      const claimedReadyAt = state.onBallPreparation!.readyAt;
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      expect(state.onBallPreparation!.gainedAt).toBe(claimedGainedAt);
      expect(state.onBallPreparation!.readyAt).toBe(claimedReadyAt);
      expect(state.onBallPreparation!.receptionKind).toBe(
        recovery === 'still_recovering' ? 'heavy_touch' : undefined,
      );
      expect(state.onBallPreparation!.micro!.phase).toBe(
        recovery === 'still_recovering' ? 'recovering' : 'controlling',
      );
      expect(state.onBallPreparation!.micro!.origin).toEqual(claimedPosition);
    },
  );

  it.each([
    [45, 12, 'heavy_touch'],
    [10, 18, 'failed_control'],
  ] as const)(
    'passes incoming physical evidence through a %s-skill %s m/s contact and creates %s recovery',
    (receiverSkill, incomingSpeed, kind) => {
      const { receiver, before, next } = physicalContact(receiverSkill, incomingSpeed);
      expect(next.lastReceptionOutcome?.kind).toBe(kind);
      expect(next.lastReceptionOutcome!.quality!.incomingSpeed).toBeGreaterThan(
        incomingSpeed - 0.2,
      );
      expect(next.ball.ownerId).toBeUndefined();
      expect(next.ball.looseSince).toBe(next.time);
      expect(distance(next.ball, next.lastReceptionOutcome!.contactPoint)).toBeGreaterThan(1.2);
      expect(Math.hypot(next.ball.velocity!.x, next.ball.velocity!.y)).toBeGreaterThan(1.5);
      expect(next.onBallPreparation?.micro?.phase).toBe('recovering');
      expect(next.onBallPreparation!.readyAt).toBeGreaterThan(next.time + 0.6);
      expect(next.pendingReceptionIntent).toBeUndefined();
      expect(next.lastResolvedPass?.receptionOutcome).toBe(kind);
      expect(next.lastResolvedPass?.finalResult).toBe('technical_error');
      expect(next.ball.secondBallPriorityIds).toContain(receiver.id);
      expect(before.ball.velocity!.x).toBe(incomingSpeed);
    },
  );
});
