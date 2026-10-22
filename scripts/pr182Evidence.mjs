import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
export const digest = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || v instanceof Uint8Array ? v : JSON.stringify(v))
    .digest('hex');
export const pr182SourceHash = (root = '.', normaliseDefault = false) => {
  const sourceText = (path) => {
    const body = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
    return normaliseDefault && path.endsWith('decisionPolicyConfig.ts')
      ? body.replace(
          /DEFAULT_DECISION_POLICY: DecisionPolicyId = '[^']+';/,
          "DEFAULT_DECISION_POLICY: DecisionPolicyId = '@selection-only@';",
        )
      : body;
  };
  const walk = (p) =>
    readdirSync(p, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(resolve(p, e.name))
        : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)
          ? [resolve(p, e.name)]
          : [],
    );
  return digest(
    [
      ...walk(resolve(root, 'src')),
      resolve(root, 'package.json'),
      resolve(root, 'package-lock.json'),
    ]
      .sort()
      .map((p) => `${relative(root, p).replaceAll('\\', '/')}\0${sourceText(p)}\0`)
      .join(''),
  );
};
export const pr182CandidateHash = (root = '.') => pr182SourceHash(root, true);
export const pr182HarnessHash = (root = '.') =>
  digest(
    [
      'scripts/benchmarkPr182.mjs',
      'scripts/pr182Evidence.mjs',
      'scripts/pr182Observation.ts',
      'scripts/pr181Observation.ts',
      'scripts/preparePr182Inputs.mjs',
      'scripts/runPr182Validation.mjs',
      'scripts/reportPr182.mjs',
      'scripts/benchmarkPr182Performance.mjs',
      'scripts/benchmarkPr182Coaching.mjs',
      'scripts/benchmarkPr182Holds.mjs',
      'scripts/freezePr182.mjs',
      'scripts/benchmarkPr182Integrity.mjs',
      'scripts/benchmarkPr182Telemetry.mjs',
      'scripts/reportPr182Performance.mjs',
    ]
      .map((p) => `${p}\0${readFileSync(resolve(root, p), 'utf8').replaceAll('\r\n', '\n')}\0`)
      .join(''),
  );
