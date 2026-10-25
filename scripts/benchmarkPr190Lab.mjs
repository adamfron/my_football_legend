import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
const args = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('='))),
  engineRoot = args.get('engine-root') ?? '.',
  version = args.get('version') ?? 'current';
const output = `docs/performance/pr190/controlled-${version}.json`;
if (existsSync(output)) throw Error(`Preserve ${output}`);
const load = (p) => import(pathToFileURL(resolve(engineRoot, `src/core/matchSimulation/${p}.ts`)));
const { stepTacticalMatchAfterDecisionProbe: step, applyCanonicalBallControl } =
  await load('matchSimulation');
const { resolveMatchAction } = await load('matchActions');
const { resolveReceptionOutcome } = await load('passReception');
const { executeFootContact } = await load('footContact');
const receipt = JSON.parse(
  readFileSync(
    'docs/performance/PR188-match-dev-ww-opportunity-driven-v1-full-observed-final-v1.json',
  ),
);
const initial = JSON.parse(gunzipSync(readFileSync(receipt.archive))).input;
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const snapshot = (s) => ({
  at: s.time,
  ball: s.ball,
  players: s.players.map((p) => ({
    id: p.id,
    position: p.position,
    velocity: p.velocity,
    target: p.target,
    facing: p.facingAngle,
  })),
  reception: s.lastReceptionOutcome,
  pass: s.lastPassDiagnostic,
});
const rows = [];
for (const [teamSkill, opponentSkill] of [
  [40, 40],
  [80, 80],
  [40, 80],
  [80, 40],
])
  for (const situation of [
    'lateral',
    'closing_defender',
    'moving_receiver',
    'moving_current',
    'body_pressure',
    'long_line',
    'imperfect_reception',
    'second_ball',
  ])
    for (const metres of [6, 14, 30])
      for (const angle of [0, Math.PI / 2])
        for (let seed = 0; seed < 4; seed++) {
          const passerSkill = teamSkill,
            receiverSkill = teamSkill;
          let state = JSON.parse(JSON.stringify(initial));
          state.seed = `pr190-controlled:${situation}:${metres}:${seed}`;
          state.scenario = 'open_play';
          delete state.restart;
          delete state.lastRestartAward;
          delete state.stoppageLedger;
          delete state.rolePlan;
          state.decisionPolicy = 'state-value-v1';
          state.actionCooldown = 30;
          const home = state.players.filter(
              (p) => p.team === 'home' && p.profile.primaryPosition !== 'goalkeeper',
            ),
            passer = home[0],
            receiver = home[1];
          for (const [i, p] of state.players.entries()) {
            p.position = { x: p.team === 'home' ? 5 : 100, y: 3 + i * 2.6 };
            p.target = { ...p.position };
            p.velocity = { x: 0, y: 0 };
          }
          for (const p of state.players) {
            const skill = p.team === 'home' ? teamSkill : opponentSkill;
            p.profile.attributes = Object.fromEntries(
              Object.keys(p.profile.attributes).map((k) => [k, skill]),
            );
            p.profile.weakFootProficiency = skill;
          }
          passer.position = { x: 35, y: 18 };
          passer.target = { ...passer.position };
          passer.facingAngle = 0;
          receiver.position = { x: 35, y: 18 + metres };
          receiver.target = { ...receiver.position };
          receiver.facingAngle = Math.PI;
          const defender = state.players.find(
            (p) => p.team === 'away' && p.profile.primaryPosition !== 'goalkeeper',
          );
          if (['closing_defender', 'body_pressure', 'long_line'].includes(situation)) {
            defender.position = {
              x: situation === 'body_pressure' ? 36.2 : 38,
              y: 18 + (situation === 'long_line' ? metres * 0.6 : 1),
            };
            defender.target = { x: 35, y: 18 + metres / 2 };
            defender.velocity = { x: -2, y: 0 };
          }
          if (situation === 'moving_receiver' || situation === 'moving_current') {
            receiver.velocity = { x: 3, y: 0 };
            receiver.target = { x: 45, y: receiver.position.y };
          }
          const rotate = (p) => ({
            x: 35 + Math.cos(angle) * (p.x - 35) + Math.sin(angle) * (p.y - 18),
            y: 18 - Math.sin(angle) * (p.x - 35) + Math.cos(angle) * (p.y - 18),
          });
          const rotateVelocity = (v) => ({
            x: Math.cos(angle) * v.x + Math.sin(angle) * v.y,
            y: -Math.sin(angle) * v.x + Math.cos(angle) * v.y,
          });
          for (const p of [passer, receiver, defender]) {
            p.position = rotate(p.position);
            p.target = rotate(p.target);
            p.velocity = rotateVelocity(p.velocity);
            p.facingAngle += angle;
          }
          state.ball = {
            x: 35 + Math.sin(angle) * 0.3,
            y: 18 + Math.cos(angle) * 0.3,
            height: 0.11,
            velocity: { x: 0, y: 0, z: 0 },
            ownerId: passer.id,
            lastTouchPlayerId: passer.id,
          };
          state.possessionTeam = 'home';
          const inputSha256 = sha(state),
            start = snapshot(state);
          if (situation === 'imperfect_reception' || situation === 'second_ball') {
            // Contact apparatus: identical reachable incoming ball, four skill pairs. The
            // direct exported canonical control gate still checks actual height/foot reach.
            state.ball = {
              x: receiver.position.x + Math.sin(angle) * 0.3,
              y: receiver.position.y + Math.cos(angle) * 0.3,
              height: 0.11,
              velocity: {
                x:
                  Math.sin(angle) *
                  (situation === 'imperfect_reception' ? (seed % 2 ? 30 : 10) : 4),
                y:
                  Math.cos(angle) *
                  (situation === 'imperfect_reception' ? (seed % 2 ? 30 : 10) : 4),
                z: 0,
              },
              travelKind: 'pass',
              lastTouchPlayerId: passer.id,
            };
            state.receptionPreparation = {
              actorId: receiver.id,
              sourceActorId: passer.id,
              releasedAt: 0,
              awarenessAt: 0,
              expectedContactPoint: { ...receiver.position },
              expectedArrivalTime: 1,
              movement: 'wait',
              ballEpisode: 'lab',
              readiness: {
                contactPoint: { ...receiver.position },
                awareAt: 0,
                readyAt: 0,
                earliestUsefulContactTime: 0,
                preferredArrivalSpeed: 4,
                maximumComfortableArrivalSpeed: 8,
                preparationMargin: 1,
                movementTime: 0,
                orientationTime: 0,
              },
            };
            state.time = 1;
            state.receptionPreparation.awarenessAt = 1 - (seed < 2 ? 0.04 : 0.8);
            const predicted = resolveReceptionOutcome(state, receiver, state.ball),
              surface = executeFootContact(state, receiver, {
                intended: 'cushion',
                desiredVelocity: { x: 0, y: 0, z: 0 },
                balance: 1,
                preparationSeconds: 1,
                contactSeconds: 0.06,
                pressure: 0,
              });
            const controlled = applyCanonicalBallControl(state, receiver.id);
            rows.push({
              passerSkill,
              receiverSkill,
              situation,
              metres,
              seed,
              inputSha256: sha(state),
              angle,
              teamSkill,
              opponentSkill,
              kind: controlled.lastReceptionOutcome?.kind,
              owner: controlled.ball.ownerId ?? null,
              predictedQuality: predicted.quality?.score,
              surface: {
                available: surface.available,
                retained: surface.retained,
                outgoing: surface.outgoingVelocity,
              },
              start: snapshot(state),
              end: snapshot(controlled),
            });
            continue;
          }
          const release = resolveMatchAction(state, {
            type: 'pass',
            actorId: passer.id,
            receiverId: receiver.id,
            target: { ...receiver.position },
            intent: 'support',
            ...(situation === 'moving_current' ? { requestedSpace: { ...receiver.position } } : {}),
          });
          const passId = release.lastPassDiagnostic?.passId;
          state = release;
          state.actionCooldown = 30;
          const trajectory = [snapshot(state)];
          for (let i = 0; i < 400 && !state.lastPassDiagnostic?.finalResult; i++) {
            state = step(state, 0.025);
            if (i % 8 === 0) trajectory.push(snapshot(state));
            if (state.status === 'abandoned') break;
          }
          rows.push({
            passerSkill,
            receiverSkill,
            situation,
            metres,
            seed,
            inputSha256,
            angle,
            teamSkill,
            opponentSkill,
            released: Boolean(passId),
            result: state.lastPassDiagnostic?.finalResult ?? 'unresolved',
            reception: state.lastPassDiagnostic?.receptionOutcome,
            start,
            trajectory,
            end: snapshot(state),
          });
        }
