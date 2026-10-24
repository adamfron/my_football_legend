import { describe, expect, it } from 'vitest';
import { deriveWallContactCandidate, findFirstBallContact, resolveBallRebound } from './ballFlight';
import { CONTACT_RESEARCH_PLAN, contactResearchCaseSchema } from './footballContactResearchPlan';

describe('crowded contact research regressions', () => {
  it('preserves the four separate contact categories and validates every plan', () => {
    expect(new Set(CONTACT_RESEARCH_PLAN.map((r) => r.category)).size).toBe(4);
    for (const row of CONTACT_RESEARCH_PLAN)
      expect(contactResearchCaseSchema.safeParse(row).success).toBe(true);
  });
  it('uses actual swept body geometry for an oblique deflection and keeps a gap open', () => {
    const body = deriveWallContactCandidate('defender', { x: 90, y: 34 }, 1.8);
    const found = findFirstBallContact({
      previous: { x: 89, y: 34.2, z: 1 },
      next: { x: 91, y: 34.2, z: 1 },
      attackingTeam: 'home',
      candidates: [body],
    });
    expect(found?.kind).toBe('defender');
    expect(found?.playerId).toBe('defender');
    const incoming = { x: 20, y: 0, z: 0 };
    const rebound = resolveBallRebound('defender', incoming, 'home', undefined, {
      surfaceNormal: found!.surfaceNormal,
    });
    expect(Math.abs(rebound.velocity.y)).toBeGreaterThan(0);
    expect(
      Math.hypot(rebound.velocity.x, rebound.velocity.y, rebound.velocity.z),
    ).toBeLessThanOrEqual(20);
    expect(
      findFirstBallContact({
        previous: { x: 89, y: 34.6, z: 1 },
        next: { x: 91, y: 34.6, z: 1 },
        attackingTeam: 'home',
        candidates: [body],
      }),
    ).toBeUndefined();
  });
});
