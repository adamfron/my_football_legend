// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../scripts/createCanonicalWorldDatabase';
import { samplePerson } from '../content/sampleContent';
import { footballerVisualIdentitySchema, resolvedAppearanceSchema } from '../schemas/domainSchemas';
import { PresentationFrameProjector } from '../app/match/tacticalRenderer/frameProjection';
import {
  createCareerState,
  generateStartingPlayerProfile,
  type CreatorInput,
} from './playerCreator';
import { advanceToNextCareerSeason, acceptProfessionalOffer, retireCareer } from './careerSeasons';
import { advanceCareerFlow } from './careerFlow';
import { advanceCareerWeek, getCurrentFixture } from './careerWeeks';
import { createCareerMatchInput, startCareerMatch } from './careerMatchContract';
import { hydrateCareerWithWorld, parseCareerSave, serializeCareerSave } from './persistence';
import { createSingleMatchSession } from './singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatch,
} from './matchSimulation/matchSimulation';
import { captureReplaySnapshot } from './matchSimulation/matchReplay';
import { resolveFootballer, isEligibleForNormalPosition } from './footballerWorld';
import { createProceduralFootballerId, resolveProceduralFootballer } from './proceduralFootballers';
import { applyRestartScenario } from './matchSimulation/restartScenarios';
import { advanceMatchSubstitutions, requestSubstitutions } from './matchSimulation/substitutions';
import { RandomGenerator } from './random/RandomGenerator';
import {
  createVisualIdentity,
  deriveAppearance,
  resolveFaceGenome,
  toCanonicalFootballProfile,
  updateCareerAppearance,
} from './visualIdentity';

const world = createCanonicalWorldDatabase();
const creator: CreatorInput = {
  firstName: 'Jan',
  lastName: 'Wygląd',
  nationality: 'PL',
  age: 16,
  dominantFoot: 'right',
  position: 'central_midfielder',
  heightCm: 178,
  weightKg: 70,
  seed: 'pr165-identity',
};
const career = () =>
  createCareerState(generateStartingPlayerProfile(creator, creator.seed, 0), creator.seed, world);
const setup = {
  homeClubId: world.clubs[0]!.id,
  awayClubId: world.clubs[1]!.id,
  control: { mode: 'spectator' as const },
  seed: 'pr165-physics-parity',
};

