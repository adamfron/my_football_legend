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
import { resolveMatchAction } from './matchActions';
import { advanceMatchRules, applyChallengeInfringement } from './matchRules';
import { applyRestartScenario } from './restartScenarios';
import { observePlayerMatchStats } from './playerMatchStats';
import type { ChallengeDiagnostic } from './defensiveChallenges';
import type { MatchAction, TacticalMatchState } from './matchState';
import { projectDebugEvents, snapshotMatchState } from '../../app/match/matchDebugCapture';

const world = createCanonicalWorldDatabase();
const fixture = (seed: string) => {
  const initial = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
  const shooter = initial.players.find(
    (p) => p.team === 'home' && p.profile.primaryPosition !== 'goalkeeper',
  )!;
  const defender = initial.players.find(
    (p) => p.team === 'away' && p.profile.primaryPosition !== 'goalkeeper',
  )!;
  const players = initial.players.map((p, index) => ({
    ...p,
    position: p.id === shooter.id ? { x: 82, y: 34 } : { x: 10 + index, y: 60 },
    target: p.id === shooter.id ? { x: 82, y: 34 } : { x: 10 + index, y: 60 },
    velocity: { x: 0, y: 0 },
    facingAngle: Math.PI / 2,
  }));
  const state: TacticalMatchState = {
    ...initial,
    time: 751.5,
    players,
    ball: { x: 82.4, y: 34, ownerId: shooter.id, lastTouchPlayerId: shooter.id },
    possessionTeam: 'home',
    currentPressure: 0.4,
    actionCooldown: 20,
    controlledFootballerId: shooter.id,
  };
  const shot: MatchAction = {
    type: 'shot',
    actorId: shooter.id,
    intent: 'driven',
    contact: 'settled',
    target: { x: 105, y: 34 },
    goalTarget: { horizontal: 0, vertical: 0.24 },
  };
  const contact: ChallengeDiagnostic = {
    id: `${seed}:physical-foul`,
    at: state.time,
    actorId: defender.id,
    team: 'away',
    opponentId: shooter.id,
    technique: 'standing',
    source: 'autonomous_npc',
    position: { x: 82, y: 34 },
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
  };
  return { state, shooter, defender, shot, contact };
};

const shots = (state: TacticalMatchState) =>
  state.statistics!.players.reduce((sum, p) => sum + p.shots, 0);

describe('PR158 shot, foul and DEV restart provenance', () => {
  it('preserves a physically released human shot during valid advantage after a later DEV restart', () => {
    const { state, shooter, shot, contact } = fixture('pr158-valid-advantage-shot');
    const played = applyChallengeInfringement(state, contact);
    expect(played.lastAdvantage?.outcome).toBe('played');
    const released = resolveMatchAction({ ...played, time: 752.05 }, shot, 'human_selected');
    expect(released.ball.shot?.releasedAt).toBe(752.05);
    expect(released.currentActionSource).toBe('human_selected');
    let settled = advanceMatchRules(played, released);
    expect(settled.lastAdvantage?.outcome).toBe('realized');
    expect(settled.pendingAdvantage).toBeUndefined();
    settled = {
      ...settled,
      statistics: observePlayerMatchStats(state.statistics!, played, settled),
    };
    for (let tick = 0; !settled.lastShot?.outcome && tick < 160; tick++)
      settled = stepTacticalMatchAfterDecisionProbe(settled, FIXED_MATCH_DT);
    expect(settled.lastShot?.shooterId).toBe(shooter.id);
    expect(settled.lastShot?.outcome).toBeDefined();
    expect(shots(settled)).toBe(1);
    const before = structuredClone(settled);
    const injected = applyRestartScenario(settled, 'free_kick_wide', { restartTeam: 'home' });
    expect(injected.lastRestartAward?.cause).toBe('bookkeeping');
    expect(injected.lastAdvantage).toEqual(settled.lastAdvantage);
    expect(injected.lastShot).toEqual(settled.lastShot);
    const statistics = observePlayerMatchStats(settled.statistics!, settled, injected);
    expect(statistics.players.find((p) => p.playerId === shooter.id)?.shots).toBe(1);
    expect(statistics.observedShotIds).toHaveLength(1);
    expect(
      projectDebugEvents(snapshotMatchState(settled), snapshotMatchState(injected)),
    ).toContainEqual(
      expect.objectContaining({ type: 'scenario_changed', data: { scenario: 'free_kick_wide' } }),
    );
    expect(settled).toEqual(before);
  });

  it('recalls failed advantage to its actual foul point without inventing a shot', () => {
    const { state, defender, contact } = fixture('pr158-failed-advantage');
    const played = applyChallengeInfringement(state, contact);
    const recalled = advanceMatchRules(played, {
      ...played,
      time: state.time + 0.5,
      ball: { x: 82, y: 34, ownerId: defender.id },
    });
    expect(recalled.lastAdvantage?.outcome).toBe('recalled');
    expect(recalled.lastRestartAward?.cause).toBe('foul');
    expect(recalled.ball).toMatchObject({ x: contact.position.x, y: contact.position.y });
    expect(recalled.time).toBe(state.time + 0.5);
    expect(recalled.ball.shot).toBeUndefined();
    expect(recalled.lastShot).toBeUndefined();
    expect(shots(recalled)).toBe(0);
  });

  it('does not turn a pending shot request into a released shot after the canonical period whistle', () => {
    const { state, shot } = fixture('pr158-whistle-before-shot');
    const requested: TacticalMatchState = {
      ...state,
      time: 2699.99,
      status: 'first_half',
      shotAgencyRequest: shot,
    };
    const whistled = stepTacticalMatch(requested, FIXED_MATCH_DT);
    expect(whistled.status).toBe('half_time');
    expect(whistled.time).toBe(2700);
    expect(whistled.ball.shot).toBeUndefined();
    expect(whistled.lastShot).toBeUndefined();
    expect(whistled.shotAgencyRequest).toBeUndefined();
    expect(resolveMatchAction(whistled, shot, 'human_selected')).toBe(whistled);
    expect(shots(whistled)).toBe(0);
  });
});
