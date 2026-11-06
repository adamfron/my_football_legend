/* global document */
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const root = 'docs/performance/pr217/browser';
const production = process.argv.includes('--production');
mkdirSync(root, { recursive: true });
mkdirSync('.benchmark-artifacts/pr217', { recursive: true });
const read = (name) =>
  JSON.parse(gunzipSync(readFileSync(`docs/performance/pr217/${name}.json.gz`)));
const fixture = read('session-input'),
  incident = read('incident-before-handoff'),
  onBall = read('human-on-ball-fixture');
const browser = await chromium.launch({
  channel: process.env.MFL_BROWSER_CHANNEL ?? 'msedge',
  headless: true,
});
const report = {
  schema: 'pr217-browser-v1',
  browser: browser.version(),
  source: JSON.parse(readFileSync('docs/performance/pr217/source.json')).fingerprint,
  componentFixtureInDev: !production,
  scenarios: [],
};
const baseUrl = process.env.MFL_BROWSER_URL ?? 'http://127.0.0.1:5178/my_football_legend/';
try {
  for (const [width, height] of [
    [1366, 768],
    [1920, 1080],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const row = { width, height, errors, checks: [] };
    report.scenarios.push(row);
    await page.goto(baseUrl);
    await page.getByRole('button', { name: 'Pojedynczy mecz [DEV]', exact: true }).click();
    assert.equal(await page.getByLabel('Fizyka meczu', { exact: true }).inputValue(), 'ordinary');
    await page.getByLabel('Fizyka meczu', { exact: true }).selectOption('holistic-physical-dev-v1');
    await page.getByLabel('SEED', { exact: true }).fill('lab-mw3xhr6o');
    await page.getByLabel('Polityka decyzji', { exact: true }).selectOption('state-value-v1');
    row.checks.push('normal-menu-ordinary-default-holistic-policy-seed');
    if (production) {
      await page.getByRole('button', { name: 'Rozpocznij mecz', exact: true }).click();
      const skip = page.getByRole('button', { name: 'Pomiń oprawę', exact: true });
      if (await skip.isVisible()) await skip.click();
      await page.getByRole('button', { name: 'Odtwórz', exact: true }).click();
      await page.getByRole('button', { name: '16×', exact: true }).click();
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Pauza', exact: true }).click();
      assert.equal(
        await page.getByRole('button', { name: 'Odtwórz', exact: true }).isEnabled(),
        true,
      );
      assert.deepEqual(errors, []);
      row.checks.push('production-normal-start-play-pause');
      await page.screenshot({ path: `${root}/production-${width}.png` });
      await context.close();
      continue;
    }
    const mount = async (initialState) => {
      await page.evaluate(
        async ({ session, initialState }) => {
          const base = '/my_football_legend';
          const React = (await import(`${base}/node_modules/.vite/deps/react.js`)).default;
          const { createRoot } = (
            await import(`${base}/node_modules/.vite/deps/react-dom_client.js`)
          ).default;
          const { RunningLabGuard } = await import(
            `${base}/src/app/match/TacticalMatchSandbox.tsx`
          );
          if (globalThis.__pr217Root) globalThis.__pr217Root.unmount();
          document.getElementById('root').style.display = 'none';
          document.getElementById('pr217-fixture')?.remove();
          const host = document.createElement('div');
          host.id = 'pr217-fixture';
          document.body.append(host);
          const root = createRoot(host);
          globalThis.__pr217Root = root;
          root.render(
            React.createElement(RunningLabGuard, {
              session,
              initialState,
              startPaused: true,
              onSetup() {},
              onRestart() {},
              onRandomize() {},
            }),
          );
        },
        { session: fixture.session, initialState },
      );
      await page.getByRole('button', { name: 'Odtwórz', exact: true }).waitFor();
      const skip = page.getByRole('button', { name: 'Pomiń oprawę', exact: true });
      if (await skip.isVisible()) await skip.click();
    };
    const exportState = async (name) => {
      const panel = page.locator('#match-lab-export');
      if ((await panel.getAttribute('open')) === null)
        await panel.locator('summary').first().click();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Eksportuj benchmark sesji', exact: true }).click();
      const file = await download;
      const path = `.benchmark-artifacts/pr217/browser-${name}-${width}.json`;
      await file.saveAs(path);
      const bytes = readFileSync(path);
      writeFileSync(`${root}/${name}-${width}.json.gz`, gzipSync(bytes, { level: 9 }));
      return JSON.parse(bytes);
    };
    await mount(incident.originalTerminal);
    await page.getByRole('button', { name: 'Odtwórz', exact: true }).click();
    const haltButton = page.getByRole('button', {
      name: 'Zatrzymanie bezpieczeństwa',
      exact: true,
    });
    await haltButton.waitFor();
    assert.equal(await haltButton.isDisabled(), true);
    await page.getByRole('button', { name: 'Diagnostyka i eksport', exact: true }).click();
    const halted = await exportState('halt');
    assert.equal(halted.canonicalPhysicalCheckpoint.time, incident.originalTerminal.time);
    assert.equal(halted.canonicalPhysicalCheckpoint.safetyHalt.reason, 'initial_penetration');
    assert.deepEqual(halted.canonicalPhysicalCheckpoint.ball, incident.originalTerminal.ball);
    await haltButton.click({ force: true });
    const repeated = await exportState('halt-repeated');
    assert.deepEqual(repeated.canonicalPhysicalCheckpoint, halted.canonicalPhysicalCheckpoint);
    assert.equal(
      await page.getByRole('alert').filter({ hasText: 'Zatrzymanie bezpieczeństwa' }).count(),
      1,
    );
    await page.screenshot({ path: `${root}/halt-${width}.png`, fullPage: false });
    row.checks.push(
      'physical-incident-auto-halt',
      'resume-disabled-state-preserved',
      'one-alert',
      'diagnostic-export',
    );
    await mount(incident.initial);
    await page.getByRole('button', { name: 'Odtwórz', exact: true }).click();
    await page.getByRole('button', { name: '16×', exact: true }).click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Pauza', exact: true }).click();
    const continued = await exportState('continued');
    assert.ok(continued.duration > 296);
    assert.equal(continued.canonicalPhysicalCheckpoint.safetyHalt, undefined);
    row.checks.push('repaired-contact-continues-with-one-play-click', 'normal-user-pause');
    await page.getByRole('button', { name: 'Odtwórz', exact: true }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Pauza', exact: true }).click();
    const resumed = await exportState('resumed');
    assert.ok(resumed.duration > continued.duration);
    row.checks.push('one-click-resume');
    await page.screenshot({ path: `${root}/continued-${width}.png` });
    await mount(onBall.initial);
    await page.getByRole('button', { name: 'Odtwórz', exact: true }).click();
    const targets = page.getByLabel('Cel decyzji piłkarskiej', { exact: true });
    await targets.waitFor();
    const pass = onBall.opportunity.options.find(
      (o) => o.kind === 'action' && o.action.type === 'pass',
    );
    assert.ok(pass);
    await targets.selectOption(
      JSON.stringify({ kind: 'player', playerId: pass.action.receiverId }),
    );
    const choices = page.getByRole('region', { name: 'Zagrania do wybranego celu', exact: true });
    await choices.getByRole('button').filter({ hasText: /Podaj/ }).first().click();
    const selected = await exportState('human-selected-pass');
    assert.equal(selected.canonicalPhysicalCheckpoint.safetyHalt, undefined);
    const attempt =
      selected.canonicalPhysicalCheckpoint.pendingStrike ??
      selected.canonicalPhysicalCheckpoint.lastStrikeResolution;
    assert.equal(attempt.actorId, fixture.controlledPlayer);
    assert.equal(attempt.selectedAt, onBall.initial.time);
    row.checks.push('ordinary-on-ball-human-menu', 'contextual-human-pass-selection');
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  writeFileSync(
    `${root}/${production ? 'production' : 'report'}.json`,
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
}
console.log(
  'PR217 browser acceptance',
  report.scenarios.map((r) => ({
    viewport: [r.width, r.height],
    checks: r.checks,
    errors: r.errors,
  })),
);
