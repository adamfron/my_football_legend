/* global performance, structuredClone */
import assert from 'node:assert/strict';
import process from 'node:process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { serveProduction, loadBrowserSave, readBrowserSave } from './pr170BrowserSupport.mjs';
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const phase = process.env.MFL_PR170_PHASE ?? 'after';
const browser = await chromium.launch({ channel: 'msedge', headless: true }),
  server = await serveProduction(phase === 'before' ? '../baseline-pr169/dist' : 'dist');
const report = {
  phase,
  environment:
    'Actual production Edge, Brotli HTTP, genuine UI decisions and persisted save; no match-state injection.',
  scenarios: [],
};
let active;
const reachFixture = async (page) => {
  for (let attempts = 0; attempts < 180; attempts++) {
    if (await page.getByRole('button', { name: 'Rozegraj mecz 3D', exact: true }).count()) return;
    for (const candidate of [
      page.getByRole('button', { name: 'Wybierz', exact: true }).first(),
      page.getByRole('button', { name: '▶ Graj', exact: true }),
      page.getByRole('button', { name: /^(Dalej|Kontynuuj wydarzenie)$/ }).first(),
    ]) {
      if ((await candidate.count()) && (await candidate.isEnabled().catch(() => false))) {
        await candidate.click();
        break;
      }
    }
    await page.waitForTimeout(250);
  }
  throw Error('No playable canonical fixture reached');
};
const resources = (page) =>
  page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name.split('/').at(-1),
      transferBytes: entry.transferSize,
      encodedBytes: entry.encodedBodySize,
      decodedBytes: entry.decodedBodySize,
    })),
  );
try {
  process.stdout.write(`Starting ${phase} career smoke\n`);
  active = await loadBrowserSave(browser, server.url, '../pr170-dashboard.json');
  const { page } = active;
  const initial = await readBrowserSave(page);
  if (phase === 'after') {
    const today = page.locator('.calendar-days button[aria-current="date"]');
    await today.focus();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('button', { name: 'Następny miesiąc' }).click();
  }
  assert.equal(await readBrowserSave(page), initial);
  await reachFixture(page);
  process.stdout.write('Reached first fixture\n');
  const before = JSON.parse(await readBrowserSave(page)).career,
    fixtureId = before.activeMatch.id;
  const careerResources = await resources(page);
  const careerNetwork = structuredClone(active.network),
    firstNetworkIndex = active.network.length;
  assert(
    !careerResources.some((entry) =>
      /TacticalMatchSandbox|CareerCanonicalMatch|^model-/.test(entry.name),
    ),
    '3D loaded before explicit choice',
  );
  const firstStart = Date.now();
  await page.getByRole('button', { name: 'Rozegraj mecz 3D', exact: true }).click();
  await page.locator('.tactical-sandbox').waitFor();
  process.stdout.write('Loaded first 3D runtime\n');
  const firstMatchLoadMs = Date.now() - firstStart,
    firstResources = await resources(page);
  const firstMatchNetwork = structuredClone(active.network.slice(firstNetworkIndex));
  const selector = page.getByLabel('Cel decyzji piłkarskiej', { exact: true });
  await selector.waitFor({ timeout: 120000 });
  process.stdout.write('Reached a genuine contextual decision\n');
  assert.equal(await page.locator('.interaction-hint').count(), phase === 'after' ? 0 : 1);
  if (phase === 'after') {
    await page.getByLabel('Cieniowanie zawodników').selectOption('faceted');
    await page.getByLabel('Cieniowanie zawodników').selectOption('classic');
  }
  const options = await selector
    .locator('option')
    .evaluateAll((elements) => elements.map((element) => element.value).filter(Boolean));
  const target =
    options.find(
      (value) =>
        JSON.parse(value).kind === 'player' && JSON.parse(value).playerId !== before.player.id,
    ) ??
    options.find((value) => JSON.parse(value).kind === 'ball') ??
    options[0];
  assert(target, 'No real contextual target');
  await selector.focus();
  await selector.selectOption(target);
  const action = page
    .locator(phase === 'after' ? '.decision-target-actions button' : '.context-menu button')
    .first();
  await action.waitFor();
  await action.focus();
  const chosenAction = await action.innerText();
  await page.screenshot({ path: `docs/images/pr170/gameplay-keyboard-${phase}.png` });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: 'Symuluj do końca', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Symuluj do końca', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Symulacja pozostałej części meczu' });
  await dialog.waitFor();
  await dialog.getByRole('button', { name: /symul/i }).click();
  await page.locator('.career-view').waitFor();
  const saved = JSON.parse(await readBrowserSave(page)).career;
  const participation = saved.seasonParticipation.find((entry) => entry.fixtureId === fixtureId);
  assert.equal(participation.fixtureStatus, 'completed');
  assert.equal(participation.metricsSource, 'canonical_plus_summary');
  assert(
    participation.participationEvidence?.decisions?.resolved >= 1,
    'No resolved genuine player input retained',
  );
  process.stdout.write('Saved actual canonical prefix and summary continuation\n');
  assert(saved.historyFacts.some((fact) => fact.factType === 'canonical_match_result'));
  await page.locator('.summary-strip > button').nth(2).click();
  await page.screenshot({ path: `docs/images/pr170/smoke-finance-${phase}.png` });
  await page.getByRole('button', { name: 'Zamknij', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Kontynuuj', exact: true }).click();
  const reloaded = JSON.parse(await readBrowserSave(page)).career;
  assert.deepEqual(
    reloaded.seasonParticipation.find((entry) => entry.fixtureId === fixtureId),
    participation,
  );
  await reachFixture(page);
  const secondStart = Date.now();
  const secondNetworkIndex = active.network.length;
  await page.getByRole('button', { name: 'Rozegraj mecz 3D', exact: true }).click();
  await page.locator('.tactical-sandbox').waitFor();
  const secondMatchLoadMs = Date.now() - secondStart,
    secondResources = await resources(page);
  report.scenarios.push({
    name: 'career-calendar-play3D-action-remainder-save-reload-finance-next3D',
    fixtureId,
    target: JSON.parse(target).kind,
    chosenAction,
    participation,
    firstMatchLoadMs,
    secondMatchLoadMs,
    careerResources,
    firstResources,
    secondResources,
    careerNetwork,
    firstMatchNetwork,
    secondMatchNetwork: structuredClone(active.network.slice(secondNetworkIndex)),
    errors: active.errors,
  });
  assert.equal(active.errors.length, 0, active.errors.join('\n'));
  report.complete = true;
} catch (error) {
  report.failure = error.message;
  if (active && !active.page.isClosed()) {
    await active.page.screenshot({ path: '../pr170-smoke-failure.png' });
    report.failureText = await active.page.locator('body').innerText();
  }
  throw error;
} finally {
  writeFileSync(
    `docs/performance/PR170-smoke-${phase}.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
  await server.close();
}
