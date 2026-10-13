import { z } from 'zod';
import type { CareerState } from '../types/domain';
import { compactMatchParticipantSchema } from './careerMatchSummary';

const disciplinarySummary = z.object({
  fixture: z.object({
    seasonId: z.string(),
    date: z.string(),
    homeClubId: z.string(),
    awayClubId: z.string(),
  }),
  participants: z.array(
    z.union([
      z.object({
        id: z.string(),
        team: z.enum(['home', 'away']),
        yellowCards: z.number().int().nonnegative(),
        redCards: z.number().int().nonnegative(),
      }),
      compactMatchParticipantSchema.transform(([id, team, , , , , yellowCards, redCards]) => ({
        id,
        team,
        yellowCards,
        redCards,
      })),
    ]),
  ),
  cards: z
    .array(z.object({ actorId: z.string(), kind: z.enum(['yellow', 'second_yellow_red', 'red']) }))
    .optional(),
});

/** Existing career discipline rules (four yellows, one second-yellow/three direct-red fixtures)
 * projected from permanent receipts. Scheduled club fixtures serve bans even when simulated. */
export const suspendedCareerFootballers = (career: CareerState, date: string): Set<string> => {
  const league = career.leagueSeason;
  if (!league) return new Set();
  const states = new Map<
    string,
    { yellows: number; remaining: number; clubId: string; lastDate: string }
  >();
  const fixtures = league.rounds.flatMap((round) => round.fixtures);
  const served = (clubId: string, after: string, before: string) =>
    fixtures.filter(
      (f) => f.date > after && f.date < before && [f.homeClubId, f.awayClubId].includes(clubId),
    ).length;
  for (const fact of career.historyFacts
    .filter((f) => f.factType === 'canonical_match_result' && f.date < date)
    .sort((a, b) => a.date.localeCompare(b.date))) {
    const parsed = disciplinarySummary.safeParse(fact.data.summary);
    if (!parsed.success || parsed.data.fixture.seasonId !== league.id) continue;
    const summary = parsed.data;
    for (const p of summary.participants) {
      const prior = states.get(p.id) ?? {
        yellows: 0,
        remaining: 0,
        clubId: summary.fixture[`${p.team}ClubId`],
        lastDate: summary.fixture.date,
      };
      const direct = summary.cards?.some((card) => card.actorId === p.id && card.kind === 'red');
      const newBan = p.redCards
        ? direct
          ? 3
          : 1
        : Math.floor((prior.yellows + p.yellowCards) / 4) - Math.floor(prior.yellows / 4);
      states.set(p.id, {
        yellows: prior.yellows + p.yellowCards,
        remaining:
          Math.max(
            0,
            prior.remaining - served(prior.clubId, prior.lastDate, summary.fixture.date),
          ) + newBan,
        clubId: summary.fixture[`${p.team}ClubId`],
        lastDate: summary.fixture.date,
      });
    }
  }
  return new Set(
    [...states]
      .filter(([, p]) => p.remaining > served(p.clubId, p.lastDate, date))
      .map(([id]) => id),
  );
};
