import ts from 'typescript';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';

export const digest = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest('hex');
const walk = (root) =>
  readdirSync(root, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${root}/${e.name}`) : [`${root}/${e.name}`],
  );
export const inventory = () => {
  const paths = walk('src/core/matchSimulation')
    .filter((p) => p.endsWith('.ts'))
    .sort();
  const files = paths.map((path) => {
    const raw = readFileSync(path, 'utf8').replace(/\r\n/g, '\n'),
      source = ts.createSourceFile(path, raw, ts.ScriptTarget.Latest, true);
    const symbols = [],
      imports = [],
      findings = [];
    const line = (n) => source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1;
    const visit = (node, owner = 'module') => {
      if (
        (ts.isVariableDeclaration(node) ||
          ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node)) &&
        node.name
      ) {
        owner = node.name.getText(source);
        symbols.push({ name: owner, line: line(node) });
      }
      if (ts.isImportDeclaration(node)) imports.push(node.moduleSpecifier.text);
      // Context-bearing comparisons/calls/distributions, not an indiscriminate literal list.
      const comparison =
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.LessThanToken,
          ts.SyntaxKind.LessThanEqualsToken,
          ts.SyntaxKind.GreaterThanToken,
          ts.SyntaxKind.GreaterThanEqualsToken,
        ].includes(node.operatorToken.kind);
      const call =
        ts.isCallExpression(node) &&
        /random|normal|chance|probab|clamp|Math\.(exp|pow)|risk|reach|Seconds|Timeout/i.test(
          node.expression.getText(source),
        );
      if (comparison || call) {
        const text = node.getText(source).replace(/\s+/g, ' ');
        if (/\d/.test(text) && text.length <= 600 && !/Schema$/.test(owner))
          findings.push({
            owner,
            line: line(node),
            kind: comparison ? 'comparison' : 'model_or_distribution_call',
            text,
          });
      }
      ts.forEachChild(node, (child) => visit(child, owner));
    };
    visit(source);
    return {
      path,
      sha256: digest(raw),
      lines: raw.split('\n').length,
      test: path.endsWith('.test.ts'),
      imports,
      symbols,
      findings,
    };
  });
  for (const file of files) {
    const stem = file.path.replace(/\.ts$/, '');
    file.consumers = files
      .filter((f) =>
        f.imports.some(
          (i) =>
            i.startsWith('.') && posix.normalize(posix.join(posix.dirname(f.path), i)) === stem,
        ),
      )
      .map((f) => f.path);
  }
  return {
    schema: 'mfl-pr195-source-inventory-v1',
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    files,
  };
};
export const sourceFingerprint = () => {
  const paths = [
    'package-lock.json',
    'scripts/benchmarkPr195.mjs',
    'scripts/pr195DefenderArrival.mjs',
    'scripts/pr195Outcomes.mjs',
    'scripts/pr195SourceInventory.mjs',
    'scripts/registerTypescriptLoader.mjs',
    ...walk('src/core'),
    ...walk('src/schemas'),
    ...walk('src/types'),
  ]
    .filter((p) => !p.endsWith('.test.ts') && !p.endsWith('.test.tsx'))
    .sort();
  return Object.fromEntries(
    paths.map((p) => [p, digest(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'))]),
  );
};
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/pr195SourceInventory.mjs')) {
  const result = inventory(),
    target = 'docs/performance/pr195/source-inventory.json';
  if (process.argv.includes('--check')) {
    if (digest(result.files) !== digest(JSON.parse(readFileSync(target)).files))
      throw Error('Source inventory drift: regenerate and review');
  } else {
    mkdirSync('docs/performance/pr195', { recursive: true });
    writeFileSync(target, JSON.stringify(result, null, 2) + '\n');
  }
  console.log(
    'PR195 AST inventory',
    result.files.length,
    'files',
    result.files.reduce((n, f) => n + f.findings.length, 0),
    'context candidates (not all football assumptions)',
  );
}
