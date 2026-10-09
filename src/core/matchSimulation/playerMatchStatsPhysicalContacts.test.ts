import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { advanceControlledBall } from './ballContactGeometry';
import { collectContactEvidence } from './contactEvidence';
import { resolveMatchAction } from './matchActions';
import { createTacticalMatch } from './matchSimulation';
import {
  createMatchStatistics,
  matchStatisticsSchema,
  observePlayerMatchStats,
} from './playerMatchStats';

const world = createCanonicalWorldDatabase();
const fixture = () => {
  const initial = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed: 'pr158-bounded-physical-accounting',
      control: { mode: 'spectator' },
    }),
  );
  delete initial.restart;
  initial.scenario = 'open_play';
  initial.time = 100;
  initial.actionCooldown = 0;
  const actor = initial.players.find((player) => player.id === initial.ball.ownerId)!;
  initial.players.forEach((player, index) => {
    player.position = { x: player.team === 'home' ? 15 : 85, y: 5 + (index % 10) * 5 };
    player.velocity = { x: 0, y: 0 };
    player.target = { ...player.position };
  });
  actor.position = { x: 52, y: 34 };
  actor.facingAngle = Math.PI / 2;
  initial.ball = { x: 52.45, y: 34, ownerId: actor.id };
  initial.ballOwnershipStartedAt = initial.time;
  const contact = advanceControlledBall(
    { ...initial, time: initial.time + 0.025 },
    actor,
    0.025,
  ).state;
  const receiver = initial.players.find(
    (player) =>
      player.team === actor.team && player.id !== actor.id && player.slot.position !== 'goalkeeper',
  )!;
  receiver.position = { x: 65, y: 34 };
  receiver.facingAngle = -Math.PI / 2;
  const release = resolveMatchAction(
    contact,
    {
      type: 'pass',
      actorId: actor.id,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'support',
    },
    'autonomous_npc',
  );
  return { initial, actor, contact, release };
};

describe('bounded physical-contact accounting', () => {
  it('keeps one watermark across repeated real foot contacts without growing the event ledger', () => {
    const { initial, actor } = fixture();
    let current = initial;
    let statistics = createMatchStatistics(initial);
    const ledger = statistics.observedContactIds;
    for (let tick = 0; tick < 1_200; tick++) {
      const previous = current;
      current = advanceControlledBall(
        { ...previous, time: previous.time + 0.025 },
        actor,
        0.025,
      ).state;
      statistics = observePlayerMatchStats(statistics, previous, current);
    }
    expect(current.controlledBallContact!.physicalContacts).toBeGreaterThan(100);
    expect(statistics.observedContactIds).toBe(ledger);
    expect(statistics.observedContactIds).toEqual([]);
    expect(statistics.observedPhysicalContactAt).toEqual({
      [actor.id]: current.controlledBallContact!.lastContactAt,
    });
    expect(statistics.players.find((player) => player.playerId === actor.id)?.touches).toBe(1);
    expect(matchStatisticsSchema.safeParse(statistics).success).toBe(true);
  });

  it('deduplicates a physical transition after the control episode has ended', () => {
    const { initial, actor, contact } = fixture();
    const first = observePlayerMatchStats(createMatchStatistics(initial), initial, contact);
    const savedFirst = structuredClone(first);
    Object.freeze(first.observedPhysicalContactAt);
    expect(observePlayerMatchStats(first, initial, contact)).toEqual(first);
    let later = contact;
    for (let tick = 0; tick < 12; tick++)
      later = advanceControlledBall({ ...later, time: later.time + 0.025 }, actor, 0.025).state;
    expect(later.controlledBallContact!.lastContactAt).toBeGreaterThan(
      contact.controlledBallContact!.lastContactAt,
    );
    const branch = observePlayerMatchStats(first, contact, later);
    expect(branch.observedPhysicalContactAt).not.toBe(first.observedPhysicalContactAt);
    expect(observePlayerMatchStats(first, contact, later)).toEqual(branch);
    expect(first).toEqual(savedFirst);
    const closed = { ...contact, status: 'half_time' as const };
    const ended = observePlayerMatchStats(first, contact, closed);
    expect(ended.activeControlEpisode).toBeUndefined();
    expect(observePlayerMatchStats(ended, initial, contact)).toEqual(ended);
    expect(first).toEqual(savedFirst);
    expect(ended.players.find((player) => player.playerId === actor.id)?.touches).toBe(1);
  });

  it('merges same-time physical contact and release, including separate observations and replay', () => {
    const { initial, actor, contact, release } = fixture();
    for (const separateContact of [false, true]) {
      let statistics = createMatchStatistics(initial);
      if (separateContact) statistics = observePlayerMatchStats(statistics, initial, contact);
      statistics = observePlayerMatchStats(
        statistics,
        separateContact ? contact : initial,
        release,
      );
      expect(statistics.players.find((player) => player.playerId === actor.id)).toMatchObject({
        touches: 1,
        passesAttempted: 1,
      });
      expect(statistics.activeControlEpisode).toBeUndefined();
      expect(observePlayerMatchStats(statistics, initial, contact)).toEqual(statistics);
      expect(observePlayerMatchStats(statistics, contact, release)).toEqual(statistics);
    }
  });

  it('reads legacy physical IDs without a watermark and deduplicates a closed saved episode', () => {
    const { initial, actor, contact } = fixture();
    const recorded = observePlayerMatchStats(createMatchStatistics(initial), initial, contact);
    const legacy = {
      ...recorded,
      observedContactIds: collectContactEvidence(initial, contact).map((evidence) => evidence.id),
    };
    delete legacy.observedPhysicalContactAt;
    delete legacy.activeControlEpisode;
    const parsed = matchStatisticsSchema.parse(legacy);
    expect(parsed.observedPhysicalContactAt).toBeUndefined();
    const replayed = observePlayerMatchStats(parsed, initial, contact);
    expect(replayed).toEqual(parsed);
    expect(replayed.players.find((player) => player.playerId === actor.id)?.touches).toBe(1);
  });
});
