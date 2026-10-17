/* global document, getComputedStyle */
import assert from 'node:assert/strict';
import process from 'node:process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { serveProduction } from './pr170BrowserSupport.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
// Uses the real production renderer harness prepared by benchmarkPr170Render.mjs.
await build({
  configFile: false,
  root: resolve('../pr170-render-harness'),
  base: '/my_football_legend/',
  publicDir: false,
  logLevel: 'error',
  plugins: [react()],
  resolve: {
    alias: {
      'mfl-renderer': resolve('src/app/match/tacticalRenderer/TacticalPitchRenderer.ts'),
      'mfl-viewer': resolve('src/app/match/TacticalMatchSandbox.tsx'),
      'mfl-css': resolve('src/app/App.css'),
      react: resolve('node_modules/react'),
      'react-dom': resolve('node_modules/react-dom'),
      three: resolve('node_modules/three'),
      zod: resolve('node_modules/zod'),
    },
  },
  build: { outDir: resolve('../pr170-render-harness/after'), emptyOutDir: true },
});
const server = await serveProduction('../pr170-render-harness/after');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { browser: browser.version(), scenarios: [] };
try {
  for (const moment of ['half_time', 'goal', 'full_time']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${server.url}?mode=ui&moment=${moment}`);
    await page.locator('.tactical-sandbox').waitFor();
    if (moment === 'goal') await page.getByRole('button', { name: 'Pauza', exact: true }).click();
    await page.screenshot({ path: `docs/images/pr170/match-${moment}-after.png` });
    await context.close();
  }
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [820, 1180],
    [390, 844],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${server.url}?mode=ui&moment=half_time`);
    const skip = page.getByRole('button', { name: 'Pomiń oprawę', exact: true });
    await skip.waitFor();
    await skip.focus();
    await page.keyboard.press('Tab');
    await skip.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.match-occasion').count(), 0);
    for (const name of ['Akcja', 'Taktyczna z góry', 'Resetuj widok']) {
      const control = page.getByRole('button', { name, exact: true });
      await control.scrollIntoViewIfNeeded();
      const box = await control.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width + 1, `${name} overflows ${width}`);
      await control.focus();
      await page.keyboard.press('Enter');
    }
    await page.getByLabel('Szczegółowość stadionu').selectOption('minimal');
    await page.getByLabel('Szczegółowość stadionu').selectOption('standard');
    await page.getByLabel('Cieniowanie zawodników').selectOption('faceted');
    await page.getByLabel('Cieniowanie zawodników').selectOption('classic');
    const camera = page.getByRole('button', { name: 'Przegląd', exact: true });
    await camera.focus();
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(
      () => getComputedStyle(document.activeElement).outlineStyle,
    );
    assert.notEqual(outline, 'none');
    assert(
      (await page.evaluate(() => document.documentElement.scrollWidth)) <= width + 1,
      `Match overflows ${width}`,
    );
    await page.screenshot({
      path: `docs/images/pr170/match-responsive-${width}.png`,
      fullPage: true,
    });
    assert.equal(errors.length, 0, errors.join('\n'));
    report.scenarios.push({
      width,
      height,
      keyboardSkip: true,
      cameraAndDetail: true,
      focusOutline: outline,
      errors,
    });
    await context.close();
  }
  report.complete = true;
} catch (error) {
  report.failure = error.message;
  throw error;
} finally {
  writeFileSync('docs/performance/PR170-match-ui.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  await server.close();
}
