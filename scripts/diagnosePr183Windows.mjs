import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase.ts';
import { createSingleMatchSession } from '../src/core/singleMatch.ts';
import {
  createTacticalMatch,
  stepTacticalMatch,
  applyPlayerDecision,
  projectPlayerAgency,
  createConsequenceWindow,
  observeConsequenceWindow,
} from '../src/core/matchSimulation/index.ts';
import console from 'node:console';
let state = createTacticalMatch(
  createSingleMatchSession(createCanonicalWorldDatabase(), {
    homeClubId: 'pro_0',
    awayClubId: 'pro_1',
    seed: 'pr143-agency',
    control: { mode: 'spectator' },
  }),
);
const actor = state.players.find(
  (p) => p.team === 'home' && p.profile.primaryPosition !== 'goalkeeper',
);
state.controlledFootballerId = actor.id;
actor.position = { x: 94, y: 34 };
state.ball = { ...actor.position, ownerId: actor.id };
state.possessionTeam = 'home';
state.players.find(
  (p) => p.team === 'away' && p.profile.primaryPosition === 'goalkeeper',
).position = { x: 103, y: 34 };
state.players.find(
  (p) => p.team === 'away' && p.profile.primaryPosition !== 'goalkeeper',
).position = { x: 92.5, y: 34 };
const opportunity = projectPlayerAgency(state).opportunity,
  selected = opportunity.options.find((o) => o.kind === 'action' && o.action.type === 'pass');
console.log(JSON.stringify({ selected }));
let window = createConsequenceWindow(state, opportunity.actorId);
state = applyPlayerDecision(state, opportunity, selected.id);
for (let tick = 0; tick < 1100; tick++) {
  const { controlledFootballerId, ...autonomous } = state;
  void controlledFootballerId;
  state = stepTacticalMatch(autonomous, 0.025);
  const result = observeConsequenceWindow(window, state);
  window = result.window;
  if (tick % 40 === 0 || result.endReason)
    console.log(
      JSON.stringify({
        time: state.time,
        window,
        result,
        owner: state.ball.ownerId,
        ball: state.ball,
        scenario: state.scenario,
        actor: state.players.find((p) => p.id === actor.id)?.position,
      }),
    );
  if (result.endReason) break;
}
