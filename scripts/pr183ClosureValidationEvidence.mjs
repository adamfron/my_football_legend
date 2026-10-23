import { readFileSync } from 'node:fs';
import { digest, pr183SourceHash } from './pr183Evidence.mjs';
export { digest, pr183SourceHash };
export const pr183HarnessHash = () =>
  digest(
    [
      'scripts/benchmarkPr183ClosureValidation.mjs',
      'scripts/runPr183ClosureValidation.mjs',
      'scripts/pr183ClosureValidationEvidence.mjs',
      'scripts/preparePr183ClosureInputs.mjs',
      'scripts/pr183ClosureObservation.ts',
      'scripts/pr183Observation.ts',
      'scripts/pr181Observation.ts',
      'scripts/pr182Observation.ts',
      'scripts/pr183Evidence.mjs',
      'scripts/pr182Evidence.mjs',
    ]
      .map((p) => `${p}\0${readFileSync(p, 'utf8').replaceAll('\r\n', '\n')}\0`)
      .join(''),
  );
