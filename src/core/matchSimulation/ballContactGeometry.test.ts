// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, stepTacticalMatch } from './matchSimulation';
import {
  advanceControlledBall,
  controlledBallContactSchema,
  deriveBallContactAccess,
  estimateCarrierContactWindow,
  playerContactGeometry,
} from './ballContactGeometry';
import { integrateGroundRolling } from './ballPhysics';
import {
  beginDefensiveChallenge,
  isDefensiveEpisodeLocked,
  resolveDefensiveChallenge,
} from './defensiveChallenges';
import { collectContactEvidence, projectControlEpisodes } from './contactEvidence';
import { distance } from './matchSpace';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr158-contact-regression',
      control: { mode: 'spectator' },
    }),
  );
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 600;
  state.actionCooldown = 20;
  state.players.forEach((p, i) => {
    p.position = {
      x: p.team === 'home' ? 20 - (i % 3) * 3 : 85 + (i % 3) * 3,
      y: 5 + (i % 10) * 5,
    };
    p.target = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  });
  const carrier = state.players.find(
    (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
  )!;
  const defender = state.players.find(
    (p) => p.team === 'away' && p.slot.position === 'center_back',
  )!;
  carrier.position = { x: 52, y: 34 };
  carrier.target = { x: 68, y: 34 };
  carrier.facingAngle = Math.PI / 2;
  for (const key of [
    'dribbling',
    'technique',
    'agility',
    'firstTouch',
    'composure',
    'strength',
  ] as const)
    carrier.profile.attributes[key] = 60;
  defender.position = { x: 58, y: 34 };
  defender.facingAngle = -Math.PI / 2;
  state.ball = { x: 52.45, y: 34, ownerId: carrier.id, lastTouchPlayerId: carrier.id };
  state.possessionTeam = 'home';
  state.ballOwnershipStartedAt = 600;
  state.ballCarrierIntent = {
    actorId: carrier.id,
    type: 'carry',
    target: { x: 68, y: 34 },
    localTarget: { x: 68, y: 34 },
    startPosition: { ...carrier.position },
    closestPointReached: { ...carrier.position },
    startedAt: 600,
    expiresAt: 620,
    estimatedArrival: 605,
    humanSelected: false,
    movementMode: 'dribble',
    executionMode: 'controlled',
    touchDistance: 0.72,
  };
  return { state, carrier, defender };
};

