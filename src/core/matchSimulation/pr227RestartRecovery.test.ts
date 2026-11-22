// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { stepTacticalMatch } from './matchSimulation';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { prepareRestartMovement } from './restartLifecycle';
import { deriveRestartLegalReadiness } from './restartLaws';
import { canHandleRestartBall } from './restartPhase';
import { GROUNDED_RECOVERY_BALANCE } from './dynamicBalanceState';
import { distance } from './matchSpace';

const dt = 0.025;
const load = (path: string) =>
  tacticalMatchStateSchema.parse(
    JSON.parse(gunzipSync(readFileSync(`docs/performance/${path}.json.gz`)).toString()),
  ) as unknown as TacticalMatchState;
const loadRefined = (fixture: string) => load(`pr227-refined-${fixture}-development-halt`);

it.each([
  { fixture: 'paired', handler: 'footballer_pro_9_9', taker: 'footballer_pro_9_0', seconds: 15 },
  { fixture: 'native-a', handler: 'footballer_pro_1_0', taker: 'footballer_pro_1_0', seconds: 24 },
])(
  'physically releases the $fixture restart after replacing its lost handler',
  ({ fixture, handler, taker, seconds }) => {
    const before = loadRefined(fixture);
    const restart = before.restart!;
    const previous = before.players.find((p) => p.id === restart.retrieval?.playerId)!;
    expect(canHandleRestartBall(before, previous)).toBe(false);
    const assigned = prepareRestartMovement(before);
    expect(assigned.restart).toMatchObject({
      awardId: restart.awardId,
      restartTeam: restart.restartTeam,
      spot: restart.spot,
      takerId: taker,
      retrieval: { playerId: handler, stage: 'approach' },
    });
    expect(assigned.restart?.retrieval?.attachedOffset).toBeUndefined();
    expect(assigned.ball).toEqual(before.ball);
    let state = stepTacticalMatch(before, dt);
    expect(Math.hypot(state.ball.x - before.ball.x, state.ball.y - before.ball.y)).toBeLessThan(
      0.01,
    );
    for (
      let tick = 1;
      tick < seconds / dt && !state.safetyHalt && state.restart?.phase !== 'release';
      tick++
    )
      state = stepTacticalMatch(state, dt);
    expect(state.safetyHalt).toBeUndefined();
    expect(state.restart).toMatchObject({
      awardId: restart.awardId,
      takerId: taker,
      phase: 'release',
      executedAt: expect.any(Number),
      readiness: { legalReady: true },
    });
  },
  20000,
);

it('places the archived corner and preserves the restriction on nearby opponents', () => {
  let state = loadRefined('independent');
  const award = state.restart!.awardId;
  let sawPlaced = false;
  for (
    let tick = 0;
    tick < 60 / dt && !state.safetyHalt && state.restart?.phase !== 'release';
    tick++
  ) {
    state = stepTacticalMatch(state, dt);
    sawPlaced ||= state.restart?.retrieval?.stage === 'placed';
  }
  expect(sawPlaced).toBe(true);
  expect(state.restart).toMatchObject({
    awardId: award,
    takerId: 'geometry:anchor:0',
    phase: 'preparing',
    retrieval: { stage: 'placed' },
  });
  expect(deriveRestartLegalReadiness(state)).toMatchObject({
    ballReady: true,
    takerReady: true,
    ready: false,
    blockers: ['opponent_restriction'],
  });
  expect(state.safetyHalt?.reason).toBe('opponent_restriction');
  expect(state.restart?.executedAt).toBeUndefined();
}, 20000);

it('lets the detached ball fall while the restarting team has no available handler', () => {
  const before = loadRefined('paired');
  const restart = before.restart!;
  const lost = before.players.find((player) => player.id === restart.retrieval?.playerId)!
    .articulatedStance!.dynamicBalance!;
  const state = {
    ...before,
    players: before.players.map((player) =>
      player.team === restart.restartTeam && player.articulatedStance
        ? { ...player, articulatedStance: { ...player.articulatedStance, dynamicBalance: lost } }
        : player,
    ),
  };
  expect(
    state.players.some((p) => p.team === restart.restartTeam && canHandleRestartBall(state, p)),
  ).toBe(false);
  const detached = prepareRestartMovement(state);
  expect(detached.restart?.retrieval).toBeUndefined();
  expect(detached.ball).toEqual(before.ball);
  const next = stepTacticalMatch(detached, dt);
  expect(next.ball.height!).toBeLessThan(before.ball.height!);
  expect(next.restart?.readiness?.takerReady).toBe(false);
});

it.each([
  ['pr227-followup-paired-halt', 'kick_off', 30],
  ['pr227-followup-native-a-halt', 'throw_in', 25],
  ['pr227-followup-independent-halt', 'corner', 50],
  ['pr227-refined-independent-development-halt', 'corner', 35],
] as const)(
  'restores the legal %s award through finite grounded recovery',
  (path, scenario, seconds) => {
    const source = load(path);
    expect(source.scenario).toBe(scenario);
    const initialLost = source.players.filter(
      (p) => p.articulatedStance?.dynamicBalance?.phase === 'lost',
    );
    expect(initialLost.length).toBeGreaterThan(0);
    let state: TacticalMatchState = {
      ...source,
      experimentalDynamicBalance: GROUNDED_RECOVERY_BALANCE,
    };
    const first = stepTacticalMatch(state, dt);
    expect(first.safetyHalt).toBeUndefined();
    expect(
      first.players
        .filter((p) => initialLost.some(({ id }) => id === p.id))
        .every((p) => p.articulatedStance?.dynamicBalance?.phase === 'lost'),
    ).toBe(true);
    state = first;
    for (
      let tick = 1;
      tick < seconds / dt && !state.safetyHalt && state.restart?.phase !== 'release';
      tick++
    )
      state = stepTacticalMatch(state, dt);
    expect(state.safetyHalt).toBeUndefined();
    expect(state.restart).toMatchObject({
      awardId: source.restart?.awardId,
      restartTeam: source.restart?.restartTeam,
      spot: source.restart?.spot,
      phase: 'release',
      executedAt: expect.any(Number),
      readiness: { legalReady: true, tacticalReady: true, blockers: [] },
    });
    expect(
      state.players.some(
        (p) => initialLost.some(({ id }) => id === p.id) && canHandleRestartBall(state, p),
      ),
    ).toBe(true);
    const atRelease = state.ball;
    for (
      let tick = 0;
      tick < 1 / dt && !state.safetyHalt && distance(atRelease, state.ball) < 0.3;
      tick++
    )
      state = stepTacticalMatch(state, dt);
    expect(state.safetyHalt).toBeUndefined();
    expect(distance(atRelease, state.ball)).toBeGreaterThanOrEqual(0.3);
  },
  30000,
);
