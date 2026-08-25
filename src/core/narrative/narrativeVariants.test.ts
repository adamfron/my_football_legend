import { describe, expect, it } from 'vitest';
import {
  composeNarrativeSummary,
  narrativeFallbackKey,
  selectNarrativeVariant,
  type NarrativeVariantSet,
} from './narrativeVariants';
const set: NarrativeVariantSet = {
  id: 'test',
  variants: [
    { key: 'a', weight: 1, requiredTags: ['friendly_rivalry'] },
    { key: 'b', weight: 4, excludedTags: ['hostile_rivalry'] },
  ],
};
describe('narrative variants', () => {
  it('is deterministic and filters tags', () => {
    const c = { careerSeed: 'seed', scope: 'scene', tags: ['friendly_rivalry'] };
    expect(selectNarrativeVariant(set, c)).toBe(selectNarrativeVariant(set, c));
    expect(selectNarrativeVariant(set, { ...c, tags: ['hostile_rivalry'] })).toBe(
      narrativeFallbackKey,
    );
  });
  it('uses stable fallback', () =>
    expect(
      selectNarrativeVariant(
        { id: 'none', variants: [{ key: 'x', requiredTags: ['x'] }] },
        { careerSeed: 's', scope: 'result', tags: [] },
      ),
    ).toBe(narrativeFallbackKey));
  it('composes independently scoped fragments without duplicates', () => {
    const one = { id: 'one', variants: [{ key: 'one' }] };
    expect(
      composeNarrativeSummary(
        { opening: one, decision: one, result: one, relationshipCallback: one, nextStep: one },
        { careerSeed: 's', scope: 'summary', tags: [] },
        () => 'Zdanie.',
      ),
    ).toBe('Zdanie.');
  });
});
