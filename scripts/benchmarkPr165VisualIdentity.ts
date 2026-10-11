import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createCareerState, generateStartingPlayerProfile } from '../src/core/playerCreator';
import { serializeCareerSave } from '../src/core/persistence';
import {
  createVisualIdentity,
  deriveAppearance,
  updateCareerAppearance,
} from '../src/core/visualIdentity';
import { createSingleMatchSession } from '../src/core/singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatch,
} from '../src/core/matchSimulation/matchSimulation';
import { PresentationFrameProjector } from '../src/app/match/tacticalRenderer/frameProjection';

const world = createCanonicalWorldDatabase();
const career = createCareerState(
  generateStartingPlayerProfile(
    {
      firstName: 'Jan',
      lastName: 'Pomiar',
      nationality: 'PL',
      age: 16,
      dominantFoot: 'right',
      position: 'striker',
      heightCm: 182,
      weightKg: 76,
      seed: 'pr165-visual-performance',
    },
    'pr165-visual-performance',
    0,
  ),
  'pr165-visual-performance',
  world,
);
const edited = updateCareerAppearance(career, {
  hairstyle: 'long',
  hairColor: 0.1,
  accessories: 'headband',
  presentation: 'feminine',
});
const custom = {
  ...edited,
  player: {
    ...edited.player,
    visualIdentity: createVisualIdentity(
      edited.player.id,
      { jawWidth: 0.9, eyeSpacing: 0.2 },
      edited.player.visualIdentity!.cosmetics,
    ),
  },
};
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const savedAt = '2026-10-11T00:00:00.000Z';
const save = (state: typeof career) => bytes(serializeCareerSave(state, savedAt));
const session = createSingleMatchSession(world, {
  homeClubId: world.clubs[0]!.id,
  awayClubId: world.clubs[1]!.id,
  seed: 'pr165-visual-performance',
  control: { mode: 'spectator' },
});
const profiles = [...session.home.players, ...session.away.players].map((player) => player.profile);
const start = performance.now();
for (let repeat = 0; repeat < 200; repeat++)
  for (const profile of profiles) deriveAppearance(profile, '2026-07-01');
const generationMs = performance.now() - start;
const state = createTacticalMatch(session);
const projector = new PresentationFrameProjector(session.presentation);
const coldStart = performance.now();
projector.frame(state);
const coldProjectionMs = performance.now() - coldStart;
const warmStart = performance.now();
for (let repeat = 0; repeat < 200; repeat++) projector.frame(state);
const warmProjectionMs = (performance.now() - warmStart) / 200;
const id = profiles[6]!.id;
const editedWorld = {
  ...world,
  footballers: {
    ...world.footballers,
    [id]: {
      ...world.footballers[id]!,
      profile: {
        ...world.footballers[id]!.profile,
        visualIdentity: createVisualIdentity(
          id,
          { headProportion: 0.99 },
          { hairstyle: 'long', presentation: 'feminine' },
        ),
      },
    },
  },
};
const editedSession = createSingleMatchSession(editedWorld, session.setup);
const headless = (matchSession: typeof session) => {
  let match = createTacticalMatch(matchSession);
  const began = performance.now();
  for (let tick = 0; tick < 1200; tick++) match = stepTacticalMatch(match, FIXED_MATCH_DT);
  return { durationMs: performance.now() - began, state: JSON.stringify(match) };
};
headless(session);
const baseline = [],
  cosmetic = [];
let equal = true;
for (let sample = 0; sample < 3; sample++) {
  const before = headless(session),
    after = headless(editedSession);
  baseline.push(before.durationMs);
  cosmetic.push(after.durationMs);
  equal &&= before.state === after.state;
}
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const receipt = {
  seed: session.setup.seed,
  environment:
    'Local Node CPU samples; browser/GPU cost is measured separately. Warmed 3-sample medians, not a throughput guarantee.',
  saveBytes: {
    baseline: save(career),
    editedCosmetics: save(edited),
    customFace: save(custom),
    cosmeticIncrease: save(edited) - save(career),
    customFaceIncrease: save(custom) - save(career),
  },
  npcVisualIdentityFields: Object.values(world.footballers).filter(
    (player) => player.profile.visualIdentity,
  ).length,
  appearanceGeneration: {
    players: 22,
    repeats: 200,
    totalMs: generationMs,
    perPlayerMs: generationMs / 4400,
  },
  projection: {
    cold22PlayersMs: coldProjectionMs,
    cached22PlayersMs: warmProjectionMs,
    cacheLimit: 64,
  },
  headless: {
    ticks: 1200,
    canonicalDt: FIXED_MATCH_DT,
    baselineMs: baseline,
    cosmeticMs: cosmetic,
    baselineMedianMs: median(baseline),
    cosmeticMedianMs: median(cosmetic),
    byteIdenticalCanonicalStates: equal,
  },
};
writeFileSync(
  'docs/performance/PR165-visual-identity.json',
  JSON.stringify(receipt, null, 2) + '\n',
);
console.info(JSON.stringify(receipt, null, 2));
