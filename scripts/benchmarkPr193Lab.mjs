import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import {
  runTransitionLab,
  transitionLabConfigSchema,
} from '../src/core/matchSimulation/transitionLaboratory.ts';
import { hash, manifest, writeReceipt, retainSourceVersion } from './pr193Evidence.mjs';
const root = 'docs/performance/pr193';
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const protocolVersion = args.get('protocol') ?? 'v2';
if (!['v1', 'v2'].includes(protocolVersion)) throw Error('Unknown protocol');
const protocolPath = root + '/laboratory-protocol-' + protocolVersion + '.json';
const pairs = [
    [40, 40],
    [80, 80],
    [40, 80],
    [80, 40],
  ],
  conditions = [];
const add = (scenario, attacker, defender, mirror, extra = {}) => {
  const id = `${scenario}:${attacker}-${defender}:${mirror ? 'mirrored' : 'original'}:${extra.variant ?? 'autonomous'}:${extra.delay ?? 0}:${extra.lane ?? 'central'}`;
  conditions.push(
    transitionLabConfigSchema.parse({
      id,
      scenario,
      attacker,
      defender,
      mirror,
      seed: `pr193:paired:${scenario}:${protocolVersion === 'v1' ? (extra.variant ?? 'autonomous') : 'autonomous'}:${extra.lane ?? 'central'}`,
      seconds: scenario === 'counterattack' ? 16 : scenario === 'clearance' ? 9 : 6,
      ...extra,
    }),
  );
};
for (const [a, d] of pairs)
  for (const mirror of [false, true]) {
    for (const scenario of ['counterattack', 'contact_race', 'crowded', 'deflection'])
      add(scenario, a, d, mirror, { lane: scenario === 'crowded' ? 'left' : 'central' });
    for (const lane of ['central', 'left', 'right']) add('wing', a, d, mirror, { lane });
    for (const variant of ['control', 'into_play', 'touchline', 'late'])
      add('clearance', a, d, mirror, { variant, lane: 'left' });
    for (const delay of [0.2, 0.5, 1]) add('contact_race', a, d, mirror, { delay });
  }
for (const mirror of [false, true]) {
  for (const variant of [
    'none',
    'passive',
    'organised',
    'fatigued',
    'chasing',
    'protecting',
    'press_escape',
  ])
    add('counterattack', 80, 80, mirror, { variant });
  for (const delay of [0.2, 0.5, 1]) add('counterattack', 80, 80, mirror, { delay });
}
const protocol = {
  schema: 'mfl-pr193-laboratory-protocol-' + protocolVersion,
  classification:
    'prescribed initial geometry and causal objectives; canonical continuation; development only',
  stepSeconds: 0.025,
  conditions,
  inputHash: hash(conditions),
  independentConfirmation: 'sealed',
  scoring: 'No goal, pass, shooting or out-of-play quotas; raw physical failure retained.',
  pairing:
    'Same seed across skill pairs and mirrors; mirror changes y, y velocity, facing and dominant foot. Observation jitter remains seeded rather than being forced symmetric.',
};
if (args.has('freeze')) {
  writeReceipt(protocolPath, protocol);
  console.log('Frozen', conditions.length, 'conditions');
} else {
  const frozen = JSON.parse(readFileSync(protocolPath));
  if (hash(frozen) !== hash(protocol)) throw Error('Protocol drift');
  const version = args.get('version') ?? 'v1';
  if (!/^[a-z0-9-]+$/.test(version)) throw Error('Invalid version');
  const output = `${root}/laboratory-${version}.json`,
    check = args.has('check');
  if (!check && existsSync(output)) throw Error('Refusing overwrite');
  const rows = [];
  const source = manifest(),
    sourceArchive = retainSourceVersion(source);
  for (const c of frozen.conditions) {
    const r = runTransitionLab(c);
    const row = {
      config: c,
      initialHash: hash(r.initial),
      finalHash: hash(r.final),
      actions: r.actions,
      contacts: r.contacts,
      intentContacts: r.intentContacts,
      contactFacts: r.contactFacts,
      collisions: r.collisions,
      races: r.races,
      candidates: r.candidates,
      clearanceDecision: r.clearanceDecision,
      forecasts: r.forecasts,
      decisions: r.traces.map((t) => ({
        at: t.at,
        actorId: t.actorId,
        stage: t.stage,
        decision: t.decision,
        action: t.action,
        contactFailure: t.contactFailure,
        released: t.released,
      })),
      samples: r.samples,
      score: r.final.score,
      ownerId: r.final.ball.ownerId ?? null,
      lastTouch: r.final.ball.lastTouchPlayerId ?? null,
      award: r.final.lastRestartAward ?? null,
      crossing: r.final.lastBoundaryCrossing ?? null,
      challenge: r.final.lastChallenge ?? null,
      shots: r.final.statistics?.players.reduce((n, p) => n + p.shots, 0) ?? 0,
      intentionalShotIds: r.final.statistics?.observedShotIds ?? [],
      incidentalGoal: r.final.lastIncidentalGoal ?? null,
      classification: r.classification,
      limitation: r.limitation,
      observerNeutral: null,
    };
    if (
      c.attacker === 80 &&
      c.defender === 80 &&
      !c.mirror &&
      c.variant === 'autonomous' &&
      c.delay === 0
    ) {
      const observed = runTransitionLab(c, (s) => {
        s.ball.x = -999;
        s.players.length = 0;
        s.runs.length = 0;
      });
      row.observerNeutral = hash(observed.final) === row.finalHash;
      if (!row.observerNeutral) throw Error('Observer changed canonical result ' + c.id);
    }
    rows.push(row);
    console.log(c.id, row.shots, row.award?.scenario ?? 'in_play', row.challenge?.outcome ?? '');
  }
  if (hash(manifest()) !== hash(source)) throw Error('Source changed while laboratory was running');
  const result = {
    schema: 'mfl-pr193-laboratory-v1',
    protocol: protocolPath,
    protocolHash: hash(protocol),
    source,
    sourceHash: hash(source),
    sourceArchive,
    rows,
  };
  if (check) {
    const pointer = JSON.parse(readFileSync(output)),
      bytes = readFileSync(pointer.archive.path);
    if (hash(bytes) !== pointer.archive.sha256) throw Error('Archive bytes drift');
    const recorded = JSON.parse(gunzipSync(bytes));
    if (hash(rows) !== hash(recorded.rows)) throw Error('Canonical laboratory replay drift');
    console.log('PR193 canonical laboratory replay PASS');
  } else {
    const archive = output + '.gz',
      bytes = gzipSync(JSON.stringify(result));
    mkdirSync(root, { recursive: true });
    writeFileSync(archive, bytes, { flag: 'wx' });
    writeReceipt(output, {
      schema: 'mfl-pr193-laboratory-pointer-v1',
      protocolHash: hash(protocol),
      sourceHash: result.sourceHash,
      archive: { path: archive, sha256: hash(bytes), originalSha256: hash(JSON.stringify(result)) },
      count: rows.length,
      summary: rows.map((r) => ({
        id: r.config.id,
        initialHash: r.initialHash,
        finalHash: r.finalHash,
        shots: r.shots,
        award: r.award?.scenario ?? null,
        team: r.award?.team ?? null,
        contactCount: r.contacts.filter((c) => c.available).length,
        observerNeutral: r.observerNeutral,
      })),
    });
  }
}
