import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const snapshotText = readFileSync(
  resolve(args.get('snapshot') ?? '../pr155-contest-state.json'),
  'utf8',
);
const snapshot: TacticalMatchState = JSON.parse(snapshotText);
const factSchema = z.object({
  at: z.number(),
  team: z.enum(['home', 'away']),
  owner: z.string().nullable(),
  lastTouch: z.string().nullable(),
  height: z.number(),
  aerialId: z.string().nullable(),
  winner: z.string().nullable(),
  possessionCause: z.string().nullable(),
});
async function run(root: string) {
  const load = <T>(path: string): Promise<T> => import(pathToFileURL(resolve(root, path)).href);
  const [engine, actions, decisions, statistics] = await Promise.all([
    load<typeof import('../src/core/matchSimulation/matchSimulation')>(
      'src/core/matchSimulation/matchSimulation.ts',
    ),
    load<typeof import('../src/core/matchSimulation/matchActions')>(
      'src/core/matchSimulation/matchActions.ts',
    ),
    load<typeof import('../src/core/matchSimulation/playerDecision')>(
      'src/core/matchSimulation/playerDecision.ts',
    ),
    load<typeof import('../src/core/matchSimulation/playerMatchStats')>(
      'src/core/matchSimulation/playerMatchStats.ts',
    ),
  ]);
  let state = structuredClone(snapshot);
  let flips = 0,
    adjacent = 0,
    lastFlip = -10;
  const contacts = new Set<string>();
  const facts: z.infer<typeof factSchema>[] = [];
  for (let tick = 0; tick < 300; tick++) {
    const opportunity = decisions.projectPlayerDecisionOpportunity(state);
    if (opportunity) {
      const option = [...opportunity.options].sort((a, b) => {
        const score = (o: typeof a) =>
          o.kind === 'action'
            ? actions.scoreActionForAI(state, opportunity.actorId, o.action)
            : -20;
        return score(b) - score(a) || a.id.localeCompare(b.id);
      })[0]!;
      state = decisions.applyPlayerDecision(state, opportunity, option.id);
    }
    const previous = state;
    state = engine.stepTacticalMatchAfterDecisionProbe(state, engine.FIXED_MATCH_DT);
    if (state.time === previous.time) throw new Error('Contest replay stalled');
    const flipped = previous.possessionTeam !== state.possessionTeam;
    if (flipped) {
      flips++;
      adjacent += Number(state.time - lastFlip <= engine.FIXED_MATCH_DT + 1e-6);
      lastFlip = state.time;
    }
    const contact = state.lastAerialContact;
    const newContact = contact?.id && !contacts.has(contact.id);
    if (contact?.id) contacts.add(contact.id);
    if (tick < 12 || flipped || newContact)
      facts.push(
        factSchema.parse({
          at: state.time,
          team: state.possessionTeam,
          owner: state.ball.ownerId ?? null,
          lastTouch: state.ball.lastTouchPlayerId ?? null,
          height: state.ball.height ?? 0,
          aerialId: contact?.id ?? null,
          winner: contact?.winnerId ?? null,
          possessionCause: flipped ? (state.lastPossessionChange?.cause ?? null) : null,
        }),
      );
  }
  statistics.assertMatchStatisticsInvariants(state.statistics!, state);
  return {
    flips,
    adjacentTickPossessionFlips: adjacent,
    aerialContacts: contacts.size,
    facts,
    canonicalHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
  };
}
const before = await run(resolve(args.get('baseline-root') ?? '../baseline-pr154'));
const after = await run(process.cwd());
const repeat = await run(process.cwd());
if (after.canonicalHash !== repeat.canonicalHash) throw new Error('Contest repeat differs');
if (before.adjacentTickPossessionFlips === 0)
  throw new Error('Fixture did not reproduce the old regression');
if (after.adjacentTickPossessionFlips !== 0) throw new Error('Same-pair regression remains');
const output = resolve(args.get('out') ?? '.benchmark-artifacts/pr155-contest.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      base: '235caf8abe593fb7fa85911f0d12bbe5474973e0',
      seed: snapshot.seed,
      at: snapshot.time,
      snapshotHash: createHash('sha256').update(snapshotText).digest('hex'),
      ticks: 300,
      dt: 0.025,
      before,
      after,
      repeatHash: repeat.canonicalHash,
    },
    null,
    2,
  ) + '\n',
);
process.stderr.write(
  `A/B adjacent flips ${before.adjacentTickPossessionFlips} -> ${after.adjacentTickPossessionFlips}; aerial contacts ${before.aerialContacts} -> ${after.aerialContacts}\n`,
);
