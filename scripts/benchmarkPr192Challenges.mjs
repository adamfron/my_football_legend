import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { readPr192Evidence } from './readPr192Evidence.mjs';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  beginDefensiveChallenge,
  enumerateDefensiveChallengeActions,
} from '../src/core/matchSimulation/defensiveChallenges.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry.ts';
import { angleForVector } from '../src/core/matchSimulation/playerOrientation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
const out = 'docs/performance/pr192/touchline-challenges.json',
  check = process.argv.includes('--check');
if (!check && existsSync(out)) throw Error('Refusing overwrite');
const old = JSON.parse(
  readFileSync('docs/performance/PR188-match-dev-ww-state-value-v1-full-observed-final-v1.json'),
);
const initial = JSON.parse(gunzipSync(readFileSync(old.archive))).input;
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const rows = [];
for (const rating of [40, 80])
  for (const mirror of [false, true])
    for (const approach of ['front', 'behind'])
      for (const technique of ['standing', 'slide', 'carry', 'pressured_carry']) {
        const id = `${rating}:${mirror}:${approach}:${technique}`;
        let s = globalThis.structuredClone(initial);
        s.seed = `pr192:touchline:${approach}:${technique}`;
        s.time = 0;
        s.status = 'first_half';
        s.scenario = 'open_play';
        s.playerAgencyEnabled = false;
        s.actionCooldown = 3;
        for (const key of [
          'restart',
          'postGoal',
          'timekeeping',
          'stoppageLedger',
          'lastRestartAward',
          'lastBoundaryCrossing',
          'lastChallenge',
          'lastGroundContact',
          'onBallPreparation',
          'ballCarrierIntent',
          'playerMovementIntent',
          'receptionPreparation',
          'defensiveChallenge',
          'controlledBallContact',
          'ballAcquisition',
          'pendingPossessionLoss',
        ])
          delete s[key];
        for (const [i, p] of s.players.entries()) {
          p.position = { x: 10 + i * 3, y: 50 + (i % 3) * 4 };
          p.target = { ...p.position };
          p.velocity = { x: 0, y: 0 };
        }
        const attacker = s.players.find(
          (p) => p.team === 'home' && p.slot.position !== 'goalkeeper',
        );
        const defender = s.players.find(
          (p) => p.team === 'away' && p.slot.position !== 'goalkeeper',
        );
        for (const p of [attacker, defender])
          for (const key of Object.keys(p.profile.attributes)) p.profile.attributes[key] = rating;
        attacker.position = { x: 90, y: 0.7 };
        attacker.target = { x: 100, y: 0.3 };
        attacker.velocity = { x: 2, y: 0 };
        attacker.facingAngle = Math.PI / 2;
        defender.position = approach === 'front' ? { x: 91.6, y: 0.9 } : { x: 88.9, y: 0.3 };
        defender.target = { ...attacker.position };
        defender.velocity = { x: approach === 'front' ? -3 : 5, y: -1 };
        if (technique === 'carry') defender.position = { x: 75, y: 20 };
        if (mirror) {
          attacker.position.y = 68 - attacker.position.y;
          attacker.target.y = 68 - attacker.target.y;
          defender.position.y = 68 - defender.position.y;
          defender.velocity.y *= -1;
          attacker.profile.dominantFoot = 'left';
          defender.profile.dominantFoot = 'left';
        }
        const feet = playerContactGeometry(attacker),
          point = attacker.profile.dominantFoot === 'left' ? feet.leftFoot : feet.rightFoot;
        s.ball = {
          ...point,
          height: 0.11,
          velocity: { ...attacker.velocity, z: 0 },
          lastTouchPlayerId: attacker.id,
          ownerId: attacker.id,
        };
        s.possessionTeam = 'home';
        s.ballOwnershipStartedAt = 0;
        defender.facingAngle = angleForVector({
          x: s.ball.x - defender.position.x,
          y: s.ball.y - defender.position.y,
        });
        const available = enumerateDefensiveChallengeActions(s, defender.id).map(
          (a) => a.technique,
        );
        let accepted;
        if (technique === 'carry' || technique === 'pressured_carry') {
          const oldIndex = s.decisionIndex;
          s = resolveMatchAction(
            s,
            {
              type: 'carry',
              actorId: attacker.id,
              target: attacker.target,
              movementMode: 'dribble',
            },
            'dev_ai_selected',
          );
          accepted = s.decisionIndex > oldIndex;
        } else {
          s = beginDefensiveChallenge(
            s,
            { type: 'challenge', actorId: defender.id, opponentId: attacker.id, technique },
            'autonomous_npc',
          );
          accepted = s.defensiveChallenge?.actorId === defender.id;
        }
        tacticalMatchStateSchema.parse(s);
        const inputHash = hash(s),
          trace = [],
          contacts = [],
          seen = new Set();
        for (let tick = 0; tick < 80; tick++) {
          s = step(s, 0.025);
          const contact = s.lastGroundContact;
          if (contact && contact.at >= 0) {
            const key = contact.actorId + ':' + contact.at;
            if (!seen.has(key)) {
              seen.add(key);
              contacts.push(globalThis.structuredClone(contact));
            }
          }
          if (tick % 4 === 0)
            trace.push({
              at: s.time,
              ball: { x: s.ball.x, y: s.ball.y, z: s.ball.height ?? 0 },
              velocity: s.ball.velocity ?? null,
              actor: s.players.find((p) => p.id === attacker.id).position,
              defender: s.players.find((p) => p.id === defender.id).position,
            });
          if (s.lastRestartAward) break;
        }
        rows.push({
          id,
          rating,
          mirror,
          approach,
          technique,
          available,
          accepted,
          inputHash,
          seed: s.seed,
          classification:
            'prescribed actual canonical challenge/carry near touchline; not a captured match replay',
          finalHash: hash(s),
          elapsed: s.time,
          challenge: s.lastChallenge ?? null,
          award: s.lastRestartAward ?? null,
          crossing: s.lastBoundaryCrossing ?? null,
          contacts,
          trace,
        });
        console.log(
          id,
          accepted,
          s.lastChallenge?.outcome ?? '',
          s.lastRestartAward?.scenario ?? 'in_play',
        );
      }
const result = { schema: 'mfl-pr192-touchline-challenges-v1', baseArchive: old.archive, rows };
if (check) {
  if (hash(readPr192Evidence(out)) !== hash(result)) throw Error('Challenge apparatus drift');
} else writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
