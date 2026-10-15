// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { getPolishU17TeamDefinitions, getYouthCohortKey } from '../content/world/polishU17';
import { generateCanonicalFootballerProfile, resolveFootballer } from './footballerWorld';
import { generateDevelopmentProfile } from './playerCreator';
import {
  NPC_DEVELOPMENT_CURVES,
  projectNpcAttributesAtDate,
  applyNpcExperienceDevelopment,
} from './seasonDevelopment';
import { RandomGenerator } from './random/RandomGenerator';
import { deriveNpcPlayStyles } from './npcFootballIdentity';
import { createPr167Career, pr167World as world } from '../../scripts/pr167Fixtures';
import { getPlayerOverall } from './playerOverall';
import { getCareerClubStrength } from './clubStrength';
import { createCareerMatchInput, startCareerMatch } from './careerMatchContract';
import { getCareerNpcPlayStyles } from './npcCareerIdentity';
import { playStyleIdSchema, playStylePreparationRelief } from './playStyles';
import { resolveCareerWorldFootballer } from './worldDatabase';
import { deriveAppearance } from './visualIdentity';
import { parseCareerSave, serializeCareerSave, hydrateCareerWithWorld } from './persistence';
import type { NpcDevelopmentCurveId, PlayerAttributes, WorldFootballer } from '../types/domain';

const npc = (id = 'pr167-npc', keeper = false): WorldFootballer => ({
  profile: {
    ...generateCanonicalFootballerProfile({
      id,
      seed: id,
      age: 18,
      targetOverall: 58,
      primaryPosition: keeper ? 'goalkeeper' : 'left_winger',
    }),
    dateOfBirth: '2008-01-01',
  },
  developmentProfile: {
    ...generateDevelopmentProfile(RandomGenerator.fromSeed('pr167-growth')),
    familyCapacity: { technical: 90, mental: 90, physical: 90, goalkeeper: 90 },
    familyPeakAge: { technical: 27, mental: 30, physical: 25, goalkeeper: 29 },
    familyDeclineStartAge: { technical: 31, mental: 35, physical: 29, goalkeeper: 35 },
  },
  careerStatus: 'active',
  developmentCurveId: keeper ? 'goalkeeper_late_prime' : 'balanced',
});
const project = (player: WorldFootballer, age: number, clubEnvironment = 50) =>
  projectNpcAttributesAtDate({ footballer: player, date: `${2008 + age}-07-01`, clubEnvironment });

