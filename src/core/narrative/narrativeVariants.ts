import {
  narrativeVariantContextSchema,
  narrativeVariantSetSchema,
} from '../../schemas/domainSchemas';
import { RandomGenerator } from '../random/RandomGenerator';

export interface NarrativeVariant {
  key: string;
  weight?: number;
  requiredTags?: string[];
  excludedTags?: string[];
}
export interface NarrativeVariantSet {
  id: string;
  variants: NarrativeVariant[];
}
export interface NarrativeVariantContext {
  careerSeed: string;
  scope: string;
  tags: string[];
  factIds?: string[];
  actorIds?: string[];
}

const FALLBACK_KEY = 'narrative.fallback';
const canonical = (values: string[] | undefined) => [...new Set(values ?? [])].sort().join('|');

/** Selects copy without consuming the simulation RNG. Context arrays are canonicalized so fact ordering is irrelevant. */
export const selectNarrativeVariant = (
  set: NarrativeVariantSet,
  context: NarrativeVariantContext,
): string => {
  narrativeVariantSetSchema.parse(set);
  narrativeVariantContextSchema.parse(context);
  const tags = new Set(context.tags);
  const eligible = set.variants.filter(
    (variant) =>
      (variant.requiredTags ?? []).every((tag) => tags.has(tag)) &&
      !(variant.excludedTags ?? []).some((tag) => tags.has(tag)),
  );
  if (!eligible.length) return FALLBACK_KEY;
  const total = eligible.reduce((sum, variant) => sum + (variant.weight ?? 1), 0);
  const rng = RandomGenerator.fromSeed(
    [
      context.careerSeed,
      set.id,
      context.scope,
      canonical(context.tags),
      canonical(context.factIds),
      canonical(context.actorIds),
    ].join('::'),
  );
  let cursor = rng.float() * total;
  for (const variant of eligible) {
    cursor -= variant.weight ?? 1;
    if (cursor < 0) return variant.key;
  }
  return eligible.at(-1)?.key ?? FALLBACK_KEY;
};

export type NarrativeFragment =
  | 'opening'
  | 'decision'
  | 'result'
  | 'relationshipCallback'
  | 'nextStep';
export const composeNarrativeSummary = (
  sets: Record<NarrativeFragment, NarrativeVariantSet>,
  context: NarrativeVariantContext,
  translate: (key: string) => string,
): string =>
  (Object.keys(sets) as NarrativeFragment[])
    .map((part) =>
      translate(
        selectNarrativeVariant(sets[part], { ...context, scope: `${context.scope}.${part}` }),
      ).trim(),
    )
    .filter((text, index, all) => text && all.indexOf(text) === index)
    .join(' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s{2,}/g, ' ');

export const narrativeFallbackKey = FALLBACK_KEY;
