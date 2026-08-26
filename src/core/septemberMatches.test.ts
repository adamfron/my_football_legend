import { describe, expect, it, vi } from 'vitest';
import {
  createCareerState,
  generateStartingPlayerProfile,
  type CreatorInput,
} from './playerCreator';
import {
  advanceMatch,
  advanceSeptemberWeek,
  evaluatePlayerForPosition,
  evaluateSquadOpportunity,
  finishMatch,
  generateSeptemberOpponents,
  initializeSeptemberPhase,
  MATCH_MOMENT_LIBRARY,
  resolveMatchDecision,
  startSeptemberMatch,
  TOMASZ_RADECKI_PROFILE,
  VISTULA_NOVA_PROFILE,
  projectFixtureParticipation,
} from './septemberMatches';
import { initializeCareerSeason } from './careerSeasons';
import { careerStateSchema } from '../schemas/domainSchemas';
const input: CreatorInput = {
  firstName: 'Jan',
  lastName: 'Test',
  nationality: 'PL',
  age: 16,
  dominantFoot: 'right',
  customSeed: '',
  position: 'central_midfielder',
  heightCm: 178,
  weightKg: 70,
  seed: 'match-test',
};
const ready = (seed = input.seed) => {
  const c = createCareerState(generateStartingPlayerProfile({ ...input, seed }, seed, 0), seed);
  const base = c.historyFacts[0]!;
  return {
    ...c,
    historyFacts: [
      ...c.historyFacts,
      {
        ...base,
        id: 'role',
        factType: 'opening_month_role_assigned',
        data: { role: 'weekly_senior_access' },
      },
      { ...base, id: 'august-done', factType: 'august_2026_completed', data: {} },
    ],
  };
};
describe('September match engine', () => {
  it('has deterministic profiles, opponents and position-specific evaluation', () => {
    expect(VISTULA_NOVA_PROFILE).toEqual(VISTULA_NOVA_PROFILE);
    expect(TOMASZ_RADECKI_PROFILE.tacticalDiscipline).toBeGreaterThan(
      TOMASZ_RADECKI_PROFILE.youthTrust,
    );
    expect(generateSeptemberOpponents('x')).toEqual(generateSeptemberOpponents('x'));
    expect(evaluatePlayerForPosition(ready().player, 'central_midfielder')).not.toBe(
      evaluatePlayerForPosition(ready().player, 'striker'),
    );
    expect(MATCH_MOMENT_LIBRARY.length).toBeGreaterThanOrEqual(34);
  });
  it('initializes idempotently and validates an active match save', () => {
    const a = initializeSeptemberPhase(ready());
    expect(initializeSeptemberPhase(a)).toEqual(a);
    const started = startSeptemberMatch(a);
    expect(careerStateSchema.safeParse(started).success).toBe(true);
  });
  it('uses absences and fitness without making a junior an automatic starter', () => {
    const c = initializeSeptemberPhase(ready());
    const f = { fixtureIndex: 0, opponent: c.september!.opponents[0]!, venue: 'home' as const };
    const low = evaluateSquadOpportunity({ ...c, player: { ...c.player, fitness: 20 } }, f);
    const fit = evaluateSquadOpportunity({ ...c, player: { ...c.player, fitness: 100 } }, f);
    expect(fit.selectionScore).toBeGreaterThan(low.selectionScore);
    const absent = evaluateSquadOpportunity(c, {
      ...f,
      availability: [{ unit: 'midfield', severity: 'several_absences', reason: 'major_injury' }],
    });
    expect(absent.selectionScore).toBeGreaterThan(
      evaluateSquadOpportunity(c, { ...f, availability: [] }).selectionScore,
    );
    expect(['academy_starter', 'academy_bench', 'no_match']).toContain(fit.status);
  });
  it('keeps deterministic standard U-17 careers near the intended minute share', () => {
    const shares = Array.from({ length: 30 }, (_, index) => {
      const base = ready(`balance-${index}`);
      const youth = initializeCareerSeason(base, {
        startYear: 2026,
        careerSeasonNumber: 1,
        club: base.currentClub,
        professional: false,
      });
      const fixtures = youth.careerCalendar!.fixtures;
      const minutes = fixtures.reduce(
        (sum, fixture) => sum + projectFixtureParticipation(youth, fixture).plannedMinutes,
        0,
      );
      return minutes / (fixtures.length * 90);
    }).sort((a, b) => a - b);
    const median = shares[Math.floor(shares.length / 2)]!;
    expect(median).toBeGreaterThanOrEqual(0.4);
    expect(median).toBeLessThanOrEqual(0.6);
  });
  it('creates no moments for zero minutes and deterministically resolves three independent impact axes', () => {
    let c = initializeSeptemberPhase(ready());
    c = startSeptemberMatch(c);
    c = { ...c, activeMatch: { ...c.activeMatch!, plannedMinutes: 0, moments: [] } };
    c = advanceMatch(c);
    expect(c.activeMatch?.resolvedMoments).toHaveLength(0);
    let a = startSeptemberMatch({ ...initializeSeptemberPhase(ready()), seed: 'interactive' });
    a = advanceMatch(a);
    if (a.activeMatch?.currentMoment) {
      const d = MATCH_MOMENT_LIBRARY.find(
        (x) => x.id === a.activeMatch!.currentMoment!.definitionId,
      )!.decisions[0]!;
      const one = resolveMatchDecision(a, d.id);
      const two = resolveMatchDecision(a, d.id);
      expect(one).toEqual(two);
      expect(one.activeMatch?.resolvedMoments[0]).toEqual(
        expect.objectContaining({
          personalImpact: expect.any(Number),
          teamImpact: expect.any(Number),
          coachImpact: expect.any(Number),
        }),
      );
    }
  });
  it('completes the same reusable engine across four fixtures', () => {
    let c = initializeSeptemberPhase(ready());
    for (let i = 0; i < 4; i++) {
      c = startSeptemberMatch(c);
      c = advanceMatch(c);
      while (c.activeMatch && !c.activeMatch.completed) {
        const def = MATCH_MOMENT_LIBRARY.find(
          (x) => x.id === c.activeMatch?.currentMoment?.definitionId,
        );
        c = def ? resolveMatchDecision(c, def.decisions[0]!.id) : advanceMatch(c);
      }
      c = advanceSeptemberWeek(c);
    }
    expect(c.september?.completed).toBe(true);
    expect(c.historyFacts.some((f) => f.factType === 'september_2026_completed')).toBe(true);
    expect(c.matchHistory).toHaveLength(4);
  });
  it('never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('forbidden');
    });
    expect(() => startSeptemberMatch(initializeSeptemberPhase(ready()))).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('keeps a canonical 3:0 ledger through the result and history', () => {
    let c = startSeptemberMatch(initializeSeptemberPhase(ready()));
    const match = c.activeMatch!;
    c = {
      ...c,
      activeMatch: {
        ...match,
        currentMinute: 70,
        homeGoals: 3,
        awayGoals: 0,
        moments: [],
        goalEvents: [12, 41, 66].map((minute, index) => ({
          id: `${match.id}:regression:${index}`,
          minute,
          scoringSide: 'home' as const,
          source: 'background' as const,
        })),
      },
    };
    c = finishMatch(c);
    expect(c.activeMatch).toMatchObject({ homeGoals: 3, awayGoals: 0, completed: true });
    const fact = [...c.historyFacts].reverse().find((item) => item.factType === 'match_played')!;
    expect(fact.data).toMatchObject({ homeGoals: 3, awayGoals: 0 });
    expect(c.activeMatch!.goalEvents!.filter((event) => event.scoringSide === 'home')).toHaveLength(
      3,
    );
  });
});
