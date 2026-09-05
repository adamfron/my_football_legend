import { describe, expect, test } from 'vitest';
import type { ProfessionalClub } from '../types/domain';
import { getPlayerOverall } from './playerOverall';
import { generateProfessionalClubPool } from './professionalClubs';
import { createProceduralFootballerId, resolveProceduralFootballer } from './proceduralFootballers';
import { generateYouthFootballer } from './youthTalent';

const overall = (player: ReturnType<typeof generateYouthFootballer>) =>
  getPlayerOverall(player.profile, player.profile.primaryPosition);
const sample = (quality: number, prefix: string, count = 2000) =>
  Array.from({ length: count }, (_, slot) =>
    generateYouthFootballer({
      id: `${prefix}-${slot}`,
      seed: 'youth-calibration-test',
      age: 16,
      primaryPosition: 'striker',
      academyQuality: quality,
    }),
  );

describe('canonical youth talent model', () => {
  test('is deterministic and bounds potential independently from current ability', () => {
    const input = {
      id: 'stable-youth',
      seed: 'stable',
      age: 16 as const,
      primaryPosition: 'striker' as const,
      academyQuality: 52,
    };
    expect(generateYouthFootballer(input)).toEqual(generateYouthFootballer(input));
    const players = sample(50, 'potential', 500);
    const capacities = players.flatMap((player) =>
      Object.values(player.developmentProfile.familyCapacity),
    );
    expect(Math.min(...capacities)).toBeGreaterThanOrEqual(52);
    expect(Math.max(...capacities)).toBeLessThanOrEqual(96);
    expect(
      new Set(
        players.map(
          (player) =>
            `${overall(player)}:${Math.max(...Object.values(player.developmentProfile.familyCapacity))}`,
        ),
      ).size,
    ).toBeGreaterThan(100);
  });

  test('shifts academy probabilities without guaranteeing individual ordering', () => {
    const weak = sample(32, 'weak');
    const strong = sample(64, 'strong');
    const mean = (players: typeof weak) =>
      players.reduce((sum, player) => sum + overall(player), 0) / players.length;
    expect(mean(strong)).toBeGreaterThan(mean(weak) + 4);
    expect(weak.some((player, index) => overall(player) > overall(strong[index]!))).toBe(true);
  });

  test('keeps the exceptional teenage tail rare but possible', () => {
    const players = sample(55, 'large-tail', 20_000);
    const values = players.map(overall);
    expect(values.filter((value) => value >= 70).length).toBeGreaterThan(0);
    expect(values.filter((value) => value >= 70).length / values.length).toBeLessThan(0.005);
    expect(values.filter((value) => value < 60).length / values.length).toBeGreaterThan(0.7);
  });

  test('uses the canonical model for future intake and limits supplemental talent', () => {
    const club = generateProfessionalClubPool('canonical-model')[0]!;
    const intake = Array.from(
      { length: 1000 },
      (_, slot) =>
        resolveProceduralFootballer(
          createProceduralFootballerId({
            kind: 'intake',
            ownerId: club.id,
            season: 2028,
            position: 'striker',
            slot,
          }),
          [club],
        )!,
    );
    expect(intake.every(Boolean)).toBe(true);
    const supplemental = Array.from(
      { length: 500 },
      (_, slot) =>
        resolveProceduralFootballer(
          createProceduralFootballerId({
            kind: 'supplemental',
            ownerId: club.id,
            season: 2028,
            position: 'striker',
            slot,
          }),
          [club],
        )!,
    );
    expect(Math.max(...supplemental.map(overall))).toBeLessThanOrEqual(64);
    expect(supplemental.filter((player) => overall(player) >= 65)).toHaveLength(0);
  });

  test('preserves legacy v1 procedural identity resolution', () => {
    const club = generateProfessionalClubPool('legacy')[0] as ProfessionalClub;
    const id = `footballer_proc_v1_intake_${club.id}_2028_striker_0`;
    expect(resolveProceduralFootballer(id, [club])).toEqual(
      resolveProceduralFootballer(id, [club]),
    );
  });
});
