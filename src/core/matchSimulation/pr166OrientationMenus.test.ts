// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createFormationBenchmarkSession } from './benchmarkFixtures';
import {
  createOpenPlayMatchFixture as createTacticalMatch,
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { attacksRight, fieldValue, signedForwardDistance } from './matchSpace';
import { goalIntentToPitch } from './goalCoordinates';
import { deriveGoalkeeperBasePosition } from './goalkeeperPositioning';
import { calculateOffsideLine } from './tacticalPositioning';
import { secondLastOpponentLine } from './offside';
import { deriveRestartGeometry, deriveRestartMovementTargets } from './restartGeometry';
import { goalkeeperIntervention } from './aerialPlay';
import { beginPostGoalReaction, advancePostGoalReaction } from './postGoalReactions';
import { createMatchFlowTelemetry, observeMatchFlow } from './matchFlowTelemetry';
import { legalRestartPosition, legalizeRestartPlayerTarget } from './restartLaws';
import {
  groupContextualInteractions,
  uniqueContextualInteractions,
  type ContextualInteraction,
} from './contextualInteractions';
import { deriveShotAimCameraPose } from '../../app/match/tacticalRenderer/model';

const fixture = (mirrored: boolean) =>
  createTacticalMatch(
    createFormationBenchmarkSession({
      anchor: mirrored ? '4-4-2' : '4-3-3',
      opponent: mirrored ? '4-3-3' : '4-4-2',
      attributes: 65,
      seed: 'pr166-orientation',
    }),
  );

describe('PR166 physical ends and contextual menu integrity', () => {
  for (const mirrored of [false, true])
    for (const side of ['home', 'away'] as const)
      it(`switches ${side} geometry, laws and aim without moving the bodies (mirrored=${mirrored})`, () => {
        const first = fixture(mirrored);
        const before = { ...first, status: 'half_time' as const, time: 2700 };
        const second = startSecondHalf(before);
        expect(second.endsSwitched).toBe(true);
        expect(second.players.map((p) => p.position)).toEqual(
          before.players.map((p) => p.position),
        );
        expect(second.score).toEqual(before.score);
        const actor = second.players.find(
          (p) => p.team === side && p.slot.position !== 'goalkeeper',
        )!;
        const keeper = second.players.find(
          (p) => p.team === side && p.slot.position === 'goalkeeper',
        )!;
        const direction = side === 'home' ? -1 : 1;
        expect(attacksRight(actor)).toBe(direction > 0);
        expect(goalIntentToPitch(actor, { horizontal: 0, vertical: 0.5 }).x).toBe(
          direction > 0 ? 105 : 0,
        );
        expect(
          signedForwardDistance({ x: 50, y: 34 }, { x: 50 + direction * 10, y: 34 }, actor),
        ).toBe(10);
        expect(fieldValue({ x: direction > 0 ? 90 : 15, y: 34 }, actor)).toBeGreaterThan(70);
        expect(deriveGoalkeeperBasePosition({ x: 52.5, y: 34 }, keeper).x).toBe(
          direction > 0 ? 1.625 : 103.375,
        );
        expect(keeper.neutralAnchor.x).toBe(direction > 0 ? 5.5 : 99.5);
        const ownGoalX = direction > 0 ? 0 : 105;
        const highBall = {
          ...second,
          possessionTeam: side === 'home' ? ('away' as const) : ('home' as const),
          players: second.players.map((p) =>
            p.id === keeper.id ? { ...p, position: { x: ownGoalX + direction * 2, y: 34 } } : p,
          ),
          ball: { x: ownGoalX + direction, y: 34, height: 1.5 },
        };
        expect(goalkeeperIntervention(highBall).decision).not.toBe('stay');
        const scored = beginPostGoalReaction(
          {
            ...second,
            ball: {
              x: direction > 0 ? 106 : -1,
              y: 40,
              height: 3,
              velocity: { x: 0, y: 0, z: 0 },
            },
          },
          side,
          actor.id,
          `switched-goal-${side}`,
        );
        const contained = advancePostGoalReaction(scored, 0);
        expect(Math.abs(contained.ball.y - 34)).toBeLessThan(3.66);
        expect(contained.ball.height).toBeLessThan(2.44);
        expect(contained.score).toEqual(second.score);
        const prior = { ...second, possessionTeam: side, ball: { x: 52.5, y: 34 } };
        const telemetry = observeMatchFlow(createMatchFlowTelemetry(), prior, {
          ...prior,
          time: prior.time + 0.025,
          ball: { x: direction > 0 ? 90 : 15, y: 34 },
        });
        expect(telemetry.finalThirdEntries).toBe(1);
        expect(telemetry.finalThirdPossessionSeconds).toBeGreaterThan(0);
        const corner = deriveRestartGeometry(second, 'corner', side);
        const markerEntry = Object.entries(corner.roles).find(
          ([, role]) => role.markerId && role.intent === 'mark_opponent',
        )!;
        expect(markerEntry).toBeDefined();
        const [markerId, markerRole] = markerEntry;
        const marker = second.players.find((p) => p.id === markerId)!;
        const markedX = 52.5;
        const movement = deriveRestartMovementTargets({
          ...second,
          scenario: 'corner',
          players: second.players.map((p) =>
            p.id === markerRole.markerId ? { ...p, position: { x: markedX, y: 34 } } : p,
          ),
          ball: { ...second.ball, ...corner.ball },
          restart: {
            ...second.restart!,
            origin: 'live_event',
            takerId: corner.taker.id,
            roles: corner.roles,
            targets: corner.targets,
          },
        });
        expect(movement[markerId]!.x).toBeCloseTo(markedX + (attacksRight(marker) ? -1.2 : 1.2));
        const opponents = second.players
          .filter((p) => p.team !== side)
          .map((p) => p.position.x)
          .sort((a, b) => (direction > 0 ? b - a : a - b));
        expect(secondLastOpponentLine(second, side)).toBe(opponents[1]);
        expect(calculateOffsideLine(second, side)).toBe(
          direction > 0
            ? Math.max(second.ball.x, opponents[1]!)
            : Math.min(second.ball.x, opponents[1]!),
        );
        expect(legalRestartPosition('penalty', side, { x: 52, y: 34 }, false, true).x).toBe(
          direction > 0 ? 94 : 11,
        );
        expect(legalRestartPosition('goal_kick', side, { x: 52, y: 34 }, false, true).x).toBe(
          direction > 0 ? 5.5 : 99.5,
        );
        for (const scenario of [
          'kick_off',
          'penalty',
          'corner',
          'goal_kick',
          'free_kick_close',
        ] as const) {
          const geometry = deriveRestartGeometry(second, scenario, side);
          expect(geometry.taker.team).toBe(side);
          expect(
            Object.values(geometry.targets).every(
              (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
            ),
          ).toBe(true);
        }
        const target = legalizeRestartPlayerTarget(second, actor, {
          x: 52.5 + direction * 10,
          y: 34,
        });
        expect(target.x * direction).toBeLessThanOrEqual(52.5 * direction + 0.3);
        expect(deriveShotAimCameraPose(side, actor.position, true).attackDirection).toBe(direction);
        expect(startSecondHalf(second)).toBe(second);
        const stepped = stepTacticalMatchAfterDecisionProbe(second, 0.025);
        expect(stepped.score).toEqual(before.score);
        expect(stepped.lastShot).toBeUndefined();
        expect(
          stepped.players.every(
            (p) =>
              Math.hypot(
                p.position.x - before.players.find((old) => old.id === p.id)!.position.x,
                p.position.y - before.players.find((old) => old.id === p.id)!.position.y,
              ) < 1,
          ),
        ).toBe(true);
      });

  it('deduplicates mechanics and preserves distinct pass intents and stable IDs in both menus', () => {
    const action = (id: string, intent: 'support' | 'direct'): ContextualInteraction => ({
      id,
      labelKey: 'lofted_pass',
      target: { kind: 'player', playerId: 'receiver' },
      resolution: {
        kind: 'action',
        action: {
          type: 'pass',
          actorId: 'actor',
          receiverId: 'receiver',
          target: { x: 70, y: 30 },
          intent,
          delivery: 'lofted',
        },
      },
    });
    const choices = [
      action('first', 'support'),
      action('duplicate', 'support'),
      action('distinct', 'direct'),
    ];
    for (const restart of [false, true]) {
      const unique = groupContextualInteractions(choices, restart).flatMap((g) => g.interactions);
      expect(unique.map((c) => c.id).sort()).toEqual(['distinct', 'first']);
      expect(new Set(unique.map((c) => c.labelDetail)).size).toBe(2);
      expect(uniqueContextualInteractions(unique)).toEqual(unique);
    }
  });
});
