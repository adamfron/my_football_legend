// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createPr167Career, pr167World as world } from '../../scripts/pr167Fixtures';
import { evaluateCanonicalRating, participationEvidenceSchema } from './careerMatchPresentation';
import {
  buildCareerNews,
  buildSeasonNarrative,
  buildRetirementNarrative,
  getCareerStatistics,
  NEWS_VARIANTS,
} from './narrative/careerStories';
import {
  recordSeasonAchievements,
  recordParticipationMilestones,
  hasLevelMilestone,
  getDistinctCareerFacts,
} from './narrative/careerEvidence';
import { getFactPresentation } from './narrative/factPresentation';
import { getSeasonHonours } from './history/careerHistory';
import { createCompletedSeasonSnapshot } from './seasonArchive';
import {
  acceptProfessionalOffer,
  acceptSeasonEndRenegotiatedContract,
  validateProfessionalOfferAcceptance,
  continueOnExistingContract,
  retireCareer,
} from './careerSeasons';
import { generateSummerWindowOffers } from './professionalClubs';
import { advanceCareerFlow } from './careerFlow';
import { serializeCurrentCareerSave, parseCareerSave, hydrateCareerWithWorld } from './persistence';
import { presentSubstitutions } from './matchParticipationPresentation';
import { getSeasonGoalkeeperStats } from './seasonParticipation';
import { getCurrentFixture, advanceCareerWeek } from './careerWeeks';
import { simulateRoutinePlayerMatch } from './careerSimulation';
import { settleLeagueRound } from './leagueSeason';
import { auditNarrativeVariants } from './narrative/narrativeAudit';
import dictionary from '../content/localization/pl/history.json';
import type { CareerState, SeasonParticipationRecord } from '../types/domain';

const base = createPr167Career(true, 'pr169-regression', 'central_midfielder');
const completed = (age = 25, tier: 1 | 2 | 3 | 4 = 1, position = 1): CareerState => ({
  ...base,
  activeMatch: undefined,
  player: { ...base.player, age, dateOfBirth: `${base.currentSeason - age}-01-01` },
  currentDate: `${base.currentSeason + 1}-06-30`,
  currentProfessionalClub: { ...base.currentProfessionalClub!, leagueTier: tier },
  leagueSeason: {
    ...base.leagueSeason!,
    completed: true,
    competition: { ...base.leagueSeason!.competition, tier },
  },
  seasonOutcome: {
    competitionType: 'professional',
    finalPosition: position,
    champion: position === 1,
    previousLeagueTier: tier,
    nextLeagueTier: tier === 1 ? 1 : ((tier - 1) as 1 | 2 | 3),
    leagueOutcome: position === 1 ? (tier === 1 ? 'champion' : 'promoted') : 'stayed',
  },
  seasonParticipation: base.seasonParticipation!.map((r, i) => ({
    ...r,
    fixtureStatus: 'completed',
    status: 'starter',
    minutes: 90,
    started: true,
    goals: i === 0 ? 1 : 0,
    assists: i === 1 ? 1 : 0,
    rating: 6.7,
  })),
});
const stats = {
  minutesPlayed: 90,
  goals: 0,
  assists: 0,
  yellowCards: 0,
  redCards: 0,
  passesAttempted: 40,
  passesCompleted: 36,
  shots: 0,
  shotsOnTarget: 0,
  tacklesWon: 0,
  interceptions: 0,
  saves: 0,
  goalsConceded: 0,
};

