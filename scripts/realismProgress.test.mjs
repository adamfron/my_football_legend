import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseRegistry, validateProgress, generateProgress } from './realismProgress.mjs';
import { read } from './pr199Evidence.mjs';
const registry = parseRegistry(readFileSync('docs/match-engine/ASSUMPTIONS_REGISTER.md', 'utf8'));
const mapping = read('docs/match-engine/REALISM_EVIDENCE.json');
const frozen = read('docs/performance/pr199/frozen-pr198.json');
const check = (r = registry, m = mapping) =>
  validateProgress(
    r,
    m,
    frozen.registry.map((r) => r.id),
    false,
  );
describe('authoritative realism-progress integrity', () => {
  it('covers every original identity exactly once and derives deduplicated counts', () => {
    expect(check()).toBe(true);
    const report = generateProgress(registry, mapping, frozen);
    expect(report.total).toBe(new Set(registry.map((r) => r.id)).size);
    expect(report.supportedCounts.COMPLETE).toBe(registry.filter((r) => r.checked).length);
    expect(report.historicalUpdateCount).toBe(
      new Set([196, 197, 198].flatMap((pr) => report.explicitDevelopmentUpdates[pr])).size,
    );
  });
  it('rejects duplicate and missing mappings', () => {
    const duplicate = globalThis.structuredClone(mapping);
    duplicate.records.push(duplicate.records[0]);
    expect(() => check(registry, duplicate)).toThrow(/Duplicate/);
    const missing = globalThis.structuredClone(mapping);
    missing.records.pop();
    expect(() => check(registry, missing)).toThrow(/Missing/);
  });
  it('rejects invalid status and positive classification without evidence', () => {
    const invalid = globalThis.structuredClone(mapping);
    invalid.records[0].dimensions.SOURCE_AUDITED.status = 'DONE';
    expect(() => check(registry, invalid)).toThrow();
    const empty = globalThis.structuredClone(mapping);
    empty.records[0].dimensions.SOURCE_AUDITED.evidence = [];
    expect(() => check(registry, empty)).toThrow(/Unsupported positive/);
  });
  it('rejects cross-issue references and invented closure', () => {
    const bad = globalThis.structuredClone(mapping);
    bad.records[0].dimensions.ROOT_CAUSE_IDENTIFIED.evidence = ['arrival-correction'];
    expect(() => check(registry, bad)).toThrow(/Invalid item evidence/);
    const closed = globalThis.structuredClone(mapping);
    closed.records[0].dimensions.COMPLETE = {
      status: 'SUPPORTED',
      evidence: ['source-register'],
      limitation: 'test',
    };
    expect(() => check(registry, closed)).toThrow(/COMPLETE disagrees/);
  });
  it('rejects removed historical IDs even if mapping size is adjusted', () => {
    const r = registry.slice(1),
      m = globalThis.structuredClone(mapping);
    m.records.shift();
    expect(() => check(r, m)).toThrow(/Historical/);
  });
  it('keeps the checkbox contract strict', () => {
    expect(() => parseRegistry('### TEST-001 — example\n\n- [x] LAB_ACTIVE\n')).toThrow();
  });
  it('cannot turn development evidence into independent confirmation', () => {
    const m = globalThis.structuredClone(mapping);
    m.records[0].dimensions.INDEPENDENT_VALIDATED = {
      status: 'SUPPORTED',
      evidence: ['source-register'],
      limitation: 'test',
    };
    expect(() => check(registry, m)).toThrow(/sealed/);
  });
});
