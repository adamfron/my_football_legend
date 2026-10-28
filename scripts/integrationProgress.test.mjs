import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { read } from './pr200Evidence.mjs';
import { parseRegistry } from './realismProgress.mjs';
import { validateIntegrationProgress } from './integrationProgress.mjs';
const mapping = read('docs/match-engine/INTEGRATION_EVIDENCE.json');
const registry = parseRegistry(readFileSync('docs/match-engine/ASSUMPTIONS_REGISTER.md', 'utf8'));
describe('integration evidence gates independent of historical closure', () => {
  it('validates source-backed scope without canonical promotion', () =>
    expect(validateIntegrationProgress(mapping, registry)).toBe(true));
  it('rejects positive selection with no evidence', () => {
    const m = globalThis.structuredClone(mapping);
    m.records[0].dimensions.LIVE_CONSUMER_PRESENT.evidence = [];
    expect(() => validateIntegrationProgress(m, registry, false)).toThrow(/Unsupported positive/);
  });
  it('rejects an invented original issue identity', () => {
    const m = globalThis.structuredClone(mapping);
    m.records[0].ids = ['FAKE-001'];
    expect(() => validateIntegrationProgress(m, registry, false)).toThrow(/Unregistered/);
  });
  it('cannot convert integrated presence to canonical promotion', () => {
    const m = globalThis.structuredClone(mapping);
    m.records[0].dimensions.CANONICAL_PROMOTED = {
      status: 'SUPPORTED',
      evidence: ['inventory'],
      limitation: 'test',
    };
    expect(() => validateIntegrationProgress(m, registry, false)).toThrow(/no canonical promotion/);
  });
  it('rejects changed evidence bytes even when a positive status remains', () => {
    const m = globalThis.structuredClone(mapping);
    m.evidence[0].sha256 = '0'.repeat(64);
    expect(() => validateIntegrationProgress(m, registry)).toThrow(/bytes drift/);
  });
});