describe('PR167 evolving NPC identity', () => {
  it('invalidates the projection cache for environment, age, curve and replaced development/attributes', () => {
    const base = npc('projection-cache');
    const assertFresh = (footballer: WorldFootballer, age: number, environment: number) => {
      const cached = project(footballer, age, environment);
      const fresh = project(
        { ...footballer, profile: { ...footballer.profile } },
        age,
        environment,
      );
      expect(cached).toEqual(fresh);
    };
    for (const age of [28, 38, 21, 28]) {
      for (const environment of [0, 100, 50]) {
        assertFresh(base, age, environment);
        assertFresh({ ...base, developmentCurveId: 'late_bloomer' }, age, environment);
        assertFresh(
          { ...base, developmentProfile: { ...base.developmentProfile, growthRate: 1.8 } },
          age,
          environment,
        );
      }
    }
    const original = project(base, 28);
    base.profile.attributes = { ...base.profile.attributes, finishing: 80 };
    assertFresh(base, 28, 50);
    expect(project(base, 28)).not.toEqual(original);
  });
  it('keeps natural individual variation attached to identity rather than the protagonist career seed', () => {
    const footballer = npc();
    expect(
      projectNpcAttributesAtDate({ footballer, date: '2036-07-01', seed: 'career-a' }),
    ).toEqual(projectNpcAttributesAtDate({ footballer, date: '2036-07-01', seed: 'career-b' }));
  });
  it('uses the actual parent academy environment and keeps it through a full legacy transfer override', () => {
    const career = createPr167Career(),
      team = getPolishU17TeamDefinitions(career.clubWorld!).find((t) => t.parentClubId)!;
    const id = career.youthCohorts![getYouthCohortKey(team.id, 2026)]![0]!;
    const atEnvironment = (quality: number) => ({
      ...career,
      currentDate: '2035-07-01',
      clubWorld: career.clubWorld!.map((club) =>
        club.id === team.parentClubId
          ? {
              ...club,
              infrastructure: {
                ...club.infrastructure!,
                coachingQuality: quality,
                trainingFacilities: quality,
              },
            }
          : club,
      ),
    });
    const poor = resolveCareerWorldFootballer(atEnvironment(0), id)!;
    const richCareer = atEnvironment(100),
      rich = resolveCareerWorldFootballer(richCareer, id)!;
    expect(
      Object.keys(poor.profile.attributes).some(
        (key) =>
          rich.profile.attributes[key as keyof PlayerAttributes] >
          poor.profile.attributes[key as keyof PlayerAttributes],
      ),
    ).toBe(true);
    const transferred = {
      ...richCareer,
      worldDelta: {
        ...richCareer.worldDelta!,
        footballerOverrides: {
          [id]: { ...career.footballerWorld![id]!, currentClubId: world.clubs.at(-1)!.id },
        },
      },
    };
    expect(resolveCareerWorldFootballer(transferred, id)!.profile.attributes).toEqual(
      rich.profile.attributes,
    );
  });
  it.each(Object.keys(NPC_DEVELOPMENT_CURVES) as NpcDevelopmentCurveId[])(
    '%s is random-access deterministic, bounded and distinguishes physical/mental aging',
    (curve) => {
      const player = { ...npc(), developmentCurveId: curve };
      const direct = project(player, 35);
      for (const age of [40, 16, 30, 20, 25]) project(player, age);
      expect(project(player, 35)).toEqual(direct);
      expect(Object.values(direct).every((n) => n >= 1 && n <= 100)).toBe(true);
      expect(project(player, 40).pace).toBeLessThan(project(player, 25).pace);
      expect(project(player, 35).gameReading - project(player, 25).gameReading).toBeGreaterThan(
        project(player, 35).pace - project(player, 25).pace,
      );
      expect(project(player, 30).professionalism).toBe(player.profile.attributes.professionalism);
      expect(player.profile.dateOfBirth).toBe('2008-01-01');
    },
  );

  it('curves, character, headroom, strengths and origin environment produce distinct growth without changing positions', () => {
    const player = npc();
    const curves = Object.keys(NPC_DEVELOPMENT_CURVES).map((developmentCurveId) =>
      JSON.stringify(
        project({ ...player, developmentCurveId: developmentCurveId as NpcDevelopmentCurveId }, 28),
      ),
    );
    expect(new Set(curves).size).toBeGreaterThan(6);
    const high = project(player, 26, 100),
      low = project(player, 26, 0);
    expect(high.dribbling).toBeGreaterThan(low.dribbling);
    const weak = {
      ...player,
      profile: {
        ...player.profile,
        attributes: { ...player.profile.attributes, professionalism: 5, determination: 5 },
      },
    };
    expect(project(weak, 26).dribbling).toBeLessThan(high.dribbling);
    expect(project(player, 30).dribbling - player.profile.attributes.dribbling).not.toBe(
      project(player, 30).tackling - player.profile.attributes.tackling,
    );
    expect(
      project(npc('keeper', true), 38).handling - project(npc('keeper', true), 28).handling,
    ).toBeGreaterThan(project(player, 38).pace - project(player, 28).pace);
  });

  it('preserves archetype diversity at equal age/OVR, including specialist keepers', () => {
    const cohort = Array.from({ length: 80 }, (_, i) => npc(`cohort-${i}`));
    const ovr = cohort.map((p) => getPlayerOverall(p.profile, p.profile.primaryPosition));
    expect(Math.max(...ovr) - Math.min(...ovr)).toBeLessThanOrEqual(2);
    const gaps = cohort.map((p) => p.profile.attributes.pace - p.profile.attributes.technique);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(20);
    expect(
      new Set(cohort.map((p) => project(p, 28).dribbling - p.profile.attributes.dribbling)).size,
    ).toBeGreaterThan(3);
    expect(npc('keeper', true).profile.secondaryPositions).toEqual([]);
  });

  it('separates capped known experience, injury interruption, natural growth and absolute overlays', () => {
    const player = npc(),
      natural = project(player, 26);
    expect(applyNpcExperienceDevelopment(player, natural, { minutes: 0 })).toBe(natural);
    const bonus = applyNpcExperienceDevelopment(player, natural, { minutes: 4000 });
    expect(
      Object.keys(natural).filter(
        (key) => bonus[key as keyof PlayerAttributes] !== natural[key as keyof PlayerAttributes],
      ),
    ).toHaveLength(2);
    expect(
      applyNpcExperienceDevelopment(player, natural, { minutes: 1000, injuryDays: 28 }),
    ).toEqual(natural);
    const career = createPr167Career();
    const id = Object.keys(career.footballerWorld!)[0]!;
    const base = career.footballerWorld![id]!;
    const dated = { ...career, currentDate: '2032-07-01' };
    const before = resolveCareerWorldFootballer(dated, id)!;
    const transferred = {
      ...dated,
      worldDelta: {
        ...dated.worldDelta!,
        npcClubMembership: { ...dated.worldDelta?.npcClubMembership, [id]: world.clubs[1]!.id },
        footballerAttributeOverrides: { [id]: { passing: 99 } },
      },
    };
    const effective = resolveCareerWorldFootballer(transferred, id)!;
    expect(effective.profile.attributes.passing).toBe(99);
    expect(effective.profile.attributes.pace).toBe(before.profile.attributes.pace);
    expect(effective.profile.dateOfBirth).toBe(base.profile.dateOfBirth);
    expect(deriveAppearance(effective.profile, dated.currentDate)).toEqual(
      deriveAppearance(before.profile, dated.currentDate),
    );
    const parsed = parseCareerSave(serializeCareerSave(transferred));
    if (!parsed.ok) throw new Error('Save failed');
    const restored = hydrateCareerWithWorld(parsed.save.career, world);
    expect(resolveFootballer(restored, id)?.attributes).toEqual(effective.profile.attributes);
  });

  it.each(playStyleIdSchema.options)(
    'derives %s deterministically with shared contextual mechanics and real acquisition requirements',
    (style) => {
      const keeper = style === 'goalkeeper_distributor';
      let found: WorldFootballer | undefined;
      for (let i = 0; i < 200 && !found; i++) {
        const player = npc(`style-${style}-${i}`, keeper);
        player.profile = {
          ...player.profile,
          age: 25,
          attributes: Object.fromEntries(
            Object.keys(player.profile.attributes).map((key) => [key, 75]),
          ) as unknown as PlayerAttributes,
        };
        if (deriveNpcPlayStyles(player).some((s) => s.style === style)) found = player;
      }
      expect(found).toBeTruthy();
      expect(deriveNpcPlayStyles(found!)).toEqual(deriveNpcPlayStyles(structuredClone(found!)));
      expect(deriveNpcPlayStyles(found!).length).toBeLessThanOrEqual(2);
      const young = {
        ...found!,
        profile: {
          ...found!.profile,
          age: 18,
          attributes: Object.fromEntries(
            Object.keys(found!.profile.attributes).map((key) => [key, 55]),
          ) as unknown as PlayerAttributes,
        },
      };
      expect(deriveNpcPlayStyles(young, { ...young.profile, age: 25 })).toEqual([]);
      expect(
        deriveNpcPlayStyles(young, found!.profile).every((s) => s.source === 'development'),
      ).toBe(true);
      expect(
        deriveNpcPlayStyles(young, found!.profile, { matches: 12, minutes: 1080 }).some(
          (s) => s.source === 'career_experience',
        ),
      ).toBe(true);
      expect(
        playStylePreparationRelief([style], {
          forwardMetres: 0,
          goalDistance: 80,
          pressure: 0,
          goalkeeper: keeper,
          pass: false,
          shot: false,
        }),
      ).toBe(0);
    },
  );

  it('does not universally award styles and passes the exact effective NPC identity/styles to canonical bodies', () => {
    const career = createPr167Career(true);
    const input = createCareerMatchInput(career, world),
      state = startCareerMatch(input);
    let styles = 0;
    for (const body of state.players.filter((p) => p.id !== career.player.id)) {
      const profile = resolveFootballer({ ...career, currentDate: input.fixture.date }, body.id)!;
      expect(body.profile.attributes).toEqual(profile.attributes);
      expect(body.profile.age).toBe(profile.age);
      expect(body.playStyles).toEqual(
        getCareerNpcPlayStyles({ ...career, currentDate: input.fixture.date }, profile).map(
          (s) => s.style,
        ),
      );
      styles += body.playStyles?.length ?? 0;
    }
    expect(styles).toBeGreaterThan(0);
    expect(styles).toBeLessThan(42);
    expect(
      Array.from({ length: 40 }, (_, i) => deriveNpcPlayStyles(npc(`no-style-${i}`))).some(
        (s) => s.length === 0,
      ),
    ).toBe(true);
  });

  it('allows a young cohort to develop specialisations without claiming fictional action histories', () => {
    const cohort = Array.from({ length: 100 }, (_, index) => npc(`emerging-${index}`));
    const developed = cohort.map((base) =>
      deriveNpcPlayStyles(base, { ...base.profile, age: 27, attributes: project(base, 27) }),
    );
    expect(developed.some((styles) => styles.some((style) => style.source === 'development'))).toBe(
      true,
    );
    expect(developed.some((styles) => styles.length === 0)).toBe(true);
    expect(
      developed.every(
        (styles) =>
          styles.length <= 2 && styles.every((style) => style.source !== 'career_experience'),
      ),
    ).toBe(true);
  });

  it('recomputes actual club strength for a changed career with identical date and membership', () => {
    const career = createPr167Career(true),
      club = career.currentProfessionalClub!;
    const before = getCareerClubStrength(career, club);
    const overrides = Object.fromEntries(
      (club.squadPlayerIds ?? [])
        .filter((id) => id !== career.player.id)
        .map((id) => [
          id,
          Object.fromEntries(Object.keys(career.player.attributes).map((key) => [key, 95])),
        ]),
    );
    const improved = {
      ...career,
      worldDelta: { ...career.worldDelta!, footballerAttributeOverrides: overrides },
    };
    expect(getCareerClubStrength(improved, club)).toBeGreaterThan(before);
    expect(getCareerClubStrength(career, club)).toBe(before);
  });
});
