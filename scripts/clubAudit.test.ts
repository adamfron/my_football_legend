import { describe, expect, it } from 'vitest';
import { getClubQualityDiagnostic } from '../src/core/clubObservability';
import { getBootstrapClubStrength } from '../src/core/clubStrength';
import { populateFootballerWorld } from '../src/core/footballerWorld';
import { generateProfessionalClubPool } from '../src/core/professionalClubs';
import type { CareerState } from '../src/types/domain';

describe('club quality audit', () => {
  it('reports canonical XI distributions and integrity', () => {
    const generated = populateFootballerWorld(
      generateProfessionalClubPool('club-audit'),
      'club-audit',
    );
    const career = {
      seed: 'club-audit',
      currentSeason: 2026,
      currentDate: '2026-07-01',
      player: { id: '__audit__' },
      clubWorld: generated.clubs,
      footballerWorld: generated.footballerWorld,
    } as CareerState;
    const diagnostics = generated.clubs.map((club) => ({
      club,
      diagnostic: getClubQualityDiagnostic(career, club),
    }));
    const broken = diagnostics.filter((item) => !item.diagnostic);
    expect(
      broken,
      `Legal-XI failures: ${broken.map((item) => item.club.name).join(', ')}`,
    ).toHaveLength(0);
    for (const tier of [1, 2, 3, 4]) {
      const tierItems = diagnostics.filter((item) => item.club.leagueTier === tier);
      const rows = tierItems.map((item) => item.diagnostic!);
      const strengths = rows.map((row) => row.strength);
      const gaps = rows.map((row) => Math.abs(row.weakestGap));
      const bootstrapGap = Math.max(
        ...tierItems.map((item) =>
          Math.abs(getBootstrapClubStrength(item.club) - item.diagnostic!.strength),
        ),
      );
      console.info(
        `Tier ${tier}: canonical mean/min/max ${(strengths.reduce((a, b) => a + b, 0) / strengths.length).toFixed(1)}/${Math.min(...strengths)}/${Math.max(...strengths)}; bootstrap-vs-current max ${bootstrapGap}; legal-XI failures 0; fallback rate ${((rows.filter((r) => !r.preferredFormationFeasible).length / rows.length) * 100).toFixed(1)}%; weakest gap mean/max ${(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(1)}/${Math.max(...gaps).toFixed(1)}`,
      );
    }
  });
});
