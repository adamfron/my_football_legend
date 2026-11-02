import test from 'node:test';
import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { holisticInventory } from './pr214Inventory.mjs';
import { files } from './pr199Evidence.mjs';

const paths = files('src/core/matchSimulation').filter((p) => !p.includes('.test.'));
const codepoint = [...paths].sort();
const windows = [...paths].sort((a, b) => {
  const x = a.toLowerCase(),
    y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
});
const readReceipt = (version) =>
  JSON.parse(gunzipSync(readFileSync(`docs/performance/pr214/canonical-${version}.json.gz`)))
    .result;

test('inventory preserves identical references across Windows, Linux and reversed enumeration', () => {
  assert.notDeepEqual(
    windows,
    codepoint,
    'The regression fixture must exercise different filesystem orders',
  );
  const input = [...windows];
  const a = holisticInventory(input),
    b = holisticInventory(codepoint),
    c = holisticInventory([...codepoint].reverse());
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  assert.deepEqual(input, windows, 'Inventory must not mutate the supplied file enumeration');
  assert.ok(
    a.records.some((r) => r.sourceLocations.includes('src/core/matchSimulation/footContact.ts')),
  );
  assert.ok(a.records.some((r) => r.sourceLocations.some((p) => p.includes('football'))));
  // Equality must not be obtained by dropping source evidence.
  assert.notDeepEqual(
    a,
    holisticInventory(codepoint.filter((p) => !p.endsWith('/footContact.ts'))),
  );
});

test('the CI correction preserves all recorded physical/configuration evidence exactly', () => {
  const original = readReceipt('final-v3'),
    current = readReceipt('ci-v1');
  assert.deepEqual(
    current.rows,
    original.rows,
    'Every body/ball frame, event, impulse, save and terminal hash must remain exact',
  );
  assert.deepEqual(
    current.reference,
    original.reference,
    'The strict PR213 reference must remain exact',
  );
  const { source: oldSource, ...oldProtocol } = original.protocol;
  const { source: newSource, ...newProtocol } = current.protocol;
  assert.notEqual(
    newSource.fingerprint,
    oldSource.fingerprint,
    'The observer correction needs a new source identity',
  );
  assert.deepEqual(
    newProtocol,
    oldProtocol,
    'Selections, rosters, seed, input hashes and readiness must remain exact',
  );
  assert.deepEqual(
    current.inventory,
    {
      ...original.inventory,
      records: original.inventory.records.map((r) => ({
        ...r,
        sourceLocations: [...r.sourceLocations].sort(),
      })),
    },
    'Only unordered source-location metadata may change order',
  );
});

console.log('PR214 inventory order and unchanged-physics contracts');
