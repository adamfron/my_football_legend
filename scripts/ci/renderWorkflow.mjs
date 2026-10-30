import process from 'node:process';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { qualityProgram } from './quality.mjs';
const original = readFileSync('docs/performance/pr202/ci-pr201.yml', 'utf8').replaceAll(
  '\r\n',
  '\n',
);
const rollback = original.replace('&& npm run benchmark:pr201:check', '&& npm run ci:pr201-check');
let workflow = original.replace(
  / {2}pr198-source:[\s\S]*?(?= {2}pr200-matches:)/,
  `  historical-source:
    name: Historical source (\${{ matrix.group }})
    runs-on: ubuntu-latest
    timeout-minutes: 30
    strategy:
      fail-fast: false
      matrix:
        group: [source-01, source-02, source-03, source-04]
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run ci:group -- --group=\${{ matrix.group }}
`,
);
workflow = workflow.replace(
  / {6}- run: \$\{\{ matrix.command \}\}/,
  `      - if: matrix.group == 'main'
        run: npm run ci:manifest
      - if: matrix.group == 'main'
        run: npm run ci:contracts
      - if: matrix.group == 'main'
        run: node scripts/ci/renderWorkflow.mjs --check
      - if: matrix.group == 'main'
        run: node scripts/ci/corruptReplay.mjs
      - if: matrix.group == 'main'
        run: node scripts/ci/replayPr203Check.mjs
      - if: matrix.group == 'main'
        run: node scripts/ci/replayPr204Check.mjs
      - if: matrix.group == 'main'
        run: node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/checkPr204Authority.mjs
      - if: matrix.group == 'main'
        run: node --max-semi-space-size=64 --experimental-transform-types --import ./scripts/registerPr199Lab.mjs scripts/checkPr204Boundary.mjs
      - if: matrix.group == 'main'
        run: node scripts/checkPr205Evidence.mjs
      - if: matrix.group == 'main'
        run: node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr205.mjs --contracts
      - run: npm run ci:group -- --group=checks:\${{ matrix.group }}`,
);
workflow = workflow.replace(
  / {6}- if: matrix.group == 'main'\n {8}run: test -f dist\/data\/world\/pl-2026-v2.json\n/,
  '',
);
workflow = workflow.replace(
  / {6}- run: npm run generate:world-db\n {6}- run: \$\{\{ matrix.command \}\}\n {6}- run: git diff --exit-code -- docs\/performance docs\/match-engine\n/,
  `      - run: npm run ci:group -- --group=historical-checks:\${{ matrix.group }}
`,
);
workflow = workflow.replace(
  / {6}- run: npm run benchmark:pr200:source-replay[\s\S]*? {6}- run: git diff --exit-code -- docs\/performance docs\/match-engine\n/,
  `      - run: npm run ci:group -- --group=pr200-matches:\${{ matrix.fixture }}:\${{ matrix.cohort }}
`,
);
workflow = workflow.replace(
  / {6}- run: node --experimental-transform-types[\s\S]*? {6}- run: git diff --exit-code -- docs\/performance docs\/match-engine\n/,
  `      - run: npm run ci:group -- --group=pr200-platform:\${{ matrix.os }}
`,
);
workflow = workflow.replace('pr198-source, pr199-source, pr200-source', 'historical-source');
workflow = workflow.replace(
  / {10}PR198_RESULT:[^\n]+\n {10}PR199_RESULT:[^\n]+\n {10}PR200_RESULT:[^\n]+\n/,
  `          SOURCE_RESULT: \${{ needs.historical-source.result }}
`,
);
workflow = workflow.replace(
  'test "$PR198_RESULT" = success && test "$PR199_RESULT" = success && test "$PR200_RESULT" = success',
  'test "$SOURCE_RESULT" = success',
);
workflow = workflow.replace(
  / {8}run: test "\$VERIFY_RESULT"[^\n]+/,
  `        run: node -e '${qualityProgram}'`,
);
const families = [
  'checks',
  'historical-checks',
  'historical-source',
  'pr200-matches',
  'pr200-platform',
];
workflow = workflow.replaceAll(
  '          fetch-depth: 0',
  '          fetch-depth: 0\n          ref: ${{ github.event.pull_request.head.sha || github.sha }}',
);
for (const family of families) {
  const start = workflow.indexOf(`  ${family}:\n`),
    rest = workflow.slice(start);
  const endOffset = rest.slice(3).search(/^ {2}[a-z][\w-]+:\n/m);
  const end = endOffset < 0 ? workflow.length : start + 3 + endOffset;
  const key =
    family === 'pr200-matches'
      ? '${{ matrix.fixture }}-${{ matrix.cohort }}'
      : family === 'pr200-platform'
        ? '${{ matrix.os }}'
        : '${{ matrix.group }}';
  const upload = `      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: pr202-${family}-${key}-\${{ github.run_attempt }}
          path: .benchmark-artifacts/pr202
          include-hidden-files: true
          if-no-files-found: error
`;
  workflow = workflow.slice(0, end) + upload + workflow.slice(end);
}
// No interpolation is performed on GitHub expressions; this script is only a deterministic renderer.
const target = process.argv.includes('--activate')
  ? '.github/workflows/ci.yml'
  : 'docs/performance/pr202/ci-proposed.yml';
if (process.argv.includes('--rollback')) writeFileSync('.github/workflows/ci.yml', rollback);
else if (process.argv.includes('--check'))
  assert.equal(
    readFileSync('.github/workflows/ci.yml', 'utf8'),
    workflow,
    'CI workflow differs from checked plan',
  );
else {
  writeFileSync(target, workflow);
  writeFileSync('docs/performance/pr202/ci-rollback.yml', rollback);
}