describe('PR169 position-aware canonical ratings', () => {
  it.each([
    'goalkeeper',
    'center_back',
    'defensive_midfielder',
    'central_midfielder',
    'right_winger',
    'striker',
  ])('evaluates %s deterministically without mutation', (position) => {
    const input = {
      position,
      source: 'canonical' as const,
      stats: {
        ...stats,
        tacklesWon: 5,
        interceptions: 4,
        saves: 7,
        shots: 3,
        shotsOnTarget: 2,
        goals: 1,
      },
    };
    const before = structuredClone(input),
      a = evaluateCanonicalRating(input);
    expect(a).toEqual(evaluateCanonicalRating(input));
    expect(input).toEqual(before);
    expect(a.value).toBeGreaterThanOrEqual(3);
    expect(a.value).toBeLessThanOrEqual(10);
  });
  it('does not make harmless passing exceptional or require goals for defensive/GK excellence', () => {
    const rate = (position: string, extra = {}) =>
      evaluateCanonicalRating({ position, source: 'canonical', stats: { ...stats, ...extra } })
        .value!;
    expect(rate('central_midfielder', { passesAttempted: 180, passesCompleted: 180 })).toBeLessThan(
      6.5,
    );
    expect(rate('defensive_midfielder', { tacklesWon: 7, interceptions: 5 })).toBeGreaterThan(8);
    expect(rate('goalkeeper', { saves: 8 })).toBeGreaterThan(8);
    expect(rate('striker', { goals: 2, shots: 4, shotsOnTarget: 3 })).toBeGreaterThan(8);
    expect(
      rate('center_back', { passesAttempted: 30, passesCompleted: 8, yellowCards: 1, redCards: 1 }),
    ).toBeLessThan(5);
    expect(rate('goalkeeper', { saves: 0, goalsConceded: 5 })).toBeLessThan(5);
  });
  it('keeps short, missing, abandoned and hybrid evaluations unavailable', () => {
    for (const input of [
      { source: 'canonical_plus_summary' as const, stats },
      { source: 'canonical' as const, stats: { ...stats, minutesPlayed: 2 } },
      { source: 'canonical' as const },
      { source: 'canonical' as const, stats, abandoned: true },
    ]) {
      const r = evaluateCanonicalRating({ position: 'central_midfielder', ...input });
      expect(r.value).toBeUndefined();
      expect(r.provenance.unavailable).toBeDefined();
    }
  });
});

