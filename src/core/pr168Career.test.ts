// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../scripts/createCanonicalWorldDatabase';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import {
  generateProfessionalOffers,
  deriveOfferPositionIntent,
  evaluateClubInterest,
} from './professionalClubs';
import {
  deriveSquadHierarchy,
  selectBestXI,
  getSportingStatus,
  FORMATIONS,
} from './footballerWorld';
import { getEffectivePositionOverall } from './playerOverall';
import { deriveCanonicalCoachProfile } from './coachProfiles';
import { deriveCoachTacticalPreferences } from './coachTactics';
import { deriveCareerMatchBriefing } from './matchBriefing';
import { acceptProfessionalOffer } from './careerSeasons';
import { advanceCareerFlow } from './careerFlow';
import { getCurrentSquadSelectionContext } from './youthWorld';
import { formatCareerInteger } from './numberPresentation';
import { evaluatePlayStyleUnlocks, getUnlockedPlayStyles } from './playStyles';
import type { PlayerPosition } from '../types/domain';
import { playerAttributesSchema } from '../schemas/domainSchemas';
import { processManagerLifecycle } from './managerLifecycle';
import { getCareerClubStrength } from './clubStrength';

const world = createCanonicalWorldDatabase();
const fixture = (position: PlayerPosition = 'right_winger', age = 25, ability = 73) => {
  const career = createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'PR168',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position,
        heightCm: 180,
        weightKg: 75,
        seed: 'pr168-career',
      },
      'pr168-career',
      0,
    ),
    'pr168-career',
    world,
  );
  return {
    ...career,
    player: {
      ...career.player,
      age,
      attributes: playerAttributesSchema.parse(
        Object.fromEntries(Object.keys(career.player.attributes).map((key) => [key, ability])),
      ),
    },
  };
};

