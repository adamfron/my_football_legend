import { mkdirSync, writeFileSync } from 'node:fs';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import { createTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import { runFitnessMicroLab } from '../src/core/matchSimulation/fitnessMicroLab';
import { createMatchFitness } from '../src/core/matchSimulation/matchFitness';
import { rollContextualInjury } from '../src/core/matchSimulation/matchInjuries';

const world = createCanonicalWorldDatabase();
const state = createTacticalMatch(
  createSingleMatchSession(world, {
    homeClubId: 'pro_9',
    awayClubId: 'pro_1',
    seed: 'pr160-physical-fitness',
    control: { mode: 'spectator' },
  }),
);
const player = state.players.find(
  (candidate) => candidate.team === 'home' && candidate.slot.position !== 'goalkeeper',
)!;
const lab = runFitnessMicroLab(player);
const tired = { ...player, fitness: { ...createMatchFitness(55), burstReadiness: 0.08 } };
const highWork = lab.rows.find((row) => row.scenario === 'repeated_sprints' && row.stamina === 60)!;
const injuryProbes = [
  {
    name: 'exhausted_without_physical_exposure',
    athlete: tired,
    mechanism: 'movement' as const,
    exposure: 0,
    force: 0,
  },
  {
    name: 'integrated_900s_repeated_sprint_exposure',
    athlete: player,
    mechanism: 'movement' as const,
    exposure: highWork.fitness.movementRiskExposure,
    force: 0,
  },
  {
    name: 'single_forceful_contact_fresh',
    athlete: player,
    mechanism: 'tackle' as const,
    exposure: (7 - 0.8) * 0.00045,
    force: 7,
  },
  {
    name: 'single_forceful_contact_depleted',
    athlete: tired,
    mechanism: 'tackle' as const,
    exposure: (7 - 0.8) * 0.00045 * (1 + (1 - 0.08 / 0.55) * 0.5 + 0.45 * 0.35),
    force: 7,
  },
].map((probe) => {
  const outcomes = { discomfort: 0, playable: 0, unable: 0, absence: 0 };
  for (let repetition = 0; repetition < 4096; repetition++) {
    const injury = rollContextualInjury(probe.athlete, {
      seed: `pr160-injury-probe:${repetition}`,
      at: 900,
      mechanism: probe.mechanism,
      exposure: probe.exposure,
      force: probe.force,
    });
    if (injury) outcomes[injury.status]++;
  }
  return {
    name: probe.name,
    repetitions: 4096,
    exposure: probe.exposure,
    outcomes,
    injuries: Object.values(outcomes).reduce((sum, count) => sum + count, 0),
  };
});
const report = {
  seed: state.seed,
  fixture: {
    home: 'pro_9',
    away: 'pro_1',
    footballerId: player.id,
    attributes: player.profile.attributes,
  },
  protocol:
    'Paired completed locomotion, 0.025s fixed step, 900s workload windows; injury probes sample the stated exposure and are not match-frequency estimates.',
  ...lab,
  injuryProbes,
};
mkdirSync('docs/performance', { recursive: true });
writeFileSync(
  'docs/performance/PR160-fitness-injuries.json',
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      rows: lab.rows.length,
      injuryProbes,
      representativeRows: lab.rows
        .filter((row) => row.stamina === 60)
        .map((row) => ({
          scenario: row.scenario,
          capacity: row.fitness.longTermCapacity,
          readiness: row.fitness.burstReadiness,
          exertion: row.fitness.exertionSpent,
          capacityRecovered: row.fitness.capacityRecovered,
          burstRecovered: row.fitness.burstRecovered,
          speed: row.attainableSpeed,
          acceleration: row.acceleration,
          firstSprintMetres: row.firstEightSecondSprintDistance,
          repeatSprintMetres: row.finalEightSecondSprintDistance,
        })),
    },
    null,
    2,
  ),
);
