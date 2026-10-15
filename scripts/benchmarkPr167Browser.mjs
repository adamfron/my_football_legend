/* global indexedDB, performance, console, URL */
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const root = resolve('dist'),
  base = '/my_football_legend/';
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
const server = createServer((req, res) => {
  try {
    const path = resolve(
      root,
      decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(base.length) ||
        'index.html',
    );
    if (!path.startsWith(root + '/') && !path.startsWith(root + '\\'))
      throw new Error('Invalid path');
    const body = readFileSync(path);
    res.writeHead(200, {
      'Content-Type': types[extname(path)] ?? 'application/octet-stream',
      'Content-Length': body.length,
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}${base}`;
const browser = await chromium.launch({
  channel: process.env.MFL_BROWSER_CHANNEL ?? 'msedge',
  headless: true,
});
const report = {
  environment:
    'Actual headless Edge over local uncompressed production HTTP. UI interactions only; no match-state injection.',
  scenarios: [],
};
mkdirSync('docs/images', { recursive: true });
mkdirSync('docs/performance', { recursive: true });
let page;
const readSave = (page) =>
  page.evaluate(async () => {
    const open = indexedDB.open('my-football-legend', 1);
    const db = await new Promise((done, fail) => {
      open.onsuccess = () => done(open.result);
      open.onerror = () => fail(open.error);
    });
    const request = db
      .transaction('careerSaves', 'readonly')
      .objectStore('careerSaves')
      .get('primary');
    const text = await new Promise((done, fail) => {
      request.onsuccess = () => done(request.result);
      request.onerror = () => fail(request.error);
    });
    db.close();
    return text;
  });
const reachFixture = async (page) => {
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    if (await page.getByRole('button', { name: 'Rozegraj mecz 3D', exact: true }).count()) return;
    for (const candidate of [
      page.getByRole('button', { name: 'Wybierz', exact: true }).first(),
      page.getByRole('button', { name: '▶ Graj', exact: true }),
      page.getByRole('button', { name: /^(Dalej|Kontynuuj wydarzenie)$/ }).first(),
    ]) {
      if (
        (await candidate.count()) &&
        (await candidate.isEnabled({ timeout: 300 }).catch(() => false))
      ) {
        await candidate.click({ timeout: 1000 }).catch(() => undefined);
        break;
      }
    }
    await page.waitForTimeout(150);
  }
  throw new Error('No legitimate playable fixture reached');
};
try {
  for (const scenario of [
    'youth-summary',
    'professional-summary',
    'professional-play',
    'youth-play-remainder',
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    page = await context.newPage();
    const errors = [],
      consoleErrors = [],
      requests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('response', (r) => requests.push(r.url().replace(url, '')));
    await page.goto(url);
    if (scenario.startsWith('professional')) {
      const serialized = readFileSync('../pr167-professional-before.json', 'utf8');
      await page.evaluate(async (text) => {
        const open = indexedDB.open('my-football-legend', 1);
        const db = await new Promise((done, fail) => {
          open.onsuccess = () => done(open.result);
          open.onerror = () => fail(open.error);
        });
        await new Promise((done, fail) => {
          const transaction = db.transaction('careerSaves', 'readwrite');
          transaction.objectStore('careerSaves').put(text, 'primary');
          transaction.oncomplete = done;
          transaction.onerror = () => fail(transaction.error);
        });
        db.close();
      }, serialized);
      await page.reload();
      await page.getByRole('button', { name: 'Kontynuuj', exact: true }).click();
    } else {
      await page.getByRole('button', { name: 'Nowa kariera', exact: true }).click();
      await page.getByLabel('Imię', { exact: true }).fill('Jan');
      await page.getByLabel('Nazwisko', { exact: true }).fill('Junior');
      await page.getByLabel('Seed kariery').fill('pr166-youth');
      await page.getByRole('button', { name: 'Dalej >', exact: true }).click();
      await page.locator('.pitch-lw').click();
      await page.getByRole('button', { name: 'Dalej >', exact: true }).click();
      await page.locator('.player-preview[data-rendered="true"]').waitFor();
      await page.getByRole('button', { name: 'Dalej >', exact: true }).click();
      await page.getByRole('button', { name: 'Rozpocznij karierę', exact: true }).click();
    }
    await reachFixture(page);
    const before = await readSave(page),
      initial = JSON.parse(before).career;
    const fixtureId = initial.activeMatch.id;
    const preflightRequests = [...requests];
    if (preflightRequests.some((r) => /CareerCanonicalMatch|TacticalMatchSandbox/.test(r)))
      throw new Error('Canonical runtime loaded before the choice');
    const row = {
      scenario,
      preflight: await page.locator('.career-prematch').innerText(),
      canonicalModuleBeforeChoice: false,
    };
    if (scenario.endsWith('summary')) {
      const start = Date.now();
      await page.getByRole('button', { name: 'Symuluj mecz', exact: true }).click();
      await page.locator('.career-view').waitFor();
      row.summaryAndSaveWallMs = Date.now() - start;
      row.canonicalModuleAfterSummary = requests.some((r) =>
        /CareerCanonicalMatch|TacticalMatchSandbox/.test(r),
      );
      if (row.canonicalModuleAfterSummary) throw new Error('Summary initialized canonical runtime');
    } else {
      await page.getByRole('button', { name: 'Rozegraj mecz 3D', exact: true }).click();
      await page.locator('.pitch-canvas-host canvas').waitFor({ state: 'attached' });
      row.canonicalModuleAfterPlay = requests.some((r) => /CareerCanonicalMatch/.test(r));
      await page.getByRole('button', { name: '16×', exact: true }).click();
      let decisions = 0,
        lastProgress = Date.now(),
        handedOff = false;
      const end = Date.now() + 600000;
      while (Date.now() < end) {
        const handoff = page.getByRole('button', { name: 'Symuluj do końca', exact: true });
        const pending = await page.getByLabel('Cel decyzji piłkarskiej', { exact: true }).count();
        if (
          (scenario === 'professional-play' || decisions >= 3) &&
          (await handoff.count()) &&
          (await handoff.isEnabled())
        ) {
          row.handoffHeader = await page.locator('.tactical-sandbox header').innerText();
          await page.waitForTimeout(1500);
          await handoff.click();
          await page.getByRole('dialog', { name: 'Symulacja pozostałej części meczu' }).waitFor();
          if (scenario === 'youth-play-remainder') {
            await page.screenshot({
              path: 'docs/images/PR167-remainder-confirmation.png',
              fullPage: true,
            });
            await page.getByRole('button', { name: 'Anuluj', exact: true }).click();
            row.cancelPreservedMatch = (await page.locator('.tactical-sandbox').count()) === 1;
            await handoff.click();
          }
          await page
            .getByRole('button', { name: 'Tak, symuluj pozostałą część', exact: true })
            .click();
          await page.locator('.career-view').waitFor();
          handedOff = true;
          break;
        }
        const half = page.getByRole('button', { name: 'Rozpocznij drugą połowę', exact: true });
        if (await half.count()) await half.click();
        else if (await page.locator('.shot-aim button').count()) {
          await page.locator('.shot-aim button').first().click();
          decisions++;
        } else if (await page.locator('.restart-choices button').count())
          await page.locator('.restart-choices button').first().click();
        else if (await page.locator('.context-menu button').count()) {
          const passes = page
            .locator('.context-menu button')
            .filter({ hasText: /^(Podaj|Podanie|Zagraj|Dośrodkuj|Wycofaj)/ });
          await (
            (await passes.count()) ? passes.first() : page.locator('.context-menu button').first()
          ).click();
          decisions++;
        } else if (pending) {
          const target = page.getByLabel('Cel decyzji piłkarskiej', { exact: true });
          const values = await target
            .locator('option')
            .evaluateAll((options) => options.slice(1).map((option) => option.value));
          const labels = await target.locator('option').allTextContents();
          const receiver = values.find(
            (value, index) =>
              value && JSON.parse(value).kind === 'player' && !labels[index + 1].includes('Junior'),
          );
          if (receiver ?? values[0]) await target.selectOption(receiver ?? values[0]);
        }
        if (Date.now() - lastProgress >= 30000) {
          console.log(
            JSON.stringify({
              scenario,
              decisions,
              header: await page.locator('.tactical-sandbox header').innerText(),
            }),
          );
          lastProgress = Date.now();
        }
        await page.waitForTimeout(100);
      }
      if (!handedOff) throw new Error('No handoff reached in bounded browser smoke');
      row.decisionsSelectedThroughUI = decisions;
    }
    const after = await readSave(page),
      saved = JSON.parse(after).career;
    row.fixtureId = fixtureId;
    row.saveBytes = Buffer.byteLength(after);
    row.participation = saved.seasonParticipation.find((p) => p.fixtureId === fixtureId);
    if (!row.participation || row.participation.fixtureStatus !== 'completed' || saved.activeMatch)
      throw new Error('Fixture did not settle');
    if (scenario === 'youth-play-remainder') {
      const fact = saved.historyFacts.find((f) => f.id === `canonical_match:${fixtureId}`),
        result = fact?.data.result;
      row.evidence = result?.controlledEvidence;
      row.provenance = fact?.data.summary.provenance;
      row.resultBytes = Buffer.byteLength(JSON.stringify(result));
      writeFileSync('../pr167-browser-career-save.json', after);
      if (result?.version !== 2 || row.evidence.resolved < 2 || !row.provenance) {
        report.scenarios.push(row);
        throw new Error(
          `Missing actual human evidence/continuation: ${JSON.stringify({ version: result?.version, selected: row.evidence?.selected, resolved: row.evidence?.resolved, provenance: row.provenance })}`,
        );
      }
    }
    await page.reload();
    await page.getByRole('button', { name: 'Kontynuuj', exact: true }).click();
    await page.locator('.career-view').waitFor();
    const loadedSave = await readSave(page);
    const stable = (value) =>
      Array.isArray(value)
        ? value.map(stable)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, item]) => [key, stable(item)]),
            )
          : value;
    row.savedRoundTrip =
      JSON.stringify(stable(JSON.parse(loadedSave).career)) === JSON.stringify(stable(saved));
    if (!row.savedRoundTrip) {
      const restored = JSON.parse(loadedSave).career;
      row.changedCareerKeys = [
        ...new Set([...Object.keys(saved), ...Object.keys(restored)]),
      ].filter(
        (key) => JSON.stringify(stable(saved[key])) !== JSON.stringify(stable(restored[key])),
      );
      writeFileSync('../pr167-before-reload.json', after);
      writeFileSync('../pr167-after-reload.json', loadedSave);
      report.scenarios.push(row);
    }
    row.heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
    if (!row.savedRoundTrip || errors.length || consoleErrors.length)
      throw new Error(
        JSON.stringify({ errors, consoleErrors, savedRoundTrip: row.savedRoundTrip }),
      );
    await reachFixture(page);
    row.nextFixtureReached = true;
    row.nextFixtureId = JSON.parse(await readSave(page)).career.activeMatch.id;
    if (row.nextFixtureId === fixtureId) throw new Error('Completed fixture offered again');
    row.errors = errors;
    row.consoleErrors = consoleErrors;
    report.scenarios.push(row);
    console.log(
      JSON.stringify({
        completed: scenario,
        saveBytes: row.saveBytes,
        resolved: row.evidence?.resolved,
      }),
    );
    await context.close();
  }
} catch (error) {
  report.failure = error.message;
  if (page && !page.isClosed()) {
    await page.screenshot({ path: '../pr167-browser-failure.png', fullPage: true });
    report.failureText = await page.locator('body').innerText();
  }
  throw error;
} finally {
  writeFileSync('docs/performance/PR167-browser.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await new Promise((done) => server.close(done));
}
