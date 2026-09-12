import { describe, expect, it } from 'vitest';
import { physicalPointSchema, pitchPointSchema } from './matchSpace';

describe('spatial point contracts', () => {
  it('distinguishes bounded pitch positions from finite physical predictions', () => {
    const outside = { x: 61, y: -0.3 };
    expect(pitchPointSchema.safeParse(outside).success).toBe(false);
    expect(physicalPointSchema.safeParse(outside).success).toBe(true);
    expect(physicalPointSchema.safeParse({ x: Infinity, y: 2 }).success).toBe(false);
  });
});