const archive = `${output}.gz`;
writeFileSync(archive, gzipSync(JSON.stringify(rows)));
const groups = [];
for (const [teamSkill, opponentSkill] of [
  [40, 40],
  [80, 80],
  [40, 80],
  [80, 40],
])
  for (const situation of [...new Set(rows.map((r) => r.situation))]) {
    const found = rows.filter(
      (r) =>
        r.teamSkill === teamSkill && r.opponentSkill === opponentSkill && r.situation === situation,
    );
    groups.push({
      teamSkill,
      opponentSkill,
      situation,
      count: found.length,
      outcomes: Object.fromEntries(
        [...new Set(found.map((r) => r.result ?? r.kind ?? 'no_contact'))].map((key) => [
          key,
          found.filter((r) => (r.result ?? r.kind ?? 'no_contact') === key).length,
        ]),
      ),
    });
  }
writeFileSync(
  output,
  JSON.stringify(
    {
      schemaVersion: 1,
      classification:
        'paired canonical team-quality apparatus; rotated geometry and prepared/unprepared contacts; no independent confirmation',
      sourceSha256: sha(
        readdirSync(engineRoot + '/src', { recursive: true })
          .map((p) => p.replaceAll('\\', '/'))
          .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
          .sort()
          .map((p) => ({
            path: 'src/' + p,
            sha256: createHash('sha256')
              .update(readFileSync(engineRoot + '/src/' + p, 'utf8').replaceAll('\r\n', '\n'))
              .digest('hex'),
          })),
      ),
      runnerSha256: createHash('sha256')
        .update(readFileSync('scripts/benchmarkPr190Lab.mjs', 'utf8').replaceAll('\r\n', '\n'))
        .digest('hex'),
      engineRoot,
      version,
      rows: rows.length,
      archive,
      archiveSha256: createHash('sha256').update(readFileSync(archive)).digest('hex'),
      groups,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ output, groups }));
