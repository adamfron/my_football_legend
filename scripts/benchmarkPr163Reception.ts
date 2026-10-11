import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createOffensiveScenario } from '../src/core/matchSimulation/pr163Fixtures';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';

const root = resolve(
  process.argv.find((a) => a.startsWith('--engine-root='))?.split('=')[1] ?? '.',
);
const output = resolve(
  process.argv.find((a) => a.startsWith('--output='))?.split('=')[1] ?? '../reception.json',
);
const load = <T>(path: string): Promise<T> => import(pathToFileURL(resolve(root, path)).href);
const engine = await load<typeof import('../src/core/matchSimulation/matchSimulation')>(
  'src/core/matchSimulation/matchSimulation.ts',
);
const actions = await load<typeof import('../src/core/matchSimulation/matchActions')>(
  'src/core/matchSimulation/matchActions.ts',
);
const arrivals = await load<typeof import('../src/core/matchSimulation/playerArrival')>(
  'src/core/matchSimulation/playerArrival.ts',
);
const contacts = await load<typeof import('../src/core/matchSimulation/ballContactGeometry')>(
  'src/core/matchSimulation/ballContactGeometry.ts',
);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rows = [];
for (const scenario of ['baran_equivalent', 'kowalski_equivalent'] as const)
  for (const seed of ['pr163-case-1', 'pr163-case-2', 'pr163-case-3']) {
    const fixture = createOffensiveScenario(scenario, seed, engine.createTacticalMatch);
    let state = actions.resolveMatchAction(fixture.state, fixture.action);
    const initialHash = hash(fixture.state),
      windows: unknown[] = [];
    const snapshot = (stage: string, s: TacticalMatchState) => {
      const actor = s.players.find((p) => p.id === fixture.wingerId)!;
      const defenders = s.players.filter((p) => p.team !== actor.team);
      const nearest = defenders.sort(
        (a, b) =>
          Math.hypot(a.position.x - actor.position.x, a.position.y - actor.position.y) -
          Math.hypot(b.position.x - actor.position.x, b.position.y - actor.position.y),
      )[0]!;
      const ahead = { x: actor.position.x + (actor.team === 'home' ? 5 : -5), y: actor.position.y };
      const ranking = actions
        .rankAvailableActionsForAI(s, actor.id)
        .slice(0, 6)
        .map((r) => ({
          ...r,
          contact:
            r.action.type === 'carry' && s.ball.ownerId === actor.id
              ? contacts.estimateCarrierContactWindow(s, actor, r.action.target)
              : undefined,
        }));
      windows.push({
        stage,
        time: s.time,
        ball: s.ball,
        receiver: {
          position: actor.position,
          velocity: actor.velocity,
          facingAngle: actor.facingAngle,
          target: actor.target,
          fitness: actor.fitness,
        },
        preparation: s.receptionPreparation,
        onBall: s.onBallPreparation,
        nearestDefender: {
          id: nearest.id,
          position: nearest.position,
          velocity: nearest.velocity,
          distance: Math.hypot(
            nearest.position.x - actor.position.x,
            nearest.position.y - actor.position.y,
          ),
        },
        forwardFiveMetreETA: {
          carrier: arrivals.estimatePlayerArrivalTime(s, actor, ahead).estimatedTime,
          defender: Math.min(
            ...defenders.map(
              (d) => arrivals.estimatePlayerArrivalTime(s, d, ahead, 'intercept').estimatedTime,
            ),
          ),
        },
        ranking,
        latestAction: s.latestAction,
        physicalOutcome: s.lastReceptionOutcome,
        passResult: s.lastResolvedPass,
      });
    };
    snapshot('released_before_awareness', state);
    let aware = false,
      received = false,
      decision = false,
      firstContactAt = 0;
    for (let tick = 0; tick < 240; tick++) {
      const previous = state;
      state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
      if (
        !aware &&
        state.receptionPreparation &&
        state.time >= state.receptionPreparation.awarenessAt
      ) {
        aware = true;
        snapshot('first_awareness', state);
      }
      if (!received && state.ball.ownerId === fixture.wingerId) {
        received = true;
        firstContactAt = state.time;
        snapshot('first_real_control', state);
      }
      if (
        received &&
        !decision &&
        previous.ball.ownerId === fixture.wingerId &&
        state.decisionIndex !== previous.decisionIndex
      ) {
        decision = true;
        snapshot('before_followup_choice', previous);
        snapshot('after_followup_choice', state);
      }
      if (received && state.time >= firstContactAt + 2) {
        snapshot('two_seconds_after_contact', state);
        break;
      }
    }
    rows.push({ scenario, seed, initialHash, windows });
  }
writeFileSync(
  output,
  JSON.stringify({ fixedDt: engine.FIXED_MATCH_DT, root, rows }, null, 2) + '\n',
);
console.log(`saved ${rows.length} bounded reception windows`);
