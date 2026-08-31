import { describe, expect, test } from 'vitest';
import { worldDatabaseSchema } from '../src/core/worldDatabase';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';

describe('canonical world database generation', () => {
  test('builds a valid and internally consistent professional world', () => {
    const database = createCanonicalWorldDatabase();
    expect(database.clubs).toHaveLength(64);
    const seniorFootballerCount = database.clubs.reduce(
      (count, club) => count + (club.squadPlayerIds?.length ?? 0),
      0,
    );
    const youthFootballerCount = Object.values(database.youthCohorts).reduce(
      (count, cohort) => count + cohort.length,
      0,
    );
    expect(Object.keys(database.youthCohorts)).toHaveLength(12);
    expect(youthFootballerCount).toBe(12 * 24);
    expect(Object.keys(database.footballers)).toHaveLength(
      seniorFootballerCount + youthFootballerCount,
    );
    for (const club of database.clubs)
      for (const id of club.squadPlayerIds ?? [])
        expect(database.footballers[id], `unresolved squad member: ${id}`).toBeDefined();
    expect(() => worldDatabaseSchema.parse(database)).not.toThrow();
  });

  test('serializes identically for the canonical seed and version', () => {
    expect(JSON.stringify(createCanonicalWorldDatabase())).toBe(
      JSON.stringify(createCanonicalWorldDatabase()),
    );
  });
});
