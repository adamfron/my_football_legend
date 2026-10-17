// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { TacticalMatchState } from './matchState';
import { prepareRestartMovement } from './restartLifecycle';
import { stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { distance } from './matchSpace';

const frozen = () =>
  JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          '../../../docs/performance/pr174-experiments/PR174-G-blocker-state.json.gz',
          import.meta.url,
        ),
      ),
    ).toString(),
  ) as TacticalMatchState;
describe('PR174 physically reachable free-kick preparation', () => {
  it('changes only the trapped marker destination, leaving bodies and ball untouched', () => {
    const state = frozen(),
      prepared = prepareRestartMovement(state);
    expect(prepared.ball).toEqual(state.ball);
    expect(prepared.players.map((p) => p.position)).toEqual(state.players.map((p) => p.position));
    const marker = prepared.players.find((p) => p.id === 'footballer_pro_9_13')!;
    expect(distance(marker.target, state.restart!.spot!)).toBeGreaterThan(9.3);
    expect(
      distance(marker.target, state.players.find((p) => p.id === marker.id)!.target),
    ).toBeGreaterThan(1);
  });
  it('releases the retained soft lock through physical movement and actual legal readiness', () => {
    let state = frozen();
    const initial = state,
      origin = { ...state.players.find((p) => p.id === 'footballer_pro_9_13')!.position };
    let released = false,
      maximumStep = 0;
    for (let tick = 0; tick < 800; tick++) {
      const previous = state;
      state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
      const marker = state.players.find((p) => p.id === 'footballer_pro_9_13')!;
      maximumStep = Math.max(
        maximumStep,
        distance(marker.position, previous.players.find((p) => p.id === marker.id)!.position),
      );
      if (
        (state.lastPassDiagnostic?.releasedAt ?? -1) > initial.time ||
        (state.lastShot?.releasedAt ?? -1) > initial.time ||
        (state.ball.shot?.releasedAt ?? -1) > initial.time ||
        (state.ball.travelKind && !previous.ball.travelKind)
      ) {
        released = true;
        break;
      }
    }
    expect(released).toBe(true);
    expect(
      distance(state.players.find((p) => p.id === 'footballer_pro_9_13')!.position, origin),
    ).toBeGreaterThan(1);
    expect(maximumStep).toBeLessThan(0.5);
  });
});
