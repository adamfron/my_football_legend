import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../scripts/createCanonicalWorldDatabase';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { createTacticalMatch } from './matchSimulation/matchSimulation';
import { createSingleMatchSession } from './singleMatch';
import { createMatchFitness } from './matchSimulation/matchFitness';
import { careerStateSchema } from '../schemas/domainSchemas';
import {
  commitCanonicalMatchCondition,
  createCareerSingleMatchSession,
  recoverCareerFitnessToDate,
  recordSummaryAppearanceCondition,
} from './careerFitness';
import {
  emptyWorldDelta,
  resolveCareerWorldFootballer,
  createCareerWorldFootballerResolver,
} from './worldDatabase';
import { recoverFootballerCondition } from './fitnessRecovery';
import { getPlayerAvailability } from './playerAvailability';
import type { CareerState, MatchAppearance } from '../types/domain';

const world = createCanonicalWorldDatabase();
const seed = 'pr160-career-fitness';
const makeCareer = (): CareerState => {
  const profile = generateStartingPlayerProfile(
    {
      firstName: 'Jan',
      lastName: 'Test',
      nationality: 'PL',
      age: 16,
      dominantFoot: 'right',
      position: 'central_midfielder',
      heightCm: 178,
      weightKg: 72,
      seed,
    },
    seed,
    0,
  );
  return {
    ...createCareerState(profile, seed),
    currentDate: '2026-10-09',
    clubWorld: world.clubs,
    footballerWorld: world.footballers,
    worldDelta: emptyWorldDelta(),
  };
};
const match = () =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );

describe('PR160 canonical condition and existing career dates', () => {
  it('persists actual workload condition and outgoing minutes without changing attributes or unused bench', () => {
    const career = makeCareer();
    const state = match();
    const outgoing = state.players[1]!;
    const incoming = state.bench!.home[0]!;
    const player = { ...outgoing, fitness: createMatchFitness(62) };
    const final = {
      ...state,
      status: 'full_time' as const,
      time: 5500,
      players: state.players.filter((actor) => actor.id !== outgoing.id),
      departedPlayers: [player],
      statistics: {
        ...state.statistics!,
        players: state.statistics!.players.map((entry) => ({
          ...entry,
          minutesPlayed: entry.playerId === outgoing.id ? 27.5 : 90,
        })),
      },
    };
    const result = commitCanonicalMatchCondition(career, final, '2026-10-09', 'fixture-160');
    expect(result.worldDelta!.footballerConditionOverrides![outgoing.id]).toMatchObject({
      capacity: 62,
      lastAppearanceMinutes: 27.5,
      source: 'canonical',
    });
    expect(result.worldDelta!.footballerConditionOverrides![incoming.id]).toBeUndefined();
    expect(result.footballerWorld![outgoing.id]!.profile.attributes).toEqual(
      career.footballerWorld![outgoing.id]!.profile.attributes,
    );
    expect(commitCanonicalMatchCondition(result, final, '2026-10-09', 'fixture-160')).toEqual(
      result,
    );
    expect(careerStateSchema.safeParse(result).success).toBe(true);
  });

  it('both world resolvers expose insufficient rest and an adapter uses it at the next kickoff', () => {
    let career = makeCareer();
    const state = match();
    const id = state.players[1]!.id;
    career = {
      ...career,
      worldDelta: {
        ...career.worldDelta!,
        footballerConditionOverrides: {
          [id]: {
            capacity: 62,
            lastUpdatedDate: '2026-10-09',
            lastAppearanceDate: '2026-10-09',
            lastMatchId: 'one',
            source: 'canonical',
          },
        },
      },
    };
    const atDate = { ...career, currentDate: '2026-10-10' };
    const resolved = resolveCareerWorldFootballer(atDate, id)!;
    expect(resolved.fitness).toBeGreaterThan(62);
    expect(resolved.fitness).toBeLessThan(100);
    expect(createCareerWorldFootballerResolver(atDate)(id)).toEqual(resolved);
    const session = createCareerSingleMatchSession(
      career,
      world,
      {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed: 'next',
        control: { mode: 'spectator' },
      },
      '2026-10-10',
    );
    const selected = [...session.home.players, ...(session.home.bench ?? [])].find(
      (player) => player.footballerId === id,
    );
    if (selected) expect(selected.condition).toBeCloseTo(resolved.fitness!);
    const afterRest = resolveCareerWorldFootballer(
      { ...career, currentDate: '2026-10-14' },
      id,
    )!.fitness!;
    expect(afterRest).toBeGreaterThan(resolved.fitness!);
  });

  it('recovery is deterministic, date-driven and idempotent within the same day', () => {
    const career = makeCareer();
    const used = { ...career, player: { ...career.player, fitness: 55 } };
    const start = recoverCareerFitnessToDate(used, '2026-10-09');
    expect(recoverCareerFitnessToDate(start, '2026-10-09')).toEqual(start);
    const one = recoverCareerFitnessToDate(start, '2026-10-10');
    const three = recoverCareerFitnessToDate(start, '2026-10-12');
    expect(one.player.fitness).toBeGreaterThan(55);
    expect(one.player.fitness).toBeLessThan(three.player.fitness);
    expect(recoverCareerFitnessToDate(start, '2026-10-10')).toEqual(one);
  });

  it('injury restricts date recovery and eligibility until its canonical return date', () => {
    const career = makeCareer();
    const condition = {
      capacity: 55,
      lastUpdatedDate: '2026-10-09',
      injuryUntilDate: '2026-10-12',
      injuryStatus: 'absence' as const,
    };
    const injured = {
      ...career,
      worldDelta: {
        ...career.worldDelta!,
        footballerConditionOverrides: { [career.player.id]: condition },
      },
    };
    expect(getPlayerAvailability(injured, '2026-10-10').available).toBe(false);
    expect(getPlayerAvailability(injured, '2026-10-12').available).toBe(true);
    const restricted = recoverFootballerCondition(condition, '2026-10-10', 60);
    const normal = recoverFootballerCondition(
      { capacity: 55, lastUpdatedDate: '2026-10-09' },
      '2026-10-10',
      60,
    );
    expect(restricted.capacity).toBeLessThan(normal.capacity);
  });

  it('a short appearance spends less than a full one; a bench nonappearance spends nothing', () => {
    const career = makeCareer();
    const appearance: MatchAppearance = {
      matchId: 'summary',
      date: '2026-10-09',
      opponentId: 'opponent',
      teamLevel: 'senior',
      started: true,
      minutes: 90,
      goals: 0,
      assists: 0,
      xG: 0,
      xA: 0,
      keyPasses: 1,
      defensiveActions: 2,
      saves: 0,
      personalImpact: 0,
    };
    const full = recordSummaryAppearanceCondition(career, appearance);
    const short = recordSummaryAppearanceCondition(career, { ...appearance, minutes: 20 });
    const bench = recordSummaryAppearanceCondition(career, {
      ...appearance,
      started: false,
      minutes: 0,
    });
    expect(full.player.fitness).toBeLessThan(short.player.fitness);
    expect(bench.player.fitness).toBe(career.player.fitness);
    expect(full.worldDelta!.footballerConditionOverrides![career.player.id]!.source).toBe(
      'summary',
    );
    expect(recordSummaryAppearanceCondition(full, appearance)).toEqual(full);
  });
});
