// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import { resolveMatchAction } from './matchActions';
import { awardOffsideRestart } from './offside';
import { emitMatchEvents } from './matchEventFeed';
import { MatchReplayHistory, matchReplayWindowSchema } from './matchReplay';
import { replaySnapshotToFrame } from '../../app/match/tacticalRenderer/replay';

describe('PR164 offside release frame', () => {
  it.each(['home', 'away'] as const)(
    'retains the actual %s pass frame after later bodies move',
    (side) => {
      const world = createCanonicalWorldDatabase();
      const state = createTacticalMatch(
        createSingleMatchSession(world, {
          homeClubId: 'pro_9',
          awayClubId: 'pro_1',
          seed: 'pr164-offside',
          control: { mode: 'spectator' },
        }),
      );
      delete state.restart;
      state.scenario = 'open_play';
      state.time = 100;
      const actor = state.players.find(
          (p) => p.team === side && p.slot.position === 'central_midfielder',
        )!,
        receiver = state.players.find((p) => p.team === side && p.slot.position === 'striker')!;
      const x = (home: number) => (side === 'home' ? home : 105 - home);
      state.players = state.players.map((p, i) => ({
        ...p,
        position: { x: x(p.team === side ? 15 : i === 11 ? 95 : 85), y: 10 + i * 2 },
        target: { x: 50, y: 34 },
        velocity: { x: 0, y: 0 },
      }));
      state.players.find((p) => p.id === actor.id)!.position = { x: x(50), y: 34 };
      state.players.find((p) => p.id === receiver.id)!.position = { x: x(90), y: 34 };
      state.ball = { x: x(50), y: 34, ownerId: actor.id, height: 0.11 };
      state.possessionTeam = side;
      const released = resolveMatchAction(state, {
        type: 'pass',
        actorId: actor.id,
        receiverId: receiver.id,
        target: { x: x(90), y: 34 },
        intent: 'progressive',
        delivery: 'ground',
      });
      expect(released.offsideSnapshot?.offsidePlayerIds).toContain(receiver.id);
      const history = new MatchReplayHistory(),
        canonical = structuredClone(released);
      history.observe(released);
      const later = {
        ...released,
        time: 101,
        players: released.players.map((p) => ({ ...p, position: { x: 45, y: p.position.y } })),
      };
      const awarded = emitMatchEvents(
        released,
        awardOffsideRestart(later, receiver.id, { x: 45, y: 34 }),
      );
      history.observe(awarded);
      history.observe({ ...awarded, time: 105 });
      const event = awarded.matchEvents!.find((e) => e.kind === 'offside')!,
        window = history.getWindow(event.replayKey)!;
      expect(matchReplayWindowSchema.safeParse(window).success).toBe(true);
      expect(window.offsideFrame?.timestampMs).toBe(100000);
      expect(window.offsideFrame?.offside?.offsideLineX).toBe(
        released.offsideSnapshot!.offsideLineX,
      );
      expect(window.offsideFrame?.players.find((p) => p.id === receiver.id)?.x).toBe(x(90));
      expect(replaySnapshotToFrame(window.offsideFrame!).offside?.attackingTeam).toBe(side);
      expect(released).toEqual(canonical);
      window.offsideFrame!.players[0]!.x = 1;
      expect(history.getWindow(event.replayKey)!.offsideFrame!.players[0]!.x).not.toBe(1);
      history.observe({ ...state, seed: 'another-match', time: 0 });
      expect(history.getWindow(event.replayKey)).toBeUndefined();
    },
  );
});