describe('PR168 real squad transfer and coaching consistency', () => {
  for (const position of ['central_midfielder', 'goalkeeper'] as const)
    it(`handles a missing keeper without inventing a live XI: ${position}`, () => {
      const source = fixture(position, 25, 90);
      const club = {
        ...source.clubWorld![0]!,
        squadPlayerIds: selectBestXI(source, source.clubWorld![0]!)
          .assignments.filter((item) => item.position !== 'goalkeeper')
          .map((item) => item.footballerId),
      };
      const career = { ...source, clubWorld: [club] };
      expect(selectBestXI(career, club).assignments).toHaveLength(0);
      expect(() => getCareerClubStrength(career, club)).toThrow('no canonical legal XI');
      const interest = evaluateClubInterest(career, club);
      const offers = generateProfessionalOffers(career);
      if (position === 'goalkeeper') {
        expect(interest.interested).toBe(true);
        expect(offers).toHaveLength(1);
        expect(offers[0]!.plannedPosition).toBe('goalkeeper');
        expect(offers[0]!.projectedStanding).toBe('starting_xi');
        expect(
          selectBestXI(career, {
            ...club,
            squadPlayerIds: [...club.squadPlayerIds, career.player.id],
          }).assignments,
        ).toHaveLength(11);
      } else {
        expect(interest.interested).toBe(false);
        expect(offers).toEqual([]);
      }
      expect(() => getCareerClubStrength(career, club)).toThrow('no canonical legal XI');
    });
  for (const [position, age, ability] of [
    ['right_winger', 25, 73],
    ['right_winger', 34, 73],
    ['central_midfielder', 25, 73],
    ['striker', 27, 78],
    ['goalkeeper', 27, 78],
    ['left_winger', 17, 60],
    ['striker', 37, 58],
  ] as const)
    it(`${position}, ${age} years, ${ability} OVR: credible deterministic opportunities`, () => {
      const career = fixture(position, age, ability);
      const before = structuredClone(career);
      const offers = generateProfessionalOffers(career);
      expect(generateProfessionalOffers(career)).toEqual(offers);
      expect(career).toEqual(before);
      expect(offers.length).toBeLessThanOrEqual(age >= 35 ? 5 : 8);
      for (const offer of offers) {
        expect(evaluateClubInterest(career, offer.club).interested).toBe(true);
        const hierarchy = deriveSquadHierarchy(career, {
          ...offer.club,
          squadPlayerIds: [...new Set([...(offer.club.squadPlayerIds ?? []), career.player.id])],
        });
        expect(offer.projectedStanding).toBe(getSportingStatus(hierarchy, career.player.id));
        if (['star_player', 'important_player'].includes(offer.contract.squadRole))
          expect(offer.projectedStanding).toBe('starting_xi');
        if (position === 'goalkeeper') expect(offer.plannedPosition).toBe('goalkeeper');
        expect(getEffectivePositionOverall(career.player, offer.plannedPosition)).toBeGreaterThan(
          0,
        );
      }
      if (ability >= 73) {
        expect(offers.length).toBeGreaterThanOrEqual(5);
        expect(offers.some((o) => o.club.leagueTier <= 2)).toBe(true);
      }
    });
  it('a familiar alternative accommodates clear specialist quality without changing familiarity', () => {
    const career = fixture();
    const managerId = Array.from({ length: 500 }, (_, i) => `pr168-flex-${i}`).find((id) => {
      const coach = deriveCanonicalCoachProfile(id);
      return coach.preferredFormation === '3-5-2' && coach.secondaryFormation === '4-3-3';
    })!;
    expect(managerId).toBeDefined();
    const club = {
      ...career.clubWorld![0]!,
      managerId,
      squadPlayerIds: [...career.clubWorld![0]!.squadPlayerIds!, career.player.id],
    };
    const next = {
      ...career,
      player: {
        ...career.player,
        attributes: { ...career.player.attributes, dribbling: 98, pace: 98, technique: 98 },
        positionFamiliarity: {
          ...career.player.positionFamiliarity,
          right_winger: 1,
          central_midfielder: 0.2,
          right_back: 0.2,
        },
      },
    };
    const selected = selectBestXI(next, club);
    expect(selected.assignments).toHaveLength(11);
    expect(selected.formation).toBe('4-3-3');
    expect(selected.assignments.find((p) => p.footballerId === next.player.id)?.position).toBe(
      'right_winger',
    );
    expect(selectBestXI(next, club)).toEqual(selected);
    expect(next.player.positionFamiliarity.right_back).toBe(0.2);
    expect(selected.assignments.filter((p) => p.position === 'goalkeeper')).toHaveLength(1);
  });
  it('re-resolves an offer after a manager override and communicates current factual briefing', () => {
    const base = fixture();
    const offers = generateProfessionalOffers(base);
    const chosen = offers[0]!;
    const changed = {
      ...base,
      professionalOffers: offers,
      worldDelta: {
        ...base.worldDelta!,
        managerOverrides: {
          ...base.worldDelta!.managerOverrides,
          [chosen.club.id]: 'pr168-new-manager',
        },
      },
    };
    const accepted = acceptProfessionalOffer(changed, chosen.id);
    const context = getCurrentSquadSelectionContext(accepted)!;
    expect(context.managerId).toBe('pr168-new-manager');
    const plan = deriveOfferPositionIntent(accepted, context as typeof chosen.club);
    expect(plan.plannedPosition).toBeDefined();
    const briefing = deriveCareerMatchBriefing(accepted)!;
    expect(briefing.managerId).toBe('pr168-new-manager');
    expect(briefing.formation).toBe(deriveSquadHierarchy(accepted, context).formation);
    expect(briefing.source).toBe('current_canonical_squad');
    expect(briefing.instructions).toHaveLength(2);
    expect(accepted.currentContract?.squadRole).toBe(chosen.contract.squadRole);
  });
  it('preserves legal selection under unavailable players and coach preferences are bounded', () => {
    const career = fixture();
    const club = career.clubWorld![0]!;
    const injured = club.squadPlayerIds![2]!;
    const next = {
      ...career,
      footballerWorld: {
        ...career.footballerWorld!,
        [injured]: { ...career.footballerWorld![injured]!, fitness: 30 },
      },
    };
    const xi = selectBestXI(next, club);
    expect(xi.assignments).toHaveLength(11);
    expect(xi.assignments.some((p) => p.footballerId === injured)).toBe(false);
    expect(new Set(xi.assignments.map((p) => p.footballerId)).size).toBe(11);
    expect(FORMATIONS[xi.formation]).toHaveLength(11);
    const coaches = ['a', 'b', 'c', 'd'].map((id) => deriveCanonicalCoachProfile(id));
    expect(
      coaches
        .map(deriveCoachTacticalPreferences)
        .every((preferences) => Object.values(preferences).every((n) => n >= 0 && n <= 1)),
    ).toBe(true);
    expect(
      new Set(coaches.map((c) => JSON.stringify(deriveCoachTacticalPreferences(c)))).size,
    ).toBeGreaterThan(1);
  });
  it('records an appointment after signing without rewriting the promise or familiarity', () => {
    const source = fixture();
    const offers = generateProfessionalOffers(source);
    const chosen = offers[0]!;
    const accepted = acceptProfessionalOffer({ ...source, professionalOffers: offers }, chosen.id);
    const club = { ...accepted.currentProfessionalClub!, pressureLevel: 100 };
    const career = {
      ...accepted,
      currentProfessionalClub: club,
      clubWorld: accepted.clubWorld!.map((item) => (item.id === club.id ? club : item)),
    };
    const next = processManagerLifecycle(career, '2028-07-01', [
      {
        clubId: club.id,
        finish: 16,
        previousTier: club.leagueTier,
        nextTier: club.leagueTier + 1,
        clubCount: 16,
        promoted: false,
        relegated: true,
      },
    ]);
    const fact = next.historyFacts.find(
      (item) => item.factType === 'head_coach_changed' && item.date === '2028-07-01',
    );
    expect(fact).toBeDefined();
    expect(fact!.data.managerId).toBe(getCurrentSquadSelectionContext(next)!.managerId);
    expect(fact!.data.currentSportingRole).toBeDefined();
    expect(next.currentContract).toBe(career.currentContract);
    expect(next.player.positionFamiliarity).toEqual(career.player.positionFamiliarity);
    expect(next.selectionStanding).toBe(career.selectionStanding);
  });
});