describe('PR169 historical achievements and evidence', () => {
  it.each([
    [1, 1, 'top_tier_champion'],
    [1, 2, undefined],
    [2, 1, 'division_winner'],
    [4, 1, 'division_winner'],
  ] as const)('recognises tier %s position %s', (tier, position, type) => {
    const c = recordSeasonAchievements(completed(25, tier, position));
    expect(c.historyFacts.some((f) => f.factType === 'top_tier_champion')).toBe(
      type === 'top_tier_champion',
    );
    if (type)
      expect(c.historyFacts.find((f) => f.factType === type)).toMatchObject({
        season: base.currentSeason,
        clubs: [base.currentClub.id],
        competitions: [base.leagueSeason!.competition.id],
      });
    expect(recordSeasonAchievements(c)).toBe(c);
  });
  it('records a lower division winner without possible promotion without a national title', () => {
    const c = completed(25, 2);
    c.seasonOutcome = { ...c.seasonOutcome!, leagueOutcome: 'stayed', nextLeagueTier: 2 };
    const r = recordSeasonAchievements(c);
    expect(r.historyFacts.some((f) => f.factType === 'division_winner')).toBe(true);
    expect(r.historyFacts.some((f) => f.factType === 'top_tier_champion')).toBe(false);
  });
  it('captures honours before a transfer and at retirement, with original season/club identities', () => {
    const c = completed();
    c.professionalOffers = generateSummerWindowOffers(c);
    const offer = c.professionalOffers.find((o) => o.club.id !== c.currentClub.id)!;
    const next = acceptProfessionalOffer(c, offer.id);
    const f = next.historyFacts.find((f) => f.factType === 'top_tier_champion')!;
    expect(f.clubs).toEqual([c.currentClub.id]);
    expect(f.season).toBe(c.currentSeason);
    const snapshot = next.completedSeasons!.find((s) => s.seasonId === c.leagueSeason!.id)!;
    expect(getSeasonHonours(next.historyFacts, snapshot)).toEqual(['Mistrzostwo']);
    expect(getFactPresentation(next, f).clubName).toBe(c.currentClub.name);
    expect(retireCareer(c).historyFacts.some((f) => f.factType === 'top_tier_champion')).toBe(true);
    const again = completed();
    again.currentSeason++;
    again.leagueSeason = { ...again.leagueSeason!, id: 'next-title' };
    again.historyFacts = next.historyFacts;
    const twice = recordSeasonAchievements(again);
    expect(twice.historyFacts.filter((f) => f.factType === 'top_tier_champion')).toHaveLength(2);
  });
  it('does not award the previous club title to a player who has already departed', () => {
    const c = completed();
    c.currentClub = { ...c.currentClub, id: 'other' };
    expect(recordSeasonAchievements(c)).toBe(c);
  });
  it('projects safe old snapshot honours and deduplicates legacy firsts', () => {
    const c = completed(),
      snapshot = createCompletedSeasonSnapshot(c);
    const firstClub = c.historyFacts.find((f) => f.factType === 'career_started')!.data.club;
    expect(buildRetirementNarrative({ ...c, completedSeasons: [snapshot] })).toContain(
      `Od ${firstClub} do`,
    );
    expect(
      getSeasonHonours([], {
        ...snapshot,
        leagueTier: 2,
        leagueLevel: 2,
        clubFinish: 1,
        seasonResult: undefined,
      }),
    ).toEqual([]);
    expect(getSeasonHonours([], snapshot)).toEqual(['Mistrzostwo']);
    const fact = {
      ...c.historyFacts[0]!,
      factType: 'first_senior_goal',
      id: 'first',
      date: '2027-09-01',
    };
    expect(
      getDistinctCareerFacts([fact, { ...fact, id: 'duplicate', date: '2029-08-01' }]),
    ).toHaveLength(1);
    const withArchive = { ...c, matchHistory: [], completedSeasons: [snapshot], historyFacts: [] };
    for (const metric of ['appearances', 'starts', 'goals', 'assists'] as const)
      expect(hasLevelMilestone(withArchive, 'senior', metric)).toBe(true);
  });
  it('dates a crossed threshold to its actual fixture rather than the week cursor', () => {
    const c = completed();
    c.currentDate = '2027-08-01';
    c.seasonParticipation![0]!.goals = 50;
    c.seasonParticipation = c.seasonParticipation!.slice(0, 1);
    const next = recordParticipationMilestones(c);
    const milestone = next.historyFacts.find(
      (f) => f.factType === 'career_stat_milestone' && f.data.metric === 'goals',
    )!;
    expect(milestone.date).toBe(c.seasonParticipation[0]!.date);
    expect(milestone.data.fixtureId).toBe(c.seasonParticipation[0]!.fixtureId);
  });
  it('avoids double-counting current season and excludes unsubstantiated hybrid clean sheets', () => {
    const c = completed();
    const snapshot = createCompletedSeasonSnapshot(c);
    c.completedSeasons = [snapshot, snapshot];
    expect(getCareerStatistics(c).totals.appearances).toBe(snapshot.player.appearances);
    const record = {
      ...c.seasonParticipation![0]!,
      assignedPosition: 'goalkeeper',
      metricsSource: 'canonical_plus_summary',
      canonicalStats: { minutesPlayed: 90, saves: 3, goalsConceded: 0 },
    } as SeasonParticipationRecord;
    expect(getSeasonGoalkeeperStats([record]).cleanSheets).toBe(0);
    const archived = createCompletedSeasonSnapshot({ ...c, seasonParticipation: [record] });
    expect(archived.matches[0]!.goalkeeper!.cleanSheet).toBe(false);
    expect(getCareerStatistics(c).nationalTeam.available).toBe(false);
  });
  it.each(['tactical', 'fatigue', 'injury'] as const)(
    'retains exact substitution times and names for %s',
    (reason) => {
      const c = completed();
      const evidence = participationEvidenceSchema.parse({
        substitutions: [
          {
            outgoingId: c.player.id,
            incomingId: 'historical-incoming',
            outgoingName: 'Jan Testowy',
            incomingName: 'Piotr Dawny',
            requestedAt: 4300,
            leftAt: 4381,
            enteredAt: 4385,
            reason,
          },
        ],
      });
      c.seasonParticipation![0]!.participationEvidence = evidence;
      const snapshot = createCompletedSeasonSnapshot(c);
      c.completedSeasons = [snapshot];
      const loaded = parseCareerSave(serializeCurrentCareerSave(c));
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) throw Error('save');
      expect(loaded.save.career.completedSeasons![0]!.matches[0]!.participationEvidence).toEqual(
        evidence,
      );
      expect(presentSubstitutions({ participationEvidence: evidence }, c.player.id)[0]).toContain(
        'Piotr Dawny',
      );
      expect(presentSubstitutions({}, c.player.id)).toEqual([]);
    },
  );
  it('keeps news and contextual season narratives deterministic, referenced and localized', () => {
    const c = recordSeasonAchievements(completed());
    const before = structuredClone(c),
      news = buildCareerNews(c);
    expect(buildCareerNews(c, 0)).toEqual([]);
    expect(news).toEqual(buildCareerNews(c));
    expect(c).toEqual(before);
    expect(news.every((n) => c.historyFacts.some((f) => f.id === n.factId))).toBe(true);
    expect(news.length).toBeLessThanOrEqual(24);
    expect(news.map((n) => n.headline + ' ' + n.summary).join(' ')).not.toMatch(
      /Kanoniczny zapis|senior_debut|top_tier_champion/,
    );
    expect(auditNarrativeVariants([NEWS_VARIANTS], dictionary)).toEqual({
      valid: true,
      errors: [],
    });
    expect(buildSeasonNarrative(c, createCompletedSeasonSnapshot(c)).join(' ')).toContain(
      'mistrzostwo',
    );
    const loaded = parseCareerSave(serializeCurrentCareerSave(c));
    if (!loaded.ok) throw Error('save');
    expect(buildCareerNews(hydrateCareerWithWorld(loaded.save.career, world))).toEqual(news);
  });
  it('preserves a substitute entering and later leaving with two distinct actual times', () => {
    const c = completed(),
      playerId = c.player.id;
    const evidence = participationEvidenceSchema.parse({
      substitutions: [
        {
          outgoingId: 'former-starter',
          incomingId: playerId,
          outgoingName: 'Jan Pierwszy',
          incomingName: 'Jan Testowy',
          requestedAt: 3590,
          leftAt: 3595,
          enteredAt: 3601,
          reason: 'tactical',
        },
        {
          outgoingId: playerId,
          incomingId: 'later-sub',
          outgoingName: 'Jan Testowy',
          incomingName: 'Piotr Drugi',
          requestedAt: 4800,
          leftAt: 4804,
          enteredAt: 4808,
          reason: 'injury',
        },
      ],
    });
    c.seasonParticipation![0] = {
      ...c.seasonParticipation![0]!,
      status: 'substitute',
      started: false,
      minutes: 20.05,
      participationEvidence: evidence,
    };
    const snapshot = createCompletedSeasonSnapshot(c);
    const saved = parseCareerSave(
      serializeCurrentCareerSave({ ...c, completedSeasons: [snapshot] }),
    );
    if (!saved.ok) throw Error('two-change save');
    const retained = saved.save.career.completedSeasons![0]!.matches[0]!.participationEvidence!;
    expect(retained).toEqual(evidence);
    expect(presentSubstitutions({ participationEvidence: retained }, playerId)).toEqual([
      'Wejście w 61. min · za: Jan Pierwszy (taktycznie)',
      'Zejście w 81. min · zastępujący: Piotr Drugi (uraz)',
    ]);
  });
});

