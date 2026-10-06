// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  stepTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
  FIXED_MATCH_DT,
} from './matchSimulation';
import {
  resolveMatchAction,
  enumerateAvailableActions,
  chooseIncomingShotAction,
} from './matchActions';
import {
  applyPlayerDecision,
  projectPlayerDecisionOpportunity,
  incomingBallIntentKey,
} from './playerDecision';
import { enumerateFirstTimePasses, deriveFirstTimeSpacePass } from './firstTimePassing';
import { preparationMarginForAction } from './onBallPreparation';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  assertTelemetryInvariants,
} from './matchFlowTelemetry';
import { createMatchStatistics, assertMatchStatisticsInvariants } from './playerMatchStats';
import { enumerateCanonicalShootingOptions } from './shootingOptions';
import { applyRestartScenario } from './restartScenarios';
import {
  MATCH_PRESENTATION_POLICIES,
  projectMatchMoment,
  shouldSurfaceMatchMoment,
} from './matchMoment';
import { advanceBackgroundBatch } from './matchPresentation';
import { findAerialContactCandidates } from './aerialPlay';
import { advanceBallAcquisition } from './ballAcquisition';
import { deriveBuildUpSupport } from './tacticalPositioning';
import type { MatchAction, TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = (seed = 'pr155-contract') => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed,
      control: { mode: 'spectator' },
    }),
  );
  state.time = 30;
  state.actionCooldown = 0;
  state.ballOwnershipStartedAt = 20;
  state.scenario = 'open_play';
  delete state.restart;
  state.players = state.players.map((p) => ({
    ...p,
    position: { x: p.team === 'home' ? 5 : 100, y: 62 },
    velocity: { x: 0, y: 0 },
    profile: { ...p.profile, attributes: { ...p.profile.attributes } },
  }));
  const actor = state.players.find(
    (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
  )!;
  const receiver = state.players.find(
    (p) => p.team === 'home' && p.id !== actor.id && p.slot.position === 'striker',
  )!;
  const rival = state.players.find((p) => p.team === 'away' && p.slot.position === 'center_back')!;
  actor.position = { x: 50, y: 34 };
  actor.facingAngle = Math.PI / 2;
  receiver.position = { x: 65, y: 26 };
  receiver.target = { x: 76, y: 26 };
  receiver.velocity = { x: 2, y: 0 };
  state.ball = { ...actor.position, ownerId: actor.id, lastTouchPlayerId: actor.id };
  state.possessionTeam = 'home';
  state.statistics = createMatchStatistics(state);
  return { state, actor, receiver, rival };
};
const incoming = (height = 0.11, speed = 14) => {
  const f = fixture();
  const passer = f.state.players.find(
    (p) => p.team === 'home' && p.id !== f.actor.id && p.id !== f.receiver.id,
  )!;
  f.state.currentActorId = passer.id;
  f.state.ball = {
    x: 49.7,
    y: 34,
    height,
    airborne: height > 0.2,
    from: { x: 40, y: 34 },
    target: { x: 50, y: 34 },
    velocity: { x: speed, y: 0, z: 0 },
    lastTouchPlayerId: passer.id,
    travelKind: 'pass',
    sourceAction: 'pass',
    intendedReceiverId: f.actor.id,
  };
  return f;
};

