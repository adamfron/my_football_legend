import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import {
  runPerceptionLab,
  perceptionLabConfigSchema,
} from '../src/core/matchSimulation/perceptionLaboratory.ts';
import { hash, manifest, writeReceipt, retainPr194Source } from './pr194Evidence.mjs';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const check = args.has('check'),
  version = args.get('version') ?? 'v1',
  root = 'docs/performance/pr194';
if (!/^[a-z0-9-]+$/.test(version)) throw Error('Invalid version');
const protocolPath = root + '/laboratory-protocol-v1.json';
if (!existsSync(protocolPath)) {
  const conditions = [];
  for (const condition of perceptionLabConfigSchema.shape.condition.unwrap().options)
    for (const mirror of [false, true])
      conditions.push({
        id: `${condition}-${mirror ? 'mirror' : 'normal'}`,
        condition,
        mirror,
        seed: 'pr194-paired-development',
        seconds: 8,
      });
  for (const attribute of perceptionLabConfigSchema.shape.attribute.unwrap().options)
    for (const level of [20, 40, 60, 80, 100])
      conditions.push({
        id: `attribute-${attribute}-${level}`,
        condition: 'prior_scan',
        attribute,
        level,
        seed: 'pr194-attribute-development',
        seconds: 8,
      });
  writeReceipt(protocolPath, {
    schema: 'mfl-pr194-lab-protocol-v1',
    classification: 'paired controlled development, not independent validation',
    conditions,
  });
}
const protocol = JSON.parse(readFileSync(protocolPath)),
  source = manifest(),
  sourceHash = hash(source),
  sourceArchive = check ? null : retainPr194Source(source),
  rows = [];
const target = `${root}/laboratory-${version}.json`,
  reference = check ? JSON.parse(gunzipSync(readFileSync(target + '.gz'))) : null;
for (const config of protocol.conditions) {
  const cpu = process.cpuUsage(),
    wall = performance.now(),
    r = runPerceptionLab(config);
  const row = {
    config: r.config,
    initialHash: hash(r.initial),
    finalHash: hash(r.final),
    deliveryAt: r.deliveryAt,
    receiverContactAt: r.receiverContactAt,
    receiverActionAt: r.receiverActionAt,
    scans: r.final.activePerceptionRuntime?.memory[r.receiverId]?.scans ?? 0,
    usefulPriorObservation: r.history?.visible.some((p) => p.id === r.supportId) ?? false,
    preparedBeforeContact: r.samples.some(
      (s) => s.plan && r.receiverContactAt !== null && s.at < r.receiverContactAt,
    ),
    preparedSamples: r.samples.filter((s) => s.plan).length,
    used: r.samples.map((s) => s.plan?.usedId).filter(Boolean),
    invalidated: r.samples.flatMap((s) => s.plan?.invalidated ?? []),
    actions: r.actions,
    contacts: r.contacts,
    traces: r.traces,
    samples: r.samples,
    cpu: process.cpuUsage(cpu),
    wallMs: performance.now() - wall,
    observerNeutral: null,
  };
  if (
    ['prior_scan-normal', 'no_scan-normal', 'urgent-normal', 'attribute-leadership-20'].includes(
      config.id,
    )
  ) {
    const observed = runPerceptionLab(config, (s) => {
      s.players.length = 0;
      s.scene.visible.length = 0;
      s.ball.x = -999;
    });
    row.observerNeutral = hash(observed.final) === row.finalHash;
    if (!row.observerNeutral) throw Error('Observer changed ' + config.id);
  }
  if (check) {
    const old = reference.rows.find((p) => p.config.id === config.id);
    if (
      !old ||
      old.finalHash !== row.finalHash ||
      old.initialHash !== row.initialHash ||
      hash(old.contacts) !== hash(row.contacts)
    )
      throw Error('Lab replay drift ' + config.id);
  }
  rows.push(row);
  console.log(config.id, 'contact', r.receiverContactAt, 'plans', row.preparedSamples);
}
if (hash(manifest()) !== sourceHash) throw Error('Source changed during lab');
if (!check) {
  const result = {
    schema: 'mfl-pr194-laboratory-v1',
    protocolHash: hash(protocol),
    source,
    sourceHash,
    sourceArchive,
    rows,
  };
  const raw = JSON.stringify(result),
    bytes = gzipSync(raw);
  mkdirSync(root, { recursive: true });
  writeFileSync(target + '.gz', bytes, { flag: 'wx' });
  writeReceipt(target, {
    schema: 'mfl-pr194-lab-pointer-v1',
    sourceHash,
    protocolHash: hash(protocol),
    archive: { path: target + '.gz', sha256: hash(bytes), originalSha256: hash(raw) },
    count: rows.length,
    summary: rows.map(
      ({
        config,
        initialHash,
        finalHash,
        deliveryAt,
        receiverContactAt,
        receiverActionAt,
        scans,
        usefulPriorObservation,
        preparedBeforeContact,
        preparedSamples,
        used,
        invalidated,
        cpu,
        wallMs,
        observerNeutral,
      }) => ({
        config,
        initialHash,
        finalHash,
        deliveryAt,
        receiverContactAt,
        receiverActionAt,
        scans,
        usefulPriorObservation,
        preparedBeforeContact,
        preparedSamples,
        used,
        invalidated,
        cpu,
        wallMs,
        observerNeutral,
      }),
    ),
  });
}
console.log('PR194 laboratory', check ? 'replay PASS' : 'recorded', rows.length);
