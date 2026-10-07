// @vitest-environment node
import { expect, it } from 'vitest';
import { findCanonicalDifference } from './pr156CanonicalComparison';

const record = () => ({
  teams: {
    home: { phase: 'positional_attack', support: [{ playerId: 'cm', target: { x: 50, y: 34 } }] },
  },
  statistics: {
    players: Array.from({ length: 22 }, (_, i) => ({ playerId: String(i), touches: i })),
    ledger: Array.from({ length: 512 }, (_, i) => ({ id: String(i), source: 'autonomous_npc' })),
  },
});
it('compares every property of separately allocated equal canonical objects without a false parent difference', () => {
  const a = record();
  expect(findCanonicalDifference(a, structuredClone(a))).toBeNull();
  expect(findCanonicalDifference(a, a)).toBeNull();
});
it('finds a source-only difference in the last ledger row', () => {
  const a = record(),
    b = structuredClone(a);
  b.statistics.ledger[511]!.source = 'human_selected';
  expect(findCanonicalDifference(a, b)).toBe('.statistics.ledger.511.source');
});
it('finds the last starter counter without excluding statistics', () => {
  const a = record(),
    b = structuredClone(a);
  b.statistics.players[21]!.touches++;
  expect(findCanonicalDifference(a, b)).toBe('.statistics.players.21.touches');
});
it('distinguishes array length and object/array shape', () => {
  expect(findCanonicalDifference({ ledger: [1] }, { ledger: [1, 2] })).toBe('.ledger.length');
  expect(findCanonicalDifference({ ledger: [1] }, { ledger: { 0: 1 } })).toBe('.ledger');
});
it('matches JSON omission of an undefined optional property and detects a newly present value', () => {
  expect(findCanonicalDifference({ optional: undefined }, {})).toBeNull();
  expect(findCanonicalDifference({ optional: undefined }, { optional: 3 })).toBe('.optional');
});
