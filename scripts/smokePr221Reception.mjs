import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';
import { withArticulatedBody } from '../src/core/matchSimulation/articulatedGait.ts';
import {
  matchStateToFrame,
  stepTacticalMatch,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';

const { initial } = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr217/session-input.json.gz')).toString(),
);
const run = (edition) => {
  let state = tacticalMatchStateSchema.parse({
    ...withArticulatedBody(initial),
    playerAgencyEnabled: false,
    ...(edition && { experimentalReceptionPreparation: edition }),
  });
  const start = state.time;
  const contacts = [];
  let invalidFrames = 0;
  let ownershipChanges = 0;
  let travel = 0;
  let controlAt600 = 0;
  let planTicks = 0;
  const settling = [];
  while (state.time < start + 30 - 1e-8 && !state.safetyHalt) {
    const previous = state;
    state = stepTacticalMatch(state, 0.025);
    assert.ok(state.time > previous.time);
    travel += Math.hypot(state.ball.x - previous.ball.x, state.ball.y - previous.ball.y);
    if (state.ball.ownerId !== previous.ball.ownerId) ownershipChanges++;
    if (Object.keys(state.activePerceptionRuntime?.plans ?? {}).length > 0) planTicks++;
    const touch = state.lastGroundContact;
    if (touch?.executed && touch.at !== previous.lastGroundContact?.at) {
      contacts.push(touch);
      if (touch.preparedReception && touch.retained)
        settling.push({ at: touch.at + 0.6, owner: touch.actorId });
    }
    while (settling[0]?.at <= state.time) {
      if (settling.shift().owner === state.ball.ownerId) controlAt600++;
    }
    const frame = matchStateToFrame(state);
    if (
      frame.players.length !== 22 ||
      frame.players.some((p) => ![p.x, p.y, p.facing].every(Number.isFinite))
    )
      invalidFrames++;
  }
  return {
    seconds: state.time - start,
    invalidFrames,
    travel,
    ownershipChanges,
    contacts: contacts.length,
    prepared: contacts
      .filter((contact) => contact.preparedReception)
      .map((contact) => ({
        at: contact.at,
        region: contact.region,
        surface: contact.surfaceContact?.executed,
        retained: contact.retained,
        plan: contact.preparedReception,
      })),
    controlAt600,
    planTicks,
    halt: state.safetyHalt ?? null,
    score: state.score,
  };
};

const baseline = run(undefined);
const adaptive = run('adaptive-reception-dev-v1');
process.stdout.write(`${JSON.stringify({ baseline, adaptive }, null, 2)}\n`);
