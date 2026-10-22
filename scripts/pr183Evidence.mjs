import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { digest, pr182SourceHash } from './pr182Evidence.mjs';
export { digest, pr182SourceHash as pr183SourceHash };
export const pr183HarnessHash = (root = '.') =>
  digest(
    [
      'scripts/benchmarkPr183.mjs',
      'scripts/pr183Evidence.mjs',
      'scripts/pr183Observation.ts',
      'scripts/runPr183Cohort.mjs',
      'scripts/pr181Observation.ts',
      'scripts/pr182Observation.ts',
      'scripts/preparePr183Inputs.mjs',
    ]
      .map((p) => `${p}\0${readFileSync(resolve(root, p), 'utf8').replaceAll('\r\n', '\n')}\0`)
      .join(''),
  );
