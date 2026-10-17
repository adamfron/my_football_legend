import { writeFileSync } from 'node:fs';
import { createCombinationFixture } from './pr174Fixtures';
import {
  rankAvailableActionsForAI,
  resolveMatchAction,
} from '../src/core/matchSimulation/matchActions';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation';
import { deriveOnBallPreparation } from '../src/core/matchSimulation/onBallPreparation';
import { pr172Manifest, pr172Hash } from './pr172Evidence';
const rows = [];
for (const name of [
  'delegate',
  'receiver_pass_35',
  'receiver_touch_35',
  'own_pass_90',
  'runner_fast',
  'runner_slow',
  'defender_fast',
  'defender_crossing',
  'runner_tired',
] as const) {
  const f = createCombinationFixture({
      scenario: name.startsWith('runner') || name.startsWith('defender') ? 'pace' : 'creator',
    }),
    s = f.state;
  const a = s.players.find((p) => p.id === f.a)!,
    b = s.players.find((p) => p.id === f.b)!;
  a.profile.attributes.passing = 60;
  b.profile.attributes.passing = 90;
  if (name === 'receiver_pass_35') b.profile.attributes.passing = 35;
  if (name === 'receiver_touch_35') b.profile.attributes.firstTouch = 35;
  if (name === 'own_pass_90') a.profile.attributes.passing = 90;
  let actor = a;
  if (name.startsWith('runner') || name.startsWith('defender')) {
    actor = b;
    s.ball = {
      x: b.position.x + 0.35,
      y: b.position.y,
      ownerId: b.id,
      height: 0.11,
      lastTouchPlayerId: b.id,
    };
    a.profile.attributes.pace = name === 'runner_slow' ? 40 : 97;
    const defender = s.players.find((p) => p.team !== a.team && p.slot.position === 'right_back')!;
    defender.profile.attributes.pace = name === 'defender_fast' ? 95 : 45;
    defender.position = { x: 73, y: 11 };
    defender.velocity = { x: name === 'defender_crossing' ? -5 : 4, y: 0 };
    defender.facingAngle = name === 'defender_crossing' ? -Math.PI / 2 : Math.PI / 2;
    if (name === 'runner_tired') a.fitness!.burstReadiness = 0.01;
    s.onBallPreparation = deriveOnBallPreparation({ ...s, time: s.time - 2 }, b, 'clean_control');
  }
  const ranked = rankAvailableActionsForAI(s, actor.id),
    action = ranked[0]?.action;
  let state = action ? resolveMatchAction(s, action) : s,
    losses = 0;
  const passes = new Map();
  for (let tick = 0; tick < 320; tick++) {
    const previous = state;
    state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    if (
      state.lastPossessionLoss?.id !== previous.lastPossessionLoss?.id &&
      state.lastPossessionLoss?.from === actor.team
    )
      losses++;
    for (const pass of [state.lastPassDiagnostic, state.lastResolvedPass])
      if (pass && pass.releasedAt >= s.time) passes.set(pass.passId, pass);
  }
  rows.push({
    name,
    initialHash: pr172Hash(s),
    actorId: actor.id,
    ownPassing: actor.profile.attributes.passing,
    receiverPassing: b.profile.attributes.passing,
    receiverFirstTouch: b.profile.attributes.firstTouch,
    ranked: ranked.slice(0, 8),
    selected: action,
    passes: [...passes.values()],
    losses,
    finalControl: state.players.find((p) => p.id === state.ball.ownerId)?.team === actor.team,
    finalHash: pr172Hash(state),
  });
}
writeFileSync(
  'docs/performance/PR174-player-matchups.json',
  JSON.stringify(
    {
      manifest: pr172Manifest(),
      method:
        'Full canonical present states, one attribute/observable-matchup difference where labelled; autonomous initial choice and 8s physical continuation. Receiver passing and receiver first touch are varied separately; no OVR term or forced pass. Shared variants are dependent.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(
    rows.map((r) => ({
      name: r.name,
      selected: r.selected,
      losses: r.losses,
      control: r.finalControl,
    })),
  ),
);
