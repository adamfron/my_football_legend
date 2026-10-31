import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { hash } from './pr199Evidence.mjs';
const root = 'docs/performance/pr207';
const read = (mode) =>
  JSON.parse(gunzipSync(readFileSync(`${root}/${mode}-development-v1.json.gz`)));
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const stats = (values) => {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b),
    n = xs.length;
  if (!n)
    return {
      n: 0,
      mean: null,
      sd: null,
      p95Absolute: null,
      maxAbsolute: null,
      excessKurtosis: null,
    };
  const m = mean(xs),
    variance = mean(xs.map((x) => (x - m) ** 2));
  const abs = xs.map(Math.abs).sort((a, b) => a - b);
  return {
    n,
    mean: m,
    sd: Math.sqrt(variance),
    p95Absolute: abs[Math.min(n - 1, Math.floor(n * 0.95))],
    maxAbsolute: Math.max(...abs),
    excessKurtosis: variance ? mean(xs.map((x) => (x - m) ** 4)) / variance ** 2 - 3 : null,
  };
};
const ellipse = (pairs) => {
  const xs = pairs.filter((p) => p.every(Number.isFinite)),
    n = xs.length;
  if (n < 3) return { n, diagnosticOnly: true, covariance: null };
  const m = [mean(xs.map((p) => p[0])), mean(xs.map((p) => p[1]))];
  const a = mean(xs.map((p) => (p[0] - m[0]) ** 2)),
    b = mean(xs.map((p) => (p[0] - m[0]) * (p[1] - m[1]))),
    c = mean(xs.map((p) => (p[1] - m[1]) ** 2));
  const d = Math.sqrt((a - c) ** 2 + 4 * b ** 2),
    determinant = a * c - b * b;
  const distances =
    determinant > 1e-15
      ? xs.map(
          (p) =>
            (c * (p[0] - m[0]) ** 2 -
              2 * b * (p[0] - m[0]) * (p[1] - m[1]) +
              a * (p[1] - m[1]) ** 2) /
            determinant,
        )
      : [];
  return {
    n,
    mean: m,
    covariance: [
      [a, b],
      [b, c],
    ],
    correlation: a * c > 0 ? b / Math.sqrt(a * c) : null,
    semiaxes: [Math.sqrt(Math.max(0, (a + c + d) / 2)), Math.sqrt(Math.max(0, (a + c - d) / 2))],
    angleRadians: Math.atan2(2 * b, a - c) / 2,
    empiricalCoverageUnit: distances.length ? mean(distances.map((x) => Number(x <= 1))) : null,
    empiricalCoverageSquared5991: distances.length
      ? mean(distances.map((x) => Number(x <= 5.991)))
      : null,
    diagnosticOnly: true,
    confidenceClaim: false,
  };
};
const lab = read('lab'),
  live = read('live'),
  explore = read('explore');
const groups = new Map();
for (const row of lab.result.rows)
  for (const arm of row.arms) {
    const c = row.config;
    const key = [
      c.family,
      c.metres,
      c.primary,
      c.technique,
      c.intent,
      c.context,
      c.delivery,
      arm.model,
    ].join('/');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...arm, nominal: row.nominal });
  }
const summaries = [...groups].map(([key, rows]) => {
  const accepted = rows.filter((r) => r.released),
    contacts = accepted.filter((r) => r.contact);
  const vector = (r) => r.launch.velocity;
  const speed = (v) => Math.hypot(v.x, v.y, v.z ?? 0);
  const elev = (v) => Math.atan2(v.z ?? 0, Math.hypot(v.x, v.y));
  return {
    key,
    attempts: rows.length,
    accepted: accepted.length,
    finiteContacts: contacts.length,
    planeMissing: accepted.filter((r) => !r.flight.plane).length,
    stopCensored: accepted.filter((r) => r.flight.stopCensored).length,
    departureDirection: stats(accepted.map((r) => Math.atan2(vector(r).y, vector(r).x))),
    initialSpeed: stats(accepted.map((r) => speed(vector(r)))),
    elevation: stats(accepted.map((r) => elev(vector(r)))),
    speedError: stats(contacts.map((r) => speed(vector(r)) - speed(r.contact.nominalVelocity))),
    elevationError: stats(contacts.map((r) => elev(vector(r)) - elev(r.contact.nominalVelocity))),
    spin: Object.fromEntries(
      ['x', 'y', 'z'].map((axis) => [axis, stats(accepted.map((r) => r.launch.spin?.[axis] ?? 0))]),
    ),
    apex: stats(accepted.map((r) => r.flight.apex)),
    landingTime: stats(accepted.map((r) => r.flight.landing?.at)),
    arrivalTime: stats(accepted.map((r) => r.flight.plane?.at)),
    arrivalSpeed: stats(accepted.map((r) => r.flight.plane?.speed)),
    lateralError: stats(
      accepted.map((r) => (r.flight.plane?.y === undefined ? null : r.flight.plane.y - r.target.y)),
    ),
    finalStopLongitudinalError: stats(accepted.map((r) => r.flight.longitudinalError)),
    planeEllipse: ellipse(
      accepted
        .filter((r) => r.flight.plane)
        .map((r) => [
          r.flight.plane.y - r.target.y,
          r.flight.plane.z - (key.startsWith('shot') ? 0.8 * 2.44 : 0.11),
        ]),
    ),
    stopEllipse: ellipse(
      accepted
        .filter((r) => r.nominal)
        .map((r) => [r.flight.stop.y - r.nominal.stop.y, r.flight.stop.x - r.nominal.stop.x]),
    ),
    speedElevationCorrelation: ellipse(
      contacts.map((r) => [
        speed(vector(r)) - speed(r.contact.nominalVelocity),
        elev(vector(r)) - elev(r.contact.nominalVelocity),
      ]),
    ),
    frame: Object.fromEntries(
      ['goal_plane', 'left_post', 'right_post', 'crossbar', 'out'].map((k) => [
        k,
        accepted.filter((r) => r.flight.frame?.kind === k).length,
      ]),
    ),
    underGrassAimError: accepted.filter((r) => r.flight.plane && r.flight.plane.z < 0.11).length,
  };
});
const liveGroups = new Map();
for (const r of live.result.rows)
  for (const arm of r.arms) {
    const key = [r.config.family, r.config.context, arm.model].join('/');
    if (!liveGroups.has(key)) liveGroups.set(key, []);
    liveGroups.get(key).push(arm);
  }