describe('PR168 presentation and long-term evidence', () => {
  it('cannot farm a style in one season or by repeating the same receipt', () => {
    const career = fixture();
    const template = career.historyFacts[0]!;
    const facts = Array.from({ length: 20 }, (_, index) => ({
      ...template,
      id: `canonical_match:farm-${index}`,
      factType: 'canonical_match_result',
      season: 2026,
      date: `2026-09-${String(index + 1).padStart(2, '0')}`,
      data: {
        summary: {
          styles: [
            { style: 'progressive_passer', situations: 8, successes: 8, contexts: ['a', 'b', 'c'] },
          ],
        },
      },
    }));
    const oneSeason = { ...career, historyFacts: [...career.historyFacts, ...facts] };
    expect(getUnlockedPlayStyles(evaluatePlayStyleUnlocks(oneSeason))).toEqual([]);
    const repeated = {
      ...career,
      historyFacts: [...career.historyFacts, ...facts.map(() => facts[0]!)],
    };
    expect(getUnlockedPlayStyles(evaluatePlayStyleUnlocks(repeated))).toEqual([]);
  });
  it('formats totals only at the presentation boundary', () => {
    const value = 28009.017083333085;
    expect(formatCareerInteger(value)).toBe('28 009');
    expect(formatCareerInteger(68.59231372170186)).toBe('69');
    expect(formatCareerInteger(0.49 + 0.49)).toBe('1');
    expect(value).toBe(28009.017083333085);
  });
  it('does not unlock styles from calendar ageing or revoke a legacy unlock', () => {
    const career = fixture();
    const advanced = {
      ...career,
      currentDate: '2035-09-01',
      currentSeason: 2035,
      careerSeasonNumber: 10,
    };
    expect(getUnlockedPlayStyles(evaluatePlayStyleUnlocks(advanced))).toEqual([]);
    const fact = {
      ...career.historyFacts[0]!,
      id: 'legacy-unlock',
      factType: 'play_style_unlocked',
      data: { playStyleId: 'progressive_passer' },
    };
    const legacy = { ...advanced, historyFacts: [...advanced.historyFacts, fact] };
    expect(getUnlockedPlayStyles(evaluatePlayStyleUnlocks(legacy))).toEqual(['progressive_passer']);
    expect(advanceCareerFlow(legacy).historyFacts).toContainEqual(fact);
  });
});
