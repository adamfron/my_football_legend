import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const args = new Map(process.argv.slice(2).map((x) => x.replace(/^--/, '').split('=')));
const root = resolve(args.get('source') ?? '.'),
  seed = args.get('seed') ?? 'pr146-flow-reference:a';
const load = (p) => import(pathToFileURL(resolve(root, p)).href);
const { createCanonicalWorldDatabase } = await load('scripts/createCanonicalWorldDatabase.ts');
const { createSingleMatchSession } = await load('src/core/singleMatch.ts');
const { createTacticalMatch, FIXED_MATCH_DT, stepTacticalMatch } = await load(
  'src/core/matchSimulation/matchSimulation.ts',
);
const {
  createMatchFlowTelemetry,
  observeMatchFlow,
  matchFlowTelemetrySchema,
  assertTelemetryInvariants,
} = await load('src/core/matchSimulation/matchFlowTelemetry.ts');
const world = createCanonicalWorldDatabase();
let state = createTacticalMatch(
  createSingleMatchSession(world, {
    homeClubId: world.clubs[0].id,
    awayClubId: world.clubs[1].id,
    seed,
    decisionPolicy: 'legacy-pr176',
    control: { mode: 'spectator' },
  }),
);
let telemetry = createMatchFlowTelemetry(seed);
const stable = (v) =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]]),
        )
      : x,
  );
const sha = (v) => createHash('sha256').update(stable(v)).digest('hex');
const inputSha256 = sha(state);
for (let tick = 0; tick < 2400; tick++) {
  const old = state;
  state = stepTacticalMatch(state, FIXED_MATCH_DT);
  telemetry = observeMatchFlow(telemetry, old, state);
}
matchFlowTelemetrySchema.parse(telemetry);
assertTelemetryInvariants(telemetry);
const result = {
  seed,
  inputSha256,
  ticks: 2400,
  telemetrySha256: sha(telemetry),
  finalStateSha256: sha(state),
  telemetry,
};
if (args.has('out')) writeFileSync(args.get('out'), JSON.stringify(result) + '\n');
console.log(
  JSON.stringify({ seed, sha256: result.telemetrySha256, state: result.finalStateSha256 }),
);