const continuations = [...liveGroups].map(([key, rows]) => ({
  key,
  attempts: rows.length,
  released: rows.filter((r) => r.released).length,
  touch: rows.filter((r) => r.continuation?.outcome.directReceiverTouch).length,
  control: rows.filter((r) => r.continuation?.outcome.receiverControl).length,
  possessionOneSecond: rows.filter((r) => r.continuation?.outcome.teamPossessionAtOneSecond).length,
  usefulNextAction: rows.filter((r) => r.continuation?.usefulNextAction).length,
  censored: rows.filter((r) => r.continuation?.outcome.censored).length,
  defensiveContact: rows.filter(
    (r) =>
      r.continuation?.outcome.defensiveContactAt !== null &&
      r.continuation?.outcome.defensiveContactAt !== undefined,
  ).length,
  shotOutcomes: Object.fromEntries(
    ['goal', 'save', 'block', 'post', 'crossbar', 'miss'].map((k) => [
      k,
      rows.filter((r) => r.continuation?.outcome.originalShotOutcome === k).length,
    ]),
  ),
}));
const examples = [];
const choose = (id, predicate) => {
  const row = lab.result.rows.find((r) => r.arms[1].contact && predicate(r.arms[1], r));
  if (row)
    examples.push({
      id,
      seed: row.config.seed,
      config: row.config,
      contact: row.arms[1].contact,
      flight: row.arms[1].flight,
      nominal: row.nominal,
    });
};
choose(
  'incidental-lift',
  (a, r) => r.config.family === 'pass' && r.config.metres === 10 && a.flight.apex > 0.115,
);
choose(
  'driven-too-high',
  (a, r) => r.config.family === 'shot' && r.config.intent === 'driven' && a.flight.plane?.z > 2.55,
);
choose(
  'long-underhit',
  (a, r) =>
    r.config.family === 'pass' &&
    r.config.metres >= 35 &&
    a.flight.stop.x < a.target.x &&
    Math.abs(a.flight.stop.y - a.target.y) < 1.5,
);
choose('unwanted-sidespin', (a) => Math.abs(a.launch.spin?.z ?? 0) > 10);
choose(
  'clean-close-to-nominal',
  (a, r) =>
    r.config.family === 'pass' &&
    r.nominal &&
    Math.hypot(a.flight.stop.x - r.nominal.stop.x, a.flight.stop.y - r.nominal.stop.y) < 0.25,
);
const overcross = explore.result.rows.find(
  (r) =>
    r.kind === 'cross' &&
    r.realisedFlight.plane &&
    r.realisedFlight.landing?.x > r.actual.intendedTarget.x + 1,
);
if (overcross)
  examples.push({ id: 'overhit-cross', scope: 'solver exploration only', ...overcross });
const summary = {
  schema: 'pr207-summary-v1',
  source: lab.result.source,
  inputResults: { lab: hash(lab.result), live: hash(live.result), explore: hash(explore.result) },
  independentSeedsPerStratum: lab.result.n,
  labKicks: lab.result.rows.length * 2,
  liveKicks: live.result.rows.length * 2,
  exploratoryKicks: explore.result.rows.length,
  diagnostics: summaries,
  continuations,
  examples,
  costs: { lab: lab.costs, live: live.costs, explore: explore.costs },
  integration: {
    maintainedCandidate: 'PR201',
    defaultPolicy: 'B',
    promotion: 'RETAIN_EXPERIMENTAL',
    wholeEngine: 'NOT_READY_FOR_PROMOTION',
    confirmation: 'sealed',
    fullMatches: 'gated by local continuation/regression evidence; see report',
  },
};
const output = `${root}/summary.json`;
if (process.argv.includes('--check'))
  assert.equal(hash(JSON.parse(readFileSync(output, 'utf8'))), hash(summary));
else writeFileSync(output, JSON.stringify(summary, null, 2) + '\n');
console.log(
  JSON.stringify({
    labKicks: summary.labKicks,
    liveKicks: summary.liveKicks,
    exploratoryKicks: summary.exploratoryKicks,
    examples: examples.map((r) => r.id),
    continuations,
  }),
);
