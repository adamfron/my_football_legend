/* global indexedDB */
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { brotliCompressSync } from 'node:zlib';

export const serveProduction = async (directory) => {
  const root = resolve(directory),
    base = '/my_football_legend/',
    cache = new Map();
  const server = createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const path = resolve(root, pathname.slice(base.length) || 'index.html');
      if (!path.startsWith(root + '/') && !path.startsWith(root + '\\')) throw Error('path');
      let bytes = cache.get(path);
      if (!bytes) {
        bytes = brotliCompressSync(readFileSync(path));
        cache.set(path, bytes);
      }
      res.writeHead(200, {
        'Content-Type':
          {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.svg': 'image/svg+xml',
          }[extname(path)] ?? 'application/octet-stream',
        'Content-Encoding': 'br',
        'Content-Length': bytes.length,
        'Cache-Control': extname(path) === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return {
    url: `http://127.0.0.1:${server.address().port}${base}`,
    close: () => new Promise((done) => server.close(done)),
  };
};
export const readBrowserSave = (page) =>
  page.evaluate(async () => {
    const request = indexedDB.open('my-football-legend', 1);
    const db = await new Promise((done, fail) => {
      request.onsuccess = () => done(request.result);
      request.onerror = () => fail(request.error);
    });
    const get = db.transaction('careerSaves', 'readonly').objectStore('careerSaves').get('primary');
    const value = await new Promise((done, fail) => {
      get.onsuccess = () => done(get.result);
      get.onerror = () => fail(get.error);
    });
    db.close();
    return value;
  });
export const loadBrowserSave = async (
  browser,
  url,
  file,
  viewport = { width: 1440, height: 1000 },
) => {
  const context = await browser.newContext({ viewport }),
    page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
  return { context, page, errors };
};
