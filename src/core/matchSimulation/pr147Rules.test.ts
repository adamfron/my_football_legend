// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  matchStateToFrame,
  stepTacticalMatch,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import {
  beginDefensiveChallenge,
  chooseNpcDefensiveChallengeAction,
  enumerateDefensiveChallengeActions,
  resolveDefensiveChallenge,
  type ChallengeDiagnostic,
  type DefensiveTechnique,
} from './defensiveChallenges';
import {
  advanceMatchRules,
  applyChallengeInfringement,
  awardFoulRestart,
  classifyChallengeFoul,
  isOwnPenaltyArea,
} from './matchRules';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { applyRestartScenario } from './restartScenarios';
import { angleForVector } from './playerOrientation';
import { choosePenaltyTaker } from './restartGeometry';
import { enumerateRestartActions, resolveMatchAction } from './matchActions';
import { applyThrowInContact } from './throwIn';

const world = createCanonicalWorldDatabase();
const fixture = (seed = 'pr147-rules') => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
  const actor = state.players.find(
    (p) => p.team === 'home' && p.profile.primaryPosition !== 'goalkeeper',
  )!;
  const opponent = state.players.find(
    (p) => p.team === 'away' && p.profile.primaryPosition !== 'goalkeeper',
  )!;
  state.players = state.players.map((p) => ({
    ...p,
    position: { x: p.team === 'home' ? 90 : 100, y: 62 },
    velocity: { x: 0, y: 0 },
    target: { x: p.team === 'home' ? 90 : 100, y: 62 },
  }));
  const defender = state.players.find((p) => p.id === actor.id)!;
  const attacker = state.players.find((p) => p.id === opponent.id)!;
  defender.position = { x: 22, y: 34 };
  defender.anchor = { ...defender.position };
  defender.target = { ...defender.position };
  defender.facingAngle = Math.PI / 2;
  attacker.position = { x: 23.2, y: 34 };
  attacker.target = { ...attacker.position };
  attacker.facingAngle = -Math.PI / 2;
  defender.profile = {
    ...defender.profile,
    attributes: {
      ...defender.profile.attributes,
      tackling: 90,
      gameReading: 90,
      positioning: 90,
      aggression: 85,
    },
  };
  attacker.profile = {
    ...attacker.profile,
    attributes: {
      ...attacker.profile.attributes,
      dribbling: 40,
      technique: 40,
      agility: 40,
      composure: 40,
    },
  };
  state.ball = { x: 22.7, y: 34, ownerId: attacker.id, lastTouchPlayerId: attacker.id };
  state.possessionTeam = 'away';
  state.currentPressure = 1;
  state.actionCooldown = 20;
  state.teams.away = { ...state.teams.away, phase: 'attacking_transition' };
  return { state, defender, attacker };
};
const selected = (
  state: TacticalMatchState,
  actorId: string,
  opponentId: string,
  technique: DefensiveTechnique,
) =>
  beginDefensiveChallenge(
    state,
    { type: 'challenge', actorId, opponentId, technique },
    'human_selected',
  );

const foulContact = (
  state: TacticalMatchState,
  actorId: string,
  opponentId: string,
  changes: Partial<ChallengeDiagnostic> = {},
): ChallengeDiagnostic => ({
  id: `${state.seed}:physical-contact:${state.time}`,
  at: state.time,
  actorId,
  team: 'home',
  opponentId,
  technique: 'standing',
  source: 'autonomous_routine',
  position: { ...state.players.find((p) => p.id === opponentId)!.position },
  outcome: 'foul',
  ballFirst: false,
  opponentContact: true,
  ballDistance: 1.3,
  opponentDistance: 1,
  facingError: 0,
  relativeSpeed: 2,
  lateness: 0.1,
  force: 0.3,
  fromBehind: false,
  ...changes,
});

