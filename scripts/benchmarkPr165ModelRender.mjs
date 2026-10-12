import process from 'node:process';
import { URL } from 'node:url';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { build } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MFL_PLAYWRIGHT_MODULE ?? 'playwright');
const current = resolve('.');
const baseline = resolve(process.argv[2] ?? '../baseline-source');
const work = mkdtempSync(join(tmpdir(), 'mfl-pr165-render-'));
const source = String.raw`
import * as THREE from 'three';
import { PlayerModel, PlayerModelResources } from 'mfl-model';
import { DEFAULT_KITS } from 'mfl-model-types';
import { deriveAppearance } from 'mfl-visual';
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(1200,980);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
document.body.append(renderer.domElement);
const resources=new PlayerModelResources();
const scene=new THREE.Scene();scene.background=new THREE.Color('#d5dedc');
scene.add(new THREE.HemisphereLight('#fff4dd','#44535c',2.5));
const light=new THREE.DirectionalLight('#ffffff',3);light.position.set(-2.5,4,4);scene.add(light);
const start=performance.now();
for(let index=0;index<22;index++) {
 const id='pr165-render-bench-'+index,heightCm=165+index*1.5,weightKg=60+index;
 const appearance=__BEFORE__?undefined:deriveAppearance({id,dateOfBirth:(1990+index)+'-04-14',heightCm,weightKg},'2026-07-01');
 const model=new PlayerModel({id,team:'home',x:0,y:0,heightCm,weightKg,appearance},DEFAULT_KITS.home,resources);
 model.root.position.set(((index%11)-5)*0.95,0,Math.floor(index/11)*-2);scene.add(model.root);
}
const generationMs=performance.now()-start;
const camera=new THREE.OrthographicCamera(-6.3,6.3,3,-3,0.1,30);camera.position.set(0,3.4,9);camera.lookAt(0,0.8,-0.8);
const samples=[];let firstAt=0;
const paint=at=>{
 firstAt||=at;const before=performance.now();renderer.render(scene,camera);samples.push(performance.now()-before);
 if(samples.length<60){requestAnimationFrame(paint);return;}
 const sorted=samples.slice(5).sort((a,b)=>a-b);
 const geometries=[resources.box,resources.sphere,resources.cylinder,resources.picker];
 const geometryBufferBytes=geometries.reduce((n,g)=>n+Object.values(g.attributes).reduce((m,a)=>m+a.array.byteLength,0)+(g.index?.array.byteLength??0),0);
 const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
 const result={version:__BEFORE__?'main':'PR165',models:22,frames:60,generationMs,firstSubmitMs:samples[0],medianSubmitMs:sorted[Math.floor(sorted.length/2)],p95SubmitMs:sorted[Math.floor(sorted.length*.95)],observedRafHz:59000/(at-firstAt),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs?.length,geometryBufferBytes,materials:resources.materials.size,viewport:{width:1200,height:980,pixelRatio:1},gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null};
 document.body.dataset.measurement=JSON.stringify(result);
};requestAnimationFrame(paint);`;
writeFileSync(join(work, 'harness.js'), source);
writeFileSync(
  join(work, 'index.html'),
  '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><script type="module" src="/harness.js"></script></body></html>',
);
for (const [label, root] of [
  ['baseline', baseline],
  ['current', current],
]) {
  await build({
    configFile: false,
    root: work,
    publicDir: false,
    logLevel: 'error',
    define: { __BEFORE__: JSON.stringify(label === 'baseline') },
    resolve: {
      alias: {
        three: resolve(current, 'node_modules/three/build/three.module.js'),
        zod: resolve(current, 'node_modules/zod/index.js'),
        'mfl-model': resolve(root, 'src/app/match/tacticalRenderer/playerModel.ts'),
        'mfl-model-types': resolve(root, 'src/app/match/tacticalRenderer/model.ts'),
        'mfl-visual': resolve(current, 'src/core/visualIdentity.ts'),
      },
    },
    build: { outDir: join(work, label), emptyOutDir: true },
  });
}
let servedRoot = join(work, 'baseline');
const server = createServer((req, res) => {
  const path = resolve(
    servedRoot,
    new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html',
  );
  if (!path.startsWith(servedRoot + '/') && !path.startsWith(servedRoot + '\\')) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const raw = readFileSync(path);
    res.writeHead(200, {
      'Content-Type': extname(path) === '.js' ? 'text/javascript' : 'text/html',
    });
    res.end(raw);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({
  channel: process.env.MFL_BROWSER_CHANNEL ?? 'msedge',
  headless: true,
});
const rows = [];
try {
  for (const label of ['baseline', 'current']) {
    servedRoot = join(work, label);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('body[data-measurement]').waitFor({ timeout: 60000 });
    rows.push(await page.locator('body').evaluate((e) => JSON.parse(e.dataset.measurement)));
    await context.close();
  }
  const hash = (content) => createHash('sha256').update(content).digest('hex');
  writeFileSync(
    'docs/performance/PR165-model-render.json',
    JSON.stringify(
      {
        browser: await browser.version(),
        basis:
          'Same standalone harness, 22 IDs/body dimensions, camera, lighting, viewport; actual game PlayerModel from clean main 4f08a37 versus PR165. CPU submit timings and RAF cadence, not GPU time or full-match FPS.',
        harnessHash: hash(source),
        playerModelHashes: {
          baseline: hash(
            readFileSync(resolve(baseline, 'src/app/match/tacticalRenderer/playerModel.ts')),
          ),
          current: hash(
            readFileSync(resolve(current, 'src/app/match/tacticalRenderer/playerModel.ts')),
          ),
        },
        rows,
      },
      null,
      2,
    ) + '\n',
  );
  process.stdout.write(JSON.stringify(rows) + '\n');
} finally {
  await browser.close();
  server.close();
}