describe('PR158 finite physical ball contacts', () => {
  it('transforms foot regions in pitch metres consistently', () => {
    const { carrier } = fixture();
    const feet = playerContactGeometry(carrier);
    expect(feet.leftFoot.x).toBeCloseTo(52.2);
    expect(Math.abs(feet.leftFoot.y - feet.rightFoot.y)).toBeCloseTo(0.34);
    carrier.facingAngle = 0;
    const rotated = playerContactGeometry(carrier);
    expect(rotated.leftFoot.y).toBeCloseTo(34.2);
    expect(rotated.footReach).toBe(feet.footReach);
  });
  it('a body rotation between contacts cannot rotate or teleport a stationary ball', () => {
    const { state, carrier } = fixture();
    delete state.ballCarrierIntent;
    let next = advanceControlledBall(state, carrier, 0.025).state;
    const ball = next.ball;
    carrier.facingAngle += Math.PI;
    next.time += 0.025;
    const expected = integrateGroundRolling(ball, ball.velocity!, 0.025);
    next = advanceControlledBall(next, carrier, 0.025).state;
    expect(next.ball.x).toBeCloseTo(expected.position.x, 12);
    expect(next.ball.y).toBeCloseTo(expected.position.y, 12);
    expect(next.controlledBallContact?.physicalContacts).toBe(1);
    expect(distance(next.ball, carrier.position)).toBeLessThan(0.7);
  });
  it('unpressured moving control uses repeated physical contacts and one public control episode', () => {
    const { state: initial, carrier } = fixture();
    carrier.velocity = { x: 3, y: 0 };
    let state = initial;
    let episode;
    let publicTouches = 0;
    for (let tick = 0; tick < 200; tick++) {
      const previous = state;
      carrier.position = { x: carrier.position.x + 0.075, y: carrier.position.y };
      state = advanceControlledBall(state, carrier, 0.025).state;
      state = { ...state, time: state.time + 0.025 };
      const projected = projectControlEpisodes(
        previous,
        state,
        collectContactEvidence(previous, state),
        episode,
      );
      episode = projected.active;
      publicTouches += projected.started.length;
    }
    expect(state.ball.ownerId).toBe(carrier.id);
    expect(state.contactControlTelemetry!.physicalContacts).toBeGreaterThan(10);
    expect(publicTouches).toBe(1);
    expect(distance(state.ball, carrier.position)).toBeLessThan(1.1);
    expect(state.ball.x).toBeGreaterThan(65);
    expect(controlledBallContactSchema.safeParse(state.controlledBallContact).success).toBe(true);
  });
  it('Technique, Dribbling and Agility continuously shorten a difficult second-contact preparation', () => {
    for (const attribute of ['technique', 'dribbling', 'agility'] as const) {
      const { state, carrier } = fixture();
      const next = advanceControlledBall(state, carrier, 0.025).state;
      next.ballCarrierIntent = {
        ...next.ballCarrierIntent!,
        localTarget: { x: 42, y: 34 },
        target: { x: 42, y: 34 },
      };
      carrier.profile.attributes[attribute] = 20;
      const weak = estimateCarrierContactWindow(next, carrier);
      carrier.profile.attributes[attribute] = 95;
      const elite = estimateCarrierContactWindow(next, carrier);
      expect(weak.turnAngle).toBeGreaterThan(3);
      expect(elite.earliestContactAt).toBeLessThan(weak.earliestContactAt);
      expect(weak.difficulty).toBeGreaterThan(0.3);
    }
  });
  it('a next-contact plan misses a ball outside actual foot reach and creates recoverable loose control', () => {
    const { state, carrier } = fixture();
    state.ball = { ...state.ball, x: 54.5, velocity: { x: 1, y: 0 } };
    const result = advanceControlledBall(state, carrier, 0.025);
    expect(result.looseVelocity).toBeDefined();
    expect(result.state.contactControlTelemetry?.failedControls).toBe(1);
    expect(result.state.controlledBallContact).toBeUndefined();
    expect(result.state.ball.x).toBeGreaterThan(54.5);
  });
  it('a defender can legally intervene between two planned carrier contacts', () => {
    const { state, carrier, defender } = fixture();
    const next = advanceControlledBall(state, carrier, 0.025).state;
    next.time += 0.025;
    defender.position = { x: 53.15, y: 34 };
    defender.velocity = { x: 0, y: 0 };
    expect(next.controlledBallContact!.nextContact.earliestAt).toBeGreaterThan(next.time);
    expect(deriveBallContactAccess(next, defender, carrier).ballReachable).toBe(true);
    const outcomes = new Set<string>();
    for (let sample = 0; sample < 48; sample++) {
      const selected = beginDefensiveChallenge(
        { ...next, seed: `pr158-between:${sample}` },
        { type: 'challenge', actorId: defender.id, opponentId: carrier.id, technique: 'standing' },
        'human_selected',
      );
      outcomes.add(resolveDefensiveChallenge(selected).diagnostic!.outcome);
    }
    expect(outcomes.has('clean_win')).toBe(true);
    expect(outcomes.has('beaten')).toBe(true);
  });
  it('shielding depends on front, side and back access and the second defender has an independent opportunity', () => {
    const { state, carrier, defender } = fixture();
    state.ballCarrierIntent!.executionMode = 'shield';
    state.ball.x = 51.55;
    defender.position = { x: 53.1, y: 34 };
    const protectedAccess = deriveBallContactAccess(state, defender, carrier);
    expect(protectedAccess.bodyOccludes).toBe(true);
    expect(protectedAccess.shielding).toBeGreaterThan(0);
    expect(protectedAccess.ballReachable).toBe(false);
    const second = state.players.find((p) => p.team === defender.team && p.id !== defender.id)!;
    second.position = { x: 51, y: 34 };
    second.facingAngle = Math.PI / 2;
    expect(deriveBallContactAccess(state, second, carrier).ballReachable).toBe(true);
    expect(deriveBallContactAccess(state, second, carrier).shielding).toBe(0);
    defender.position = { x: 51.4, y: 34.6 };
    defender.facingAngle = Math.PI;
    expect(deriveBallContactAccess(state, defender, carrier).bodyOccludes).toBe(false);
    state.defensiveEpisodes = [
      {
        participants: [carrier.id, defender.id],
        ballEpisode: state.ballEpisode ?? 0,
        resolvedAt: state.time,
        position: { x: state.ball.x, y: state.ball.y },
      },
    ];
    expect(isDefensiveEpisodeLocked(state, defender.id, carrier.id)).toBe(true);
    expect(isDefensiveEpisodeLocked(state, second.id, carrier.id)).toBe(false);
  });
  it('a reachable ball on the rear side may be contacted without going through the torso', () => {
    const { state, carrier, defender } = fixture();
    state.ball.x = 51.45;
    defender.position = { x: 51, y: 34 };
    defender.facingAngle = Math.PI / 2;
    const result = resolveDefensiveChallenge(
      beginDefensiveChallenge(
        state,
        { type: 'challenge', actorId: defender.id, opponentId: carrier.id, technique: 'standing' },
        'human_selected',
      ),
    );
    expect(result.diagnostic?.fromBehind).toBe(true);
    expect(result.diagnostic?.bodyOccludes).toBe(false);
    expect(result.diagnostic?.ballReachable).toBe(true);
  });
  it('Strength resists actual protecting body contact and changes the ensuing physical touch trajectory', () => {
    const run = (strength: number) => {
      const { state: initial, carrier, defender } = fixture();
      carrier.profile.attributes.strength = strength;
      carrier.facingAngle = -Math.PI / 2;
      initial.ballCarrierIntent!.executionMode = 'shield';
      initial.ballCarrierIntent!.movementMode = 'retain';
      initial.ball = { ...initial.ball, x: 51.55, velocity: { x: 0, y: 2 } };
      defender.position = { x: 53, y: 34 };
      defender.velocity = { x: -2, y: 0 };
      let state = initial;
      for (let tick = 0; tick < 100; tick++) {
        state = advanceControlledBall(state, carrier, 0.025).state;
        state = { ...state, time: state.time + 0.025 };
      }
      return state;
    };
    const weak = run(20);
    const strong = run(95);
    expect(strong.controlledBallContact!.balance).toBeGreaterThan(
      weak.controlledBallContact!.balance + 0.1,
    );
    expect(strong.contactControlTelemetry!.physicalContacts).toBeGreaterThan(
      weak.contactControlTelemetry!.physicalContacts,
    );
    expect(distance(strong.ball, weak.ball)).toBeGreaterThan(0.001);
    const { state, carrier, defender } = fixture();
    state.ballCarrierIntent!.executionMode = 'shield';
    state.ball.x = 51.55;
    defender.position = { x: 51, y: 34 };
    defender.facingAngle = Math.PI / 2;
    carrier.profile.attributes.strength = 20;
    const exposedWeak = deriveBallContactAccess(state, defender, carrier);
    carrier.profile.attributes.strength = 95;
    expect(deriveBallContactAccess(state, defender, carrier).ballReachable).toBe(
      exposedWeak.ballReachable,
    );
  });
  it('identical selected standing/committed contacts preserve human/NPC source and controlled-identity physical parity', () => {
    for (const technique of ['standing', 'committed'] as const)
      for (const relativeSpeed of [0, 6])
        for (let sample = 0; sample < 16; sample++) {
          const { state, carrier, defender } = fixture();
          state.seed = `pr158-source-parity:${sample}`;
          defender.position = { x: 51, y: 34 };
          defender.facingAngle = Math.PI / 2;
          defender.velocity = { x: relativeSpeed, y: 0 };
          state.ball.x = 51.3;
          const action = {
            type: 'challenge' as const,
            actorId: defender.id,
            opponentId: carrier.id,
            technique,
          };
          let expected;
          for (const source of [
            'human_selected',
            'autonomous_npc',
            'autonomous_routine',
            'dev_ai_selected',
          ] as const)
            for (const controlled of [true, false]) {
              const identity = controlled
                ? { ...state, controlledFootballerId: defender.id }
                : { ...state };
              if (!controlled) delete identity.controlledFootballerId;
              const result = resolveDefensiveChallenge({
                ...beginDefensiveChallenge(identity, action, source),
                time: state.time + 0.2,
              });
              const { source: _source, ...physical } = result.diagnostic!;
              void _source;
              const outcome = {
                physical,
                looseVelocity: result.looseVelocity,
                ball: result.state.ball,
              };
              if (!expected) expected = outcome;
              else expect(outcome).toEqual(expected);
            }
        }
  });
  it('selected elite push-and-run creates genuine displacement through the canonical engine', () => {
    const { state: initial, carrier } = fixture();
    for (const attribute of ['technique', 'dribbling', 'agility', 'firstTouch'] as const)
      carrier.profile.attributes[attribute] = 95;
    initial.ballCarrierIntent!.movementMode = 'sprint';
    const origin = { ...carrier.position };
    let state = initial;
    for (let tick = 0; tick < 80 && state.ball.ownerId === carrier.id; tick++)
      state = stepTacticalMatch(state, 0.025);
    expect(
      distance(state.players.find((p) => p.id === carrier.id)!.position, origin),
    ).toBeGreaterThan(2);
    expect(state.contactControlTelemetry!.physicalContacts).toBeGreaterThan(1);
  });
  it('an elite two-contact rotation can keep control and escape through real displacement', () => {
    const { state: initial, carrier, defender } = fixture();
    initial.seed = 'pr158-contact-paired:0';
    for (const attribute of [
      'technique',
      'dribbling',
      'agility',
      'firstTouch',
      'composure',
    ] as const)
      carrier.profile.attributes[attribute] = 95;
    defender.position = { x: 55.5, y: 34 };
    defender.velocity = { x: -2, y: 0 };
    initial.ballCarrierIntent!.target = { x: 42, y: 34 };
    delete initial.ballCarrierIntent!.localTarget;
    const origin = { ...carrier.position };
    let state = initial;
    for (let tick = 0; tick < 120; tick++) {
      if (tick === 30 && state.ballCarrierIntent)
        state = {
          ...state,
          ballCarrierIntent: { ...state.ballCarrierIntent, target: { x: 64, y: 38 } },
        };
      state = stepTacticalMatch(state, 0.025);
    }
    expect(state.ball.ownerId).toBe(carrier.id);
    expect(state.contactControlTelemetry!.physicalContacts).toBeGreaterThanOrEqual(2);
    expect(
      distance(origin, state.players.find((p) => p.id === carrier.id)!.position),
    ).toBeGreaterThan(2);
    expect(state.contactControlTelemetry!.absoluteTurnRadians).toBeGreaterThan(Math.PI);
  });
  it('a low-skill turn can fail through the canonical pressure/contact lifecycle', () => {
    const { state: initial, carrier, defender } = fixture();
    initial.seed = 'pr158-contact-paired:0';
    for (const attribute of [
      'technique',
      'dribbling',
      'agility',
      'firstTouch',
      'composure',
    ] as const)
      carrier.profile.attributes[attribute] = 20;
    defender.position = { x: 55.5, y: 34 };
    defender.velocity = { x: -2, y: 0 };
    defender.profile.attributes.aggression = 85;
    initial.ballCarrierIntent!.target = { x: 42, y: 34 };
    delete initial.ballCarrierIntent!.localTarget;
    let state = initial;
    for (let tick = 0; tick < 240 && state.ball.ownerId === carrier.id && !state.restart; tick++)
      state = stepTacticalMatch(state, 0.025);
    expect(state.ball.ownerId !== carrier.id || Boolean(state.restart)).toBe(true);
    expect(state.contactControlTelemetry!.physicalContacts).toBeGreaterThan(0);
    expect(
      state.lastChallenge || state.pendingPossessionLoss || state.lastPossessionLoss,
    ).toBeDefined();
  });
});
