/* global document */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { serveProduction } from './pr170BrowserSupport.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const server = await serveProduction('dist');
const browser = await chromium.launch({
  channel: process.env.MFL_BROWSER_CHANNEL ?? 'msedge',
  headless: true,
});
const root = 'docs/performance/pr215/browser';
mkdirSync(root, { recursive: true });
const report = {
  schema: 'pr215-browser-v1',
  browser: browser.version(),
  production: true,
  scenarios: [],
};
try {
  for (const [width, height, human] of [
    [1366, 768, false],
    [1920, 1080, true],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const row = { width, height, human, errors, checks: [] };
    report.scenarios.push(row);
    await page.goto(server.url);
    await page.getByRole('button', { name: 'Pojedynczy mecz [DEV]', exact: true }).click();
    const selector = page.getByLabel('Fizyka meczu', { exact: true });
    await selector.waitFor();
    assert.equal(await selector.inputValue(), 'ordinary');
    row.checks.push('ordinary-default');
    await selector.selectOption('holistic-physical-dev-v1');
    await page.getByLabel('Polityka decyzji', { exact: true }).selectOption('state-value-v1');
    await page.getByLabel('SEED', { exact: true }).fill(`pr215-browser-${width}`);
    if (human) {
      await page.getByLabel('Steruj piłkarzem', { exact: true }).check();
      await page.getByLabel('Piłkarz', { exact: true }).selectOption({ index: 1 });
    }
    await page.screenshot({ path: `${root}/setup-${width}.png` });
    assert.ok(
      await page
        .getByRole('status')
        .textContent()
        .then((s) => s.includes('Tryb ograniczony')),
    );
    await page.getByRole('button', { name: 'Rozpocznij mecz', exact: true }).click();
    const hud = page.getByLabel('Wykonywana fizyka meczu', { exact: true });
    await hud.waitFor();
    assert.match(await hud.textContent(), /Holistyczna.*holistic-physical-dev-v1/);
    const skip = page.getByRole('button', { name: 'Pomiń oprawę', exact: true });
    if (await skip.isVisible()) await skip.click();
    await page.screenshot({ path: `${root}/hud-${width}.png` });
    row.checks.push(
      'effective-recipe-hud',
      'initializes-normal-match',
      human ? 'human' : 'spectator',
    );
    const exportBenchmark = async (name) => {
      const details = page.locator('details.lab-diagnostics');
      if (!((await details.getAttribute('open')) !== null))
        await details.locator(':scope > summary').click();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Eksportuj benchmark sesji', exact: true }).click();
      const file = await download;
      const path = `${root}/${width}-${name}.json`;
      await file.saveAs(path);
      const value = JSON.parse(readFileSync(path, 'utf8'));
      assert.equal(value.metadata.selectedPhysicalPreset, 'holistic-physical-dev-v1');
      assert.equal(value.metadata.effectivePhysicalRecipe.id, 'holistic-physical-dev-v1');
      assert.equal(value.canonicalPhysicalCheckpoint.players.length, 22);
      assert.equal(value.canonicalPhysicalCheckpoint.experimentalPlayerBodyImpulse, 'upright-cluster-dev-v1');
      assert.equal(value.canonicalPhysicalCheckpoint.experimentalPendingStrike, 'low-pass-dev-v1');
      assert.equal(value.canonicalPhysicalCheckpoint.integrationProfile, undefined);
      assert.equal(Boolean(value.canonicalPhysicalCheckpoint.controlledFootballerId), human);
      return value;
    };
    const initial = await exportBenchmark('initial');
    assert.equal(initial.duration, 0);
    await page.getByRole('button', { name: 'Odtwórz', exact: true }).click();
    // Wait for observed canonical progress, with a finite browser-test deadline.
    await page.waitForFunction(
      () =>
        !document
          .querySelector('[aria-label="Zegar i stan meczu"]')
          ?.textContent?.includes('00:00'),
      null,
      { timeout: 30000 },
    );
    const pause = page.getByRole('button', { name: 'Pauza', exact: true });
    if (await pause.isVisible()) await pause.click();
    const advanced = await exportBenchmark('advanced');
    assert.ok(advanced.duration > 0);
    assert.ok(advanced.physicalExecutionWitnesses?.['bounded-flight-belief']?.invoked > 0);
    assert.equal(advanced.metadata.policy, 'state-value-v1');
    row.checks.push(
      'canonical-time-advances',
      'real-belief-invocation',
      'pause',
      'diagnostics-download',
    );
    row.duration = advanced.duration;
    row.witnesses = advanced.physicalExecutionWitnesses;
    await page.getByRole('button', { name: 'Restart — ten sam seed', exact: true }).click();
    const restarted = await exportBenchmark('restart');
    assert.equal(restarted.duration, 0);
    assert.equal(restarted.metadata.seed, initial.metadata.seed);
    assert.equal(restarted.metadata.fixtureId, initial.metadata.fixtureId);
    row.checks.push('restart-same-mode-seed');
    await page
      .getByLabel('Powtórz z polityką', { exact: true })
      .selectOption('opportunity-driven-v1');
    const replay = await exportBenchmark('policy-replay');
    assert.equal(replay.metadata.effectivePhysicalRecipe.policy, 'opportunity-driven-v1');
    assert.equal(replay.metadata.seed, initial.metadata.seed);
    row.checks.push('policy-independent-replay');
    await page.getByRole('button', { name: 'Losuj seed', exact: true }).click();
    const randomized = await exportBenchmark('randomized');
    assert.notEqual(randomized.metadata.seed, initial.metadata.seed);
    row.checks.push('randomize-keeps-mode');
    await page.getByRole('button', { name: 'Zmień ustawienia', exact: true }).click();
    assert.equal(await selector.inputValue(), 'holistic-physical-dev-v1');
    row.checks.push('setup-keeps-mode');
    await selector.selectOption('ordinary');
    await page.getByRole('button', { name: 'Rozpocznij mecz', exact: true }).click();
    assert.match(await hud.textContent(), /Dotychczasowa/);
    row.checks.push('new-ordinary-initialization');
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await server.close();
}
console.log(
  `PR215 browser PASS: ${report.scenarios.length} viewports, real UI and exported executing recipe`,
);
