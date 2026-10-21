import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
const [label, sessionPath, rolesPath] = process.argv.slice(2);
if (!label || !sessionPath || !rolesPath)
  throw Error('Usage: collectPr180Browser.mjs <label> <session.json> <roles.json>');
const raw = readFileSync(sessionPath),
  session = JSON.parse(raw),
  rolesRaw = readFileSync(rolesPath),
  roles = JSON.parse(rolesRaw);
const dir = 'docs/performance/pr180-evidence';
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/browser-${label}-session.json.gz`, gzipSync(raw));
writeFileSync(`${dir}/browser-${label}-roles.json.gz`, gzipSync(rolesRaw));
const flow = session.matchFlowTelemetry;
const result = {
  label,
  policy: roles.metadata.policy,
  fixtureId: roles.metadata.fixtureId,
  duration: session.duration,
  metadata: session.metadata,
  roleSourceRevision: roles.metadata.sourceRevision,
  sessionSha256: createHash('sha256').update(raw).digest('hex'),
  rolesSha256: createHash('sha256').update(rolesRaw).digest('hex'),
  firstTime: flow
    ? { attempts: flow.firstTimePassAttempts, completed: flow.firstTimePassCompleted }
    : null,
  errors: session.runtimeDiagnostics,
  rendererLifecycle: session.rendererLifecycle,
  observerErrors: roles.diagnostics.observerErrors,
};
writeFileSync(`${dir}/browser-${label}-receipt.json`, JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify({
    label,
    policy: result.policy,
    fixtureId: result.fixtureId,
    duration: result.duration,
    metadata: result.metadata,
    firstTime: result.firstTime,
    errors: result.errors.length,
  }),
);
