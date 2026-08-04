import { z } from 'zod';

const score = z.number().min(0).max(100);
const unit = z.number().min(0).max(1);
const id = z.string().min(1);

export const relationshipScoresSchema = z.object({
  liking: score, trust: score, respect: score, rivalry: score, resentment: score, gratitude: score, professionalDependence: score,
});
export const faceGenomeSchema = z.object({
  headProportion: unit, jawWidth: unit, chinLength: unit, eyeSpacing: unit, eyeSize: unit, browShape: unit,
  noseLength: unit, noseWidth: unit, mouthWidth: unit, earSize: unit, skinTone: unit, eyeColor: unit, hairColor: unit,
  hairstyle: unit, facialHair: unit, ageSigns: unit, accessories: unit,
});
export const playerAttributesSchema = z.object({ technique: score, vision: score, pace: score, stamina: score, finishing: score, defending: score, leadership: score, composure: score });
export const playerSchema = z.object({ id, firstName: z.string(), lastName: z.string(), age: z.number().int().min(15), nationality: z.string(), heightCm: z.number(), weightKg: z.number(), attributes: playerAttributesSchema, traits: z.array(z.string()), archetypeId: id, careerPremiseId: id, potential: score, primaryPosition: z.string(), secondaryPositions: z.array(z.string()), positionFamiliarity: z.record(z.string(), unit), preferredRoles: z.array(z.string()), fitness: score, health: score, morale: score, reputation: score });
export const personSchema = z.object({ id, firstName: z.string(), lastName: z.string(), role: z.string(), nationality: z.string(), age: z.number().int(), personality: z.array(z.string()), clubId: id.optional(), persistence: z.enum(['ephemeral','local','career']), relationshipParameters: relationshipScoresSchema, faceSeed: z.string(), faceGenome: faceGenomeSchema.optional(), narrativeTags: z.array(z.string()) });
export const clubSchema = z.object({ id, name: z.string(), country: z.string(), region: z.string(), dna: z.array(z.string()), currentSituation: z.string(), playStyle: z.string(), youthApproach: z.string(), prestige: score, seasonHistory: z.array(z.object({ season: z.number().int(), summary: z.string(), placement: z.number().int().optional() })), notablePlayers: z.array(id), notableCoaches: z.array(id), legends: z.array(id), rivals: z.array(id) });
export const eventDefinitionSchema = z.object({ id, version: z.number().int().positive(), category: z.string(), tags: z.array(z.string()), availabilityConditions: z.array(z.string()), cast: z.array(z.string()), playerInformationKeys: z.array(z.string()), decisions: z.array(z.object({ id, labelKey: z.string(), descriptionKey: z.string(), visiblePros: z.array(z.string()), visibleCons: z.array(z.string()) })).min(1), hiddenTests: z.array(z.object({ id, attribute: z.string(), difficulty: score, successChanceModifier: z.number().optional() })), consequences: z.array(z.object({ id, type: z.string(), data: z.record(z.string(), z.unknown()), factType: z.string().optional() })), nextEventIds: z.array(id), localizationKeys: z.object({ title: z.string(), summary: z.string() }) });
export const eventInstanceSchema = z.object({ id, definitionId: id, context: z.record(z.string(), z.unknown()), cast: z.record(z.string(), id), selectedDecisionId: id.optional(), randomState: z.string(), result: z.record(z.string(), z.unknown()).optional(), createdFactIds: z.array(id), threadChanges: z.record(z.string(), z.string()) });
export const historyFactSchema = z.object({ id, factType: z.string(), season: z.number().int(), date: z.string(), actors: z.array(id), targets: z.array(id), clubs: z.array(id), competitions: z.array(z.string()), data: z.record(z.string(), z.unknown()), causes: z.array(id), tags: z.array(z.string()), visibility: z.enum(['hidden','partial','public']), narrativeImportance: score, emotionalTone: z.enum(['positive','neutral','negative','bittersweet']) });
export const storyThreadSchema = z.object({ id, threadType: z.string(), participants: z.array(id), relatedFactIds: z.array(id), status: z.enum(['open','dormant','closed']), tension: score, importance: score, openedSeason: z.number().int(), lastActivitySeason: z.number().int(), recallTags: z.array(z.string()) });
export const careerStateSchema = z.object({ seed: z.string(), currentSeason: z.number().int(), player: playerSchema, currentClub: clubSchema, previousClubIds: z.array(id), significantPeople: z.array(personSchema), relationships: z.record(z.string(), relationshipScoresSchema), historyFacts: z.array(historyFactSchema), storyThreads: z.array(storyThreadSchema), statistics: z.record(z.string(), z.number()), activeEvent: eventInstanceSchema.optional() });

export const archetypeSchema = z.object({ id, nameKey: z.string(), descriptionKey: z.string(), attributeBias: playerAttributesSchema.partial(), tags: z.array(z.string()) });
export const careerPremiseSchema = z.object({ id, nameKey: z.string(), descriptionKey: z.string(), startingAge: z.number().int(), startingReputation: score, tags: z.array(z.string()) });
