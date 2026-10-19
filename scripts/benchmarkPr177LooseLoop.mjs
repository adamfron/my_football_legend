import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import console from 'node:console';
import { pr172SourceHash } from './pr172Evidence.ts';

const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const initial = JSON.parse(readFileSync('../pr177-debug-pr177-dev-strength.json', 'utf8'));
const rows = [];
for (const [label, root, policy] of [['pristine-pr176', '../baseline-pr176', undefined], ['B', '.', 'state-value-v1']]) {
  const sim = await import(pathToFileURL(resolve(root, 'src/core/matchSimulation/matchSimulation.ts')).href);
  let state = globalThis.structuredClone(initial);
  delete state.decisionReadiness;
  if (policy) state.decisionPolicy = policy; else delete state.decisionPolicy;
  const before = state.statistics.observedContactIds.length, origin = { ...state.ball }, contacts = [], frames = [];
  for (let tick = 0; tick < 200; tick++) {
    const previous = state;
    state = sim.stepTacticalMatchAfterDecisionProbe(state, 0.025);
    if (state.lastBallContact?.at !== previous.lastBallContact?.at && state.lastBallContact) contacts.push(state.lastBallContact);
    if (tick % 4 === 0) frames.push({ time: state.time, ball: state.ball, owner: state.ball.ownerId,
      contact: state.lastBallContact, aerial: state.lastAerialContact, episode: state.ballEpisode });
  }
  rows.push({ label, sourceHash: pr172SourceHash(resolve(root)), initialHash: sha(initial), frames, contacts,
    addedContactIdentities: state.statistics.observedContactIds.length - before,
    horizontalDisplacement: Math.hypot(state.ball.x - origin.x, state.ball.y - origin.y), finalBall: state.ball, finalHash: sha(state) });
}
mkdirSync('docs/performance/pr177-evidence', { recursive: true });
writeFileSync('docs/performance/pr177-evidence/loose-contact-loop-input.json.gz', gzipSync(JSON.stringify(initial)));
writeFileSync('docs/performance/PR177-loose-contact-loop.json', JSON.stringify({ version: 1,
  method: 'Five physical seconds from a genuine B development state. Replay the same geometry in untouched PR176 and B; no policy tuning or validation inputs. Contact churn and displacement are measurements, not a football error quota.', rows }, null, 2) + '\n');
console.log(JSON.stringify(rows.map((r) => ({ engine: r.label, addedContacts: r.addedContactIdentities, displacement: r.horizontalDisplacement }))));
