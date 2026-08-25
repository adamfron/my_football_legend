import type { NarrativeVariantSet } from './narrativeVariants';
export interface NarrativeAuditResult {
  valid: boolean;
  errors: string[];
}
const technical =
  /\b(?:criticalFailure|resolutionTier|decisionId|selectionOutcome|[a-z]+_[a-z_]+)\b/;
export const auditNarrativeVariants = (
  sets: NarrativeVariantSet[],
  dictionary: Record<string, string>,
): NarrativeAuditResult => {
  const errors: string[] = [];
  for (const set of sets) {
    if (set.variants.length < 2) errors.push(`${set.id}: wymaga co najmniej dwóch wariantów`);
    const texts = set.variants.map((v) => dictionary[v.key]);
    set.variants.forEach((v, i) => {
      if (!texts[i]) errors.push(`${set.id}: brak klucza ${v.key}`);
      else if (technical.test(texts[i]!))
        errors.push(`${set.id}: tekst ujawnia identyfikator techniczny`);
    });
    if (new Set(texts.filter(Boolean)).size !== texts.filter(Boolean).length)
      errors.push(`${set.id}: warianty mają identyczny tekst`);
  }
  return { valid: errors.length === 0, errors };
};
