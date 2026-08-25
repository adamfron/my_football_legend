import type {
  CareerState,
  Fixture,
  LeagueClubProfile,
  LeagueFixture,
  LeagueSeason,
  LeagueTableRow,
  MatchImportance,
} from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';

export const VISTULA_NOVA_ID = 'club_vistula_nova';
const clubSeeds: Array<[string, string, number, number, number]> = [
  [VISTULA_NOVA_ID, 'Vistula Nova', 56, 57, 55],
  ['club_orkan_brzeziny', 'Orkan Brzeziny', 52, 50, 54],
  ['club_pogon_zurawie', 'Pogoń Żurawie', 58, 60, 56],
  ['club_gryf_legi', 'Gryf Łęgi', 49, 48, 51],
  ['club_unia_zalesie', 'Unia Zalesie', 55, 54, 56],
  ['club_blekitni_port', 'Błękitni Port', 62, 64, 60],
  ['club_sparta_mokre', 'Sparta Mokre', 47, 49, 46],
  ['club_mazur_cichy', 'Mazur Cichy', 51, 52, 50],
  ['club_victoria_polana', 'Victoria Polana', 59, 58, 61],
  ['club_wicher_debice', 'Wicher Dębice', 54, 57, 51],
  ['club_orzel_lany', 'Orzeł Łany', 46, 45, 48],
  ['club_start_brzezina', 'Start Brzezina', 50, 53, 47],
];

const roundDates = [
  '2026-09-05',
  '2026-09-12',
  '2026-09-19',
  '2026-09-26',
  '2026-10-03',
  '2026-10-10',
  '2026-10-17',
  '2026-10-24',
  '2026-10-31',
  '2026-11-07',
  '2026-11-14',
  '2027-03-06',
  '2027-03-13',
  '2027-03-20',
  '2027-03-27',
  '2027-04-03',
  '2027-04-10',
  '2027-04-17',
  '2027-04-24',
  '2027-05-01',
  '2027-05-08',
  '2027-05-15',
];

/** Circle-method schedule: every pair meets twice and swaps venue. */
export const createLeagueSeason = (seed: string): LeagueSeason => {
  void seed;
  const clubs: LeagueClubProfile[] = clubSeeds.map(
    ([clubId, name, strength, attackStrength, defenseStrength]) => ({
      clubId,
      name,
      strength,
      attackStrength,
      defenseStrength,
      form: 0,
    }),
  );
  const ids = clubs.map((club) => club.clubId);
  let rotation = [...ids];
  const firstHalf: LeagueFixture[][] = [];
  for (let round = 0; round < ids.length - 1; round++) {
    const fixtures: LeagueFixture[] = [];
    for (let i = 0; i < ids.length / 2; i++) {
      const a = rotation[i]!;
      const b = rotation[ids.length - 1 - i]!;
      const swap = (round + i) % 2 === 1;
      fixtures.push({
        id: `league_2026_${round + 1}_${i + 1}`,
        roundIndex: round,
        date: roundDates[round]!,
        homeClubId: swap ? b : a,
        awayClubId: swap ? a : b,
        completed: false,
      });
    }
    firstHalf.push(fixtures);
    rotation = [rotation[0]!, rotation.at(-1)!, ...rotation.slice(1, -1)];
  }
  const rounds = firstHalf.map((fixtures, index) => ({
    index,
    date: roundDates[index]!,
    fixtures,
    completed: false,
  }));
  firstHalf.forEach((fixtures, index) =>
    rounds.push({
      index: index + 11,
      date: roundDates[index + 11]!,
      completed: false,
      fixtures: fixtures.map((fixture, i) => ({
        ...fixture,
        id: `league_2026_${index + 12}_${i + 1}`,
        roundIndex: index + 11,
        date: roundDates[index + 11]!,
        homeClubId: fixture.awayClubId,
        awayClubId: fixture.homeClubId,
      })),
    }),
  );
  return {
    id: '2026-27',
    name: 'Liga regionalna 2026/27',
    startDate: roundDates[0]!,
    endDate: '2027-05-31',
    clubIds: ids,
    clubs,
    rounds,
    currentRound: 0,
    completed: false,
  };
};

export const simulateLeagueFixture = (
  season: LeagueSeason,
  fixture: LeagueFixture,
  seed: string,
): LeagueFixture => {
  if (fixture.completed) return fixture;
  const home = season.clubs.find((club) => club.clubId === fixture.homeClubId)!;
  const away = season.clubs.find((club) => club.clubId === fixture.awayClubId)!;
  const rng = RandomGenerator.fromSeed(`${seed}:league:${fixture.id}`);
  const homeEdge =
    4 +
    (home.strength - away.strength) * 0.35 +
    (home.attackStrength - away.defenseStrength) * 0.28 +
    home.form -
    away.form;
  const awayEdge =
    (away.attackStrength - home.defenseStrength) * 0.28 +
    (away.strength - home.strength) * 0.25 +
    away.form -
    home.form;
  const goals = (edge: number) =>
    Math.max(0, Math.min(5, Math.floor(0.45 + rng.float() * 2.35 + edge / 24)));
  return { ...fixture, homeGoals: goals(homeEdge), awayGoals: goals(awayEdge), completed: true };
};

export interface KnownVistulaResult {
  homeGoals: number;
  awayGoals: number;
  playerAppearanceMatchId?: string;
}