describe('PR155 human shot ownership', () => {
  it.each(Object.entries(MATCH_PRESENTATION_POLICIES))(
    'reserves shots across %s visible and hidden paths',
    (name, policy) => {
      const { state, actor } = fixture(name);
      actor.position = { x: 91, y: 34 };
      state.ball = { ...actor.position, ownerId: actor.id };
      state.controlledFootballerId = actor.id;
      const shots = enumerateCanonicalShootingOptions(state, actor.id);
      expect(shots.map((s) => (s.type === 'shot' ? s.intent : s.type))).toEqual([
        'driven',
        'placed',
        'chip',
      ]);
      for (const shot of shots) {
        for (const source of [
          'autonomous_npc',
          'autonomous_routine',
          'dev_ai_selected',
          'restart_liveness_watchdog',
        ] as const) {
          const blocked = resolveMatchAction(state, shot, source);
          expect(blocked.ball).toEqual(state.ball);
          expect(blocked.decisionIndex).toBe(state.decisionIndex);
          const op = projectPlayerDecisionOpportunity(blocked)!;
          expect(op.options.some((o) => o.kind === 'action' && o.action.type === 'shot')).toBe(
            true,
          );
          const moment = projectMatchMoment(blocked);
          expect(moment.requiresHumanDecision).toBe(true);
          expect(shouldSurfaceMatchMoment(moment, policy)).toBe(true);
          expect(stepTacticalMatch(blocked, FIXED_MATCH_DT)).toEqual(blocked);
          expect(
            advanceBackgroundBatch({
              state: blocked,
              maxTicks: 10,
              policy,
              advance: stepTacticalMatch,
              project: projectMatchMoment,
              isRunning: () => true,
            }).stopReason,
          ).toBe('human_decision');
        }
        const fired = resolveMatchAction(state, shot, 'human_selected');
        const telemetry = observeMatchFlow(createMatchFlowTelemetry(name), state, fired);
        expect(telemetry.controlled.majorActionSources.shots).toEqual({ human: 1, autonomous: 0 });
      }
    },
  );
  it.each(
    Object.entries(MATCH_PRESENTATION_POLICIES).flatMap(([name, policy]) =>
      [0.11, 0.5, 1, 1.75].map((height) => [name, height, policy] as const),
    ),
  )(
    '%s incoming contact at height %s completes only a committed human shot',
    (_name, height, policy) => {
      const { state, actor } = incoming(height);
      actor.position = { x: 91, y: 34 };
      state.ball = { ...state.ball, x: 90.7, target: { x: 91, y: 34 } };
      state.controlledFootballerId = actor.id;
      const action = enumerateCanonicalShootingOptions(state, actor.id)[0]!;
      expect(action).toBeDefined();
      const blocked = resolveMatchAction(state, action, 'autonomous_npc');
      expect(blocked.ball.shot).toBeUndefined();
      const moment = projectMatchMoment(blocked);
      expect(moment.requiresHumanDecision).toBe(true);
      expect(shouldSurfaceMatchMoment(moment, policy)).toBe(true);
      expect(stepTacticalMatch(blocked, FIXED_MATCH_DT)).toEqual(blocked);
      const opportunity = projectPlayerDecisionOpportunity(blocked)!;
      const option = opportunity.options.find(
        (o) => o.kind === 'action' && (o.action.type === 'shot' || o.action.type === 'header'),
      )!;
      let selected = applyPlayerDecision(blocked, opportunity, option.id);
      expect(selected.pendingReceptionIntent?.actionSource).toBe('human_selected');
      for (let i = 0; i < 12 && !selected.ball.shot; i++)
        selected = stepTacticalMatchAfterDecisionProbe(selected, FIXED_MATCH_DT);
      expect(selected.latestActionSource).toBe('human_selected');
      expect(selected.ball.shot).toBeDefined();
    },
  );
  it.each(['penalty', 'free_kick_close'] as const)(
    'keeps the controlled %s taker human even with a resolved gate',
    (scenario) => {
      let { state } = fixture();
      state = applyRestartScenario(state, scenario, { restartTeam: 'home' });
      state.controlledFootballerId = state.restart!.takerId;
      const op = projectPlayerDecisionOpportunity(state)!;
      state.playerDecisionGate = {
        lastSituationSignature: op.signature,
        lastResolvedAt: state.time,
      };
      expect(projectPlayerDecisionOpportunity(state)).toBeDefined();
      const shot = enumerateAvailableActions(state, state.controlledFootballerId).find(
        (a) => a.type === 'shot',
      )!;
      expect(shot).toBeDefined();
      expect(
        resolveMatchAction(state, shot, 'restart_liveness_watchdog').ball.shot,
      ).toBeUndefined();
    },
  );
});

