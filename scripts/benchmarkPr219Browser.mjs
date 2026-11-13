import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const vite = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  await vite.listen();
  const url = `http://127.0.0.1:${vite.httpServer.address().port}/my_football_legend/`;
  browser = await chromium.launch({
    channel: process.env.MFL_BROWSER_CHANNEL ?? 'msedge',
    headless: true,
  });
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
  ]) {
    for (const controlled of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height }, acceptDownloads: true });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const button = (name) => page.getByRole('button', { name, exact: true });
      const hud = page.getByLabel('Wykonywana fizyka meczu');
      const skip = async () => {
        const leadIn = button('Pomiń oprawę');
        if (await leadIn.isVisible()) await leadIn.click();
      };
      const exportState = async () => {
        const panel = page.locator('#match-lab-export');
        if ((await panel.getAttribute('open')) === null)
          await panel.locator('summary').first().click();
        const downloaded = page.waitForEvent('download');
        await button('Eksportuj benchmark sesji').click();
        return JSON.parse(readFileSync(await (await downloaded).path(), 'utf8'));
      };
      await page.goto(url);
      await button('Pojedynczy mecz [DEV]').click();
      const selector = page.getByLabel('Fizyka meczu', { exact: true });
      assert.equal(await selector.inputValue(), 'ordinary');
      await selector.selectOption('holistic-stance-foot-dev-v2');
      await page.getByLabel('SEED', { exact: true }).fill('pr219-browser');
      if (controlled) await page.getByLabel('Steruj piłkarzem').check();
      await button('Rozpocznij mecz').click();
      await hud.getByText('holistic-stance-foot-dev-v2', { exact: true }).waitFor();
      await skip();
      await page.locator('canvas').first().waitFor({ state: 'visible' });
      await button('Odtwórz').click();
      await button('16×').click();
      await page.waitForTimeout(1200);
      await button('Pauza').click();
      const live = await exportState();
      const checkpoint = live.canonicalPhysicalCheckpoint;
      assert.ok(checkpoint.time > 0);
      assert.equal(checkpoint.experimentalArticulatedBody, 'stance-foot-dev-v2');
      assert.ok(checkpoint.players.every((player) => player.articulatedStance));
      assert.equal(checkpoint.safetyHalt, undefined);
      const replayAvailable = await button('Powtórka').isEnabled();
      assert.ok(replayAvailable);
      await button('Powtórka').click();
      await page.getByRole('region', { name: 'Sterowanie powtórką' }).waitFor();
      await button('Restart — ten sam seed').click();
      await hud.getByText('holistic-stance-foot-dev-v2', { exact: true }).waitFor();
      await skip();
      const reset = (await exportState()).canonicalPhysicalCheckpoint;
      assert.equal(reset.time, 0);
      assert.equal(reset.seed, checkpoint.seed);
      assert.equal(reset.decisionPolicy, checkpoint.decisionPolicy);
      assert.equal(reset.experimentalArticulatedBody, checkpoint.experimentalArticulatedBody);
      assert.deepEqual(errors, []);
      process.stdout.write(
        JSON.stringify({
          width,
          height,
          controlled,
          liveTime: checkpoint.time,
          replayAvailable,
          browser: browser.version(),
        }) + '\n',
      );
      await page.close();
    }
  }
} finally {
  await browser?.close();
  await vite.close();
}
