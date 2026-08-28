import { describe, expect, it } from 'vitest';
import {
  CLUB_COLOR_PAIRS,
  generateClubVisualIdentity,
  resolveClubVisualIdentity,
} from './clubVisualIdentity';
import { generateProfessionalClubPool } from './professionalClubs';

describe('club visual identity', () => {
  it('generates stable two-colour identities and variation between clubs', () => {
    const first = generateProfessionalClubPool('identity-seed');
    const repeated = generateProfessionalClubPool('identity-seed');
    expect(first[0]!.visualIdentity).toEqual(repeated[0]!.visualIdentity);
    expect(first[0]!.visualIdentity?.primaryColor).toMatch(/^#/);
    expect(first[0]!.visualIdentity?.secondaryColor).toMatch(/^#/);
    expect(new Set(first.map((club) => JSON.stringify(club.visualIdentity))).size).toBeGreaterThan(
      1,
    );
  });

  it('allows identical and white colours without mutating canonical values', () => {
    expect(CLUB_COLOR_PAIRS).toContainEqual({
      primaryColor: '#ffffff',
      secondaryColor: '#ffffff',
    });
    const white = { primaryColor: '#ffffff', secondaryColor: '#ffffff' };
    expect(resolveClubVisualIdentity('seed', { id: 'white-club', visualIdentity: white })).toEqual(
      white,
    );
  });

  it('uses both seed and stable club id', () => {
    expect(generateClubVisualIdentity('seed', 'club')).toEqual(
      generateClubVisualIdentity('seed', 'club'),
    );
  });
});