describe('PR155 canonical one-touch passes', () => {
  it('values fresh control independently of the previous carrier scanning age', () => {
    const { state, receiver } = incoming();
    receiver.position = { x: 42, y: 38 };
    receiver.target = { ...receiver.position };
    receiver.velocity = { x: 0, y: 0 };
    const actorId = state.ball.intendedReceiverId!;
    const fresh = chooseIncomingShotAction(
      { ...state, ballOwnershipStartedAt: state.time },
      actorId,
    );
    const oldCarrier = chooseIncomingShotAction(
      { ...state, ballOwnershipStartedAt: state.time - 60 },
      actorId,
    );
    expect(oldCarrier).toEqual(fresh);
    expect(fresh).toBeUndefined();
  });
  it.each(['support', 'lead', 'through'] as const)(
    'shares physical %s releases for human and NPC with zero settling',
    (intent) => {
      const { state, actor, receiver } = incoming();
      const action: MatchAction = {
        type: 'pass',
        actorId: actor.id,
        receiverId: receiver.id,
        target: receiver.position,
        intent,
        firstTime: true,
      };
      const human = { ...state, controlledFootballerId: actor.id };
      const a = resolveMatchAction(human, action, 'human_selected'),
        b = resolveMatchAction(state, action, 'autonomous_npc');
      expect(a.ball).toEqual(b.ball);
      expect(a.lastPassDiagnostic?.executionType).toBe('first_time');
      expect(a.lastPassDiagnostic?.incomingSpeed).toBe(14);
      expect(a.lastPassDiagnostic?.incomingHeight).toBe(0.11);
      expect(preparationMarginForAction(state, actor, action)).toBe(0);
      expect(a.lastPassDiagnostic?.actionSource).toBe('human_selected');
      expect(b.lastPassDiagnostic?.actionSource).toBe('autonomous_npc');
    },
  );
  it('enumerates feet, running and lofted targets and derives a genuine space redirect', () => {
    const { state, actor, receiver } = incoming();
    receiver.position = { x: 78, y: 20 };
    receiver.target = { x: 88, y: 20 };
    receiver.velocity = { x: 3, y: 0 };
    const options = enumerateFirstTimePasses(state, actor.id);
    expect(options.some((a) => a.intent === 'lead' || a.intent === 'through')).toBe(true);
    expect(options.some((a) => a.delivery === 'lofted')).toBe(true);
    expect(deriveFirstTimeSpacePass(state, actor.id, { x: 83, y: 20 })?.firstTime).toBe(true);
    state.ball.height = 1.75;
    expect(enumerateFirstTimePasses(state, actor.id)).toEqual([]);
  });
  it('records completion once and preserves both incoming and outgoing pass identities', () => {
    const { state: initial, actor, receiver } = incoming();
    let state = resolveMatchAction(
      initial,
      {
        type: 'pass',
        actorId: actor.id,
        receiverId: receiver.id,
        target: receiver.position,
        intent: 'support',
        firstTime: true,
      },
      'autonomous_npc',
    );
    state.pendingReceptionIntent = {
      actorId: receiver.id,
      action: { type: 'hold', actorId: receiver.id },
      actionSource: 'autonomous_npc',
      createdAt: state.time,
      expiresAt: state.time + 10,
      ballEpisode: incomingBallIntentKey(state),
    };
    let telemetry = observeMatchFlow(createMatchFlowTelemetry('one-touch'), initial, state);
    state.actionCooldown = 1000;
    for (let i = 0; i < 400 && !state.lastPassDiagnostic?.finalResult; i++) {
      const prev = state;
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      telemetry = observeMatchFlow(telemetry, prev, state);
    }
    expect(state.lastPassDiagnostic?.finalResult).toBe('completed');
    expect(telemetry.firstTimePassAttempts).toBe(1);
    expect(telemetry.firstTimePassCompleted).toBe(1);
    const repeated = observeMatchFlow(telemetry, state, state);
    expect(repeated.firstTimePassCompleted).toBe(1);
    assertTelemetryInvariants(repeated);
    assertMatchStatisticsInvariants(state.statistics!, state);
  });
});

