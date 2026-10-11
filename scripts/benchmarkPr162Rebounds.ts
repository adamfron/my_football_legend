import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createFormationBenchmarkSession } from '../src/core/matchSimulation/benchmarkFixtures';
import {
  matchActionSchema,
  tacticalMatchStateSchema,
} from '../src/core/matchSimulation/matchState';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const root = resolve(args.get('engine-root') ?? '.');
const load = <T>(path: string): Promise<T> => import(pathToFileURL(resolve(root, path)).href);
const engine = await load<typeof import('../src/core/matchSimulation/matchSimulation')>(
  'src/core/matchSimulation/matchSimulation.ts',
);
const actions = await load<typeof import('../src/core/matchSimulation/matchActions')>(
  'src/core/matchSimulation/matchActions.ts',
);
const preparation = await load<typeof import('../src/core/matchSimulation/onBallPreparation')>(
  'src/core/matchSimulation/onBallPreparation.ts',
);
const shooting = await load<typeof import('../src/core/matchSimulation/shootingOptions')>(
  'src/core/matchSimulation/shootingOptions.ts',
);
const positioning = await load<typeof import('../src/core/matchSimulation/tacticalPositioning')>(
  'src/core/matchSimulation/tacticalPositioning.ts',
);
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const results = [];
for (const seed of ['pr162-rebound-1', 'pr162-rebound-2', 'pr162-rebound-3'])
  for (const distance of [16, 24])
    for (const intent of ['driven', 'placed'] as const) {
      let state = engine.createTacticalMatch(
        createFormationBenchmarkSession({ opponent: '4-4-2', attributes: 70, seed }),
      );
      state.playerAgencyEnabled = false;
      state.time = 20;
      state.timeSincePossessionChanged = 2;
      for (const player of state.players) {
        player.position = { x: player.team === 'home' ? 60 : 76, y: 3 + player.slotIndex * 6 };
        player.target = { ...player.position };
        player.velocity = { x: 0, y: 0 };
        player.facingAngle = player.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
      }
      const forwards = state.players.filter(
        (p) => p.team === 'home' && p.slot.position === 'striker',
      );
      const shooter = forwards[0]!;
      shooter.position = { x: 105 - distance, y: 34 };
      forwards[1]!.position = { x: 96, y: 37 };
      const defenders = state.players.filter(
        (p) => p.team === 'away' && p.slot.position === 'center_back',
      );
      defenders[0]!.position = { x: 98, y: 10 };
      defenders[1]!.position = { x: 98, y: 58 };
      const keeper = state.players.find(
        (p) => p.team === 'away' && p.slot.position === 'goalkeeper',
      )!;
      keeper.position = { x: 103, y: 34 };
      state.players.find((p) => p.team === 'home' && p.slot.position === 'goalkeeper')!.position = {
        x: 5,
        y: 34,
      };
      state.ball = { ...shooter.position, height: 0.11, ownerId: shooter.id };
      state.actionCooldown = 0;
      state.ballOwnershipStartedAt = 18;
      state.onBallPreparation = preparation.deriveOnBallPreparation(
        { ...state, time: 18 },
        shooter,
        'clean_control',
      );
      tacticalMatchStateSchema.parse(state);
      const action = matchActionSchema.parse({
        type: 'shot',
        actorId: shooter.id,
        target: { x: 105, y: 34 },
        intent,
        goalTarget: { horizontal: 0, vertical: 0.3 },
      });
      if (action.type !== 'shot' || !shooting.canExecuteCanonicalShot(state, action))
        throw new Error('Rebound fixture shot is not legally executable');
      const initial = structuredClone(state);
      const initialOffsideLine = positioning.calculateOffsideLine(state, 'home');
      if (forwards[1]!.position.x > Math.max(state.ball.x, initialOffsideLine))
        throw new Error('Rebound attacker is offside at the requested first shot');
      state = actions.resolveMatchAction(state, action, 'autonomous_npc');
      if (!state.ball.shot) throw new Error('Canonical requested shot was not released');
      const firstShotId = state.ball.shot.shotId;
      const contacts = [];
      const decisions = [];
      let contactId = '',
        lastDecision = state.decisionIndex;
      let firstOutcome: unknown = null;
      let sameAttackOpen = true;
      let savedAt: number | undefined;
      const seenShots = new Set([firstShotId]);
      const followUpReleases = [];
      for (let tick = 0; tick < 800; tick++) {
        state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
        if (!firstOutcome && state.lastShot?.shotId === firstShotId) {
          firstOutcome = structuredClone(state.lastShot);
          if (state.lastShot.outcome === 'save') savedAt = state.time;
        }
        for (const shot of [state.ball.shot, state.lastShot]) {
          if (!shot?.shotId || seenShots.has(shot.shotId)) continue;
          seenShots.add(shot.shotId);
          const actor = state.players.find((p) => p.id === shot.shooterId);
          if (actor?.team === 'home')
            followUpReleases.push({
              shotId: shot.shotId,
              at: state.time,
              shooterId: shot.shooterId,
              afterSaveSeconds: savedAt === undefined ? null : state.time - savedAt,
              sameAttackAfterSave: sameAttackOpen && savedAt !== undefined,
            });
        }
        if (
          state.ball.ownerId &&
          state.players.find((p) => p.id === state.ball.ownerId)?.team === 'away'
        )
          sameAttackOpen = false;
        if (
          state.restart ||
          state.postGoal ||
          ['half_time', 'full_time'].includes(state.status ?? '')
        )
          sameAttackOpen = false;
        const nextContactId = state.lastBallContact ? digest(state.lastBallContact) : '';
        if (nextContactId && nextContactId !== contactId) {
          if (contacts.length < 32) contacts.push(structuredClone(state.lastBallContact));
          contactId = nextContactId;
        }
        if (state.decisionIndex !== lastDecision) {
          if (decisions.length < 16)
            decisions.push({
              at: state.time,
              source: state.latestActionSource,
              action: state.latestAction,
              ball: state.ball,
            });
          lastDecision = state.decisionIndex;
        }
      }
      const home = state.statistics!.players.filter(
        (p) => state.statistics!.playerTeams?.[p.playerId] === 'home',
      );
      results.push({
        seed,
        distance,
        intent,
        requestedAction: action,
        initialHash: digest(initial),
        initial,
        initialOffsideLine,
        reboundAttackerOnsideAtFirstShot: true,
        finalHash: digest(state),
        finalTime: state.time,
        firstShotId,
        firstOutcome,
        contacts,
        decisions,
        statistics: state.statistics,
        score: state.score,
        followUpReleases,
        sameAttackFollowUps: followUpReleases.filter((s) => s.sameAttackAfterSave).length,
        followUpShots: Math.max(0, home.reduce((sum, p) => sum + p.shots, 0) - 1),
        saves: state.statistics!.players.reduce((sum, p) => sum + p.saves, 0),
        parries: state.statistics!.players.reduce((sum, p) => sum + p.parries, 0),
      });
    }
writeFileSync(
  args.get('output') ?? '../PR162-rebounds-final.json',
  JSON.stringify({
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    scenarioSourceHash: createHash('sha256')
      .update(readFileSync('scripts/benchmarkPr162Rebounds.ts', 'utf8').replaceAll('\r\n', '\n'))
      .digest('hex'),
    methodology:
      'Twelve fixed shot requests test physical save/rebound recovery. Initial control is two seconds old and legal shot execution is checked. Shot error, keeper outcome, rebound and all subsequent NPC choices are endogenous. This does not measure initial AI shot selection or force a save/follow-up.',
    results,
  }) + '\n',
);
console.info(
  JSON.stringify(
    results.map(({ seed, distance, intent, saves, parries, followUpShots }) => ({
      seed,
      distance,
      intent,
      saves,
      parries,
      followUpShots,
    })),
  ),
);
