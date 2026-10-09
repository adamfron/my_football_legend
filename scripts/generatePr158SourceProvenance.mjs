import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { log } from 'node:console';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [name, ...values] = arg.replace(/^--/, '').split('=');
    return [name, values.join('=')];
  }),
);
const root = resolve(args.get('root') ?? process.cwd());
const output = resolve(root, args.get('output') ?? 'docs/performance/PR158-source-provenance.json');
const expectedCoreHash = args.get('expected-core-sha256');
const git = (command, options = {}) =>
  execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...command], {
    cwd: root,
    encoding: 'utf8',
    ...options,
  }).trim();
const optionalGitConfig = (name) => {
  try {
    return git(['config', '--get', name]);
  } catch (error) {
    if (error.status === 1) return null;
    throw error;
  }
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitBlob = (bytes) =>
  createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const normalizeLf = (bytes) => Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'), 'utf8');
const pathsUnder = (folder, predicate) => {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && predicate(path)) files.push(path);
    }
  };
  walk(resolve(root, folder));
  return files.sort();
};
const isNonTest = (path) => !/\.(?:test|spec)\.[^.]+$/.test(path);
const groupSpecifications = [
  {
    name: 'canonicalCore',
    pathRoot: 'src/core/matchSimulation',
    scope:
      'Every non-test .ts file recursively in src/core/matchSimulation; aggregate paths are relative to this directory, matching the benchmark source fingerprint.',
    files: pathsUnder(
      'src/core/matchSimulation',
      (path) => path.endsWith('.ts') && isNonTest(path),
    ),
  },
  {
    name: 'appRuntime',
    pathRoot: '.',
    scope:
      'Every non-test .ts, .tsx, .js, .mjs or .css runtime file recursively under src/app; aggregate paths are repository-relative.',
    files: pathsUnder('src/app', (path) => /\.(?:tsx?|m?js|css)$/.test(path) && isNonTest(path)),
  },
  {
    name: 'benchmarkScripts',
    pathRoot: '.',
    scope:
      'Every non-test .ts, .js or .mjs file recursively under scripts, covering benchmark entry points, imported helpers and TypeScript loaders; aggregate paths are repository-relative.',
    files: pathsUnder('scripts', (path) => /\.(?:ts|m?js)$/.test(path) && isNonTest(path)),
  },
];
const allPaths = [...new Set(groupSpecifications.flatMap((group) => group.files))];
const repositoryPaths = allPaths.map((path) => relative(root, path).replaceAll('\\', '/'));
if (repositoryPaths.some((path) => /[\r\n"]/.test(path)))
  throw new Error('Unexpected filename requiring Git stdin-path quoting.');
// Read-only Git clean filtering respects the real checkout attributes and core.autocrlf.
// No -w flag is used: this neither writes Git objects nor changes index/worktree files.
const cleanBlobs = git(['hash-object', '--stdin-paths'], {
  input: `${repositoryPaths.join('\n')}\n`,
}).split('\n');
if (
  cleanBlobs.length !== allPaths.length ||
  cleanBlobs.some((hash) => !/^[a-f0-9]{40}$/.test(hash))
)
  throw new Error('Git did not return one SHA1 blob identity per file.');
const cleanBlobByPath = new Map(allPaths.map((path, index) => [path, cleanBlobs[index]]));
const inventoryGroup = (group) => {
  const rawAggregate = createHash('sha256');
  const normalizedAggregate = createHash('sha256');
  const files = group.files.map((path) => {
    const raw = readFileSync(path);
    const normalized = normalizeLf(raw);
    const aggregatePath = relative(resolve(root, group.pathRoot), path).replaceAll('\\', '/');
    rawAggregate.update(aggregatePath).update('\0').update(raw).update('\0');
    normalizedAggregate.update(aggregatePath).update('\0').update(normalized).update('\0');
    const normalizedBlob = gitBlob(normalized);
    return {
      path: relative(root, path).replaceAll('\\', '/'),
      aggregatePath,
      rawBytes: raw.length,
      lfNormalizedBytes: normalized.length,
      rawSha256: sha256(raw),
      lfNormalizedSha256: sha256(normalized),
      gitBlobSha1: cleanBlobByPath.get(path),
      rawGitBlobSha1: gitBlob(raw),
      lfNormalizedGitBlobSha1: normalizedBlob,
      gitCleanMatchesLfNormalized: cleanBlobByPath.get(path) === normalizedBlob,
    };
  });
  return {
    pathRoot: group.pathRoot,
    scope: group.scope,
    fileCount: files.length,
    aggregateRawSha256: rawAggregate.digest('hex'),
    aggregateLfNormalizedSha256: normalizedAggregate.digest('hex'),
    files,
  };
};
const groups = Object.fromEntries(
  groupSpecifications.map((group) => [group.name, inventoryGroup(group)]),
);
if (
  groups.canonicalCore.fileCount !== 80 ||
  (expectedCoreHash !== undefined && groups.canonicalCore.aggregateRawSha256 !== expectedCoreHash)
)
  throw new Error(
    'Canonical runtime changed from the authorized frozen source; inventory was not written.',
  );
const report = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  gitHeadAtInventory: git(['rev-parse', 'HEAD']),
  gitHeadMeaning:
    'HEAD before publication; the checksummed worktree files may include uncommitted PR changes. Per-file Git blob identities tie these files to a later commit.',
  platform: process.platform,
  gitCoreAutocrlf: optionalGitConfig('core.autocrlf'),
  hashContract: {
    raw: 'SHA256 over exact bytes read from the local worktree. CRLF/LF conversion changes this value, so raw hashes are platform-sensitive.',
    lfNormalized:
      'SHA256 after replacing CRLF with LF in UTF-8 text; all other characters remain unchanged.',
    aggregate:
      'Ordered lexical file paths with forward slashes: aggregatePath + NUL + content + NUL for each file. Raw and LF-normalized aggregates use the same ordering.',
    gitBlobSha1:
      'Read-only git hash-object --stdin-paths with the checkout clean filters, without -w. This is the Git blob identity expected when these files are staged under the current Git attributes/configuration.',
    additionalBlobChecks:
      'rawGitBlobSha1 and lfNormalizedGitBlobSha1 independently hash the Git blob header plus raw/normalized bytes. gitCleanMatchesLfNormalized records whether the actual Git clean filter produces the normalized blob.',
  },
  inventoryGeneratorRawSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
  groups,
};
// Re-read every file before writing metadata: an edit during inventory invalidates this run.
for (const specification of groupSpecifications) {
  const reread = inventoryGroup(specification);
  if (reread.aggregateRawSha256 !== groups[specification.name].aggregateRawSha256)
    throw new Error(`${specification.name} changed during inventory; inventory was not written.`);
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
log(
  JSON.stringify(
    {
      output: relative(root, output).replaceAll('\\', '/'),
      groups: Object.fromEntries(
        Object.entries(groups).map(([name, group]) => [
          name,
          {
            fileCount: group.fileCount,
            rawSha256: group.aggregateRawSha256,
            lfNormalizedSha256: group.aggregateLfNormalizedSha256,
            allGitCleanBlobsMatchLfNormalized: group.files.every(
              (file) => file.gitCleanMatchesLfNormalized,
            ),
          },
        ]),
      ),
    },
    null,
    2,
  ),
);
