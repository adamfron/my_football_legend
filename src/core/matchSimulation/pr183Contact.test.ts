// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createFormationBenchmarkMatch } from './benchmarkFixtures';
import { beginDefensiveChallenge, resolveDefensiveChallenge } from './defensiveChallenges';
import { advanceBallAcquisition } from './ballAcquisition';

describe('PR183 physical touch versus established control', () => {
  it('leaves a stretched high-speed ball win loose and credits the touching defender', () => {
    const { state } = createFormationBenchmarkMatch({
      anchor: '4-3-3',
      opponent: '4-4-2',
      seed: 'pr183-stretch',
      attributes: 73,
    });
    delete state.restart;
    state.scenario = 'open_play';
    state.time = 600;
    const attacker = state.players.find((p) => p.team === 'home' && p.slot.position === 'striker')!;
    const defender = state.players.find(
      (p) => p.team === 'away' && p.slot.position === 'center_back',
    )!;
    for (const p of state.players) {
      p.position = { x: p.team === 'home' ? 20 : 60, y: 6 };
      p.velocity = { x: 0, y: 0 };
    }
    attacker.position = { x: 80, y: 34 };
    attacker.velocity = { x: 5, y: 0 };
    attacker.facingAngle = Math.PI / 2;
    defender.position = { x: 82, y: 34 };
    defender.velocity = { x: -2, y: 0 };
    defender.facingAngle = -Math.PI / 2;
    Object.assign(defender.profile.attributes, {
      tackling: 95,
      gameReading: 95,
      positioning: 95,
      strength: 95,
    });
    Object.assign(attacker.profile.attributes, {
      dribbling: 25,
      technique: 25,
      agility: 25,
      composure: 25,
    });
    state.possessionTeam = 'home';
    state.ball = {
      x: 80.5,
      y: 34,
      ownerId: attacker.id,
      lastTouchPlayerId: attacker.id,
      velocity: { x: 14, y: 0 },
    };
    const outcomes = Array.from({ length: 24 }, (_, i) => {
      const selected = beginDefensiveChallenge(
        { ...state, seed: `pr183-stretch:${i}` },
        { type: 'challenge', actorId: defender.id, opponentId: attacker.id, technique: 'slide' },
        'autonomous_npc',
      );
      expect(selected.defensiveChallenge).toBeDefined();
      return resolveDefensiveChallenge({ ...selected, time: state.time + 0.2 });
    });
    expect(outcomes.some((r) => r.diagnostic?.outcome === 'loose_ball')).toBe(true);
    expect(outcomes.some((r) => r.diagnostic?.outcome === 'clean_win')).toBe(false);
    for (const r of outcomes.filter((r) => r.diagnostic?.outcome === 'loose_ball')) {
      expect(r.state.ball.lastTouchPlayerId).toBe(defender.id);
      expect(r.looseVelocity).toBeDefined();
      expect(r.state.ball.ownerId).toBe(attacker.id); // Caller releases ownership through makeLoose.
    }
  });
  it('counts an opponent arriving during acquisition as a live contest', () => {
    const { state } = createFormationBenchmarkMatch({
      anchor: '4-3-3',
      opponent: '4-4-2',
      seed: 'pr183-arriving',
      attributes: 40,
    });
    delete state.restart;
    state.scenario = 'open_play';
    state.time = 600;
    const candidate = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'striker',
    )!;
    const rival = state.players.find(
      (p) => p.team === 'away' && p.slot.position === 'center_back',
    )!;
    for (const p of state.players) p.position = { x: 15, y: 6 };
    candidate.position = { x: 52, y: 34 };
    candidate.facingAngle = Math.PI / 2;
    state.ball = { x: 52.3, y: 34, velocity: { x: 1, y: 0 } };
    const prepared = advanceBallAcquisition(state, candidate, 2).state;
    expect(prepared.ballAcquisition?.opponentId).toBeUndefined();
    rival.position = { x: 52.6, y: 34 };
    rival.facingAngle = -Math.PI / 2;
    const atContact = { ...prepared, time: prepared.ballAcquisition!.readyAt };
    const results = Array.from({ length: 24 }, (_, i) =>
      advanceBallAcquisition(
        {
          ...atContact,
          ballAcquisition: { ...atContact.ballAcquisition!, id: `pr183-arriving:${i}` },
        },
        candidate,
        2,
      ),
    );
    expect(results.some((r) => r.failedVelocity)).toBe(true);
    expect(results.some((r) => r.securedPlayerId)).toBe(true);
    expect(
      results.filter((r) => r.securedPlayerId).every((r) => r.state.defensiveEpisodes?.length),
    ).toBe(true);
  });
});
