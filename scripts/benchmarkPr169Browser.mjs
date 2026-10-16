/* global indexedDB, document, URL */
import process from 'node:process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const base = '/my_football_legend/';
const servers = [];
const serve = async (root) => {
  root = resolve(root);
  const s = createServer((req, res) => {
    try {
      const path = resolve(
        root,
        decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(base.length) ||
          'index.html',
      );
      if (!path.startsWith(root + '\\') && !path.startsWith(root + '/')) throw Error('path');
      const bytes = readFileSync(path);
      res.writeHead(200, {
        'Content-Type':
          {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
          }[extname(path)] ?? 'application/octet-stream',
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((done) => s.listen(0, '127.0.0.1', done));
  servers.push(s);
  return `http://127.0.0.1:${s.address().port}${base}`;
};
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report =
  process.env.MFL_BROWSER_PHASE === 'full'
    ? JSON.parse(readFileSync('docs/performance/PR169-browser.json', 'utf8'))
    : {
        environment:
          'Actual headless Microsoft Edge over production HTTP; generated deterministic save fixtures. Age-36 boundary is a controlled regression fixture, not the unavailable original user save.',
        scenarios: [],
      };
mkdirSync('docs/images', { recursive: true });
const readSave = (page) =>
  page.evaluate(async () => {
    const request = indexedDB.open('my-football-legend', 1);
    const db = await new Promise((done, fail) => {
      request.onsuccess = () => done(request.result);
      request.onerror = () => fail(request.error);
    });
    const get = db.transaction('careerSaves', 'readonly').objectStore('careerSaves').get('primary');
    const result = await new Promise((done, fail) => {
      get.onsuccess = () => done(get.result);
      get.onerror = () => fail(get.error);
    });
    db.close();
    return result;
  });
const load = async (file, url) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    page = await context.newPage(),
    errors = [],
    modules = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => modules.push(r.url()));
  await page.goto(url);
  await page.evaluate(
    async (text) => {
      const request = indexedDB.open('my-football-legend', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('careerSaves'))
          request.result.createObjectStore('careerSaves');
      };
      const db = await new Promise((done, fail) => {
        request.onsuccess = () => done(request.result);
        request.onerror = () => fail(request.error);
      });
      await new Promise((done, fail) => {
        const tx = db.transaction('careerSaves', 'readwrite');
        tx.objectStore('careerSaves').put(text, 'primary');
        tx.oncomplete = done;
        tx.onerror = () => fail(tx.error);
      });
      db.close();
    },
    readFileSync(file, 'utf8'),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Kontynuuj', exact: true }).click();
  await page.locator('.career-view').first().waitFor();
  return { context, page, errors, modules };
};
let active;
const assert = (ok, message) => {
  if (!ok) throw Error(message);
};
try {
  const after = await serve('dist');
  if (process.env.MFL_BROWSER_PHASE !== 'full') {
    const before = await serve('../baseline-pr168/dist');
    for (const [name, url, file] of [
      ['before', before, '../pr169-before-long.json'],
      ['after', after, '../pr169-after-long.json'],
    ]) {
      active = await load(file, url);
      const { page } = active,
        initial = await readSave(page);
      const start = Date.now();
      await page.locator('.summary-strip > button').nth(3).click();
      await page.getByRole('heading', { name: 'Oś czasu kariery', exact: true }).waitFor();
      const row = {
        scenario: `history-${name}`,
        openWallMs: Date.now() - start,
        rows: await page.locator(name === 'before' ? '.history-item' : '.history-row').count(),
        errors: active.errors,
      };
      await page.screenshot({ path: `docs/images/PR169-history-${name}.png` });
      if (name === 'after') {
        await page.getByLabel('Wydarzenia', { exact: true }).selectOption('1');
        await page.getByLabel('Sezon', { exact: true }).selectOption({ index: 1 });
        await page.getByLabel('Wydarzenia', { exact: true }).focus();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        row.keyboardFilterWorked = true;
        await page.getByLabel('Sezon', { exact: true }).selectOption('all');
        await page.locator('.season-history > summary').first().click();
        await page.locator('.archived-match').first().waitFor();
        await page.locator('.archived-match details > summary').first().click();
        row.archiveDetailOpened = true;
        row.noMutation = (await readSave(page)) === initial;
        assert(row.noMutation, 'Historical inspection changed the save');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: 'docs/images/PR169-history-mobile.png', fullPage: true });
        row.mobilePanelWidth = (await page.locator('.career-history').boundingBox()).width;
        assert(row.mobilePanelWidth <= 390, 'History panel overflows');
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.getByRole('button', { name: 'Wiadomości', exact: true }).click();
        await page.locator('.career-news').waitFor();
        await page.locator('.career-news details > summary').first().click();
        await page.screenshot({ path: 'docs/images/PR169-news.png' });
        row.newsItems = await page.locator('.career-news details').count();
        assert(row.newsItems <= 24, 'Unbounded news');
        row.canonicalRuntimeLoaded = active.modules.some((m) =>
          /CareerCanonicalMatch|TacticalMatchSandbox/.test(m),
        );
        assert(!row.canonicalRuntimeLoaded, 'History loaded the 3D runtime');
      }
      report.scenarios.push(row);
      await active.context.close();
    }
    active = await load('../pr169-renewal-age36.json', after);
    {
      const { page } = active,
        initial = JSON.parse(await readSave(page)).career;
      await page.screenshot({ path: 'docs/images/PR169-season-summary.png' });
      await page.locator('.contract-proposal button').first().click();
      await page.waitForFunction(() => !document.querySelector('.contract-proposal'));
      const next = JSON.parse(await readSave(page)).career;
      assert(next.currentSeason === initial.currentSeason + 1, 'Renewal did not advance once');
      assert(next.currentClub.id === initial.currentClub.id, 'Renewal changed the club');
      assert(
        next.historyFacts.filter(
          (f) => f.factType === 'contract_renewed' && f.season === next.currentSeason,
        ).length === 1,
        'Renewal fact duplicated',
      );
      await page.reload();
      await page.getByRole('button', { name: 'Kontynuuj', exact: true }).click();
      assert(
        JSON.stringify(JSON.parse(await readSave(page)).career.currentContract) ===
          JSON.stringify(next.currentContract),
        'Renewal lost on reload',
      );
      report.scenarios.push({
        scenario: 'renewal-age36',
        oldSeason: initial.currentSeason,
        newSeason: next.currentSeason,
        clubId: next.currentClub.id,
        contract: next.currentContract,
        errors: active.errors,
      });
      await active.context.close();
    }
    active = await load('../pr169-invalid-renewal.json', after);
    {
      const { page } = active,
        initial = await readSave(page);
      await page.locator('.contract-proposal button').first().click();
      assert(
        (await page.locator('[role="alert"]').allTextContents())
          .join(' ')
          .includes('okna kontraktowego'),
        'Invalid renewal lacks visible error',
      );
      assert((await readSave(page)) === initial, 'Invalid renewal mutated the save');
      report.scenarios.push({
        scenario: 'invalid-renewal',
        visibleError: true,
        noMutation: true,
        errors: active.errors,
      });
      await active.context.close();
    }
    active = await load('../pr169-after-retired.json', after);
    {
      const { page } = active;
      await page.locator('.retirement-story').waitFor();
      await page.locator('.player-preview[data-rendered="true"]').waitFor();
      await page.screenshot({ path: 'docs/images/PR169-retirement.png' });
      report.scenarios.push({
        scenario: 'retirement-25-seasons',
        rows: await page.locator('.retirement-summary tbody tr').count(),
        story: await page.locator('.retirement-story').innerText(),
        errors: active.errors,
      });
      await active.context.close();
    }
  }
  if (existsSync('../pr169-full-match.json')) {
    active = await load('../pr169-full-match.json', after);
    const { page } = active,
      initial = await readSave(page);
    const rows = page
      .locator('.season-timeline > li')
      .filter({ has: page.locator('.career-match-details') });
    await rows.first().locator('details > summary').click();
    await page.screenshot({ path: 'docs/images/PR169-canonical-match-details.png' });
    assert((await readSave(page)) === initial, 'Opening canonical details changed save');
    report.scenarios.push({
      scenario: 'completed-full-canonical',
      text: await rows.first().innerText(),
      readOnly: true,
      errors: active.errors,
    });
    await active.context.close();
  }
  report.complete = report.scenarios.some((s) => s.scenario === 'completed-full-canonical');
  assert(
    report.scenarios.every((s) => !s.errors?.length),
    'Browser page errors',
  );
} catch (e) {
  report.failure = e.message;
  if (active && !active.page.isClosed()) {
    await active.page.screenshot({ path: '../pr169-browser-failure.png', fullPage: true });
    report.failureText = await active.page.locator('body').innerText();
  }
  throw e;
} finally {
  writeFileSync('docs/performance/PR169-browser.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await Promise.all(servers.map((s) => new Promise((done) => s.close(done))));
}
