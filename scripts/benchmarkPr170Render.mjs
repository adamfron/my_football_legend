/* global document, performance */
import assert from 'node:assert/strict';
import process from 'node:process';
import { createRequire } from 'node:module';
import { URLSearchParams } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { serveProduction } from './pr170BrowserSupport.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const current = resolve('.'),
  baseline = resolve('../baseline-pr169'),
  harness = resolve('../pr170-render-harness');
mkdirSync(harness, { recursive: true });
const fixture = JSON.parse(readFileSync('../pr170-render-fixture.json', 'utf8'));
writeFileSync(join(harness, 'fixture.json'), JSON.stringify(fixture));
writeFileSync(
  join(harness, 'index.html'),
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;font:12px Tahoma,Arial,sans-serif}#host{position:absolute;inset:0}canvas{display:block}</style></head><body><div id="host"></div><script type="module" src="/harness.jsx"></script></body></html>',
);
writeFileSync(
  join(harness, 'harness.jsx'),
  String.raw`
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TacticalPitchRenderer } from 'mfl-renderer';
import { RunningLabGuard } from 'mfl-viewer';
import 'mfl-css';
import data from './fixture.json';
const query=new URLSearchParams(location.search), archetype=query.get('stadium')??'compact', detail=query.get('detail')??'standard', shading=query.get('shading')??'classic', mode=query.get('mode')??'renderer', moment=query.get('moment')??'gameplay';
const host=document.querySelector('#host'), state=data.snapshots[moment]??data.snapshots.gameplay;
if(mode==='ui'){
  createRoot(host).render(<RunningLabGuard session={data.session} initialState={state} onSetup={()=>{}} onRestart={()=>{}} onRandomize={()=>{}} />);
  document.body.dataset.ready='ui';
}else{
  const frame=data.frames[moment]??data.frames.gameplay;
  const view=new TacticalPitchRenderer(host,frame,()=>{},data.kits,()=>{},{homeClubId:data.clubs[archetype],stadiumDetail:detail,playerShading:shading});
  view.setCameraPreferences({preset:query.get('camera')??'overview',zoom:query.get('camera')==='action'?0.75:0.1});
  const samples=[],rafs=[],gpu=[],gl=view.getCanvas().getContext('webgl2'),ext=gl?.getExtension('EXT_disjoint_timer_query_webgl2');
  let pending,last,frames=0;
  const draw=at=>{
    if(pending&&gl.getQueryParameter(pending,gl.QUERY_RESULT_AVAILABLE)){
      if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(pending,gl.QUERY_RESULT)/1e6);
      gl.deleteQuery(pending);pending=undefined;
    }
    let query;
    if(ext&&!pending&&frames>5&&frames%10===0){query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);}
    const start=performance.now();view.render(frame);const elapsed=performance.now()-start;
    if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);pending=query;}
    if(frames>10){samples.push(elapsed);if(last)rafs.push(at-last);}
    last=at;frames++;
    if(frames<100){requestAnimationFrame(draw);return;}
    const exported=view.exportPresentationScene(),geometries=new Set(),materials=new Set();let bufferBytes=0,instances=0,stadiumMeshes=0;
    exported.scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)(Array.isArray(object.material)?object.material:[object.material]).forEach(m=>materials.add(m));if(object.isInstancedMesh){instances+=object.count;bufferBytes+=object.instanceMatrix.array.byteLength+(object.instanceColor?.array.byteLength??0);} });
    exported.scene.getObjectByName('cosmetic-stadium').traverse(object=>{if(object.isMesh)stadiumMeshes++;});
    geometries.forEach(g=>{bufferBytes+=Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength??0);});
    const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.floor((sorted.length-1)*p)]:null;};
    const debug=gl?.getExtension('WEBGL_debug_renderer_info');
    const result={archetype,detail,shading,moment,frame:frame.timestampMs,metrics:view.getPresentationMetrics(),medianCpuMs:percentile(samples,.5),p95CpuMs:percentile(samples,.95),medianRafMs:percentile(rafs,.5),gpuMedianMs:percentile(gpu,.5),gpuSamples:gpu.length,gpuTimerAvailable:!!ext,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,geometries:geometries.size,materials:materials.size,geometryAndInstanceBufferBytes:bufferBytes,instances,stadiumMeshes,heapUsedBytes:performance.memory?.usedJSHeapSize??null};
    document.body.dataset.measurement=JSON.stringify(result);
  };requestAnimationFrame(draw);
}
`,
);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = {
  browser: browser.version(),
  fixtureHash: fixture.canonicalHash,
  methodology:
    'Three alternating before/after pairs using the production-bundled real renderer and recorded canonical frame; 100 RAF renders with 11 warmup frames. Same club, kit, frame, camera, 1440x900, DPR1. CPU submission and RAF are separate from GPU timer; JS heap before/after explicit GC is a Chromium estimate. Scenery identity varies cosmetically over the identical football fixture.',
  scenarios: [],
  ui: [],
};
let active;
try {
  for (const [phase, root, repetition] of [
    ['before', baseline, 1],
    ['after', current, 1],
    ['after', current, 2],
    ['before', baseline, 2],
    ['before', baseline, 3],
    ['after', current, 3],
  ]) {
    await build({
      configFile: false,
      root: harness,
      base: '/my_football_legend/',
      publicDir: false,
      logLevel: 'error',
      plugins: [react()],
      resolve: {
        alias: {
          'mfl-renderer': resolve(root, 'src/app/match/tacticalRenderer/TacticalPitchRenderer.ts'),
          'mfl-viewer': resolve(root, 'src/app/match/TacticalMatchSandbox.tsx'),
          'mfl-css': resolve(root, 'src/app/App.css'),
          react: resolve(current, 'node_modules/react'),
          'react-dom': resolve(current, 'node_modules/react-dom'),
          three: resolve(current, 'node_modules/three'),
          zod: resolve(current, 'node_modules/zod'),
        },
      },
      build: { outDir: join(harness, phase), emptyOutDir: true },
    });
    const server = await serveProduction(join(harness, phase));
    try {
      const settings = ['community', 'compact', 'bowl'].map((stadium) => ({
        stadium,
        detail: 'standard',
        shading: 'classic',
      }));
      settings.push({ stadium: 'bowl', detail: 'minimal', shading: 'classic' });
      if (phase === 'after')
        settings.push({ stadium: 'compact', detail: 'standard', shading: 'faceted' });
      for (const config of settings) {
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            deviceScaleFactor: 1,
          }),
          page = await context.newPage(),
          errors = [];
        active = page;
        page.on('pageerror', (error) => errors.push(error.message));
        const query = new URLSearchParams(config).toString();
        await page.goto(`${server.url}?${query}`);
        await page.waitForFunction(() => !!document.body.dataset.measurement, { timeout: 60000 });
        const measured = JSON.parse(await page.locator('body').getAttribute('data-measurement'));
        await page.screenshot({
          path: `docs/images/pr170/stadium-${config.stadium}-${config.detail}-${config.shading}-${phase}.png`,
        });
        assert.equal(errors.length, 0, errors.join('\n'));
        const cdp = await context.newCDPSession(page);
        await cdp.send('HeapProfiler.collectGarbage');
        const heapUsedAfterGC = await page.evaluate(
          () => performance.memory?.usedJSHeapSize ?? null,
        );
        report.scenarios.push({ phase, repetition, ...measured, heapUsedAfterGC, errors });
        await context.close();
      }
      for (const moment of Object.keys(fixture.snapshots).filter(
        (key) => repetition === 1 && ['half_time', 'goal', 'full_time'].includes(key),
      )) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
          page = await context.newPage(),
          errors = [];
        active = page;
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`${server.url}?mode=ui&moment=${moment}`);
        await page.locator('.tactical-sandbox').waitFor();
        if (moment === 'goal')
          await page.getByRole('button', { name: 'Pauza', exact: true }).click();
        await page.screenshot({ path: `docs/images/pr170/match-${moment}-${phase}.png` });
        assert.equal(errors.length, 0, errors.join('\n'));
        report.ui.push({ phase, moment, errors });
        await context.close();
      }
    } finally {
      await server.close();
    }
  }
} catch (error) {
  report.failure = error.message;
  if (active && !active.isClosed())
    await active.screenshot({ path: '../pr170-render-failure.png' });
  throw error;
} finally {
  writeFileSync('docs/performance/PR170-render.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
