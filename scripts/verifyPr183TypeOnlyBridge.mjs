import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { stripTypeScriptTypes } from 'node:module';
import ts from 'typescript';
import console from 'node:console';
import { digest, pr183SourceHash } from './pr183Evidence.mjs';

const frozenCommit = 'a5c11fa2b64607a3ae83a7bc95de2f29ed4b0ff9';
const final = resolve(process.argv.find((a) => a.startsWith('--final='))?.slice(8) ?? '.');
const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', frozenCommit, '--', 'src'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort();
const allPaths = [...paths, 'package.json', 'package-lock.json'].sort();
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(resolve(dir, e.name))
      : /\.(ts|tsx)$/.test(e.name) && !e.name.includes('.test.')
        ? [relative(final, resolve(dir, e.name)).replaceAll('\\', '/')]
        : [],
  );
if (JSON.stringify(walk(resolve(final, 'src')).sort()) !== JSON.stringify(paths))
  throw Error('Production file set changed');
const batch = execFileSync('git', ['cat-file', '--batch'], {
  input: allPaths.map((p) => `${frozenCommit}:${p}\n`).join(''),
  maxBuffer: 64 * 1024 * 1024,
});
const sources = new Map();
let offset = 0;
for (const path of allPaths) {
  const end = batch.indexOf(10, offset),
    header = batch.subarray(offset, end).toString(),
    size = Number(header.split(' ')[2]);
  if (!Number.isFinite(size)) throw Error('Missing frozen source');
  const text = batch
    .subarray(end + 1, end + 1 + size)
    .toString()
    .replaceAll('\r\n', '\n');
  sources.set(path, text);
  offset = end + 1 + size + 1;
}
const changed = [],
  emitted = [];
for (const path of paths) {
  const a = sources.get(path);
  const b = readFileSync(resolve(final, path), 'utf8').replaceAll('\r\n', '\n');
  if (a !== b) {
    if (
      path !== 'src/core/matchSimulation/restartGeometry.ts' ||
      b !==
        a.replaceAll('selectedAction?: MatchAction }', 'selectedAction?: MatchAction | undefined }')
    )
      throw Error('Bridge contains a runtime or unrelated source edit');
    const options = { mode: 'transform', sourceMap: false, disableWarning: true };
    const nativeBefore = stripTypeScriptTypes(a, options),
      nativeAfter = stripTypeScriptTypes(b, options);
    if (nativeBefore !== nativeAfter) throw Error('Node execution program differs');
    changed.push({
      path,
      beforeHash: digest(a),
      afterHash: digest(b),
      nativeProgramHash: digest(nativeBefore),
    });
  }
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX,
    useDefineForClassFields: true,
    sourceMap: false,
  };
  const before = path.endsWith('.d.ts')
    ? ''
    : ts.transpileModule(a, { compilerOptions: options, fileName: path }).outputText;
  const after =
    a === b
      ? before
      : path.endsWith('.d.ts')
        ? ''
        : ts.transpileModule(b, { compilerOptions: options, fileName: path }).outputText;
  if (before !== after) throw Error(`Emitted production program differs: ${path}`);
  emitted.push({ path, sha256: digest(before) });
}
for (const path of ['package.json', 'package-lock.json'])
  if (sources.get(path) !== readFileSync(resolve(final, path), 'utf8').replaceAll('\r\n', '\n'))
    throw Error('Runtime dependency difference');
if (changed.length !== 1) throw Error('Require the single explicit type-only correction');
const receipt = {
  schema: 'mfl-pr183-type-only-bridge-v1',
  frozenCommit,
  simulatedSourceHash: digest(
    allPaths
      .toSorted((a, b) =>
        resolve(final, a) < resolve(final, b) ? -1 : resolve(final, a) > resolve(final, b) ? 1 : 0,
      )
      .map((p) => `${p}\0${sources.get(p)}\0`)
      .join(''),
  ),
  compilableSourceHash: pr183SourceHash(final),
  productionFiles: paths.length,
  changed,
  emittedProductionProgramHash: digest(emitted),
  emittedProgramsEqual: true,
  scope:
    'Only optional MatchAction | undefined parameter declarations change. Native Node transformed module and TypeScript emitted code for every production TS/TSX file are byte-identical; dependencies unchanged. Frozen simulation receipts retain their actual original source hashes. This is not a behavioral refreeze or relabelled independent run.',
};
writeFileSync(
  'docs/performance/PR183-closure-type-only-bridge.json',
  JSON.stringify(receipt, null, 2) + '\n',
);
console.log(JSON.stringify(receipt, null, 2));
