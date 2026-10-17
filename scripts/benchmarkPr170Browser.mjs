/* global document, getComputedStyle */
import assert from 'node:assert/strict';
import process from 'node:process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { serveProduction, loadBrowserSave, readBrowserSave } from './pr170BrowserSupport.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const phase = process.env.MFL_PR170_PHASE ?? 'before';
const server = await serveProduction(phase === 'before' ? '../baseline-pr169/dist' : 'dist');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
mkdirSync('docs/images/pr170', { recursive: true });
const report = { phase, browser: browser.version(), production: true, scenarios: [] };
let active;
try {
  for (const [name, file] of [
    ['dashboard', '../pr170-hybrid.json'],
    ['offers', `../pr170-${phase}-offers.json`],
  ]) {
    active = await loadBrowserSave(browser, server.url, file);
    const { page } = active,
      initial = await readBrowserSave(page);
    if (name === 'offers') await page.locator('.offer-grid').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `docs/images/pr170/${name}-${phase}.png` });
    const cards = await page.locator('.offer-card').count();
    report.scenarios.push({ name, cards, errors: active.errors });
    if (phase === 'after' && name === 'dashboard') {
      const career = JSON.parse(initial).career;
      const completed = career.seasonParticipation.find((row) => row.fixtureStatus === 'completed');
      const fixture = career.careerCalendar.fixtures.find((row) => row.id === completed.fixtureId);
      const months = (value) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7));
      const delta = months(fixture.date) - months(career.currentDate);
      for (let index = 0; index < Math.abs(delta); index++)
        await page
          .getByRole('button', {
            name: delta > 0 ? 'Następny miesiąc' : 'Poprzedni miesiąc',
            exact: true,
          })
          .click();
      const date = page.locator(`.calendar-days button[data-date="${fixture.date}"]`);
      assert((await date.getAttribute('aria-label')).includes('rozegrany mecz'));
      await date.click();
      assert(
        (await page.locator('.calendar-date-details').innerText()).includes(fixture.opponent.name),
      );
      await page.screenshot({ path: 'docs/images/pr170/calendar-completed.png' });
      assert.equal(await readBrowserSave(page), initial);
      report.scenarios.push({
        name: 'completed-calendar-fixture',
        fixture: fixture.id,
        readOnly: true,
        errors: active.errors,
      });
    }
    await page.locator('.summary-strip > button').nth(2).click();
    await page.getByRole('heading', { name: 'Kontrakt i finanse', exact: true }).waitFor();
    await page.screenshot({ path: `docs/images/pr170/finance-${name}-${phase}.png` });
    assert.equal(await readBrowserSave(page), initial, 'Inspection wrote a save');
    await page.getByRole('button', { name: 'Zamknij', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.finance-view').count(), 0);
    await active.context.close();
  }
  if (phase === 'after') {
    for (const [width, height] of [
      [1920, 1080],
      [1366, 768],
      [820, 1180],
      [390, 844],
    ]) {
      active = await loadBrowserSave(browser, server.url, '../pr170-after-offers.json', {
        width,
        height,
      });
      const { page } = active;
      await page.locator('.offer-grid').scrollIntoViewIfNeeded();
      const columns = await page
        .locator('.offer-grid')
        .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
      assert.equal(columns, width > 1150 ? 3 : width > 600 ? 2 : 1);
      assert.equal(await page.locator('.offer-card').count(), 6);
      const positions = await page
        .locator('.offer-card')
        .evaluateAll((elements) =>
          elements.map((element) => ({ top: element.offsetTop, width: element.clientWidth })),
        );
      if (width > 1150) assert.equal(new Set(positions.map((position) => position.top)).size, 2);
      for (const button of await page.locator('.offer-card > button').all()) {
        await button.scrollIntoViewIfNeeded();
        assert(await button.isEnabled());
      }
      await page.locator('.offer-grid').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `docs/images/pr170/offers-${width}.png` });
      report.scenarios.push({
        name: 'responsive-offers',
        width,
        height,
        columns,
        cards: positions.length,
        errors: active.errors,
      });
      await active.context.close();

      active = await loadBrowserSave(browser, server.url, '../pr170-dashboard.json', {
        width,
        height,
      });
      const initial = await readBrowserSave(active.page),
        calendar = active.page.locator('.career-calendar');
      await calendar.locator('button[aria-pressed="true"]').focus();
      await active.page.keyboard.press('ArrowRight');
      await active.page.getByRole('button', { name: 'Następny miesiąc', exact: true }).click();
      await active.page.getByRole('button', { name: 'Dziś', exact: true }).click();
      const focused = calendar.locator('button[aria-pressed="true"]');
      await focused.focus();
      await active.page.keyboard.press('ArrowRight');
      await active.page.waitForFunction(() =>
        document.activeElement?.matches('.calendar-days button[aria-pressed="true"]:focus-visible'),
      );
      const focusOutline = await focused.evaluate(
        (element) => getComputedStyle(element).outlineStyle,
      );
      assert.notEqual(focusOutline, 'none');
      assert.equal(await readBrowserSave(active.page), initial);
      await calendar.scrollIntoViewIfNeeded();
      await active.page.screenshot({ path: `docs/images/pr170/calendar-${width}.png` });
      const fixture = JSON.parse(readFileSync('../pr170-dashboard.json', 'utf8')).career
        .careerCalendar.fixtures[0];
      for (let month = 0; month < 2; month++)
        await active.page.getByRole('button', { name: 'Następny miesiąc', exact: true }).click();
      await calendar.locator(`button[data-date="${fixture.date}"]`).click();
      assert(
        (await calendar.locator('.calendar-date-details').innerText()).includes(
          fixture.opponent.name,
        ),
      );
      assert.equal(await readBrowserSave(active.page), initial);
      await active.page.screenshot({ path: `docs/images/pr170/calendar-fixture-${width}.png` });
      const docWidth = await active.page.evaluate(() => document.documentElement.scrollWidth);
      assert(docWidth <= width + 1, `Dashboard overflows at ${width}: ${docWidth}`);
      report.scenarios.push({
        name: 'responsive-calendar',
        width,
        height,
        focusOutline,
        readOnly: true,
        futureFixture: fixture.id,
        errors: active.errors,
      });
      await active.page.locator('.summary-strip > button').nth(2).click();
      await active.page.screenshot({ path: `docs/images/pr170/finance-${width}.png` });
      await active.context.close();
    }
    for (const size of [12, 16, 20, 24]) {
      active = await loadBrowserSave(browser, server.url, `../pr170-table-${size}.json`, {
        width: 1366,
        height: 768,
      });
      assert.equal(await active.page.locator('.table-scroll tbody tr').count(), size);
      const bounds = await active.page.locator('.career-calendar').boundingBox();
      assert(
        bounds.y >= 0 && bounds.y + bounds.height <= 768,
        `Calendar hidden below ${size}-team table`,
      );
      const scrolling = await active.page.locator('.table-scroll').evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      await active.page.screenshot({ path: `docs/images/pr170/table-${size}.png` });
      report.scenarios.push({
        name: 'table-capacity',
        size,
        scrolling,
        calendarBounds: bounds,
        presentationFixtureOnly: true,
        errors: active.errors,
      });
      await active.context.close();
    }
    for (const action of ['external', 'renewal']) {
      active = await loadBrowserSave(browser, server.url, '../pr170-after-offers.json');
      const initial = JSON.parse(await readBrowserSave(active.page)).career;
      const button = active.page
        .locator(action === 'external' ? '.offer-card > button' : '.contract-proposal button')
        .first();
      await button.focus();
      await active.page.keyboard.press('Enter');
      await active.page.waitForFunction(() => !document.querySelector('.offer-grid'));
      const next = JSON.parse(await readBrowserSave(active.page)).career;
      assert.equal(next.currentSeason, initial.currentSeason + 1);
      assert.equal(next.currentClub.id === initial.currentClub.id, action === 'renewal');
      await active.page.reload();
      await active.page.getByRole('button', { name: 'Kontynuuj', exact: true }).click();
      assert.deepEqual(
        JSON.parse(await readBrowserSave(active.page)).career.currentContract,
        next.currentContract,
      );
      report.scenarios.push({
        name: `accept-${action}`,
        persistedAfterReload: true,
        season: next.currentSeason,
        errors: active.errors,
      });
      await active.context.close();
    }
    report.complete = true;
  }
  assert(
    report.scenarios.every((scenario) => !scenario.errors.length),
    'Browser errors',
  );
} catch (error) {
  report.failure = error.message;
  if (active && !active.page.isClosed()) {
    await active.page.screenshot({ path: '../pr170-browser-failure.png' });
    report.failureText = await active.page.locator('body').innerText();
  }
  throw error;
} finally {
  writeFileSync(
    `docs/performance/PR170-browser-${phase}.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
  await server.close();
}
