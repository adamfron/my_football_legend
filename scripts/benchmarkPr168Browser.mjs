/* global indexedDB, performance, console, URL, document */
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
  scenarios:
    process.env.MFL_RETIREMENT_ONLY === '1'
      ? JSON.parse(readFileSync('docs/performance/PR168-browser.json', 'utf8')).scenarios
      : [],
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
  for (const scenario of process.env.MFL_RETIREMENT_ONLY === '1'
    ? []
    : ['youth-summary', 'professional-summary', 'professional-play', 'youth-play-remainder']) {
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
    const dialog = page.getByRole('dialog', { name: 'Nadchodzący mecz' });
    await dialog.waitFor({ state: 'visible' });
    row.careerBehindDialog = (await page.locator('.career-view .season-workspace').count()) === 1;
    await page.keyboard.press('Tab');
    row.keyboardFocusContained = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('dialog')),
    );
    await page.screenshot({ path: `docs/images/PR168-${scenario}-prematch.png`, fullPage: true });
    if (scenario === 'youth-summary') {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: 'docs/images/PR168-prematch-mobile.png', fullPage: true });
      const box = await dialog.boundingBox();
      row.mobileDialogFits =
        box.x >= 0 && box.x + box.width <= 391 && box.y >= 0 && box.height <= 844;
      if (!row.mobileDialogFits) throw new Error('Prematch exceeds mobile viewport');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      const returned = JSON.parse(await readSave(page)).career;
      row.returnDoesNotSettle = !returned.seasonParticipation.some(
        (p) => p.fixtureId === fixtureId && p.fixtureStatus === 'completed',
      );
      if (!row.returnDoesNotSettle) throw new Error('Return settled fixture');
      await page.setViewportSize({ width: 1440, height: 1050 });
      await reachFixture(page);
    }
    if (!row.careerBehindDialog || !row.keyboardFocusContained)
      throw new Error('Career dialog/focus missing');
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
              path: 'docs/images/PR168-remainder-confirmation.png',
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
      writeFileSync('../pr168-browser-career-save.json', after);
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
    if (scenario === 'youth-summary') {
      await page.locator('.summary-strip > button').first().click();
      const profile = await page.locator('.player-projection').innerText();
      await page.locator('.player-preview[data-rendered="true"]').waitFor();
      row.normalStyleThresholdsHidden = !/180 minut|poziomie 45|\/4 mecze|0,025/.test(profile);
      if (!row.normalStyleThresholdsHidden) throw new Error('Hidden PlayStyle thresholds leaked');
      await page.screenshot({ path: 'docs/images/PR168-profile.png', fullPage: true });
      await page.locator('.summary-strip > button').first().click();
    }
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
  const retiredContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await retiredContext.newPage();
  await page.goto(url);
  await page.evaluate(
    async (text) => {
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
    },
    readFileSync('../pr168-retired-career.json', 'utf8'),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Kontynuuj', exact: true }).click();
  const retirement = page.locator('.retirement-summary');
  await retirement.waitFor();
  await page.locator('.player-preview[data-rendered="true"]').waitFor();
  await page.screenshot({ path: 'docs/images/PR168-retirement.png', fullPage: true });
  const retirementText = await retirement.innerText();
  if (
    !retirementText.includes('Pierwszy klub: Vistula Nova') ||
    !retirementText.includes('Najwyższy OVR')
  )
    throw new Error('Retirement facts missing');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/images/PR168-retirement-mobile.png', fullPage: true });
  const retirementBox = await retirement.boundingBox();
  if (retirementBox.width > 391) throw new Error('Retirement page overflows mobile width');
  report.retirement = {
    rows: await retirement.locator('tbody tr').count(),
    mobileWidth: retirementBox.width,
    text: retirementText,
  };
  await page.getByRole('button', { name: 'Historia kariery', exact: true }).click();
  await page.getByRole('heading', { name: 'Oś czasu kariery', exact: true }).waitFor();
  report.retirement.historyOpened = true;
  await page.getByRole('button', { name: 'Wróć do podsumowania', exact: true }).click();
  await page.getByRole('button', { name: 'Nowa kariera', exact: true }).click();
  await page.getByLabel('Imię', { exact: true }).waitFor({ state: 'visible' });
  report.retirement.newCareerOpened = await page.getByLabel('Imię', { exact: true }).isVisible();
  if (!report.retirement.newCareerOpened) throw new Error('New career action did not open creator');
  await retiredContext.close();
} catch (error) {
  report.failure = error.message;
  if (page && !page.isClosed()) {
    await page.screenshot({ path: '../pr168-browser-failure.png', fullPage: true });
    report.failureText = await page.locator('body').innerText();
  }
  throw error;
} finally {
  writeFileSync('docs/performance/PR168-browser.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await new Promise((done) => server.close(done));
}
