// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import {
  beginDefensiveChallenge,
  chooseNpcDefensiveChallengeAction,
  defensiveTelemetrySchema,
  resolveDefensiveChallenge,
  type DefensiveTechnique,
} from './defensiveChallenges';
import { advanceMatchRules, applyChallengeInfringement, classifyChallengeFoul } from './matchRules';

const world = createCanonicalWorldDatabase();
const base = createTacticalMatch(
  createSingleMatchSession(world, {
    homeClubId: world.clubs[0]!.id,
    awayClubId: world.clubs[1]!.id,
    seed: 'pr152-discipline',
    control: { mode: 'spectator' },
  }),
);
const fixture = (seed: string, skill = 65) => {
  const state = structuredClone(base);
  state.seed = seed;
  state.players.forEach((player) => {
    player.position = { x: player.team === 'home' ? 90 : 100, y: 62 };
    player.target = { ...player.position };
    player.velocity = { x: 0, y: 0 };
  });
  const defender = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  const attacker = state.players.find(
    (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
  )!;
  defender.position = { x: 51, y: 34 };
  defender.target = { ...defender.position };
  defender.anchor = { x: 40, y: 34 };
  defender.facingAngle = Math.PI / 2;
  defender.profile.attributes = {
    ...defender.profile.attributes,
    tackling: skill,
    gameReading: skill,
    positioning: skill,
    strength: skill,
    aggression: 95,
    composure: 35,
  };
  attacker.position = { x: 52.2, y: 34 };
  attacker.target = { ...attacker.position };
  attacker.facingAngle = -Math.PI / 2;
  attacker.profile.attributes = {
    ...attacker.profile.attributes,
    dribbling: 65,
    technique: 65,
    agility: 65,
    composure: 65,
  };
  state.ball = { x: 51.7, y: 34, ownerId: attacker.id, lastTouchPlayerId: attacker.id };
  state.possessionTeam = attacker.team;
  state.currentPressure = 1;
  state.teams.away.phase = 'positional_attack';
  return { state, defender, attacker };
};
const attempt = (
  input: ReturnType<typeof fixture>,
  technique: DefensiveTechnique,
  source: 'human_selected' | 'autonomous_npc' = 'human_selected',
) => {
  const { state, defender, attacker } = input;
  const begun = beginDefensiveChallenge(
    state,
    { type: 'challenge', actorId: defender.id, opponentId: attacker.id, technique },
    source,
  );
  expect(begun.defensiveChallenge).toBeDefined();
  const result = resolveDefensiveChallenge({ ...begun, time: state.time + 0.2 });
  expect(result.diagnostic).toBeDefined();
  return {
    ...result,
    foul: classifyChallengeFoul(result.state, result.diagnostic!),
  };
};
const population = (
  technique: DefensiveTechnique,
  setup: (f: ReturnType<typeof fixture>) => void,
) =>
  Array.from({ length: 512 }, (_, index) => {
    const f = fixture(`pr152-discipline-population:${index}`);
    setup(f);
    return attempt(f, technique);
  });

describe('PR152 contact, foul, severity and card distributions', () => {
  it('keeps ordinary standing challenges low risk across seeds while preserving accidental fouls', () => {
    const results = population('standing', () => {});
    const fouls = results.filter((result) => result.foul);
    const failed = results.filter((result) => result.diagnostic?.outcome === 'beaten');
    expect(fouls.length).toBeGreaterThan(0);
    expect(fouls.length / results.length).toBeLessThan(0.04);
    expect(fouls.every((result) => result.foul?.severity === 'ordinary')).toBe(true);
    expect(fouls.every((result) => result.foul?.card === 'none')).toBe(true);
    expect(failed.length).toBeGreaterThan(100);
    expect(results.some((result) => result.diagnostic?.outcome === 'clean_win')).toBe(true);
    for (const result of results)
      expect(result.diagnostic!.outcome === 'foul').toBe(Boolean(result.foul));
  });

  it('does not infer a foul or reckless contact from a slow poke missing an inaccessible ball', () => {
    const results = population('standing', ({ state }) => {
      state.ball.x = 53.2;
    });
    expect(results.every((result) => result.diagnostic?.opponentContact)).toBe(true);
    expect(results.every((result) => result.diagnostic?.ballReachable === false)).toBe(true);
    expect(results.every((result) => result.diagnostic?.outcome === 'missed')).toBe(true);
    expect(results.every((result) => !result.foul)).toBe(true);
  });

  it('preserves greater risk for rear committed/sliding contact while skilled exposed-ball attempts can be clean', () => {
    const cleanCommitted = population('committed', ({ defender, attacker }) => {
      defender.velocity.x = 2;
      attacker.velocity.x = -2;
    });
    const cleanSlides = population('slide', ({ state, defender, attacker }) => {
      defender.velocity.x = 3;
      attacker.velocity.x = -2;
      // Advanced danger enables the slide; one covering defender excludes DOGSO.
      defender.position.x = 23;
      defender.target.x = 23;
      attacker.position.x = 24.5;
      state.ball.x = 24;
      state.players.find(
        (player) =>
          player.team === defender.team &&
          player.id !== defender.id &&
          player.profile.primaryPosition !== 'goalkeeper',
      )!.position = { x: 20, y: 36 };
    });
    const rearCommitted = population('committed', ({ defender, attacker }) => {
      attacker.facingAngle = Math.PI / 2;
      defender.velocity.x = 4;
      attacker.velocity.x = -3;
    });
    const rearSlides = population('slide', ({ state, defender, attacker }) => {
      defender.position.x = 23;
      defender.target.x = 23;
      attacker.position.x = 24.2;
      attacker.facingAngle = Math.PI / 2;
      defender.velocity.x = 4;
      attacker.velocity.x = -3;
      state.ball.x = 23.9;
    });
    expect(cleanCommitted.filter((result) => result.foul).length / 512).toBeLessThan(0.05);
    expect(cleanSlides.filter((result) => result.foul).length / 512).toBeLessThan(0.05);
    expect(cleanCommitted.some((result) => result.diagnostic?.ballFirst)).toBe(true);
    expect(cleanSlides.some((result) => result.diagnostic?.outcome === 'clean_win')).toBe(true);
    expect(rearCommitted.every((result) => result.foul?.card === 'yellow')).toBe(true);
    expect(rearSlides.every((result) => result.foul?.card === 'red')).toBe(true);
  });

  it('attributes a standing yellow to genuine high-speed rear contact and still removes a second-yellow player', () => {
    const f = fixture('pr152-standing-second-yellow');
    f.attacker.facingAngle = Math.PI / 2;
    f.defender.velocity.x = 8;
    f.state.ball.x = 53;
    const first = attempt(f, 'standing');
    expect(first.foul).toMatchObject({
      severity: 'reckless',
      card: 'yellow',
      technique: 'standing',
    });
    let next = applyChallengeInfringement(first.state, first.diagnostic!);
    expect(next.lastCard?.kind).toBe('yellow');
    next = { ...next, time: 10, defensiveEpisodes: [] };
    delete next.recentDuel;
    delete next.restart;
    next.ball = { ...f.state.ball };
    next.players = structuredClone(f.state.players);
    const second = attempt(
      {
        state: next,
        defender: next.players.find((player) => player.id === f.defender.id)!,
        attacker: next.players.find((player) => player.id === f.attacker.id)!,
      },
      'standing',
    );
    next = applyChallengeInfringement(second.state, second.diagnostic!);
    expect(next.lastCard?.kind).toBe('second_yellow_red');
    expect(next.discipline?.[f.defender.id]?.sentOffAt).toBe(next.time);
    expect(next.players.some((player) => player.id === f.defender.id)).toBe(false);
    expect(next.defensiveTelemetry?.byTechnique?.standing).toMatchObject({
      attempted: 2,
      fouls: 2,
      yellowCards: 2,
      redCards: 1,
      secondYellowDismissals: 1,
    });
    expect(defensiveTelemetrySchema.safeParse(next.defensiveTelemetry).success).toBe(true);
  });
});

describe('PR152 autonomous intent selection and canonical discipline accounting', () => {
  it('contains unavailable balls instead of selecting early risky commitments across skills, speeds and seeds', () => {
    for (const skill of [50, 70, 90])
      for (const speed of [0, 2, 5])
        for (let seed = 0; seed < 24; seed++) {
          const { state, defender, attacker } = fixture(`pr152-risk-window:${seed}`, skill);
          defender.position.x = 22;
          attacker.position.x = 23.8;
          defender.velocity.x = speed;
          attacker.velocity.x = -speed;
          state.ball.x = 24.2;
          state.teams.away.phase = 'attacking_transition';
          expect(chooseNpcDefensiveChallengeAction(state, defender.id)).toBeUndefined();
          state.controlledFootballerId = defender.id;
          state.playerAgencyEnabled = false;
          expect(chooseNpcDefensiveChallengeAction(state, defender.id)).toBeUndefined();
        }
  });

  it('keeps the original technique on a booking delayed until a later stoppage', () => {
    const f = fixture('pr152-delayed-technique');
    f.defender.position.x = 32;
    f.attacker.position.x = 33.2;
    f.state.ball.x = 32.7;
    f.state.teams.away.phase = 'attacking_transition';
    f.state.currentPressure = 0.4;
    const result = attempt(f, 'tactical');
    const advantage = applyChallengeInfringement(result.state, result.diagnostic!);
    expect(advantage.pendingCards?.[0]?.technique).toBe('tactical');
    const after = advanceMatchRules(advantage, {
      ...advantage,
      time: 1,
      status: 'half_time',
      lastChallenge: { ...result.diagnostic!, id: 'later-standing', technique: 'standing' },
    });
    expect(after.lastCard).toMatchObject({ kind: 'yellow', delayed: true });
    expect(after.defensiveTelemetry?.byTechnique?.tactical).toMatchObject({
      attempted: 1,
      fouls: 1,
      yellowCards: 1,
    });
    expect(after.defensiveTelemetry?.byTechnique?.standing).toBeUndefined();
  });
});
