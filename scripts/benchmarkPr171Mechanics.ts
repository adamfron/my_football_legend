import { writeFileSync } from 'node:fs';
import { shotProbeFixture } from './pr171Probes';
import { resolveBallRebound } from '../src/core/matchSimulation/ballFlight';
import { deriveRestartGeometry } from '../src/core/matchSimulation/restartGeometry';
const rebounds = (['home', 'away'] as const).flatMap((team) =>
  [false, true].flatMap((endsSwitched) =>
    (['defender', 'goalkeeper'] as const).map((kind) => {
      const direction = (team === 'home' ? 1 : -1) * (endsSwitched ? -1 : 1);
      const incoming = { x: direction * 25, y: 2, z: 1 };
      const currentCaller = resolveBallRebound(kind, incoming, team);
      const orientationPreserved = resolveBallRebound(kind, incoming, { team, endsSwitched });
      return {
        team,
        endsSwitched,
        kind,
        incoming,
        currentCaller,
        orientationPreserved,
        towardAttackedGoal: currentCaller.velocity.x * direction > 0,
        caveat:
          'Current shot-contact caller supplies shooter.team, dropping endsSwitched. Orientation-preserved call is a frozen input counterfactual, not a production fix.',
      };
    }),
  ),
);
const { state } = shotProbeFixture('unmarked_striker');
const emergency = state.players.find((p) => p.team === 'away' && p.slot.position === 'striker')!;
emergency.goalkeeperRole = true;
let error: string | null = null;
try {
  deriveRestartGeometry(state, 'free_kick_far', 'home', { x: 60, y: 34 });
} catch (cause) {
  error = cause instanceof Error ? cause.message : String(cause);
}
delete emergency.goalkeeperRole;
const control = deriveRestartGeometry(state, 'free_kick_far', 'home', { x: 60, y: 34 });
writeFileSync(
  'docs/performance/PR171-mechanical-counterfactuals.json',
  JSON.stringify(
    {
      version: 1,
      rebounds,
      keeperHandover: {
        emergencyId: emergency.id,
        simultaneousKeeperRolesError: error,
        singleKeeperControlTargetCount: Object.keys(control.targets).length,
        changedFactor:
          'temporary goalkeeperRole on an outfield player while a named keeper is present',
        relation:
          'Equivalent transient state created between physical keeper entry and subsequent ensureMatchGoalkeepers; actual strong/weak one-tick replay is recorded separately.',
      },
    },
    null,
    2,
  ),
);
