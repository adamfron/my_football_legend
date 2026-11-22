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
import { PLAYER_BODY_CONTACT } from './playerBodyContact';

const dt = 0.025;
const load = (path: string) =>
  tacticalMatchStateSchema.parse(
    JSON.parse(gunzipSync(readFileSync(`docs/performance/${path}.json.gz`)).toString()),
  ) as unknown as TacticalMatchState;
const loadRefined = (fixture: string) => load(`pr227-refined-${fixture}-development-halt`);

it('continues the native-a throw-in after opposing markers use separate legal positions', () => {
  const oldHalt = load('pr227-contact-followup-native-a-restart-halt');
  const retargeted = prepareRestartMovement(oldHalt);
  expect(retargeted.players.map((p) => p.position)).toEqual(oldHalt.players.map((p) => p.position));
  expect(retargeted.ball).toEqual(oldHalt.ball);
  expect(deriveRestartLegalReadiness(retargeted)).toMatchObject({
    ballReady: true,
    takerReady: true,
    opponentsReady: false,
    blockers: ['opponent_restriction'],
  });
  const input = load('pr227-native-a-endline-throw-award');
  const award = input.restart!;
  const players = prepareRestartMovement(input).players;
  const markers = players.filter(
    (p) => p.team !== award.restartTeam && award.roles[p.id]?.intent === 'mark_opponent',
  );
  expect(markers.length).toBeGreaterThan(1);
  for (const [index, marker] of markers.entries()) {
    expect(distance(marker.target, award.spot!)).toBeGreaterThanOrEqual(2);
    for (const other of markers.slice(index + 1))
      expect(distance(marker.target, other.target)).toBeGreaterThan(PLAYER_BODY_CONTACT.diameter);
  }
  let state = input;
  for (
    let tick = 0;
    tick < 30 / dt && !state.safetyHalt && state.restart?.phase !== 'release';
    tick++
  )
    state = stepTacticalMatch(state, dt);
  expect(state.safetyHalt).toBeUndefined();
  expect(state.restart).toMatchObject({
    awardId: award.awardId,
    restartTeam: award.restartTeam,
    spot: award.spot,
    phase: 'release',
    executedAt: expect.any(Number),
    readiness: { legalReady: true, blockers: [] },
  });
  expect(state.ball).toMatchObject({ travelKind: 'throw_in', airborne: true, releaseHeight: 1.9 });
  expect(state.throwInRestriction).toEqual({
    throwerId: state.restart?.takerId,
    releasedAt: state.restart?.executedAt,
  });
  for (const opponent of state.players.filter(
    (p) => p.team !== award.restartTeam && !state.discipline?.[p.id]?.sentOff,
  ))
    expect(distance(opponent.position, award.spot!)).toBeGreaterThanOrEqual(2);
  const atRelease = state.ball;
  for (
    let tick = 0;
    tick < 1 / dt && !state.safetyHalt && distance(atRelease, state.ball) < 0.3;
    tick++
  )
    state = stepTacticalMatch(state, dt);
  expect(state.safetyHalt).toBeUndefined();
  expect(distance(atRelease, state.ball)).toBeGreaterThanOrEqual(0.3);
}, 20000);

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
