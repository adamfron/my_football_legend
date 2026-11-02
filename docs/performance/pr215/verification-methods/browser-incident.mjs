import assert from 'node:assert/strict';
import process from 'node:process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { serveProduction } from '../../../../scripts/pr170BrowserSupport.mjs';
import { checkPr215Source } from '../../../../scripts/pr215Evidence.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const source = checkPr215Source().fingerprint;
const server = await serveProduction('dist');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const root = 'docs/performance/pr215/browser';
try {
  await page.goto(server.url);
  await page.getByRole('button', { name: 'Pojedynczy mecz [DEV]', exact: true }).click();
  await page.getByLabel('Fizyka meczu', { exact: true }).selectOption('holistic-physical-dev-v1');
  await page.getByLabel('SEED', { exact: true }).fill('pr215-ui-incident');
  await page.getByRole('button', { name: 'Rozpocznij mecz', exact: true }).click();
  const skip = page.getByRole('button', { name: 'Pomiń oprawę', exact: true });
  if (await skip.isVisible()) await skip.click();
  await page.getByRole('button', { name: '16×', exact: true }).click();
  await page.getByRole('button', { name: 'Odtwórz', exact: true }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'Nierozstrzygnięty kontakt' });
  const incident = await alert.waitFor({ timeout: 15000 }).then(() => true, () => false);
  if (!incident) {
    const pause = page.getByRole('button', { name: 'Pauza', exact: true });
    if (await pause.isVisible()) await pause.click();
  }
  assert.deepEqual(errors, []);
  if (incident) assert.equal(await page.getByRole('button', { name: 'Odtwórz', exact: true }).isVisible(), true);
  await page.locator('details.lab-diagnostics > summary').click();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Eksportuj benchmark sesji', exact: true }).click();
  const download = await waiting;
  await download.saveAs(`${root}/incident-session.json`);
  const session = JSON.parse(readFileSync(`${root}/incident-session.json`));
  assert.equal(session.metadata.effectivePhysicalRecipe.id, 'holistic-physical-dev-v1');
  if (incident) assert.ok(session.physicalExecutionWitnesses.unresolved.invoked > 0);
  await page.screenshot({ path: `${root}/incident-1366.png` });
  writeFileSync(`${root}/incident-report.json`, JSON.stringify({ source, incident, errors,
    canonicalSeconds: session.duration, reason: session.physicalExecutionWitnesses.unresolved ?? null,
    scope: 'bounded normal-UI incident/pause/export acceptance; mandatory holistic integration smoke remains blocked',
  }, null, 2) + '\n');
} finally {
  await browser.close();
  await server.close();
}
