import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { pathToFileURL, URL } from 'node:url';
import { strict as assert } from 'node:assert';
import console from 'node:console';
import process from 'node:process';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase.ts';
import { createSingleMatchSession } from '../src/core/singleMatch.ts';
import {
  PRIMARY_DECISION_POLICIES,
  DEFAULT_DECISION_POLICY,
} from '../src/core/matchSimulation/decisionPolicyConfig.ts';
import { pr182SourceHash, pr182CandidateHash, digest } from './pr182Evidence.mjs';
const { chromium } = await import(
  pathToFileURL(
    'C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
  ).href
);
const out = '../pr182-browser';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const errors = [],
  consoleErrors = [],
  resourceErrors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('response', (r) => {
  if (r.status() >= 400) resourceErrors.push({ url: r.url(), status: r.status() });
});
const rows = [],
  base = 'http://127.0.0.1:6208/my_football_legend/?matchSandbox=1';
const download = async (button, name) => {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  const d = await pending,
    path = `${out}/${name}.json`;
  await d.saveAs(path);
  const bytes = readFileSync(path),
    value = JSON.parse(bytes);
  writeFileSync(`docs/performance/pr182-evidence/browser-${name}.json.gz`, gzipSync(bytes));
  return value;
};
try {
  await page.goto(base);
  assert.equal(
    await page.getByLabel('Polityka decyzji', { exact: true }).inputValue(),
    DEFAULT_DECISION_POLICY,
  );
  await page.getByLabel(/^GOSPODARZE/).selectOption('pro_9');
  await page.getByLabel(/^GOŚCIE/).selectOption('pro_1');
  await page.getByLabel('SEED', { exact: true }).fill('pr182-owner-comparison');
  await page.getByLabel('Polityka decyzji', { exact: true }).selectOption('role-intent-v1');
  await page.getByRole('button', { name: 'Rozpocznij mecz', exact: true }).click();
  await page.getByRole('button', { name: 'Odtwórz', exact: true }).waitFor();
  await page.getByText('Role taktyczne i zmiany instrukcji', { exact: true }).click();
  const winger = page
    .locator('select[aria-label^="Rola "]')
    .filter({ has: page.locator('option[value="wide_playmaker"]') })
    .first();
  await winger.selectOption('wide_playmaker');
  await page
    .getByRole('button', { name: 'Zamroź role i taktykę do powtórek', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Role i taktyka zamrożone do powtórek', exact: true })
    .waitFor();
  let frozen;
  for (const policy of PRIMARY_DECISION_POLICIES) {
    await page.getByLabel('Powtórz z polityką', { exact: true }).selectOption(policy);
    await page.getByRole('button', { name: 'Odtwórz', exact: true }).waitFor();
    const before = await download('Eksportuj eksperyment ról JSON', `${policy}-initial`);
    assert.equal(before.metadata.policy, policy);
    assert.equal(before.metadata.time, 0);
    const identity = {
      fixtureId: before.metadata.fixtureId,
      inputs: before.metadata.fixtureInputs,
      roles: before.metadata.roles.initial,
    };
    if (frozen) assert.deepEqual(identity, frozen);
    else frozen = identity;
    await page.getByRole('button', { name: '16×', exact: true }).click();
    await page.getByRole('button', { name: 'Odtwórz', exact: true }).click();
    await page.waitForTimeout(4500);
    const responseAt = Date.now();
    await page.getByRole('button', { name: 'Pauza', exact: true }).click();
    const responseMs = Date.now() - responseAt;
    const compact = await download('Eksportuj porównanie polityk JSON', `${policy}-comparison`);
    const detailed = await download('Eksportuj eksperyment ról JSON', `${policy}-detailed`);
    assert.equal(compact.policy, policy);
    assert.equal(compact.fixtureId, frozen.fixtureId);
    assert(compact.observedSeconds > 5);
    assert.equal(compact.errors.length, 0);
    assert.equal(detailed.diagnostics.observerErrors.length, 0);
    assert.notEqual(compact.sourceRevision, 'unknown');
    rows.push({
      policy,
      seconds: compact.observedSeconds,
      responseMs,
      fixtureId: compact.fixtureId,
      sourceRevision: compact.sourceRevision,
      metrics: compact.metrics,
      initialInputHash: digest(identity),
      compactBytes: JSON.stringify(compact).length,
      errors: compact.errors,
    });
    if (policy === 'legacy-pr176') {
      await page.getByRole('button', { name: 'Restart — ten sam seed', exact: true }).click();
      await page.getByRole('button', { name: 'Odtwórz', exact: true }).waitFor();
      const restarted = await download('Eksportuj eksperyment ról JSON', 'restart-same-seed');
      assert.equal(restarted.metadata.time, 0);
      assert.equal(restarted.metadata.fixtureId, frozen.fixtureId);
      assert.deepEqual(restarted.metadata.roles.initial, frozen.roles);
    }
    console.log(JSON.stringify(rows.at(-1)));
  }
  await page.screenshot({
    path: 'docs/performance/pr182-evidence/browser-comparison.png',
    fullPage: false,
  });
  await page.goto(base);
  await page.getByLabel(/^GOSPODARZE/).selectOption('pro_9');
  await page.getByLabel(/^GOŚCIE/).selectOption('pro_1');
  const seed = 'pr182-human-control';
  const native = createSingleMatchSession(createCanonicalWorldDatabase(), {
    homeClubId: 'pro_9',
    awayClubId: 'pro_1',
    seed,
    control: { mode: 'spectator' },
  });
  const owner = native.home.players.find((p) => p.slot.position !== 'goalkeeper');
  await page.getByLabel('SEED', { exact: true }).fill(seed);
  await page.getByLabel('Polityka decyzji', { exact: true }).selectOption(DEFAULT_DECISION_POLICY);
  await page.getByLabel('Steruj piłkarzem', { exact: true }).check();
  await page.getByLabel(/^PIŁKARZ/).selectOption(owner.footballerId);
  await page.getByLabel('Wymuś w XI', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Rozpocznij mecz', exact: true }).click();
  await page.getByRole('button', { name: 'Odtwórz', exact: true }).click();
  const targets = page.getByLabel('Cel decyzji piłkarskiej', { exact: true });
  await targets.waitFor();
  const teammate = await targets
    .locator('option')
    .evaluateAll(
      (options, actorId) =>
        options.find(
          (o) => o.textContent.includes('kolega') && JSON.parse(o.value).playerId !== actorId,
        )?.value,
      owner.footballerId,
    );
  assert(teammate, 'No legal teammate target in actual human opportunity');
  await targets.selectOption(teammate);
  const action = page
    .getByRole('region', { name: 'Zagrania do wybranego celu' })
    .getByRole('button', { name: /Podaj|Podanie/ })
    .first();
  const selectedLabel = await action.textContent();
  await action.click();
  await page.waitForTimeout(2000);
  if (await page.getByRole('button', { name: 'Pauza', exact: true }).count())
    await page.getByRole('button', { name: 'Pauza', exact: true }).click();
  const human = await download('Eksportuj eksperyment ról JSON', 'human-detailed');
  const choices = human.trace.filter(
    (e) => e.kind === 'selected_action' && e.data?.action?.actorId === owner.footballerId,
  );
  assert(
    choices.some((e) => e.data.action.type === 'pass'),
    'Clicked human pass is absent from canonical trace',
  );
  assert.equal(human.diagnostics.observerErrors.length, 0);
  await page.screenshot({
    path: 'docs/performance/pr182-evidence/browser-human.png',
    fullPage: false,
  });
  writeFileSync(
    'docs/performance/PR182-browser.json',
    JSON.stringify(
      {
        schema: 'mfl-pr182-real-browser-v1',
        sourceHash: pr182SourceHash(),
        candidateHash: pr182CandidateHash(),
        browser: await browser.version(),
        method:
          'Actual headless Edge UI on fresh Vite production build, software WebGL. Five repeated short fragments with complete frozen squads/attributes/formations/roles/preferences, real download buttons, one actual human-selected pass. These are UI smoke fragments, not five watched halves or independent full matches.',
        rows,
        human: {
          seed,
          controlledId: owner.footballerId,
          selectedLabel,
          seconds: human.metadata.time,
          choices,
        },
        errors,
        consoleErrors,
        resourceErrors,
      },
      null,
      2,
    ) + '\n',
  );
  assert.equal(errors.length, 0);
  assert(
    resourceErrors.every((r) => new URL(r.url).pathname.endsWith('/favicon.ico')),
    'Application resource failed to load',
  );
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: false });
  writeFileSync(
    `${out}/failure.json`,
    JSON.stringify(
      {
        error: String(error),
        errors,
        rows,
        body: (await page.locator('body').innerText()).slice(0, 30000),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
void process;