describe('PR165 visual identity lifecycle', () => {
  it('reuses the 17-field Person genome and a stable separate versioned stream', () => {
    const seed = 'persistent-person';
    expect(resolveFaceGenome(seed)).toEqual(resolveFaceGenome(seed));
    expect(resolveFaceGenome(seed)).not.toEqual(resolveFaceGenome('unrelated-person'));
    const person = { ...samplePerson, faceGenome: resolveFaceGenome(samplePerson.faceSeed) };
    const appearance = deriveAppearance(person, '2026-07-01');
    expect(appearance.baseFace).toEqual(person.faceGenome);
    expect(Object.keys(appearance.baseFace)).toHaveLength(17);
    expect(resolvedAppearanceSchema.safeParse(appearance).success).toBe(true);
    expect(() => resolveFaceGenome(seed, undefined, 2 as 1)).toThrow(/version/);
    const footballRng = RandomGenerator.fromSeed('football');
    const before = footballRng.export();
    deriveAppearance(person, '2040-07-01');
    expect(footballRng.export()).toBe(before);
  });

  it('keeps morphology recognisable from adolescence to veteran age and around birthdays', () => {
    const profile = { ...career().player, dateOfBirth: '2010-07-02' };
    const young = deriveAppearance(profile, '2026-07-01');
    expect(young.ageYears).toBe(15);
    expect(deriveAppearance(profile, '2026-07-02').ageYears).toBe(16);
    for (const year of [2027, 2036, 2046, 2070]) {
      const appearance = deriveAppearance(profile, `${year}-07-02`);
      expect(appearance.baseFace).toEqual(young.baseFace);
      expect(appearance.face.jawWidth).toBe(young.face.jawWidth);
      expect(appearance.face.eyeSpacing).toBe(young.face.eyeSpacing);
      expect(Math.abs(appearance.face.chinLength - young.face.chinLength)).toBeLessThan(0.036);
      expect(appearance.ageLines).toBeGreaterThanOrEqual(young.ageLines);
      expect(deriveAppearance(profile, `${year}-07-02`)).toEqual(appearance);
    }
    expect(deriveAppearance(profile, '2070-07-02').greyFraction).toBeGreaterThan(0.3);
  });

  it('changes hair alone, preserves football attributes and does not infer presentation', () => {
    const original = career();
    const before = deriveAppearance(original.player, '2026-07-01');
    const hairstyle = before.cosmetics.hairstyle === 'long' ? 'cropped' : 'long';
    const changed = updateCareerAppearance(original, { hairstyle });
    const after = deriveAppearance(changed.player, '2026-07-01');
    expect(after.baseFace).toEqual(before.baseFace);
    expect({ ...after.face, hairstyle: before.face.hairstyle }).toEqual(before.face);
    expect(toCanonicalFootballProfile(changed.player)).toEqual(original.player);
    expect(changed.player.attributes).toBe(original.player.attributes);
    const feminine = updateCareerAppearance(changed, { presentation: 'feminine' });
    expect(toCanonicalFootballProfile(feminine.player)).toEqual(original.player);
    expect(deriveAppearance(feminine.player, '2026-07-01').cosmetics.presentation).toBe('feminine');
    expect(
      deriveAppearance({ ...original.player, firstName: 'Anna', nationality: 'FR' }, '2026-07-01')
        .cosmetics.presentation,
    ).toBe('neutral');
  });

  it('lets the creator persist deliberate faces without spending football RNG', () => {
    const original = generateStartingPlayerProfile(creator, creator.seed, 0);
    const visualIdentity = createVisualIdentity(
      original.player.id,
      { jawWidth: 0.9, skinTone: 0.7 },
      { presentation: 'feminine', hairstyle: 'curly' },
    );
    const chosen = generateStartingPlayerProfile({ ...creator, visualIdentity }, creator.seed, 0);
    expect(toCanonicalFootballProfile(chosen.player)).toEqual(original.player);
    expect(chosen.developmentProfile).toEqual(original.developmentProfile);
    expect(deriveAppearance(chosen.player, '2026-07-01')).toMatchObject({
      baseFace: { jawWidth: 0.9, skinTone: 0.7 },
      cosmetics: { hairstyle: 'curly', presentation: 'feminine' },
    });
    expect(
      footballerVisualIdentitySchema.safeParse({ ...visualIdentity, geometry: [] }).success,
    ).toBe(false);
  });

  it('preserves cosmetics through the actual season boundary and validated save/hydration', () => {
    const changed = updateCareerAppearance(career(), {
      hairstyle: 'long',
      hairColor: 0.1,
      accessories: 'headband',
    });
    const next = advanceToNextCareerSeason(changed);
    expect(next.player.visualIdentity).toEqual(changed.player.visualIdentity);
    const loaded = parseCareerSave(serializeCareerSave(next));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error('Save failed.');
    const hydrated = hydrateCareerWithWorld(loaded.save.career, world);
    const before = deriveAppearance(changed.player, '2026-07-01');
    const after = deriveAppearance(hydrated.player, '2027-07-01');
    expect(after.baseFace).toEqual(before.baseFace);
    expect(after.cosmetics).toEqual(before.cosmetics);
    expect(after.ageYears).toBe(before.ageYears + 1);
    expect(hydrated.player.id).toBe(changed.player.id);
    const npc = world.clubs[0]!.squadPlayerIds![0]!;
    expect(resolveFootballer(hydrated, npc)?.visualIdentity).toBeUndefined();
    expect(deriveAppearance(resolveFootballer(hydrated, npc)!, '2026-07-01').baseFace).toEqual(
      deriveAppearance(world.footballers[npc]!.profile, '2026-07-01').baseFace,
    );
    expect(
      new TextEncoder().encode(serializeCareerSave(changed)).length -
        new TextEncoder().encode(serializeCareerSave(career())).length,
    ).toBeLessThan(1000);
  });

  it.each([3, 4, 5, 6, 7])(
    'loads supported v%i saves without adding NPC/person records',
    (version) => {
      const legacy = JSON.parse(serializeCareerSave(career()));
      legacy.version = version;
      delete legacy.career.player.visualIdentity;
      delete legacy.career.player.dateOfBirth;
      const first = parseCareerSave(JSON.stringify(legacy));
      const second = parseCareerSave(JSON.stringify(legacy));
      expect(first.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error('Legacy save failed.');
      expect(first.save.career.player.id).toBe(career().player.id);
      expect(first.save.career.player.visualIdentity).toBeUndefined();
      expect(deriveAppearance(first.save.career.player, '2026-07-01')).toEqual(
        deriveAppearance(second.save.career.player, '2026-07-01'),
      );
      expect(first.save.career.significantPeople).toHaveLength(1);
    },
  );

  it('keeps achievement-ready cosmetic metadata bounded and rejects rapid repeated toggles', () => {
    const original = career();
    let changed = updateCareerAppearance(original, { hairstyle: 'long', hairColor: 0.1 });
    const count = changed.player.visualIdentity!.changeMetadata!.meaningfulChanges;
    changed = updateCareerAppearance(changed, { hairstyle: 'shaved', hairColor: 0.3 });
    changed = updateCareerAppearance(changed, { hairstyle: 'long', hairColor: 0.1 });
    expect(changed.player.visualIdentity!.changeMetadata!.meaningfulChanges).toBe(count);
    expect(updateCareerAppearance(changed, { hairstyle: 'long', hairColor: 0.1 })).toBe(changed);
    for (let index = 1; index <= 12; index++)
      changed = updateCareerAppearance(
        { ...changed, currentDate: `${2026 + index}-07-01` },
        { hairColor: index / 13 },
      );
    expect(changed.player.visualIdentity!.changeMetadata!.recentStyleFingerprints).toHaveLength(8);
    expect(changed.player.visualIdentity!.changeMetadata!.meaningfulChanges).toBeGreaterThan(count);
    expect(changed.historyFacts).toBe(original.historyFacts);
  });

  it('keeps faces independent of the match seed and passes edits to XI, bench and replay', () => {
    const first = createSingleMatchSession(world, setup);
    const second = createSingleMatchSession(world, { ...setup, seed: 'another-match' });
    const all = [
      ...first.home.players,
      ...(first.home.bench ?? []),
      ...first.away.players,
      ...(first.away.bench ?? []),
    ];
    for (const player of all) {
      const match = [
        ...second.home.players,
        ...(second.home.bench ?? []),
        ...second.away.players,
        ...(second.away.bench ?? []),
      ].find((entry) => entry.footballerId === player.footballerId)!;
      expect(deriveAppearance(player.profile, first.presentation!.date)).toEqual(
        deriveAppearance(match.profile, second.presentation!.date),
      );
    }
    const editedId = first.home.bench![0]!.footballerId;
    const editedProfile = world.footballers[editedId]!.profile;
    const edited = {
      ...world,
      footballers: {
        ...world.footballers,
        [editedId]: {
          ...world.footballers[editedId]!,
          profile: {
            ...editedProfile,
            visualIdentity: createVisualIdentity(editedId, undefined, { hairstyle: 'long' }),
          },
        },
      },
    };
    const session = createSingleMatchSession(edited, setup);
    expect(Object.keys(session.presentation!.visualIdentities)).toEqual([editedId]);
    expect(
      session.home.bench!.find((player) => player.footballerId === editedId)!.profile
        .visualIdentity,
    ).toBeUndefined();
    const state = createTacticalMatch(session);
    const projector = new PresentationFrameProjector(session.presentation);
    const live = projector.frame(state);
    const replay = projector.replayFrame(captureReplaySnapshot(state, 0));
    for (const player of live.players)
      expect(replay.players.find((entry) => entry.id === player.id)!.appearance).toEqual(
        player.appearance,
      );
    expect(live.players[0]!.appearance).toEqual(
      deriveAppearance(state.players[0]!.profile, session.presentation!.date),
    );
  });

  it('keeps canonical physics byte-identical after cosmetic edits for the same input seed', () => {
    const first = createSingleMatchSession(world, setup);
    const id = first.home.players[6]!.footballerId;
    const edited = {
      ...world,
      footballers: {
        ...world.footballers,
        [id]: {
          ...world.footballers[id]!,
          profile: {
            ...world.footballers[id]!.profile,
            visualIdentity: createVisualIdentity(
              id,
              { headProportion: 0.99 },
              { presentation: 'feminine', hairstyle: 'long' },
            ),
          },
        },
      },
    };
    let before = createTacticalMatch(first);
    let after = createTacticalMatch(createSingleMatchSession(edited, setup));
    expect(after).toEqual(before);
    for (let tick = 0; tick < 1200; tick++) {
      before = stepTacticalMatch(before, FIXED_MATCH_DT);
      after = stepTacticalMatch(after, FIXED_MATCH_DT);
    }
    expect(after.time).toBeGreaterThan(20);
    expect(after).toEqual(before);
  }, 30_000);

  it('keeps an edited substitute identical while staging, entering and replaying', () => {
    const initial = createSingleMatchSession(world, setup);
    const incomingId = initial.home.bench![0]!.footballerId;
    const profile = world.footballers[incomingId]!.profile;
    const visualIdentity = createVisualIdentity(
      incomingId,
      { jawWidth: 0.1 },
      { hairstyle: 'curly' },
    );
    const editedWorld = {
      ...world,
      footballers: {
        ...world.footballers,
        [incomingId]: {
          ...world.footballers[incomingId]!,
          profile: { ...profile, visualIdentity },
        },
      },
    };
    const session = createSingleMatchSession(editedWorld, setup);
    let state = applyRestartScenario(createTacticalMatch(session), 'throw_in');
    const outgoing = state.players.find(
      (player) =>
        player.team === 'home' && isEligibleForNormalPosition(profile, player.slot.position),
    )!;
    outgoing.position = { x: 52.5, y: 0.2 };
    outgoing.velocity = { x: 0, y: 0 };
    state = requestSubstitutions(state, 'home', [{ outgoingId: outgoing.id, incomingId }]);
    expect(state.substitutionState!.pending).toHaveLength(1);
    const projector = new PresentationFrameProjector(session.presentation);
    const expected = deriveAppearance({ ...profile, visualIdentity }, session.presentation!.date);
    expect(
      projector.frame(state).players.find((player) => player.id === incomingId)!.appearance,
    ).toEqual(expected);
    for (let tick = 0; tick < 400 && state.substitutionState!.pending.length; tick++) {
      const previous = state;
      state = advanceMatchSubstitutions(
        previous,
        { ...state, time: state.time + FIXED_MATCH_DT },
        FIXED_MATCH_DT,
      );
    }
    expect(state.players.some((player) => player.id === incomingId)).toBe(true);
    expect(
      projector.frame(state).players.find((player) => player.id === incomingId)!.appearance,
    ).toEqual(expected);
    expect(
      projector
        .replayFrame(captureReplaySnapshot(state, 0))
        .players.find((player) => player.id === incomingId)!.appearance,
    ).toEqual(expected);
  });

  it('reconstructs future generated footballers without saved genomes and retains retirement identity', () => {
    const id = createProceduralFootballerId({
      kind: 'intake',
      ownerId: world.clubs[0]!.id,
      season: 2040,
      position: 'striker',
      slot: 4,
    });
    const footballer = resolveProceduralFootballer(id, world.clubs)!;
    expect(footballer.profile.visualIdentity).toBeUndefined();
    expect(deriveAppearance(footballer.profile, '2040-07-01')).toEqual(
      deriveAppearance(resolveProceduralFootballer(id, world.clubs)!.profile, '2040-07-01'),
    );
    const edited = updateCareerAppearance(career(), { hairstyle: 'side_part' });
    const retired = retireCareer({ ...edited, currentDate: '2060-07-01' });
    expect(retired.player.id).toBe(edited.player.id);
    expect(retired.player.visualIdentity).toBe(edited.player.visualIdentity);
    expect(deriveAppearance(retired.player, '2060-07-01').baseFace).toEqual(
      deriveAppearance(edited.player, '2026-07-01').baseFace,
    );
  });

  it('excludes appearance from career contract fingerprints and canonical match input', () => {
    let professional = advanceCareerFlow({
      ...career(),
      seasonOutcome: { finalPosition: 6, champion: false, competitionType: 'academy' },
    });
    professional = acceptProfessionalOffer(professional, professional.professionalOffers![0]!.id);
    for (let week = 0; week < 50 && !getCurrentFixture(professional); week++)
      professional = advanceCareerWeek(professional);
    const before = createCareerMatchInput(professional, world, undefined, true);
    const edited = updateCareerAppearance(professional, {
      presentation: 'feminine',
      hairstyle: 'long',
      hairColor: 0.99,
    });
    const after = createCareerMatchInput(edited, world, 'changed-presentation-seed', true);
    expect(after.footballFingerprint).toBe(before.footballFingerprint);
    expect(after.session).toEqual(before.session);
    expect(startCareerMatch(after)).toEqual(startCareerMatch(before));
    expect(after.presentation.visualContext!.visualIdentities[edited.player.id]).toEqual(
      edited.player.visualIdentity,
    );
  });
});
