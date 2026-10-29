import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { json, nodeResourceSchema } from './manifest.mjs';

// Only completed atomic publications are readable. Pool shutdown can terminate
// an observer midway through exit; keep that missing measurement explicit.
export function readNodeResources(directory) {
  const names = readdirSync(directory);
  return {
    samples: names
      .filter((n) => n.endsWith('.json'))
      .map((n) => nodeResourceSchema.parse(json(join(directory, n)))),
    incomplete: names.filter((n) => n.endsWith('.json.tmp')),
  };
}