describe('PR155 physical possession contests', () => {
  it('nominates one acquisition and leaves uncertain contact loose until control is established', () => {
    const { state, actor, rival } = fixture();
    rival.position = { x: 50.2, y: 34 };
    state.ball = { x: 50, y: 34, looseSince: 29, velocity: { x: 0, y: 0 } };
    let result = advanceBallAcquisition(state, actor, 2.1);
    expect(result.state.ball.ownerId).toBeUndefined();
    expect(result.securedPlayerId).toBeUndefined();
    for (let i = 0; i < 3; i++) {
      result = advanceBallAcquisition(
        { ...result.state, time: 30 + (i + 1) * FIXED_MATCH_DT },
        i % 2 ? rival : actor,
        2.1,
      );
      expect(result.state.ballAcquisition?.candidateId).toBe(actor.id);
      expect(result.securedPlayerId).toBeUndefined();
    }
  });
  it('resolves the A/B aerial envelope once without adjacent A-B-A-B possessions, then re-arms after separation', () => {
    const { state: initial, actor, rival } = incoming(1.85, 12);
    actor.position = { x: 50, y: 34 };
    rival.position = { x: 50.35, y: 34 };
    for (const p of [actor, rival]) {
      p.profile.attributes.heading = 100;
      p.profile.attributes.jumping = 100;
      p.profile.attributes.gameReading = 100;
      p.profile.attributes.positioning = 100;
      p.profile.attributes.strength = 100;
    }
    let state = initial;
    let flips = 0;
    const contacts = new Set<string>();
    let firstContact: TacticalMatchState | undefined;
    for (let tick = 0; tick < 12; tick++) {
      const previous = state;
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      flips += Number(state.possessionTeam !== previous.possessionTeam);
      if (state.lastAerialContact) {
        contacts.add(state.lastAerialContact.id ?? 'missing');
        firstContact ??= state;
      }
    }
    expect(flips).toBe(0);
    expect(contacts.size).toBe(1);
    expect(state.ball.ownerId).toBeUndefined();
    const locked = {
      ...firstContact!,
      ball: { ...firstContact!.ball, x: actor.position.x, y: actor.position.y, height: 1.85 },
    };
    expect(findAerialContactCandidates(locked).some((c) => c.player.id === actor.id)).toBe(false);
    const separated = { ...locked, ball: { ...locked.ball, x: 70 } };
    const advanced = stepTacticalMatchAfterDecisionProbe(separated, FIXED_MATCH_DT);
    const returned = {
      ...advanced,
      ball: { ...advanced.ball, x: actor.position.x, y: actor.position.y, height: 1.85 },
    };
    expect(findAerialContactCandidates(returned).some((c) => c.player.id === actor.id)).toBe(true);
    assertMatchStatisticsInvariants(state.statistics!, state);
  });
  it('assigns complementary local jobs, opens a central build-up link, and retains rest defence', () => {
    const { state, actor, rival } = fixture();
    const carrier = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'left_back',
    )!;
    carrier.position = { x: 30, y: 10 };
    actor.position = { x: 66, y: 34 };
    rival.position = { x: 31, y: 10 };
    state.ball = { ...carrier.position, ownerId: carrier.id };
    const outlet = state.players.find(
      (p) =>
        p.team === 'home' &&
        p.id !== actor.id &&
        p.id !== carrier.id &&
        p.slot.position === 'center_back',
    )!;
    outlet.position = { x: 24, y: 21 };
    const oppositeBack = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'right_back',
    )!;
    oppositeBack.position = { x: 45, y: 36 };
    const support = deriveBuildUpSupport(state, 'home');
    expect(new Set(support.map((s) => s.playerId)).size).toBe(support.length);
    expect(support.length).toBeLessThanOrEqual(5);
    const pivot = support.find((s) => s.role === 'pivot')!;
    expect(pivot).toBeDefined();
    expect(pivot.target.x).toBeGreaterThan(carrier.position.x);
    expect(Math.abs(pivot.target.y - 34)).toBeLessThanOrEqual(8);
    expect(support.some((s) => s.role === 'escape')).toBe(true);
    expect(support.some((s) => s.playerId === oppositeBack.id && s.role === 'escape')).toBe(false);
  });
});
