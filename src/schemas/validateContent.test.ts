import { describe, expect, it } from 'vitest';
import { validateSampleContent } from './validateContent';

describe('sample content validation', () => {
  it('loads and validates all sample content groups', () => {
    const content = validateSampleContent();
    expect(content.archetypes).toHaveLength(1);
    expect(content.careerPremises).toHaveLength(1);
    expect(content.clubs).toHaveLength(1);
    expect(content.people).toHaveLength(1);
    expect(content.events).toHaveLength(1);
    expect(content.historyFacts).toHaveLength(1);
    expect(content.storyThreads).toHaveLength(1);
  });
});
