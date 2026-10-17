import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
export const pr172Hash = (value: unknown) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
export const pr172SourceHash = (root = '.') => {
  const walk = (path: string): string[] =>
    readdirSync(path, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(resolve(path, e.name))
        : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')
          ? [resolve(path, e.name)]
          : [],
    );
  return pr172Hash(
    walk(resolve(root, 'src/core/matchSimulation'))
      .sort()
      .map(
        (path) =>
          `${relative(root, path).replaceAll('\\', '/')}\0${readFileSync(path, 'utf8').replaceAll('\r\n', '\n')}\0`,
      )
      .join(''),
  );
};
export const pr172Manifest = () => ({
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceHash: pr172SourceHash(),
  fixedDt: 0.025,
  node: process.version,
  scope:
    'sourceHash identifies measured working tree; baseCommit is its parent, not a claim of an unmodified checkout',
});
