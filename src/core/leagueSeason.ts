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

const scheduleDates = (startYear: number) => {
  const dates: string[] = [];
  const add = (start: string, count: number) => {
    const date = new Date(`${start}T00:00:00Z`);
    for (let i = 0; i < count; i++) {
      dates.push(date.toISOString().slice(0, 10));
      date.setUTCDate(date.getUTCDate() + 7);
    }
  };
  add(`${startYear}-08-29`, 11);
  add(`${startYear + 1}-03-06`, 11);
  return dates;
};

/** Circle-method schedule: every pair meets twice and swaps venue. */
export interface LeagueSeasonOptions {
  startYear?: number;
  controlledClubId?: string;
  controlledClubName?: string;
  professional?: boolean;
  professionalLevel?: number;
}
export const createLeagueSeason = (
  seed: string,
  options: LeagueSeasonOptions = {},
): LeagueSeason => {
  void seed;
  const startYear = options.startYear ?? 2026;
  const roundDates = scheduleDates(startYear);
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
        id: `league_${startYear}_${round + 1}_${i + 1}`,
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
        id: `league_${startYear}_${index + 12}_${i + 1}`,
        roundIndex: index + 11,
        date: roundDates[index + 11]!,
        homeClubId: fixture.awayClubId,
        awayClubId: fixture.homeClubId,
      })),
    }),
  );
  return {
    id: `${startYear}-${String(startYear + 1).slice(-2)}`,
    name: `${startYear}/${String(startYear + 1).slice(-2)}`,
    competition: options.professional
      ? {
          id: `polish-professional-${options.professionalLevel ?? 3}`,
          name:
            (options.professionalLevel ?? 3) <= 2
              ? 'Polska Liga Krajowa'
              : (options.professionalLevel ?? 3) === 3
                ? 'Polska Liga Regionalna'
                : 'Polska Liga Okręgowa',
          country: 'Polska',
          category: 'professional',
          tier: options.professionalLevel ?? 3,
        }
      : {
          id: 'polish-u17',
          name: 'Polska Liga U-17',
          country: 'Polska',
          category: 'youth',
          ageLevel: 'U17',
        },
    controlledClubId: options.controlledClubId ?? VISTULA_NOVA_ID,
    startDate: roundDates[0]!,
    endDate: `${startYear + 1}-05-31`,
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
    const controlled = [fixture.homeClubId, fixture.awayClubId].includes(season.controlledClubId);
    return controlled && knownVistulaResult
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
    getLeagueTable(next).find((row) => row.clubId === season.controlledClubId)?.position ?? 12;
  return {
    ...next,
    seasonOutcome: {
      finalPosition,
      champion: finalPosition === 1,
      competitionType: season.competition.category === 'youth' ? 'academy' : 'professional',
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
  const row = table.find((item) => item.clubId === career.leagueSeason?.controlledClubId);
  const season = career.leagueSeason;
  const controlledClubId = season?.controlledClubId ?? career.currentClub.id;
  const roundsRemaining = season ? season.rounds.length - season.currentRound : 22;
  const recent =
    season?.rounds
      .flatMap((r) => r.fixtures)
      .filter((f) => f.completed && [f.homeClubId, f.awayClubId].includes(controlledClubId))
      .slice(-5) ?? [];
  const wins = recent.filter((f) =>
    f.homeClubId === controlledClubId ? f.homeGoals! > f.awayGoals! : f.awayGoals! > f.homeGoals!,
  ).length;
  const winless = recent.filter((f) =>
    f.homeClubId === controlledClubId ? f.homeGoals! <= f.awayGoals! : f.awayGoals! <= f.homeGoals!,
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
