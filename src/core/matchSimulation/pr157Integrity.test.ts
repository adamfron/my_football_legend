// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { RandomGenerator } from '../random/RandomGenerator';
import { createTacticalMatch, FIXED_MATCH_DT, stepTacticalMatch } from './matchSimulation';
import { enumerateCanonicalShootingOptions } from './shootingOptions';
import { resolveMatchAction } from './matchActions';
import { projectPlayerDecisionOpportunity } from './playerDecision';
import { distance } from './matchSpace';
import type { TacticalMatchState } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = (incoming: boolean, retainedLedger: boolean) => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr157:blocked-shot-ledger',
      control: { mode: 'spectator' },
    }),
  );
  state.time = 30;
  state.actionCooldown = 0;
  state.scenario = 'open_play';
  delete state.restart;
  const shooter = state.players.find(
    (player) => player.team === 'home' && player.slot.position === 'striker',
  )!;
  const passer = state.players.find(
    (player) => player.team === 'home' && player.id !== shooter.id,
  )!;
  for (const player of state.players) {
    player.position = { x: player.team === 'home' ? 20 : 40, y: 8 };
    player.target = { ...player.position };
    player.velocity = { x: 0, y: 0 };
  }
  shooter.position = { x: 91, y: 34 };
  shooter.target = { ...shooter.position };
  shooter.facingAngle = Math.PI / 2;
  state.ball = incoming
    ? {
        x: 90.7,
        y: 34,
        height: 0.11,
        from: { x: 83, y: 34 },
        target: { ...shooter.position },
        velocity: { x: 14, y: 0, z: 0 },
        lastTouchPlayerId: passer.id,
        travelKind: 'cross',
        sourceAction: 'cross',
        intendedReceiverId: shooter.id,
      }
    : { ...shooter.position, ownerId: shooter.id };
  state.possessionTeam = 'home';
  state.controlledFootballerId = shooter.id;
  state.playerAgencyEnabled = true;
  if (retainedLedger) {
    // Retention belongs to actual canonical transitions, never to a rejected proposal.
    state.actionEvents = [
      {
        id: 'previous-real-shot',
        sequence: 0,
        at: 0,
        kind: 'shot',
        actorId: shooter.id,
        team: 'home',
        position: { ...shooter.position },
        outcome: 'released',
        cause: 'human_selected',
      },
    ];
    state.actionEventSequence = 1;
  }
  const action = enumerateCanonicalShootingOptions(state, shooter.id)[0]!;
  expect(action).toBeDefined();
  return { state, action };
};
const withoutRequest = (state: TacticalMatchState) => {
  const { shotAgencyRequest: _request, ...football } = state;
  void _request;
  return football;
};

describe('PR157 rejected controlled shot proposals preserve football and RNG', () => {
  it.each([
    { incoming: false, retainedLedger: false },
    { incoming: true, retainedLedger: false },
    { incoming: false, retainedLedger: true },
    { incoming: true, retainedLedger: true },
  ])('incoming=$incoming retainedLedger=$retainedLedger', ({ incoming, retainedLedger }) => {
    const { state, action } = fixture(incoming, retainedLedger);
    const original = structuredClone(state);
    const random = vi.spyOn(RandomGenerator.prototype, 'float');
    try {
      for (const source of [
        'autonomous_npc',
        'autonomous_routine',
        'dev_ai_selected',
        'restart_liveness_watchdog',
      ] as const) {
        const blocked = resolveMatchAction(state, action, source);
        expect(withoutRequest(blocked)).toEqual(withoutRequest(state));
        expect(blocked.actionEvents).toBe(state.actionEvents);
        expect(blocked.actionEventSequence).toBe(state.actionEventSequence);
        expect(state).toEqual(original);
        expect(random).not.toHaveBeenCalled();
        const repeated = resolveMatchAction(blocked, action, source);
        expect(repeated).toEqual(blocked);
        expect(repeated.actionEvents).toBe(blocked.actionEvents);
        expect(random).not.toHaveBeenCalled();
      }
    } finally {
      random.mockRestore();
    }
  });

  it('a deliberately held controlled ball develops physical pressure and returns its next genuine choice', () => {
    const { state: initial, action } = fixture(false, false);
    const carrier = initial.players.find((player) => player.id === action.actorId)!;
    const defenders = initial.players.filter(
      (player) => player.team === 'away' && player.slot.position !== 'goalkeeper',
    );
    const presser = defenders[0]!;
    carrier.position = { x: 50, y: 34 };
    carrier.target = { ...carrier.position };
    initial.ball = { ...carrier.position, ownerId: carrier.id };
    presser.position = { x: 52.3, y: 34 };
    presser.target = { ...carrier.position };
    presser.facingAngle = -Math.PI / 2;
    presser.profile = {
      ...presser.profile,
      attributes: {
        ...presser.profile.attributes,
        aggression: 90,
        gameReading: 65,
        positioning: 65,
      },
    };
    defenders[1]!.position = { x: 60, y: 30 };
    defenders[2]!.position = { x: 65, y: 38 };
    initial.nearestChallengerId = presser.id;
    initial.currentPressure = 0.3;
    let state = resolveMatchAction(
      initial,
      { type: 'hold', actorId: carrier.id },
      'human_selected',
    );
    state.actionCooldown = 0;
    expect(projectPlayerDecisionOpportunity(state)).toBeUndefined();
    const origin = { ...presser.position };
    for (let tick = 0; tick < 160 && !projectPlayerDecisionOpportunity(state); tick += 1)
      state = stepTacticalMatch(state, FIXED_MATCH_DT);
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    expect(opportunity?.actorId).toBe(carrier.id);
    expect(opportunity?.triggerReason).toBe('possession_contested');
    expect(
      distance(state.players.find((player) => player.id === presser.id)!.position, origin),
    ).toBeGreaterThan(0.2);
    expect(state.humanPossessionEpisode?.actorId).toBe(carrier.id);
    expect(
      (state.actionEvents ?? []).filter(
        (event) =>
          event.actorId === carrier.id &&
          ['shot', 'pass', 'cross', 'through_pass'].includes(event.kind),
      ),
    ).toEqual([]);
    expect(state.ball.ownerId).toBe(carrier.id);
    expect(stepTacticalMatch(state, FIXED_MATCH_DT)).toBe(state);
  });
});
