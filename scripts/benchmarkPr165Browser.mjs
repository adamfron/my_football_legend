/* global URL, location, history, dispatchEvent, PopStateEvent, performance, console */
import process from 'node:process';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const roots = {
  baseline: resolve(process.argv[2] ?? '../baseline-source/dist'),
  current: resolve('dist'),
};
let servedRoot = roots.baseline;
const packed = new Map();
const artifacts = {};
for (const [label, root] of Object.entries(roots)) {
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = resolve(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  artifacts[label] = walk(root).map((path) => {
    const raw = readFileSync(path),
      br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
    packed.set(path, { raw, br });
    return { path: relative(root, path).replaceAll('\\', '/'), raw: raw.length, brotli: br.length };
  });
}
const base = '/my_football_legend/';
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
  const br = (request.headers['accept-encoding'] ?? '').includes('br');
  const body = br ? item.br : item.raw;
  response.writeHead(200, {
    'Content-Type':
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      }[extname(path)] ?? 'application/octet-stream',
    'Cache-Control': path.includes('assets') ? 'public, max-age=31536000, immutable' : 'no-cache',
    Vary: 'Accept-Encoding',
    ...(br ? { 'Content-Encoding': 'br' } : {}),
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
const scenarios = [];
let lastPage;
let gallery,
  profileSaved = false,
  preview,
  renderer;
mkdirSync('docs/images', { recursive: true });
try {
  for (const [label, root] of Object.entries(roots)) {
    servedRoot = root;
    const context = await browser.newContext({ viewport: { width: 1320, height: 1000 } });
    const page = await context.newPage(),
      cdp = await context.newCDPSession(page);
    lastPage = page;
    await cdp.send('Network.enable');
    const requests = new Map();
    let completed = [];
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    cdp.on('Network.requestWillBeSent', (e) => requests.set(e.requestId, e.request.url));
    cdp.on('Network.loadingFinished', (e) =>
      completed.push({
        url: requests.get(e.requestId)?.replace(url, ''),
        bytes: e.encodedDataLength,
      }),
    );
    const sample = async (name, action) => {
      completed = [];
      const start = performance.now();
      await action();
      await page.waitForLoadState('networkidle');
      scenarios.push({
        version: label,
        name,
        bytes: completed.reduce((n, e) => n + e.bytes, 0),
        elapsedIncludingIdleMs: performance.now() - start,
        requests: [...completed],
        errors: [...errors],
      });
    };
    await sample('cold-start', async () => {
      await page.goto(url);
      await page.getByRole('button', { name: 'Nowa kariera', exact: true }).waitFor();
    });
    await sample('first-creator', async () => {
      await page.getByRole('button', { name: 'Nowa kariera', exact: true }).click();
      await page.getByLabel('Imię', { exact: true }).waitFor();
    });
    await page.getByLabel('Imię', { exact: true }).fill('Jan');
    await page.getByLabel('Nazwisko', { exact: true }).fill('DNA');
    await page.getByLabel('Seed kariery').fill('pr165-browser');
    await page.getByRole('button', { name: 'Dalej >', exact: true }).click();
    await sample('first-portrait', async () => {
      await page.getByRole('button', { name: 'Dalej >', exact: true }).click();
      if (label === 'current')
        await page.locator('.player-preview[data-rendered="true"]').waitFor();
      else await page.getByRole('button', { name: 'Rozpocznij karierę', exact: true }).waitFor();
    });
    if (label === 'current') {
      await page.getByLabel('Fryzura').selectOption('curly');
      await page.getByLabel('Prezentacja').selectOption('feminine');
      await page.getByRole('button', { name: 'Kanciasta', exact: true }).click();
      await page.screenshot({ path: '../creator-pr165.png', fullPage: true });
      preview = await page.locator('.player-preview').evaluate((e) => ({ ...e.dataset }));
      await page.getByRole('button', { name: 'Dalej >', exact: true }).click();
    }
    await sample('first-career', async () => {
      await page.getByRole('button', { name: 'Rozpocznij karierę', exact: true }).click();
      await page.locator('.career-view').waitFor();
    });
    if (label === 'current') {
      await page.locator('.summary-strip > button').first().click();
      await page.getByRole('button', { name: 'Zmień wygląd', exact: true }).click();
      await page.getByLabel('Fryzura').selectOption('long');
      await page.getByRole('button', { name: 'Zapisz wygląd', exact: true }).click();
      await page.getByRole('button', { name: 'Zmień wygląd', exact: true }).waitFor();
      await page.reload();
      await page.getByRole('button', { name: 'Kontynuuj', exact: true }).click();
      await page.locator('.career-view').waitFor();
      await page.locator('.summary-strip > button').first().click();
      await page.getByRole('button', { name: 'Zmień wygląd', exact: true }).click();
      profileSaved = (await page.getByLabel('Fryzura').inputValue()) === 'long';
      await page.screenshot({ path: '../profile-pr165.png', fullPage: true });
      await page.getByRole('button', { name: 'Anuluj', exact: true }).click();
    }
    const enter = async () => {
      await page.evaluate(() => {
        const u = new URL(location.href);
        u.searchParams.set('matchSandbox', '1');
        u.searchParams.set('devtools', '1');
        history.pushState(null, '', u.href);
        dispatchEvent(new PopStateEvent('popstate'));
      });
      await page.getByRole('button', { name: 'Rozpocznij mecz', exact: true }).click();
      await page.getByRole('button', { name: 'Powrót do menu', exact: true }).waitFor();
    };
    await sample('first-playable-match', enter);
    await page.getByRole('button', { name: 'Powrót do menu', exact: true }).click();
    await page.locator('.pitch-canvas-host canvas').waitFor({ state: 'detached' });
    await sample('second-match-same-document', enter);
    if (label === 'current') {
      await sample('first-model-gallery', async () => {
        await page.goto(url + '?devtools=1&visualGallery=1');
        await page.locator('.gallery-stage[data-benchmark]').waitFor({ timeout: 60000 });
      });
      gallery = await page.locator('.gallery-stage').evaluate((e) => ({
        first: JSON.parse(e.dataset.firstMetrics),
        final: JSON.parse(e.dataset.metrics),
        models22: JSON.parse(e.dataset.benchmark),
      }));
      renderer = await page.locator('.gallery-stage canvas').evaluate((e) => {
        const gl = e.getContext('webgl2');
        const extension = gl?.getExtension('WEBGL_debug_renderer_info');
        return {
          vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null,
          renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
        };
      });
      await page.screenshot({ path: 'docs/images/PR165-gallery.png', fullPage: true });
    }
    await context.close();
  }
  if (scenarios.some((s) => s.errors.length) || !profileSaved)
    throw new Error('Browser errors or cosmetic persistence failure');
  writeFileSync(
    'docs/performance/PR165-browser.json',
    JSON.stringify(
      {
        browser: await browser.version(),
        server:
          'loopback HTTP Brotli11, immutable hash assets, no service worker; CDP loadingFinished encodedDataLength includes response overhead; elapsed includes network idle',
        baseline: 'clean main 4f08a37 rebuilt with same toolchain',
        artifacts,
        scenarios,
        profileSaved,
        preview,
        gallery,
        renderer,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({
      profileSaved,
      scenarios: scenarios.map(({ version, name, bytes }) => ({ version, name, bytes })),
      gallery,
      renderer,
    }),
  );
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: '../browser-pr165-error.png', fullPage: true });
    console.log((await lastPage.locator('body').innerText()).slice(0, 3000));
  }
  throw error;
} finally {
  await browser.close();
  server.close();
}