describe('PR169 renewal boundary regression', () => {
  it.each([25, 36])('accepts current club renewal at age %s once, including reload', (age) => {
    const c = completed(age);
    c.professionalOffers = generateSummerWindowOffers(c);
    const renewal = c.professionalOffers.find((o) => o.offerType === 'renewal')!;
    expect(validateProfessionalOfferAcceptance(c, renewal.id).valid).toBe(true);
    const next = acceptProfessionalOffer(c, renewal.id);
    expect(next.currentClub.id).toBe(c.currentClub.id);
    expect(next.currentSeason).toBe(c.currentSeason + 1);
    expect(next.currentContract).toEqual(renewal.contract);
    expect(next.completedSeasons?.filter((s) => s.seasonId === c.leagueSeason!.id)).toHaveLength(1);
    expect(acceptProfessionalOffer(next, renewal.id)).toBe(next);
    expect(next.finances?.filter((f) => f.id === `signing_${renewal.id}`)).toHaveLength(1);
    const loaded = parseCareerSave(serializeCurrentCareerSave(next));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.save.career.currentContract).toEqual(renewal.contract);
    let playable = next;
    for (let i = 0; i < 20 && !getCurrentFixture(playable); i++)
      playable = advanceCareerWeek(playable);
    const fixture = getCurrentFixture(playable)!;
    expect(fixture).toBeDefined();
    const round = playable.leagueSeason!.rounds.find((r) =>
      r.fixtures.some((f) => f.id === fixture.id),
    )!;
    const played = settleLeagueRound(simulateRoutinePlayerMatch(playable, fixture), round.index);
    expect(played.seasonParticipation!.find((r) => r.fixtureId === fixture.id)?.fixtureStatus).toBe(
      'completed',
    );
  });
  it('accepts an expiring and negotiated renewal and rejects stale dates', () => {
    const c = completed(36);
    c.currentContract = { ...c.currentContract!, endDate: `${c.currentSeason + 1}-06-30` };
    c.professionalOffers = generateSummerWindowOffers(c);
    const renewal = c.professionalOffers.find((o) => o.offerType === 'renewal')!;
    c.renegotiation = {
      season: c.currentSeason,
      result: 'accepted',
      proposedContract: {
        ...renewal.contract,
        monthlySalary: renewal.contract.monthlySalary + 100,
      },
    };
    const next = acceptSeasonEndRenegotiatedContract(c);
    expect(next.currentSeason).toBe(c.currentSeason + 1);
    expect(next.currentClub.id).toBe(c.currentClub.id);
    expect(next.currentContract).toEqual(c.renegotiation.proposedContract);
    renewal.contract.startDate = '2099-07-01';
    expect(validateProfessionalOfferAcceptance(c, renewal.id)).toMatchObject({ valid: false });
    expect(acceptProfessionalOffer(c, renewal.id)).toBe(c);
  });
  it('reproduces an old in-season proposal silent no-op and clears it when summer offers are generated', () => {
    const c = completed(36);
    c.professionalOffers = generateSummerWindowOffers(c);
    c.renegotiation = {
      season: c.currentSeason,
      result: 'accepted',
      proposedContract: { ...c.currentContract! },
    };
    expect(acceptSeasonEndRenegotiatedContract(c)).toBe(c);
    const reopened = advanceCareerFlow(c);
    expect(reopened.renegotiation).toBeUndefined();
    expect(reopened.professionalOffers?.some((o) => o.offerType === 'renewal')).toBe(true);
    const repaired = advanceCareerFlow({ ...c, professionalOffers: undefined });
    expect(repaired.renegotiation).toBeUndefined();
    const renewal = repaired.professionalOffers!.find((o) => o.offerType === 'renewal')!;
    expect(acceptProfessionalOffer(repaired, renewal.id).currentSeason).toBe(c.currentSeason + 1);
  });
  it('continues a still-valid existing contract without a renewal bonus', () => {
    const c = completed();
    c.currentContract = { ...c.currentContract!, endDate: `${c.currentSeason + 3}-06-30` };
    const next = continueOnExistingContract(c);
    expect(next.currentSeason).toBe(c.currentSeason + 1);
    expect(next.currentContract).toEqual(c.currentContract);
    expect(next.finances).toEqual(c.finances);
  });
});
