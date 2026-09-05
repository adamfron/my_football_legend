import { describe, expect, it } from 'vitest';
import { generateProfessionalClubPool } from './professionalClubs';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import {
  createProfessionalContract,
  evaluateExpectedMonthlySalary,
  evaluatePlayerMarketValue,
  evaluateTransferFee,
} from './playerEconomy';

const fixture = () => {
  const career = createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Parzysty',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'striker',
        heightCm: 181,
        weightKg: 75,
        seed: 'economy-parity',
      },
      'economy-parity',
      0,
    ),
    'economy-parity',
  );
  return { career, club: generateProfessionalClubPool('economy-parity')[0]! };
};

describe('canonical footballer economy', () => {
  it('gives protagonist and NPC identity wrappers the same base salary', () => {
    const { career, club } = fixture();
    const context = {
      player: career.player,
      club,
      role: 'rotation' as const,
      date: '2027-07-01',
      reputation: 35,
    };
    expect(evaluateExpectedMonthlySalary({ ...context, player: { ...career.player } })).toBe(
      evaluateExpectedMonthlySalary(context),
    );
  });

  it('orders canonical role and club context separately from bounded offer variation', () => {
    const { career, club } = fixture();
    const base = (role: 'development_player' | 'rotation' | 'star_player', targetClub = club) =>
      evaluateExpectedMonthlySalary({
        player: career.player,
        club: targetClub,
        role,
        date: '2027-07-01',
        reputation: 35,
      });
    expect(base('star_player')).toBeGreaterThan(base('rotation'));
    expect(base('rotation')).toBeGreaterThan(base('development_player'));
    expect(base('rotation', { ...club, leagueTier: 1, financialLevel: 90 })).toBeGreaterThan(
      base('rotation', { ...club, leagueTier: 4, financialLevel: 30 }),
    );
    const contract = (offerFactor: number) =>
      createProfessionalContract({
        player: career.player,
        club,
        role: 'rotation',
        date: '2027-07-01',
        reputation: 35,
        startDate: '2027-07-01',
        endDate: '2030-06-30',
        offerFactor,
      });
    expect(contract(0.75).monthlySalary).toBeLessThan(contract(1.25).monthlySalary);
  });

  it('keeps signed salary fixed and distinguishes market value from a free-agent fee', () => {
    const { career, club } = fixture();
    const contract = createProfessionalContract({
      player: career.player,
      club,
      role: 'rotation',
      date: '2027-07-01',
      reputation: 35,
      startDate: '2027-07-01',
      endDate: '2030-06-30',
    });
    const context = {
      player: career.player,
      club,
      date: '2031-07-01',
      reputation: 50,
      developmentProfile: career.developmentProfile,
    };
    expect(contract.monthlySalary).toBeGreaterThan(0);
    expect(evaluatePlayerMarketValue(context)).toBeGreaterThan(0);
    expect(evaluateTransferFee(context)).toBe(0);
  });
});
