import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import console from 'node:console';
import process from 'node:process';
import { createReformFixture } from './pr177Fixtures.ts';
import { pr172Hash as sha, pr172SourceHash } from './pr172Evidence.ts';
import { awardNaturalRestart } from '../src/core/matchSimulation/restartScenarios.ts';
import {
  resolveMatchAction,
  rankAvailableActionsForAI,
  enumerateRestartActions,
} from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { evaluateTransitionOpportunity } from '../src/core/matchSimulation/attackingTransition.ts';
import { attacksRight } from '../src/core/matchSimulation/matchSpace.ts';

const rows = [];
const prescribed = process.argv.includes('--prescribed');
const receiptPath = `docs/performance/PR178-physical-transitions${prescribed ? '-prescribed' : ''}.json`;
const preceding = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) : null;
for (const policy of ['legacy-pr176', 'state-value-v1'])
  for (const scenario of [
    'corner',
    'blocked-shot',
    'weak-v-strong',
    'press-escape',
    'rejected-counter',
  ])
    for (
      let seedIndex = 0;
      seedIndex < (scenario === 'corner' || scenario === 'blocked-shot' ? 4 : 1);
      seedIndex++
    ) {
      const f = createReformFixture(
        scenario === 'rejected-counter'
          ? prescribed
            ? 'conservative-possession'
            : 'failed-counter'
          : scenario === 'corner'
            ? 'corner-counter'
            : scenario === 'blocked-shot'
              ? 'blocked-shot-counter'
              : scenario,
      );
      let state = f.state;
      state.seed = `pr178-physical-transition:${scenario}:${seedIndex}`;
      state.decisionPolicy = policy;
      if (scenario === 'rejected-counter' && prescribed) state.time = 30;
      const recoveringTeam = f.actor.team,
        attackingTeam = f.opponents[0].team;
      delete state.lastPossessionChange;
      state.possessionTeam = attackingTeam;
      if (scenario === 'corner') {
        state = awardNaturalRestart(state, 'corner', {
          restartTeam: attackingTeam,
          cause: 'boundary',
          incidentId: `${state.seed}:corner`,
          incidentPoint: { x: 0, y: 0 },
        });
        if (prescribed) {
          const deliveries = enumerateRestartActions(state).filter(
            (action) => action.type === 'cross' && action.intent === 'floated',
          );
          const delivery = deliveries[seedIndex % deliveries.length];
          if (!delivery) throw new Error('No legal floated corner');
          state = resolveMatchAction(state, delivery, 'dev_ai_selected');
        }
      } else if (scenario === 'blocked-shot') {
        const shooter = f.opponents[0],
          blocker = f.actor;
        for (const [i, p] of state.players.entries()) {
          p.position = {
            x: p.team === attackingTeam ? 32 + (i % 3) * 3 : 60 + (i % 4) * 3,
            y: 5 + (i % 9) * 6,
          };
          p.velocity = { x: 0, y: 0 };
          p.target = { ...p.position };
        }
        shooter.position = { x: 20, y: 34 };
        shooter.facingAngle = Math.PI;
        shooter.target = { ...shooter.position };
        blocker.position = { x: 16, y: 34 };
        blocker.target = { ...blocker.position };
        state.ball = { ...shooter.position, ownerId: shooter.id, height: 0.11 };
        state.ballOwnershipStartedAt = state.time - 2;
        state = resolveMatchAction(
          state,
          {
            type: 'shot',
            actorId: shooter.id,
            intent: 'driven',
            contact: 'settled',
            target: { x: 0, y: 34 },
          },
          'dev_ai_selected',
        );
      } else {
        state.ball = {
          x: f.actor.position.x + 0.2,
          y: f.actor.position.y,
          height: 0.11,
          velocity: { x: 0.1, y: 0, z: 0 },
          looseSince: state.time - 1,
          lastTouchPlayerId: f.opponents[0].id,
        };
      }
      const inputHash = sha(state),
        started = state.time,
        contacts = [],
        shots = [],
        recoveries = [],
        actions = [],
        restarts = [],
        samples = [];
      let active;
      for (let tick = 0; tick < 3200; tick++) {
        const previous = state;
        state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
        if (state.lastBallContact?.at !== previous.lastBallContact?.at && state.lastBallContact)
          contacts.push(state.lastBallContact);
        if (
          state.lastAerialContact?.id !== previous.lastAerialContact?.id &&
          state.lastAerialContact
        )
          contacts.push({
            at: state.time,
            outcome: state.lastAerialResult,
            aerial: state.lastAerialContact,
          });
        if (
          state.lastShot?.shotId !== previous.lastShot?.shotId ||
          state.lastShot?.outcome !== previous.lastShot?.outcome
        )
          if (state.lastShot) shots.push(state.lastShot);
        if (state.restart?.phase !== previous.restart?.phase)
          restarts.push({
            at: state.time,
            scenario: state.scenario,
            phase: state.restart?.phase,
            awardId: state.restart?.awardId,
          });
        if (state.decisionIndex !== previous.decisionIndex && state.latestAction)
          actions.push({ at: state.time, action: state.latestAction });
        const owner = state.players.find((p) => p.id === state.ball.ownerId);
        if (owner?.team === recoveringTeam && previous.possessionTeam !== state.possessionTeam) {
          const exposure = evaluateTransitionOpportunity(state, owner);
          const recovery = {
            at: state.time,
            fact: state.lastPossessionChange,
            ball: state.ball,
            exposure,
            ranking: rankAvailableActionsForAI(state, owner.id),
            opponents: state.players
              .filter((p) => p.team !== recoveringTeam)
              .map((p) => ({ id: p.id, position: p.position, velocity: p.velocity })),
            maxControlledProgress: 0,
            defensiveRecoveryAt: null,
          };
          recoveries.push(recovery);
          active = recovery;
        }
        if (active && owner?.team === recoveringTeam) {
          active.maxControlledProgress = Math.max(
            active.maxControlledProgress,
            (state.ball.x - active.ball.x) * (attacksRight(owner) ? 1 : -1),
          );
          if (
            active.defensiveRecoveryAt === null &&
            evaluateTransitionOpportunity(state, owner).cover >= 5
          )
            active.defensiveRecoveryAt = state.time;
        }
        if (tick % 40 === 0)
          samples.push({
            at: state.time,
            ball: state.ball,
            players: state.players.map((p) => ({
              id: p.id,
              position: p.position,
              velocity: p.velocity,
            })),
            loss: state.lastPossessionLoss,
          });
        if (active && state.time - active.at > 12) break;
        if (state.postGoal || ['half_time', 'full_time', 'abandoned'].includes(state.status ?? ''))
          break;
      }
      rows.push({
        scenario,
        policy,
        seedIndex,
        inputHash,
        seconds: state.time - started,
        contacts,
        shots,
        restarts,
        recoveries,
        actions,
        samples,
        finalHash: sha(state),
        finalBall: state.ball,
        interpretation:
          scenario === 'corner'
            ? 'Starts with a canonical legal corner lifecycle; all bodies move normally. A recovery is recorded only after real physical control.'
            : scenario === 'blocked-shot'
              ? 'Starts with a real canonical shot release into a moving defender corridor; a block/recovery is measured, never forced.'
              : 'Prescribed recovery geometry with finite canonical foot acquisition; not a natural-match prevalence estimate.',
      });
    }
const sameSourceReplay = preceding?.sourceHash === pr172SourceHash();
if (
  sameSourceReplay &&
  preceding.rows.some((old, index) => old.finalHash !== rows[index].finalHash)
)
  throw new Error('Aerial observer correction changed final state');
writeFileSync(
  receiptPath,
  JSON.stringify(
    {
      sourceHash: pr172SourceHash(),
      aerialObserverCorrection:
        'Read the canonical aerial contact id; this schema has no at property.',
      wholeFinalStateReplayEqual: sameSourceReplay ? true : null,
      previousSourceHash: preceding?.sourceHash ?? null,
      prescribed,
      method: prescribed
        ? 'Explicitly choose an enumerated legal floated corner before physical preparation; never prescribe the header, recovery or subsequent AI action. The rejected-counter diagnostic uses the genuinely covered own-third geometry.'
        : 'Autonomous corner selection; later recoveries may follow intervening restarts and are not automatically corner counters.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(
    rows.map((r) => ({
      scenario: r.scenario,
      policy: r.policy,
      seed: r.seedIndex,
      recoveries: r.recoveries.length,
      progress: r.recoveries.map((x) => x.maxControlledProgress),
      shots: r.shots.length,
    })),
  ),
);