describe('PR147 one canonical physical defence resolver', () => {
  it('uses the canonical orientation for horizontal and vertical ball access', () => {
    for (const direction of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const { state, defender, attacker } = fixture('pr147-axis-access');
      defender.position = { x: 52, y: 34 };
      defender.anchor = { ...defender.position };
      attacker.position = { x: 52 + direction.x * 1.2, y: 34 + direction.y * 1.2 };
      defender.facingAngle = angleForVector(direction);
      attacker.facingAngle = angleForVector({ x: -direction.x, y: -direction.y });
      state.ball = { x: 52 + direction.x * 0.7, y: 34 + direction.y * 0.7, ownerId: attacker.id };
      expect(
        enumerateDefensiveChallengeActions(state, defender.id).some(
          (action) => action.technique === 'standing',
        ),
      ).toBe(true);
      const result = resolveDefensiveChallenge(
        selected(state, defender.id, attacker.id, 'standing'),
      );
      expect(result.diagnostic).toMatchObject({ ballFirst: true, fromBehind: false });
      expect(result.diagnostic!.facingError).toBeCloseTo(0, 12);
      defender.facingAngle = angleForVector({ x: -direction.x, y: -direction.y });
      expect(enumerateDefensiveChallengeActions(state, defender.id)).toHaveLength(0);
    }
  });
  it('classifies rear contact in both canonical axes as a dangerous opponent-first slide', () => {
    for (const direction of [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
    ]) {
      const { state, defender, attacker } = fixture('pr147-rear-contact');
      attacker.position = { x: 23.2, y: 34 };
      defender.position = {
        x: attacker.position.x - direction.x * 1.2,
        y: attacker.position.y - direction.y * 1.2,
      };
      defender.anchor = { ...defender.position };
      defender.facingAngle = angleForVector(direction);
      attacker.facingAngle = angleForVector(direction);
      defender.velocity = { x: direction.x * 4, y: direction.y * 4 };
      attacker.velocity = { x: -direction.x * 3, y: -direction.y * 3 };
      state.ball = {
        x: defender.position.x + direction.x,
        y: defender.position.y + direction.y,
        ownerId: attacker.id,
      };
      const intent = selected(state, defender.id, attacker.id, 'slide');
      expect(intent.defensiveChallenge).toBeDefined();
      const result = resolveDefensiveChallenge({ ...intent, time: 0.2 });
      expect(result.diagnostic).toMatchObject({
        outcome: 'foul',
        fromBehind: true,
        ballFirst: false,
        opponentContact: true,
      });
      expect(classifyChallengeFoul(result.state, result.diagnostic!)?.severity).toBe(
        'excessive_force',
      );
    }
  });
  it('wins a standing challenge only after reaching the accessible ball', () => {
    const { state, defender, attacker } = fixture('pr147-standing-clean');
    const next = resolveDefensiveChallenge(selected(state, defender.id, attacker.id, 'standing'));
    expect(next.diagnostic).toMatchObject({
      outcome: 'clean_win',
      ballFirst: true,
      technique: 'standing',
    });
    expect(next.state.defensiveTelemetry).toMatchObject({ attempted: 1, cleanWins: 1, fouls: 0 });
  });
  it('records a miss when the opponent escapes an accepted approach', () => {
    const { state, defender, attacker } = fixture();
    const intent = selected(state, defender.id, attacker.id, 'standing');
    const escaped = {
      ...intent,
      time: 1,
      ball: { x: 35, y: 34, ownerId: attacker.id },
      players: intent.players.map((p) =>
        p.id === attacker.id ? { ...p, position: { x: 35, y: 34 } } : p,
      ),
    };
    const result = resolveDefensiveChallenge(escaped);
    expect(result.diagnostic?.outcome).toBe('missed');
    expect(result.state.defensiveTelemetry).toMatchObject({
      attempted: 1,
      missed: 1,
      cleanWins: 0,
    });
    expect(result.state.ball.ownerId).toBe(attacker.id);
  });
  it('executes a clean slide through the same resolver and canonical timing', () => {
    const { state, defender, attacker } = fixture('pr147-slide-clean-2');
    state.ball.x = 23;
    defender.velocity.x = 2;
    attacker.velocity.x = -2;
    const intent = selected(state, defender.id, attacker.id, 'slide');
    expect(resolveDefensiveChallenge(intent).diagnostic).toBeUndefined();
    const result = resolveDefensiveChallenge({ ...intent, time: 0.2 });
    expect(result.diagnostic).toMatchObject({
      technique: 'slide',
      outcome: 'clean_win',
      ballFirst: true,
    });
    expect(result.state.defensiveTelemetry?.slides).toBe(1);
  });
  it('makes a mistimed slide an actual opponent-first foul', () => {
    const { state, defender, attacker } = fixture();
    state.ball.x = 23;
    defender.velocity.x = 3;
    attacker.velocity.x = -3;
    const intent = selected(state, defender.id, attacker.id, 'slide');
    const result = resolveDefensiveChallenge({
      ...intent,
      time: 0.2,
      ball: { ...intent.ball, x: 24.3 },
    });
    expect(result.diagnostic).toMatchObject({
      outcome: 'foul',
      ballFirst: false,
      opponentContact: true,
    });
    expect(classifyChallengeFoul(result.state, result.diagnostic!)?.severity).toBe('reckless');
  });
  it('permits an accidental foul from ordinary low-risk defence', () => {
    const cases = Array.from({ length: 100 }, (_, i) => fixture(`pr147-ordinary-${i}`));
    const results = cases.map(({ state, defender, attacker }) => {
      defender.profile = {
        ...defender.profile,
        attributes: {
          ...defender.profile.attributes,
          tackling: 35,
          gameReading: 35,
          positioning: 35,
        },
      };
      return resolveDefensiveChallenge(
        beginDefensiveChallenge(
          state,
          {
            type: 'challenge',
            actorId: defender.id,
            opponentId: attacker.id,
            technique: 'standing',
          },
          'autonomous_routine',
        ),
      );
    });
    expect(results.some((result) => result.diagnostic?.outcome === 'foul')).toBe(true);
    expect(results.some((result) => result.diagnostic?.outcome === 'clean_win')).toBe(true);
    expect(results.every((result) => result.diagnostic?.source === 'autonomous_routine')).toBe(
      true,
    );
  });
  it('a tactical intent still misses when it cannot contact its opponent', () => {
    const { state, defender, attacker } = fixture();
    const intent = selected(state, defender.id, attacker.id, 'tactical');
    expect(intent.defensiveChallenge?.technique).toBe('tactical');
    const result = resolveDefensiveChallenge({
      ...intent,
      time: 1.3,
      ball: { ...intent.ball, x: 35 },
      players: intent.players.map((p) =>
        p.id === attacker.id ? { ...p, position: { x: 35, y: 34 } } : p,
      ),
    });
    expect(result.diagnostic?.outcome).toBe('missed');
    expect(result.state.lastFoul).toBeUndefined();
  });
  it('ranks canonical defensive intent identically when human agency is suppressed', () => {
    const { state, defender, attacker } = fixture();
    const npcAction = chooseNpcDefensiveChallengeAction(state, defender.id);
    state.controlledFootballerId = defender.id;
    state.playerAgencyEnabled = false;
    expect(
      enumerateDefensiveChallengeActions(state, defender.id).some(
        (action) => action.technique === 'tactical',
      ),
    ).toBe(true);
    expect(chooseNpcDefensiveChallengeAction(state, defender.id)).toEqual(npcAction);
    expect(
      resolveMatchAction(
        state,
        { type: 'challenge', actorId: defender.id, opponentId: attacker.id, technique: 'tactical' },
        'autonomous_npc',
      ),
    ).toMatchObject({ defensiveChallenge: { technique: 'tactical', source: 'autonomous_npc' } });
  });
  it('NPC high-risk intent enters the same canonical physical resolver', () => {
    const { state, defender, attacker } = fixture();
    // The ball is outside a comfortable immediate poke and moving across the press.
    // A reachable standing contact must take precedence over an intentional foul.
    state.ball.x = 22.9;
    defender.velocity = { x: 4, y: 0 };
    attacker.velocity = { x: 0, y: 3 };
    const action = chooseNpcDefensiveChallengeAction(state, defender.id)!;
    expect(action.technique).toBe('tactical');
    const npc = beginDefensiveChallenge(state, action, 'autonomous_npc');
    const result = resolveDefensiveChallenge({ ...npc, time: 0.2 });
    expect(result.diagnostic).toMatchObject({
      technique: 'tactical',
      source: 'autonomous_npc',
      outcome: 'foul',
    });
  });
  it('an ordinary NPC approach can foul and award a restart in the complete tick', () => {
    const { state, defender, attacker } = fixture('pr147-routine-full-tick-68');
    defender.position = { x: 51.3, y: 34 };
    defender.target = { ...defender.position };
    defender.anchor = { ...defender.position };
    defender.facingAngle = Math.PI / 2;
    attacker.position = { x: 52.5, y: 34 };
    attacker.target = { ...attacker.position };
    defender.profile = {
      ...defender.profile,
      attributes: { ...defender.profile.attributes, aggression: 40 },
    };
    state.ball = { x: 51.35, y: 34, ownerId: attacker.id, lastTouchPlayerId: attacker.id };
    // A real execution error can still foul; physical withdrawal cannot predict the RNG roll.
    state.controlledFootballerId = state.players.find(
      (p) => p.id !== defender.id && p.team === defender.team,
    )!.id;
    const next = stepTacticalMatch(state, 0.025);
    expect(next.lastChallenge).toMatchObject({
      source: 'autonomous_npc',
      technique: 'standing',
      outcome: 'foul',
      opponentContact: true,
    });
    expect(next.lastFoul).toMatchObject({
      severity: 'ordinary',
      card: 'none',
      awardedTeam: 'away',
    });
    expect(next.restart).toMatchObject({ phase: 'setup', restartTeam: 'away' });
    expect(next.defensiveTelemetry).toMatchObject({ attempted: 1, fouls: 1, cleanWins: 0 });
  });
  it('committed reckless physical contact books the player and restarts during full ticks', () => {
    const { state, defender, attacker } = fixture('pr147-contact-full-tick');
    defender.position = { x: 51, y: 34 };
    defender.target = { ...defender.position };
    defender.anchor = { x: 40, y: 34 };
    defender.velocity = { x: -5, y: 0 };
    attacker.position = { x: 52, y: 34 };
    attacker.target = { ...attacker.position };
    attacker.velocity = { x: 4, y: 0 };
    attacker.facingAngle = Math.PI / 2;
    state.ball = { x: 51.7, y: 34, ownerId: attacker.id, lastTouchPlayerId: attacker.id };
    let next = selected(state, defender.id, attacker.id, 'committed');
    expect(next.defensiveChallenge).toBeDefined();
    // Resolve a wound-up tackle while the opponents are still in contact, with real rear
    // approach and opposing momentum. The card must follow physical force, not a seed alone.
    next = {
      ...next,
      defensiveChallenge: { ...next.defensiveChallenge!, startedAt: state.time - 0.1 },
    };
    next = stepTacticalMatch(next, 0.025);
    expect(next.lastChallenge).toMatchObject({
      technique: 'committed',
      source: 'human_selected',
      outcome: 'foul',
      fromBehind: true,
      opponentContact: true,
    });
    expect(next.lastChallenge!.force).toBeGreaterThan(4.2);
    expect(next.lastFoul?.severity).toBe('reckless');
    expect(next.lastCard?.kind).toBe('yellow');
    expect(next.restart?.phase).toBe('setup');
    expect(next.players.some((p) => p.id === defender.id)).toBe(true);
    expect(next.actionEvents?.some((event) => event.kind === 'foul')).toBe(true);
    expect(
      next.actionEvents?.some((event) => event.kind === 'card' && event.outcome === 'yellow'),
    ).toBe(true);
  });
  it("does not steal another player's ball when the original opponent has passed", () => {
    const { state, defender, attacker } = fixture();
    const third = state.players.find((p) => p.team === 'away' && p.id !== attacker.id)!;
    const intent = selected(state, defender.id, attacker.id, 'standing');
    const result = resolveDefensiveChallenge({
      ...intent,
      ball: { ...intent.ball, ownerId: third.id },
    });
    expect(result.diagnostic?.outcome).not.toBe('clean_win');
    expect(result.state.ball.ownerId).toBe(third.id);
  });
  it("an NPC challenge preserves the human's independent movement intent", () => {
    const { state, defender, attacker } = fixture();
    const human = state.players.find((p) => p.id !== defender.id && p.team === 'home')!;
    state.controlledFootballerId = human.id;
    state.playerMovementIntent = {
      actorId: human.id,
      type: 'support',
      target: { x: 40, y: 34 },
      startedAt: 0,
      expiresAt: 2,
    };
    const intent = beginDefensiveChallenge(
      state,
      { type: 'challenge', actorId: defender.id, opponentId: attacker.id, technique: 'tactical' },
      'autonomous_npc',
    );
    expect(intent.playerMovementIntent).toBe(state.playerMovementIntent);
  });
});