/** The only operation which settles a senior league round. It is idempotent. */
export const settleLeagueRound = (
  career: CareerState,
  roundIndex: number,
  knownVistulaResult?: KnownVistulaResult,
): CareerState => {
  const season = career.leagueSeason;
  const round = season?.rounds[roundIndex];
  if (!season || !round || round.completed) return career;
  const fixtures = round.fixtures.map((fixture) => {
    if (fixture.completed) return fixture;
    const vistula = [fixture.homeClubId, fixture.awayClubId].includes(VISTULA_NOVA_ID);
    return vistula && knownVistulaResult
      ? { ...fixture, ...knownVistulaResult, completed: true }
      : simulateLeagueFixture(season, fixture, career.seed);
  });
  const rounds = season.rounds.map((item, index) =>
    index === roundIndex ? { ...item, fixtures, completed: true } : item,
  );
  const currentRound = rounds.findIndex((item) => !item.completed);
  const next = {
    ...career,
    leagueSeason: {
      ...season,
      rounds,
      currentRound: currentRound < 0 ? rounds.length : currentRound,
      completed: rounds.every((item) => item.completed),
    },
  };
  if (!next.leagueSeason.completed) return next;
  const finalPosition =
    getLeagueTable(next).find((row) => row.clubId === VISTULA_NOVA_ID)?.position ?? 12;
  return {
    ...next,
    seasonOutcome: {
      finalPosition,
      champion: finalPosition === 1,
      competitionType: 'academy',
    },
  };
};

export const getLeagueTable = (career: Pick<CareerState, 'leagueSeason'>): LeagueTableRow[] => {
  const season = career.leagueSeason;
  if (!season) return [];
  const rows = new Map(
    season.clubs.map((club) => [
      club.clubId,
      {
        position: 0,
        clubId: club.clubId,
        clubName: club.name,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      },
    ]),
  );
  season.rounds
    .flatMap((round) => round.fixtures)
    .filter((fixture) => fixture.completed)
    .forEach((fixture) => {
      const home = rows.get(fixture.homeClubId)!;
      const away = rows.get(fixture.awayClubId)!;
      const hg = fixture.homeGoals ?? 0;
      const ag = fixture.awayGoals ?? 0;
      home.played++;
      away.played++;
      home.goalsFor += hg;
      home.goalsAgainst += ag;
      away.goalsFor += ag;
      away.goalsAgainst += hg;
      if (hg > ag) {
        home.won++;
        away.lost++;
        home.points += 3;
      } else if (hg < ag) {
        away.won++;
        home.lost++;
        away.points += 3;
      } else {
        home.drawn++;
        away.drawn++;
        home.points++;
        away.points++;
      }
    });
  return [...rows.values()]
    .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.clubId.localeCompare(b.clubId),
    )
    .map((row, index) => ({ ...row, position: index + 1 }));
};

export const getSeasonContext = (career: CareerState) => {
  const table = getLeagueTable(career);
  const row = table.find((item) => item.clubId === VISTULA_NOVA_ID);
  const season = career.leagueSeason;
  const roundsRemaining = season ? season.rounds.length - season.currentRound : 22;
  const recent =
    season?.rounds
      .flatMap((r) => r.fixtures)
      .filter((f) => f.completed && [f.homeClubId, f.awayClubId].includes(VISTULA_NOVA_ID))
      .slice(-5) ?? [];
  const wins = recent.filter((f) =>
    f.homeClubId === VISTULA_NOVA_ID ? f.homeGoals! > f.awayGoals! : f.awayGoals! > f.homeGoals!,
  ).length;
  const winless = recent.filter((f) =>
    f.homeClubId === VISTULA_NOVA_ID ? f.homeGoals! <= f.awayGoals! : f.awayGoals! <= f.homeGoals!,
  ).length;
  return {
    position: row?.position ?? 1,
    points: row?.points ?? 0,
    roundsRemaining,
    band: (row && row.position <= 3
      ? 'top'
      : row && row.position >= 10
        ? 'trouble'
        : 'mid_table') as 'top' | 'mid_table' | 'trouble',
    winningStreak: recent.length >= 3 && wins === recent.length,
    winlessStreak: recent.length >= 3 && winless === recent.length,
  };
};

export const evaluateMatchImportance = (
  career: CareerState,
  fixture: Fixture,
  expected?: { teamLevel: 'senior' | 'academy'; started: boolean; willPlay: boolean },
): MatchImportance => {
  const senior = (career.matchHistory ?? []).filter(
    (match) => match.teamLevel === 'senior' && match.minutes > 0,
  );
  const priorInteractive = career.historyFacts.filter(
    (fact) => fact.factType === 'interactive_match',
  ).length;
  if (!senior.length && expected?.teamLevel === 'senior' && expected.willPlay) return 'major';
  if (
    !senior.some((match) => match.started) &&
    expected?.teamLevel === 'senior' &&
    expected.started
  )
    return 'notable';
  const context = getSeasonContext(career);
  if (context.roundsRemaining <= 3 && (context.position <= 3 || context.position >= 10))
    return priorInteractive < 5 ? 'major' : 'notable';
  if (
    career.storyThreads.some(
      (thread) => thread.status === 'open' && thread.importance >= 75 && thread.tension >= 65,
    )
  )
    return priorInteractive < 4 ? 'notable' : 'routine';
  return priorInteractive >= 4 ? 'routine' : fixture.matchImportance;
};
