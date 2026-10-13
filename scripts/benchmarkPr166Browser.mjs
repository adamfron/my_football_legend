/* global URL, performance, document, console, indexedDB */
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const roots = { baseline: resolve(process.argv[2]), current: resolve('dist') };
const transferOnly = process.argv.includes('--transfer-only');
const careerSeed = process.env.MFL_PR166_BROWSER_SEED ?? 'pr166-youth';
const careerPosition = process.env.MFL_PR166_BROWSER_POSITION ?? 'lw';
const careerPolicy = process.env.MFL_PR166_BROWSER_POLICY ?? 'key_player';
if (!['cm', 'striker', 'lw', 'rw', 'lb', 'rb', 'cb', 'gk'].includes(careerPosition))
  throw new Error('Unsupported career position for the browser smoke');
if (
  !['key_player', 'player_extended', 'key_match', 'extended_match', 'full_match'].includes(
    careerPolicy,
  )
)
  throw new Error('Unsupported career presentation policy for the browser smoke');
let servedRoot = roots.baseline;
const packed = new Map();
const artifacts = {};
for (const [version, root] of Object.entries(roots)) {
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = resolve(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  artifacts[version] = walk(root).map((path) => {
    const raw = readFileSync(path),
      br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
    packed.set(path, { raw, br });
    return { path: relative(root, path).replaceAll('\\', '/'), raw: raw.length, brotli: br.length };
  });
}
const base = '/my_football_legend/';
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const server = createServer((request, response) => {
  const path = resolve(
    servedRoot,
    decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(base.length) ||
      'index.html',
  );
  const item =
    path.startsWith(servedRoot + '\\') || path.startsWith(servedRoot + '/')
      ? packed.get(path)
      : undefined;
  if (!item) {
    response.writeHead(404);
    response.end();
    return;
  }
  const compressed = (request.headers['accept-encoding'] ?? '').includes('br'),
    body = compressed ? item.br : item.raw;
  response.writeHead(200, {
    'Content-Type': types[extname(path)] ?? 'application/octet-stream',
    'Cache-Control': path.includes('assets') ? 'public, max-age=31536000, immutable' : 'no-cache',
    Vary: 'Accept-Encoding',
    ...(compressed ? { 'Content-Encoding': 'br' } : {}),
    'Content-Length': body.length,
  });
  response.end(body);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}${base}`;
const browser = await chromium.launch({
  channel: process.env.MFL_BROWSER_CHANNEL ?? 'msedge',
  headless: true,
});
const scenarios = [],
  smoke = { careerSeed, careerPosition, careerPolicy };
mkdirSync('docs/images', { recursive: true });
let page;
try {
  for (const [version, root] of [
    ['baseline', roots.baseline],
    ['current-reserve', roots.current],
    ['current', roots.current],
  ]) {
    servedRoot = root;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    page = await context.newPage();
    const cdp = await context.newCDPSession(page),
      requests = new Map(),
      errors = [];
    let completed = [];
    const allCompleted = [];
    await cdp.send('Network.enable');
    page.on('pageerror', (error) => errors.push(error.message));
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    if (version === 'current') {
      smoke.errors = errors;
      smoke.consoleErrors = consoleErrors;
    }
    cdp.on('Network.requestWillBeSent', (event) =>
      requests.set(event.requestId, event.request.url),
    );
    cdp.on('Network.loadingFinished', (event) => {
      const item = {
        url: requests.get(event.requestId)?.replace(url, ''),
        bytes: event.encodedDataLength,
      };
      completed.push(item);
      allCompleted.push(item);
    });
    const sample = async (name, action) => {
      completed = [];
      await action();
      await page.waitForLoadState('networkidle');
      const row = {
        version,
        name,
        bytes: completed.reduce((sum, item) => sum + item.bytes, 0),
        requests: [...completed],
        errors: [...errors],
      };
      scenarios.push(row);
      console.log(JSON.stringify({ version, name, bytes: row.bytes }));
    };
    await sample('cold-menu', async () => {
      await page.goto(url);
      await page.getByRole('button', { name: 'Nowa kariera', exact: true }).waitFor();
    });
    const beforeCareerCreation = allCompleted.length;
    await sample('cold-career-module', async () => {
      await page.getByRole('button', { name: 'Nowa kariera', exact: true }).click();
      await page.getByLabel('Imię', { exact: true }).waitFor();
    });
    await page.getByLabel('Imię', { exact: true }).fill('Jan');
    await page.getByLabel('Nazwisko', { exact: true }).fill('Junior');
    await page
      .getByLabel('Seed kariery')
      .fill(version === 'current-reserve' ? 'pr166-youth' : careerSeed);
    await page.getByRole('button', { name: 'Dalej >', exact: true }).click();
    await page
      .locator(`.pitch-${version === 'current-reserve' ? 'striker' : careerPosition}`)
      .click();
    await page.getByRole('button', { name: 'Dalej >', exact: true }).click();
    await page.locator('.player-preview[data-rendered="true"]').waitFor();
    await page.getByRole('button', { name: 'Dalej >', exact: true }).click();
    await sample('career-home', async () => {
      await page.getByRole('button', { name: 'Rozpocznij karierę', exact: true }).click();
      await page.locator('.career-view').waitFor();
    });
    smoke[`${version}CareerHomeHeap`] = await page.evaluate(
      () => performance.memory?.usedJSHeapSize ?? null,
    );
    const creationRequests = allCompleted.slice(beforeCareerCreation);
    scenarios.push({
      version,
      name: 'career-creation-through-home',
      bytes: creationRequests.reduce((sum, item) => sum + item.bytes, 0),
      requests: creationRequests,
      errors: [...errors],
    });
    await sample('cold-saved-career-menu', async () => {
      await cdp.send('Network.clearBrowserCache');
      await page.reload();
      await page.getByRole('button', { name: 'Kontynuuj', exact: true }).waitFor();
    });
    await sample('cold-saved-career-screen', async () => {
      await page.getByRole('button', { name: 'Kontynuuj', exact: true }).click();
      await page.locator('.career-view').waitFor();
    });
    if (version === 'baseline') {
      smoke.baselineCareerMatch =
        'PR165 still has the legacy narrative route; canonical career transfer has no baseline equivalent';
      await context.close();
      continue;
    }
    const reachFixture = async () => {
      const end = Date.now() + 120000;
      while (Date.now() < end) {
        if (await page.getByRole('button', { name: 'Rozpocznij mecz 3D', exact: true }).count())
          return;
        const choice = page.getByRole('button', { name: 'Wybierz', exact: true }).first();
        if ((await choice.count()) && (await choice.isEnabled())) await choice.click();
        else {
          const play = page.getByRole('button', { name: '▶ Graj', exact: true });
          if ((await play.count()) && (await play.isEnabled())) await play.click();
          else {
            const next = page
              .getByRole('button', { name: /^(Dalej|Kontynuuj wydarzenie)$/ })
              .first();
            if ((await next.count()) && (await next.isEnabled())) await next.click();
          }
        }
        await page.waitForTimeout(300);
      }
      throw new Error('Career did not reach a legitimate playable fixture');
    };
    await sample('first-career-fixture-introduction', reachFixture);
    const introduction = await page.locator('.career-canonical-match').innerText();
    if (version === 'current-reserve') {
      if (!introduction.includes('Ławka'))
        throw new Error('Reserve preflight was not naturally selected on the bench');
      await page.getByRole('button', { name: 'Rozpocznij mecz 3D', exact: true }).click();
      await page.getByLabel(/Czułość momentów/).selectOption('full_match');
      await page.locator('.pitch-canvas-host canvas').waitFor();
      await page
        .getByText('Jesteś na ławce. O wejściu decyduje trener.', { exact: true })
        .waitFor();
      if (errors.length || consoleErrors.length)
        throw new Error('Reserve preflight reported a runtime error');
      smoke.reservePreflight = {
        seed: 'pr166-youth',
        position: 'striker',
        naturallySelectedBench: true,
        runtimeOpened: true,
        errors: [],
        consoleErrors: [],
      };
      await context.close();
      continue;
    }
    smoke.fixtureIntroduction = introduction;
    if (!transferOnly)
      await page.screenshot({ path: 'docs/images/PR166-career-introduction.png', fullPage: true });
    await sample('first-career-3d-runtime', async () => {
      await page.getByRole('button', { name: 'Rozpocznij mecz 3D', exact: true }).click();
      await page.locator('.pitch-canvas-host canvas').waitFor({ state: 'attached' });
      await page.getByLabel(/Czułość momentów/).selectOption('full_match');
      await page.locator('.pitch-canvas-host canvas').waitFor();
    });
    smoke.developerControlsAbsent =
      (await page
        .getByText('DEV · Diagnostyka, scenariusze i zapis meczu', { exact: true })
        .count()) === 0;
    const back = page.getByRole('button', {
      name: 'Wróć do kariery · rozpocznij ten mecz później od początku',
      exact: true,
    });
    await back.click();
    await page.locator('.career-view').waitFor();
    await sample('second-fixture-restart-module-reuse', async () => {
      await reachFixture();
      await page.getByRole('button', { name: 'Rozpocznij mecz 3D', exact: true }).click();
      await page.locator('.pitch-canvas-host canvas').waitFor({ state: 'attached' });
    });
    if (transferOnly) {
      if (errors.length || consoleErrors.length)
        throw new Error('Transfer probe reported a runtime error');
      await context.close();
      continue;
    }
    await page.getByLabel(/Czułość momentów/).selectOption('full_match');
    await page.locator('.pitch-canvas-host canvas').waitFor();
    await page.getByRole('button', { name: 'Taktyczna z góry', exact: true }).click();
    await page.screenshot({ path: 'docs/images/PR166-career-pitch.png', fullPage: true });
    await page.getByLabel(/Czułość momentów/).selectOption(careerPolicy);
    await page.getByRole('button', { name: '16×', exact: true }).click();
    let decisions = 0,
      halfTimes = 0;
    let nextProgress = Date.now() + 30000;
    const end = Date.now() + 900000;
    while (Date.now() < end) {
      if (Date.now() >= nextProgress) {
        console.log(
          JSON.stringify({
            progress: 'career-match',
            decisions,
            halfTimes,
            lastChoice: smoke.lastSelectionLabel,
            header: await page
              .locator('.tactical-sandbox header')
              .innerText()
              .catch(() => 'no header'),
          }),
        );
        await page.screenshot({ path: '../browser-pr166-live.png', fullPage: true });
        nextProgress = Date.now() + 30000;
      }
      const finish = page.getByRole('button', {
        name: 'Zapisz wynik i wróć do kariery',
        exact: true,
      });
      if (await finish.count()) {
        await page.screenshot({ path: 'docs/images/PR166-career-full-time.png', fullPage: true });
        smoke.fullTimeText = await page.locator('.tactical-sandbox').innerText();
        await finish.click();
        await page.locator('.career-view').waitFor();
        break;
      }
      const half = page.getByRole('button', { name: 'Rozpocznij drugą połowę', exact: true });
      if (await half.count()) {
        await half.click();
        halfTimes++;
      } else if (await page.locator('.shot-aim button').count()) {
        await page.locator('.shot-aim button').first().click();
        decisions++;
      } else if (await page.locator('.restart-choices button').count()) {
        await page.locator('.restart-choices button').first().click();
      } else if (await page.locator('.context-menu button').count()) {
        const passes = page.locator('.context-menu button').filter({
          hasText: /^(Podaj|Podanie|Zagraj|Dośrodkuj|Wycofaj)/,
        });
        const selected = (await passes.count())
          ? passes.first()
          : page.locator('.context-menu button').first();
        smoke.lastSelectionLabel = await selected.innerText();
        await selected.click();
        decisions++;
      } else if (await page.getByLabel('Cel decyzji piłkarskiej', { exact: true }).count()) {
        const target = page.getByLabel('Cel decyzji piłkarskiej', { exact: true });
        const options = await target.locator('option').all();
        const values = await Promise.all(
          options.slice(1).map((option) => option.getAttribute('value')),
        );
        const labels = await target.locator('option').allTextContents();
        const receiver = values.find(
          (value, index) =>
            value && JSON.parse(value).kind === 'player' && labels[index + 1] !== 'Junior',
        );
        if (receiver) await target.selectOption(receiver);
        else if (values[0]) await target.selectOption(values[0]);
      } else if (await page.locator('.interaction-hint').count()) {
        const pitch = page.locator('.pitch-stage'),
          box = await pitch.boundingBox();
        let opened = false;
        for (const y of [0.5, 0.4, 0.6, 0.3, 0.7]) {
          for (const x of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
            await pitch.click({ position: { x: box.width * x, y: box.height * y } });
            if (await page.locator('.context-menu button,.shot-aim button').count()) {
              opened = true;
              break;
            }
          }
          if (opened) break;
        }
        if (!opened)
          await page.screenshot({ path: '../browser-pr166-decision.png', fullPage: true });
      }
      await page.waitForTimeout(100);
    }
    if (!(await page.locator('.career-view').count()))
      throw new Error('Browser match did not complete');
    smoke.decisions = decisions;
    smoke.halfTimes = halfTimes;
    smoke.careerAfterCommit = await page.locator('.career-view').innerText();
    const serialized = await page.evaluate(async () => {
      const request = indexedDB.open('my-football-legend', 1);
      const database = await new Promise((done, fail) => {
        request.onsuccess = () => done(request.result);
        request.onerror = () => fail(request.error);
      });
      const read = database
        .transaction('careerSaves', 'readonly')
        .objectStore('careerSaves')
        .get('primary');
      const value = await new Promise((done, fail) => {
        read.onsuccess = () => done(read.result);
        read.onerror = () => fail(read.error);
      });
      database.close();
      return value;
    });
    if (typeof serialized !== 'string') throw new Error('No actual committed career save');
    writeFileSync('../pr166-browser-career-save.json', serialized);
    smoke.actualSavedCareerBytes = Buffer.byteLength(serialized);
    const receipt = JSON.parse(serialized).career.historyFacts.find(
      (fact) => fact.factType === 'canonical_match_result',
    );
    smoke.canonicalEvidence = receipt?.data.result?.controlledEvidence;
    await sample('subsequent-career-fixture-module-reuse', async () => {
      await reachFixture();
      smoke.subsequentFixtureIntroduction = await page
        .locator('.career-canonical-match')
        .innerText();
      await page.getByRole('button', { name: 'Rozpocznij mecz 3D', exact: true }).click();
      await page.locator('.pitch-canvas-host canvas').waitFor({ state: 'attached' });
    });
    await page
      .getByRole('button', {
        name: 'Wróć do kariery · rozpocznij ten mecz później od początku',
        exact: true,
      })
      .click();
    await page.locator('.career-view').waitFor();
    const beforeReload = await page.locator('.career-view').innerText();
    await page.reload();
    await page.getByRole('button', { name: 'Kontynuuj', exact: true }).click();
    await page.locator('.career-view').waitFor();
    smoke.careerAfterReload = await page.locator('.career-view').innerText();
    smoke.savedRoundTrip = smoke.careerAfterReload === beforeReload;
    smoke.memory = await page.evaluate(() =>
      performance.memory
        ? {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
          }
        : null,
    );
    smoke.webgl = await page.evaluate(() => {
      const canvas = document.createElement('canvas'),
        gl = canvas.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        available: Boolean(gl),
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      };
    });
    smoke.errors = errors;
    await page.screenshot({ path: 'docs/images/PR166-career-reload.png', fullPage: true });
    await context.close();
  }
  if (
    smoke.errors?.length ||
    smoke.consoleErrors?.length ||
    !smoke.reservePreflight?.runtimeOpened ||
    !smoke.developerControlsAbsent ||
    (!transferOnly &&
      (!smoke.savedRoundTrip ||
        !smoke.decisions ||
        !(smoke.canonicalEvidence?.resolved > 0) ||
        smoke.halfTimes !== 1))
  )
    throw new Error('Browser integration invariant failed');
  writeFileSync(
    `docs/performance/${transferOnly ? 'PR166-transfer-final' : 'PR166-browser'}.json`,
    JSON.stringify(
      {
        browser: await browser.version(),
        scope: transferOnly
          ? 'Transfer and legitimate fixture startup/restart only; full-match human/result coverage is recorded separately in PR166-browser.json.'
          : 'Full production career match, resolved human evidence, save/reload, next fixture and reserve preflight.',
        baseline:
          'PR165 exact same source tree as merged main c34ad9b7556b604b17d98382fcc33a7e209bd044; existing production build',
        server:
          'Loopback HTTP Brotli11, same immutable asset policy for both revisions; CDP encodedDataLength includes response overhead; CPU timings and GPU/FPS excluded',
        artifacts,
        scenarios,
        smoke,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({
      smoke: transferOnly ? 'transfer-only-pass' : 'pass',
      decisions: smoke.decisions,
      halfTimes: smoke.halfTimes,
    }),
  );
} catch (error) {
  if (page && !page.isClosed())
    await page.screenshot({ path: '../browser-pr166-error.png', fullPage: true });
  writeFileSync(
    '../browser-pr166-partial.json',
    JSON.stringify({ scenarios, smoke, error: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  server.close();
}