describe('PR147 canonical cards, restarts and advantage', () => {
  const releasedThrow = (receiverControl?: number) => {
    const state = applyRestartScenario(
      createTacticalMatch(
        createSingleMatchSession(world, {
          homeClubId: world.clubs[0]!.id,
          awayClubId: world.clubs[1]!.id,
          seed: 'pr138-restart-liveness',
          control: { mode: 'spectator' },
        }),
      ),
      'throw_in',
      { restartTeam: 'home', restartPoint: { x: 45, y: 0 } },
    );
    const action = enumerateRestartActions(state)[0]!;
    expect(action.type).toBe('pass');
    if (action.type === 'pass' && receiverControl !== undefined) {
      const receiver = state.players.find((player) => player.id === action.receiverId)!;
      const thrower = state.players.find((player) => player.id === action.actorId)!;
      receiver.profile = {
        ...receiver.profile,
        weakFootProficiency: 95,
        attributes: {
          ...receiver.profile.attributes,
          firstTouch: receiverControl,
          technique: receiverControl,
          agility: receiverControl,
          composure: receiverControl,
          concentration: receiverControl,
          gameReading: receiverControl,
        },
      };
      receiver.facingAngle = angleForVector({
        x: thrower.position.x - receiver.position.x,
        y: thrower.position.y - receiver.position.y,
      });
    }
    return resolveMatchAction(state, action, 'autonomous_npc');
  };
  it('ends the original throw release on a clean first physical touch before an ordinary pass', () => {
    let state = releasedThrow(95);
    const released = state.lastThrowInDiagnostic!;
    for (let tick = 0; tick < 80 && !state.lastThrowInDiagnostic?.nextContactPlayerId; tick += 1)
      state = stepTacticalMatch(state, 0.025);
    expect(state.lastThrowInDiagnostic).toMatchObject({
      throwerId: released.throwerId,
      chosenReceiverId: released.chosenReceiverId,
      releasedAt: released.releasedAt,
      nextContactPlayerId: released.chosenReceiverId,
      nextContactAt: state.time,
    });
    expect(state.time).toBeLessThan(released.releasedAt + 4);
    expect(state.scenario).toBe('open_play');
    expect(state.restart).toBeUndefined();
    expect(state.throwInRestriction).toBeUndefined();
    expect(['clean_control', 'directional_control']).toContain(state.lastReceptionOutcome?.kind);
    expect(state.ball.ownerId).toBe(released.chosenReceiverId);
    const contact = state.lastThrowInDiagnostic;
    const thrower = state.players.find((p) => p.id === released.throwerId)!;
    const pass = resolveMatchAction(
      state,
      {
        type: 'pass',
        actorId: released.chosenReceiverId,
        receiverId: thrower.id,
        target: thrower.position,
        intent: 'support',
      },
      'autonomous_npc',
    );
    expect(pass.ball.travelKind).toBe('pass');
    expect(pass.throwInRestriction).toBeUndefined();
    expect(pass.lastThrowInDiagnostic).toBe(contact);
    expect(tacticalMatchStateSchema.safeParse(pass).success).toBe(true);
  });
  it('ends the throw restriction on a heavy physical first touch before actual recovery', () => {
    let state = releasedThrow(60);
    const released = state.lastThrowInDiagnostic!;
    for (let tick = 0; tick < 80 && !state.lastThrowInDiagnostic?.nextContactPlayerId; tick += 1)
      state = stepTacticalMatch(state, 0.025);
    expect(state.lastThrowInDiagnostic).toMatchObject({
      throwerId: released.throwerId,
      chosenReceiverId: released.chosenReceiverId,
      releasedAt: released.releasedAt,
      nextContactPlayerId: released.chosenReceiverId,
      nextContactAt: state.time,
    });
    expect(state.lastReceptionOutcome?.kind).toBe('heavy_touch');
    expect(state.time).toBeLessThan(released.releasedAt + 4);
    expect(state.ball.ownerId).toBeUndefined();
    expect(state.ball.looseSince).toBe(state.time);
    expect(Math.hypot(state.ball.velocity!.x, state.ball.velocity!.y)).toBeGreaterThan(0.1);
    expect(state.ball.secondBallPriorityIds).toContain(released.chosenReceiverId);
    expect(state.scenario).toBe('open_play');
    expect(state.restart).toBeUndefined();
    expect(state.throwInRestriction).toBeUndefined();
    const contact = state.lastThrowInDiagnostic;
    for (let tick = 0; tick < 160 && !state.ball.ownerId; tick += 1)
      state = stepTacticalMatch(state, 0.025);
    expect(state.ball.ownerId).toBe(released.chosenReceiverId);
    expect(state.lastThrowInDiagnostic).toBe(contact);
    const thrower = state.players.find((player) => player.id === released.throwerId)!;
    const pass = resolveMatchAction(
      state,
      {
        type: 'pass',
        actorId: released.chosenReceiverId,
        receiverId: thrower.id,
        target: thrower.position,
        intent: 'support',
      },
      'autonomous_npc',
    );
    expect(pass.ball.travelKind).toBe('pass');
    expect(pass.throwInRestriction).toBeUndefined();
    expect(pass.lastThrowInDiagnostic).toBe(contact);
    expect(tacticalMatchStateSchema.safeParse(pass).success).toBe(true);
  });
  it('keeps the released throw and its physical restriction while no other player touches it', () => {
    const released = releasedThrow();
    expect(applyThrowInContact(released, released.restart!.takerId)).toBe(released);
    const flying = stepTacticalMatch(released, 0.025);
    expect(flying.scenario).toBe('throw_in');
    expect(flying.restart?.phase).toBe('release');
    expect(flying.ball.travelKind).toBe('throw_in');
    expect(flying.throwInRestriction).toEqual(released.throwInRestriction);
    expect(flying.lastThrowInDiagnostic?.nextContactPlayerId).toBeUndefined();
    expect(released.lastThrowInDiagnostic?.nextContactPlayerId).toBeUndefined();
  });
  it('shows a yellow card for a reckless infringement', () => {
    const { state, defender, attacker } = fixture();
    const next = applyChallengeInfringement(
      state,
      foulContact(state, defender.id, attacker.id, { force: 5 }),
    );
    expect(next.lastCard?.kind).toBe('yellow');
    expect(next.discipline?.[defender.id]).toMatchObject({ yellowCards: 1, sentOff: false });
    expect(next.discipline?.[defender.id]).not.toHaveProperty('sentOffAt');
  });
  it('does not book the same canonical contact twice', () => {
    const { state, defender, attacker } = fixture();
    const contact = foulContact(state, defender.id, attacker.id, { force: 5 });
    const booked = applyChallengeInfringement(state, contact);
    expect(applyChallengeInfringement(booked, contact)).toBe(booked);
    expect(booked.discipline?.[defender.id]?.yellowCards).toBe(1);
  });
  it('a second yellow dismisses the player from physics and keeps the canonical identity', () => {
    const { state, defender, attacker } = fixture();
    state.discipline = { [defender.id]: { yellowCards: 1, sentOff: false, team: defender.team } };
    const next = applyChallengeInfringement(
      state,
      foulContact(state, defender.id, attacker.id, { force: 5 }),
    );
    expect(next.lastCard?.kind).toBe('second_yellow_red');
    expect(next.players.some((p) => p.id === defender.id)).toBe(false);
    expect(next.statistics?.players.find((p) => p.playerId === defender.id)).toBeDefined();
    expect(next.discipline?.[defender.id]).toMatchObject({ yellowCards: 2, sentOff: true });
    expect(next.discipline?.[defender.id]?.sentOffAt).toBe(next.time);
    expect(next.players.filter((p) => p.team === 'home')).toHaveLength(10);
    expect(matchStateToFrame(next).players.some((p) => p.id === defender.id)).toBe(false);
    expect(next.defensiveTelemetry).toMatchObject({ secondYellowDismissals: 1, straightReds: 0 });
  });
  it('excessive force is a straight red, including a ball-first contact', () => {
    const { state, defender, attacker } = fixture();
    const next = applyChallengeInfringement(
      state,
      foulContact(state, defender.id, attacker.id, {
        force: 10,
        ballFirst: true,
        technique: 'slide',
      }),
    );
    expect(next.lastFoul?.severity).toBe('excessive_force');
    expect(next.lastCard?.kind).toBe('red');
    expect(next.discipline?.[defender.id]?.sentOffAt).toBe(next.time);
    expect(next.players.filter((p) => p.team === 'home')).toHaveLength(10);
    expect(next.players.filter((p) => p.team === 'away')).toHaveLength(11);
    expect(next.statistics?.players).toHaveLength(22);
    expect(next.defensiveTelemetry).toMatchObject({ secondYellowDismissals: 0, straightReds: 1 });
    expect(choosePenaltyTaker(next, 'home').id).not.toBe(defender.id);
    const restart = applyRestartScenario(next, 'penalty', { restartTeam: 'home' });
    expect(restart.restart!.takerId).not.toBe(defender.id);
    expect(
      enumerateRestartActions(restart).every((action) =>
        restart.players.some((p) => p.id === action.actorId),
      ),
    ).toBe(true);
  });
  it('a dismissed keeper has one deterministic emergency replacement and legal restart geometry', () => {
    const { state, attacker } = fixture();
    const keeper = state.players.find(
      (p) => p.team === 'home' && p.profile.primaryPosition === 'goalkeeper',
    )!;
    const candidate = state.players.find((p) => p.team === 'home' && p.id !== keeper.id)!;
    for (const player of state.players.filter((p) => p.team === 'home'))
      player.profile = {
        ...player.profile,
        attributes: {
          ...player.profile.attributes,
          reflexes: player.id === candidate.id ? 95 : 10,
        },
      };
    const previousPosition = candidate.profile.primaryPosition;
    const next = applyChallengeInfringement(
      state,
      foulContact(state, keeper.id, attacker.id, { force: 10 }),
    );
    expect(next.players.filter((p) => p.team === 'home')).toHaveLength(10);
    expect(
      next.players
        .filter((p) => p.team === 'home' && p.profile.primaryPosition === 'goalkeeper')
        .map((p) => p.id),
    ).toEqual([candidate.id]);
    expect(state.players.find((p) => p.id === candidate.id)!.profile.primaryPosition).toBe(
      previousPosition,
    );
    expect(next.statistics?.players.find((p) => p.playerId === keeper.id)).toBeDefined();
    const restart = applyRestartScenario(next, 'goal_kick', { restartTeam: 'home' });
    expect(restart.restart?.takerId).toBe(candidate.id);
    expect(restart.players.find((p) => p.id === candidate.id)!.position).toEqual({
      x: restart.ball.x,
      y: restart.ball.y,
    });
    expect(enumerateRestartActions(restart).length).toBeGreaterThan(0);
    expect(tacticalMatchStateSchema.safeParse(restart).success).toBe(true);
  });
  it('classifies a tactical denial of an obvious goal-scoring opportunity', () => {
    const { state, defender, attacker } = fixture();
    attacker.position = { x: 20, y: 34 };
    attacker.velocity.x = -3;
    const next = applyChallengeInfringement(
      state,
      foulContact(state, defender.id, attacker.id, { technique: 'tactical' }),
    );
    expect(next.lastFoul).toMatchObject({ dogso: true, tactical: true, card: 'red' });
  });
  it('uses the actual outside-area infringement point for the same free-kick lifecycle', () => {
    const { state, defender, attacker } = fixture();
    const next = applyChallengeInfringement(state, foulContact(state, defender.id, attacker.id));
    expect(next.scenario).toBe('free_kick_close');
    expect(next.ball.x).toBeCloseTo(23.2, 12);
    expect(next.ball.y).toBe(34);
    expect(next.restart).toMatchObject({ phase: 'setup', restartTeam: 'away' });
  });
  it('defending-team penalty-area contact produces a penalty at the canonical spot', () => {
    const { state, defender, attacker } = fixture();
    attacker.position = { x: 12, y: 34 };
    const next = applyChallengeInfringement(state, foulContact(state, defender.id, attacker.id));
    expect(next.lastFoul?.position).toEqual({ x: 12, y: 34 });
    expect(next.scenario).toBe('penalty');
    expect(next.ball).toMatchObject({ x: 11, y: 34 });
    expect(isOwnPenaltyArea({ x: 12, y: 34 }, 'away')).toBe(false);
    expect(isOwnPenaltyArea({ x: 93, y: 34 }, 'away')).toBe(true);
    expect(next.defensiveTelemetry?.penalties).toBe(1);
    expect(awardFoulRestart(next, next.lastFoul!).defensiveTelemetry?.penalties).toBe(1);
  });
  it('allows useful attacking possession and realizes advantage on forward progress', () => {
    const { state, defender, attacker } = fixture();
    state.currentPressure = 0.4;
    const played = applyChallengeInfringement(state, foulContact(state, defender.id, attacker.id));
    expect(played.pendingAdvantage?.expiresAt).toBe(3);
    expect(played.lastAdvantage?.outcome).toBe('played');
    const progressed = advanceMatchRules(played, {
      ...played,
      time: 0.5,
      ball: { ...played.ball, x: 17 },
    });
    expect(progressed.lastAdvantage?.outcome).toBe('realized');
    expect(progressed.pendingAdvantage).toBeUndefined();
    expect(progressed.scenario).toBe('open_play');
  });
  it('recalls failed immediate advantage at the original point without resetting time', () => {
    const { state, defender, attacker } = fixture();
    state.currentPressure = 0.4;
    const played = applyChallengeInfringement(state, foulContact(state, defender.id, attacker.id));
    const lost = advanceMatchRules(played, {
      ...played,
      time: 0.5,
      ball: { x: 22, y: 34, ownerId: defender.id },
    });
    expect(lost.lastAdvantage?.outcome).toBe('recalled');
    expect(lost.time).toBe(0.5);
    expect(lost.restart?.restartTeam).toBe('away');
    expect(lost.ball.x).toBeCloseTo(23.2, 12);
    expect(lost.ball.y).toBe(34);
  });
  it('retains a delayed card after realized advantage until the next stoppage', () => {
    const { state, defender, attacker } = fixture();
    state.currentPressure = 0.4;
    const played = applyChallengeInfringement(
      state,
      foulContact(state, defender.id, attacker.id, { force: 5 }),
    );
    expect(played.lastCard).toBeUndefined();
    expect(played.pendingCards).toHaveLength(1);
    const realized = advanceMatchRules(played, { ...played, time: 3.01 });
    expect(realized.pendingAdvantage).toBeUndefined();
    expect(realized.pendingCards).toHaveLength(1);
    const stopped = advanceMatchRules(
      realized,
      applyRestartScenario({ ...realized, time: 4 }, 'throw_in', {
        restartTeam: 'away',
        restartPoint: { x: 20, y: 0 },
      }),
    );
    expect(stopped.lastCard).toMatchObject({ kind: 'yellow', delayed: true, at: 4, foulAt: 0 });
    expect(stopped.pendingCards).toBeUndefined();
  });
  it('applies a delayed card when the advantage is recalled', () => {
    const { state, defender, attacker } = fixture();
    state.currentPressure = 0.4;
    const played = applyChallengeInfringement(
      state,
      foulContact(state, defender.id, attacker.id, { force: 5 }),
    );
    const recalled = advanceMatchRules(played, {
      ...played,
      time: 0.5,
      ball: { x: 22, y: 34, ownerId: defender.id },
    });
    expect(recalled.lastCard).toMatchObject({ kind: 'yellow', delayed: true });
    expect(recalled.defensiveTelemetry?.advantageRecalled).toBe(1);
  });
  it('a second-yellow dismissal occurs at the stoppage after advantage, preserving ten active players', () => {
    const { state, defender, attacker } = fixture();
    state.currentPressure = 0.4;
    state.discipline = { [defender.id]: { yellowCards: 1, sentOff: false, team: 'home' } };
    const played = applyChallengeInfringement(
      state,
      foulContact(state, defender.id, attacker.id, { force: 5 }),
    );
    expect(played.players.some((p) => p.id === defender.id)).toBe(true);
    expect(played.discipline![defender.id]!.yellowCards).toBe(1);
    expect(played.discipline![defender.id]).not.toHaveProperty('sentOffAt');
    const realized = advanceMatchRules(played, { ...played, time: 3.01 });
    expect(realized.players.some((p) => p.id === defender.id)).toBe(true);
    expect(realized.discipline![defender.id]).not.toHaveProperty('sentOffAt');
    const next = advanceMatchRules(
      realized,
      applyRestartScenario({ ...realized, time: 4 }, 'throw_in', {
        restartTeam: 'away',
        restartPoint: { x: 20, y: 0 },
      }),
    );
    expect(next.lastCard).toMatchObject({ kind: 'second_yellow_red', delayed: true, at: 4 });
    expect(next.discipline![defender.id]!.sentOffAt).toBe(4);
    expect(next.players.filter((p) => p.team === 'home')).toHaveLength(10);
    expect(next.statistics?.players.find((p) => p.playerId === defender.id)).toBeDefined();
    expect(next.defensiveTelemetry?.secondYellowDismissals).toBe(1);
    expect(next.pendingCards).toBeUndefined();
  });
  it('a later whistle explicitly closes the earlier advantage and shows its queued card once', () => {
    const { state, defender, attacker } = fixture();
    state.currentPressure = 0.4;
    const played = applyChallengeInfringement(
      state,
      foulContact(state, defender.id, attacker.id, { force: 5 }),
    );
    const later = { ...played, time: 0.5 };
    const another = applyChallengeInfringement(later, foulContact(later, defender.id, attacker.id));
    const stopped = advanceMatchRules(played, another);
    expect(stopped.lastAdvantage).toMatchObject({
      foulId: played.lastFoul!.id,
      outcome: 'recalled',
    });
    expect(stopped.defensiveTelemetry?.advantageRecalled).toBe(1);
    expect(stopped.discipline![defender.id]!.yellowCards).toBe(1);
    expect(stopped.pendingCards).toBeUndefined();
  });
  it('canonical tick entry points agree and bookkeeping passes the runtime schema', () => {
    const { state } = fixture('pr147-observer-parity');
    const normal = stepTacticalMatch(state, 0.025);
    const exactProbe = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    expect(exactProbe).toEqual(normal);
    expect(tacticalMatchStateSchema.safeParse(normal).success).toBe(true);
  });
  it('finishes a pending challenge at half time without carrying it into the second half', () => {
    const { state, defender, attacker } = fixture();
    state.time = 2699.99;
    let next = selected(state, defender.id, attacker.id, 'committed');
    // The accepted approach is bounded to 1.2 s and any resulting advantage to 3 s.
    for (let i = 0; i < 180 && next.status !== 'half_time'; i++)
      next = stepTacticalMatch(next, 0.025);
    expect(next.status).toBe('half_time');
    expect(next.defensiveChallenge).toBeUndefined();
    expect(next.lastChallenge).toBeDefined();
    expect(next.pendingAdvantage).toBeUndefined();
    expect(next.time).toBeGreaterThanOrEqual(state.time);
    expect(next.time).toBeGreaterThanOrEqual(next.lastChallenge!.at);
    if (next.lastCard) expect(next.time).toBeGreaterThanOrEqual(next.lastCard.at);
  });
  it('settles an existing advantage and delayed card at the canonical period stoppage', () => {
    const { state, defender, attacker } = fixture();
    state.time = 2699.8;
    state.currentPressure = 0.4;
    const played = applyChallengeInfringement(
      state,
      foulContact(state, defender.id, attacker.id, { force: 5 }),
    );
    expect(played.pendingAdvantage).toBeDefined();
    played.recentDuel = {
      participants: [defender.id, attacker.id],
      resolvedAt: state.time,
      expiresAt: state.time + 0.8,
      ballEpisode: state.ballEpisode ?? 0,
    };
    let next = played;
    for (let tick = 0; tick < 20 && next.status !== 'half_time'; tick++)
      next = stepTacticalMatch(next, 0.025);
    expect(next.status).toBe('half_time');
    expect(next.time).toBe(2700);
    expect(next.pendingAdvantage).toBeUndefined();
    expect(next.pendingCards).toBeUndefined();
    expect(next.lastAdvantage?.outcome).toBe('recalled');
    expect(next.lastCard).toMatchObject({ kind: 'yellow', delayed: true, at: 2700 });
    expect(next.lastAdvantage!.at).toBeLessThanOrEqual(next.time);
    expect(next.lastCard!.at).toBeLessThanOrEqual(next.time);
  });
  it('does not start a new advantage while the referee is finishing the period', () => {
    const { state, defender, attacker } = fixture();
    state.currentPressure = 0.4;
    state.periodEndPending = true;
    const next = applyChallengeInfringement(
      state,
      foulContact(state, defender.id, attacker.id, { force: 5 }),
    );
    expect(next.pendingAdvantage).toBeUndefined();
    expect(next.lastCard?.kind).toBe('yellow');
    expect(next.restart?.phase).toBe('setup');
  });
});
