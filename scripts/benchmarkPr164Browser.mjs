/* global console, URL, performance, indexedDB, TextEncoder, localStorage, location, history, dispatchEvent, PopStateEvent */
import process from 'node:process';
import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const baseline = resolve(process.argv[2] ?? '../baseline-dist'),
  current = resolve('dist');
let servedRoot = baseline;
const base = '/my_football_legend/';
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const packed = new Map();
const assets = (root) => {
  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = resolve(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  return walk(root).map((path) => {
    const raw = readFileSync(path),
      gzip = gzipSync(raw, { level: 9 }),
      br = brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
    packed.set(path, {
      raw,
      gzip,
      br,
      etag: '"' + createHash('sha256').update(raw).digest('hex') + '"',
    });
    return {
      path: relative(root, path).replaceAll('\\', '/'),
      raw: raw.length,
      gzip: gzip.length,
      brotli: br.length,
    };
  });
};
const artifact = { baseline: assets(baseline), current: assets(current) };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (!pathname.startsWith(base)) {
    response.writeHead(404);
    response.end();
    return;
  }
  const name = pathname.slice(base.length) || 'index.html';
  const path = resolve(servedRoot, name);
  if (!path.startsWith(servedRoot + '\\') && !path.startsWith(servedRoot + '/')) {
    response.writeHead(403);
    response.end();
    return;
  }
  const item = packed.get(path);
  if (!item) {
    response.writeHead(404);
    response.end();
    return;
  }
  const encoding = (request.headers['accept-encoding'] ?? '').includes('br')
    ? 'br'
    : (request.headers['accept-encoding'] ?? '').includes('gzip')
      ? 'gzip'
      : undefined;
  const body = encoding === 'br' ? item.br : encoding === 'gzip' ? item.gzip : item.raw;
  const headers = {
    'Content-Type': types[extname(path)] ?? 'application/octet-stream',
    'Cache-Control': name.startsWith('assets/')
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=0, must-revalidate',
    ETag: item.etag,
    Vary: 'Accept-Encoding',
    ...(encoding ? { 'Content-Encoding': encoding } : {}),
    'Content-Length': body.length,
  };
  if (request.headers['if-none-match'] === item.etag) {
    delete headers['Content-Length'];
    response.writeHead(304, headers);
    response.end();
  } else {
    response.writeHead(200, headers);
    response.end(body);
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`,
  url = origin + base;
const browser = await chromium.launch({
  channel: process.env.MFL_BROWSER_CHANNEL ?? 'msedge',
  headless: true,
});
const scenarios = [];
const observe = async (context) => {
  const page = await context.newPage(),
    cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const requests = new Map(),
    errors = [];
  let collected = [];
  page.on('pageerror', (e) => errors.push(e.message));
  cdp.on('Network.responseReceived', (e) =>
    requests.set(e.requestId, {
      url: e.response.url.replace(origin, ''),
      status: e.response.status,
      mime: e.response.mimeType,
      cache: Boolean(e.response.fromDiskCache || e.response.fromPrefetchCache),
      headers: e.response.headers,
    }),
  );
  cdp.on('Network.requestServedFromCache', (e) => {
    const value = requests.get(e.requestId);
    if (value) value.cache = true;
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = requests.get(e.requestId);
    if (r && r.url.startsWith(base)) {
      collected.push({ ...r, transferredBytes: e.encodedDataLength });
      requests.delete(e.requestId);
    }
  });
  const sample = async (name, work) => {
    collected = [];
    await page.evaluate(() => performance.clearResourceTimings());
    const start = Date.now();
    await work();
    await page.waitForLoadState('networkidle');
    const resources = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((r) => ({
        name: r.name,
        transferSize: r.transferSize,
        encodedBodySize: r.encodedBodySize,
        decodedBodySize: r.decodedBodySize,
      })),
    );
    scenarios.push({
      name,
      elapsedMs: Date.now() - start,
      requests: collected,
      transferredBytes: collected.reduce((s, r) => s + r.transferredBytes, 0),
      resources,
      errors: [...errors],
    });
    console.log(name, scenarios.at(-1).transferredBytes);
  };
  return { page, sample };
};
try {
  const oldContext = await browser.newContext(),
    old = await observe(oldContext);
  await old.sample('baseline-cold', async () => {
    await old.page.goto(url);
    await old.page.getByRole('button', { name: 'Nowa kariera', exact: true }).waitFor();
  });
  servedRoot = current;
  await old.sample('return-after-deployment', async () => {
    await old.page.reload();
    await old.page.getByRole('button', { name: 'Nowa kariera', exact: true }).waitFor();
  });
  await oldContext.close();
  const context = await browser.newContext(),
    app = await observe(context),
    page = app.page;
  await app.sample('cold-start', async () => {
    await page.goto(url);
    await page.getByRole('button', { name: 'Nowa kariera', exact: true }).waitFor();
  });
  await app.sample('warm-start', async () => {
    await page.reload();
    await page.getByRole('button', { name: 'Nowa kariera', exact: true }).waitFor();
  });
  await app.sample('first-career', async () => {
    await page.getByRole('button', { name: 'Nowa kariera', exact: true }).click();
    await page.getByLabel('Imię', { exact: true }).fill('Jan');
    await page.getByLabel('Nazwisko', { exact: true }).fill('Transfer');
    await page.getByRole('button', { name: 'Dalej >', exact: true }).click();
    await page.getByRole('button', { name: 'Dalej >', exact: true }).click();
    await page.getByRole('button', { name: 'Rozpocznij karierę', exact: true }).click();
    await page.locator('.career-view').waitFor();
  });
  await app.sample('resume-career', async () => {
    await page.reload();
    await page.getByRole('button', { name: 'Kontynuuj', exact: true }).click();
    await page.locator('.career-view').waitFor();
  });
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
  await app.sample('first-playable-match', enter);
  await page.getByRole('button', { name: 'Powrót do menu', exact: true }).click();
  await page.locator('.pitch-canvas-host canvas').waitFor({ state: 'detached' });
  await app.sample('career-return-after-match', async () => {
    await page.getByRole('button', { name: 'Kontynuuj', exact: true }).click();
    await page.locator('.career-view').waitFor({ state: 'visible' });
  });
  const detachedOnCareerReturn = (await page.locator('.pitch-canvas-host canvas').count()) === 0;
  await app.sample('second-match-same-document', enter);
  await app.sample('match-reload', async () => {
    await page.reload();
    await page.getByRole('button', { name: 'Rozpocznij mecz', exact: true }).waitFor();
  });
  const raw = readFileSync('../pr164-browser-save.json', 'utf8');
  const storage = await page.evaluate(async (raw) => {
    const open = () =>
      new Promise((done, fail) => {
        const r = indexedDB.open('pr164-benchmark', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('saves');
        r.onsuccess = () => done(r.result);
        r.onerror = () => fail(r.error);
      });
    const db = await open(),
      start = performance.now();
    await new Promise((done, fail) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(raw, 'primary');
      tx.oncomplete = done;
      tx.onabort = () => fail(tx.error);
    });
    const writeMs = performance.now() - start,
      readStart = performance.now();
    const result = await new Promise((done, fail) => {
      const tx = db.transaction('saves', 'readonly'),
        r = tx.objectStore('saves').get('primary');
      r.onsuccess = () => done(r.result);
      r.onerror = () => fail(r.error);
    });
    const readMs = performance.now() - readStart;
    await new Promise((done) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put('incomplete', 'primary');
      tx.onabort = done;
      tx.abort();
    });
    const retained = await new Promise((done) => {
      const r = db.transaction('saves', 'readonly').objectStore('saves').get('primary');
      r.onsuccess = () => done(r.result);
    });
    db.close();
    return {
      bytes: new TextEncoder().encode(raw).byteLength,
      writeMs,
      readMs,
      roundTrip: result === raw,
      abortedWritePreserved: retained === raw,
    };
  }, raw);
  const migrationContext = await browser.newContext(),
    migration = await observe(migrationContext);
  await migration.page.goto(url);
  await migration.page.evaluate((raw) => localStorage.setItem('mfl.careerSave.v3', raw), raw);
  await migration.sample('legacy-migration-resume', async () => {
    await migration.page.reload();
    await migration.page.getByRole('button', { name: 'Kontynuuj', exact: true }).click();
    await migration.page.locator('.career-view').waitFor({ state: 'visible' });
  });
  const legacyRemoved = await migration.page.evaluate(
    () => localStorage.getItem('mfl.careerSave.v3') === null,
  );
  await migrationContext.close();
  const deniedContext = await browser.newContext();
  await deniedContext.addInitScript(() => {
    Object.defineProperty(globalThis, 'indexedDB', { value: undefined });
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new globalThis.DOMException('Denied', 'SecurityError');
      },
    });
  });
  const denied = await observe(deniedContext);
  await denied.sample('storage-unavailable-creator', async () => {
    await denied.page.goto(url);
    await denied.page.getByRole('button', { name: 'Nowa kariera', exact: true }).click();
    await denied.page.getByLabel('Imię', { exact: true }).fill('Jan');
    await denied.page.getByLabel('Nazwisko', { exact: true }).fill('BrakZapisu');
    await denied.page.getByRole('button', { name: 'Dalej >', exact: true }).click();
    await denied.page.getByRole('button', { name: 'Dalej >', exact: true }).click();
    await denied.page.getByRole('button', { name: 'Rozpocznij karierę', exact: true }).click();
    await denied.page
      .getByRole('alert')
      .filter({ hasText: 'Przeglądarka nie pozwoliła zapisać kariery.' })
      .waitFor();
  });
  const deniedStorageKeptCreator = (await denied.page.locator('.career-view').count()) === 0;
  await deniedContext.close();
  await context.close();
  if (
    scenarios.some((s) => s.errors.length) ||
    !storage.roundTrip ||
    !storage.abortedWritePreserved ||
    !legacyRemoved ||
    !detachedOnCareerReturn ||
    !deniedStorageKeptCreator
  )
    throw new Error('Browser lifecycle/storage assertion failed.');
  writeFileSync(
    'docs/performance/PR164-browser.json',
    JSON.stringify(
      {
        browser: await browser.version(),
        server:
          'loopback HTTP, precompressed br quality11/gzip9; immutable hash assets, revalidated HTML/world; no service worker; bytes include HTTP response headers from CDP loadingFinished',
        artifact,
        scenarios,
        storage: { ...storage, legacyRemoved, deniedStorageKeptCreator },
        lifecycle: { detachedOnCareerReturn },
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
  server.close();
}
