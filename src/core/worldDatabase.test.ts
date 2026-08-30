import { describe, expect, test } from 'vitest';
import databaseJson from '../../public/data/world/pl-2026-v1.json';
import {
  buildWorldDatabaseUrl,
  emptyWorldDelta,
  resolveWorldFootballer,
  resolveWorldSquad,
  worldDatabaseSchema,
} from './worldDatabase';
import { generateStartingPlayerProfile } from './playerCreator';

const database = worldDatabaseSchema.parse(databaseJson);
const player = generateStartingPlayerProfile(
  {
    firstName: 'Ada',
    lastName: 'Test',
    age: 16,
    nationality: 'PL',
    dominantFoot: 'right',
    difficulty: 'normal',
    position: 'striker',
    heightCm: 180,
    weightKg: 75,
    seed: 'resolution',
  },
  'resolution',
  0,
).player;

describe('static world URL', () => {
  test('builds the URL for the domain root', () => {
    expect(buildWorldDatabaseUrl('/')).toBe('/data/world/pl-2026-v1.json');
  });

  test('builds the URL for a GitHub Pages project', () => {
    expect(buildWorldDatabaseUrl('/my_football_legend/')).toBe(
      '/my_football_legend/data/world/pl-2026-v1.json',
    );
  });
});

describe('static world and delta resolution', () => {
  test('validates every immutable squad reference', () => {
    expect(database.clubs).toHaveLength(64);
    expect(Object.keys(database.footballers)).toHaveLength(1536);
    for (const club of database.clubs)
      for (const id of club.squadPlayerIds ?? []) expect(database.footballers[id]).toBeDefined();
  });
  test('resolves overrides without mutating the base', () => {
    const original = Object.values(database.footballers)[0]!;
    const changed = { ...original, reputation: (original.reputation ?? 0) + 1 };
    const delta = {
      ...emptyWorldDelta(),
      footballerOverrides: { [original.profile.id]: changed },
      squadOverrides: { [database.clubs[0]!.id]: [] },
    };
    expect(
      resolveWorldFootballer(
        { baseWorld: database, player, worldDelta: delta },
        original.profile.id,
      ),
    ).toBe(changed);
    expect(
      resolveWorldSquad({ baseWorld: database, player, worldDelta: delta }, database.clubs[0]!.id),
    ).toEqual([]);
    expect(database.footballers[original.profile.id]!.reputation).toBe(original.reputation);
  });
});
