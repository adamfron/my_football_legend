import { describe, expect, test } from 'vitest';
import { worldDatabaseSchema } from '../src/core/worldDatabase';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';

describe('canonical world database generation', () => {
  test('builds a valid and internally consistent professional world', () => {
    const database = createCanonicalWorldDatabase();
    expect(database.clubs).toHaveLength(64);
    expect(Object.keys(database.footballers)).toHaveLength(1536);
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
