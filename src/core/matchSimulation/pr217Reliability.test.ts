// @vitest-environment node
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { tacticalMatchStateSchema, type TacticalMatchState } from './matchState';
import { stepTacticalMatch } from './matchSimulation';
import { stepSubstitutionInterval, substitutionBlocksRestart } from './substitutions';
import { deriveLowerBodyGeometry } from './lowerBodyGeometry';
import { passCompletionCredit } from './passCompletionCredit';
import { applyPlayerDecision, projectPlayerDecisionOpportunity } from './playerDecision';
import { physicalAcquisitionCause } from './possessionEvents';
import { legalizeRestartPlayerTarget } from './restartLaws';

const checkpoint = () =>
  tacticalMatchStateSchema.parse(
    JSON.parse(
      gunzipSync(
        readFileSync(
          new URL('../../../docs/performance/pr217/checkpoint-original.json.gz', import.meta.url),
        ),
      ).toString(),
    ).initial,
  ) as unknown as TacticalMatchState;

const incident = () =>
  JSON.parse(
    gunzipSync(
      readFileSync(
        new URL('../../../docs/performance/pr217/incident-before-handoff.json.gz', import.meta.url),
      ),
    ).toString(),
  ) as { initial: TacticalMatchState; originalTerminal: TacticalMatchState };

it('preserves the bouncing ball at the exact committed-challenge handoff, then finds its real foot contact', () => {
  let state = incident().initial;
  const before = state;
  state = stepTacticalMatch(state, 0.025);
  expect(state.ball.height).toBeCloseTo(0.13554646484944838, 10);
  expect(state.ball.velocity?.z).toBeCloseTo(-1.0231790602736406, 10);
  expect(state.ball.spin).toBeDefined();
  const foot = deriveLowerBodyGeometry(state.players.find((p) => p.id === 'footballer_pro_9_19')!)
    .left.foot;
  expect(
    Math.hypot(foot.x - state.ball.x, foot.y - state.ball.y, foot.z - state.ball.height!) - 0.145,
  ).toBeCloseTo(0.006342122992161303, 10);
  const next = stepTacticalMatch(state, 0.025);
  expect(next.lastGroundContact?.actorId).toBe('footballer_pro_9_19');
  expect(next.lastGroundContact?.at).toBeCloseTo(295.70356882032144, 8);
  expect(next.lastGroundContact?.surfaceContact?.available).toBe(true);
  for (let i = 0; i < 80; i++) state = stepTacticalMatch(state, 0.025);
  expect(state.executionWitnesses?.unresolved).toBeUndefined();
  expect(state.safetyHalt).toBeUndefined();
  for (const player of state.players) {
    const old = before.players.find((p) => p.id === player.id)!;
    expect(player.fitness!.workload.seconds - old.fitness!.workload.seconds).toBeCloseTo(
      state.time - before.time,
      7,
    );
  }
});

it('preserves an already invalid foot-ball snapshot and cannot repeatedly resume it', () => {
  const original = incident().originalTerminal;
  const halted = stepTacticalMatch(original, 0.025);
  expect(halted.time).toBe(original.time);
  expect(halted.ball).toEqual(original.ball);
  expect(halted.players).toEqual(original.players);
  expect(halted.safetyHalt?.reason).toBe('initial_penetration');
  expect(halted.safetyHalt?.actorIds).toEqual(['footballer_pro_9_19']);
  expect(halted.safetyHalt?.gap).toBeLessThan(0);
  expect(stepTacticalMatch(halted, 0.025)).toBe(halted);
});

it('distinguishes team control of a delivery from a credited pass', () => {
  const pass = checkpoint().lastResolvedPass!;
  const controlled = {
    ...pass,
    finalResult: 'completed' as const,
    actualContactPoint: { x: 1, y: 2 },
    resolvedAt: 10,
  };
  expect(passCompletionCredit({ ...controlled, actualReceiverId: pass.passerId })).toBe(
    'passer_recovery',
  );
  expect(passCompletionCredit({ ...controlled, actualReceiverId: pass.intendedReceiverId })).toBe(
    'credited',
  );
  expect(passCompletionCredit({ ...controlled, finalResult: 'technical_error' })).toBe(
    'not_completed',
  );
});

it('classifies real control according to an incoming delivery or an already loose ball', () => {
  const state = checkpoint();
  expect(physicalAcquisitionCause({ ...state, ball: { x: 50, y: 30, travelKind: 'pass' } })).toBe(
    'interception',
  );
  expect(
    physicalAcquisitionCause({ ...state, ball: { x: 50, y: 30, looseSince: state.time } }),
  ).toBe('claim');
  expect(physicalAcquisitionCause({ ...state, ball: { x: 50, y: 30, travelKind: 'shot' } })).toBe(
    'claim',
  );
});

it('hands an actually settled throw-in to ordinary recovery without changing ball momentum or granting possession', () => {
  const state = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL('../../../docs/performance/pr217/settled-throw-in-v3.json.gz', import.meta.url),
      ),
    ).toString(),
  ).initial as TacticalMatchState;
  expect(state.ball.travelKind).toBe('throw_in');
  const next = stepTacticalMatch(state, 0.025);
  expect(next.ball.travelKind).toBeUndefined();
  expect(next.ball.ownerId).toBeUndefined();
  expect(next.ball.x).toBe(state.ball.x);
  expect(next.ball.y).toBe(state.ball.y);
  expect(next.ball.height).toBe(state.ball.height);
  expect(next.ball.velocity).toEqual(state.ball.velocity);
  expect(next.ball.looseSince).toBe(next.time);
  expect(next.lastPassDiagnostic?.finalResult).toBe('unclaimed');
});

it('preserves the physical height of the recorded historical lofted release', () => {
  const state = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL('../../../docs/performance/pr217/lofted-handoff-v1.json.gz', import.meta.url),
      ),
    ).toString(),
  ).initial as TacticalMatchState;
  const next = stepTacticalMatch(state, 0.025);
  expect(next.ball.travelKind).toBe('pass');
  expect(next.ball.height).toBeGreaterThan(0.11);
  expect(next.ball.spin).toBeDefined();
  expect(stepTacticalMatch(next, 0.025).safetyHalt).toBeUndefined();
});

it('admits the actual playtest entrant despite an older cumulative contact witness', () => {
  const state = checkpoint();
  expect(state.seed).toBe('lab-mw3xhr6o');
  expect(state.experimentalRestartPreparation).toBe(false);
  expect(state.restart?.retrieval).toBeUndefined();
  expect(substitutionBlocksRestart(state)).toBe(true);
  const next = stepTacticalMatch(state, 0.025);
  expect(next.substitutionState?.pending).toHaveLength(0);
  expect(next.players.some((p) => p.id === 'footballer_pro_1_23')).toBe(true);
  expect(next.executionWitnesses?.unresolved).toEqual(state.executionWitnesses?.unresolved);
  expect(substitutionBlocksRestart(next)).toBe(false);
  const preparing = stepTacticalMatch(next, 0.025);
  expect(preparing.restart?.retrieval?.stage).toBe('approach');
  expect(preparing.ball.ownerId).toBeUndefined();
  expect(preparing.restart?.takerId).toBe('footballer_pro_1_19');
});

it('withholds admission when the current entry interval produces a new unresolved contact', () => {
  const state = checkpoint();
  const next = stepSubstitutionInterval(state, 0.025, (_previous, moved) => ({
    ...moved,
    executionWitnesses: {
      ...moved.executionWitnesses,
      unresolved: { invoked: 13, executed: 13, at: moved.time, source: 'entry_contact' },
    },
  }));
  expect(next.substitutionState?.pending).toHaveLength(1);
  expect(next.players.some((p) => p.id === 'footballer_pro_1_23')).toBe(false);
});

it('retrieves, places and lawfully releases the saved throw-in with native reload parity', () => {
  let state = checkpoint();
  const stages = new Set<string>();
  const oldWitness = state.executionWitnesses?.unresolved;
  let thrown = false;
  for (let tick = 0; tick < 1_600; tick++) {
    const next = stepTacticalMatch(state, 0.025);
    if (tick % 200 === 0)
      expect(tacticalMatchStateSchema.parse(next)).toEqual(
        tacticalMatchStateSchema.parse(
          stepTacticalMatch(
            tacticalMatchStateSchema.parse(
              JSON.parse(JSON.stringify(state)),
            ) as unknown as TacticalMatchState,
            0.025,
          ),
        ),
      );
    state = next;
    if (state.restart?.retrieval) stages.add(state.restart.retrieval.stage);
    expect(state.executionWitnesses?.unresolved).toEqual(oldWitness);
    if (state.restart?.phase === 'release') thrown = true;
    if (thrown && !state.restart && state.scenario === 'open_play') break;
  }
  expect(stages.has('approach')).toBe(true);
  expect(stages.has('transport')).toBe(true);
  expect(stages.has('placed')).toBe(true);
  expect(thrown).toBe(true);
  expect(state.scenario).toBe('open_play');
  expect(state.restart).toBeUndefined();
});

for (const fixture of ['restart-boot-overlap-v1', 'restart-perimeter-v2', 'restart-reach-v3']) {
  it(`prepares and releases the recorded ${fixture} through actual movement without a penetration or invalid live perimeter`, () => {
    let state = JSON.parse(
      gunzipSync(
        readFileSync(
          new URL(`../../../docs/performance/pr217/${fixture}.json.gz`, import.meta.url),
        ),
      ).toString(),
    ).initial as TacticalMatchState;
    const initial = state;
    const taker = state.players.find((p) => p.id === state.restart?.takerId)!;
    const target = legalizeRestartPlayerTarget(state, taker, taker.target);
    expect(target.x).toBeGreaterThanOrEqual(0.4);
    expect(target.x).toBeLessThanOrEqual(104.6);
    expect(target.y).toBeGreaterThanOrEqual(0.4);
    expect(target.y).toBeLessThanOrEqual(67.6);
    let releasedAt: number | undefined;
    for (let tick = 0; tick < 800; tick++) {
      const opportunity = projectPlayerDecisionOpportunity(state);
      if (opportunity) {
        const option =
          opportunity.options.find((o) => o.kind === 'action' && o.action.type === 'pass') ??
          opportunity.options[0]!;
        state = applyPlayerDecision(state, opportunity, option.id);
      }
      const next = stepTacticalMatch(state, 0.025);
      expect(next.safetyHalt).toBeUndefined();
      if (releasedAt === undefined && next.ball.travelKind && !state.ball.travelKind) {
        releasedAt = next.time;
        for (const player of state.players) {
          const geometry = deriveLowerBodyGeometry(player);
          for (const foot of [geometry.left.foot, geometry.right.foot])
            expect(
              Math.hypot(
                foot.x - state.ball.x,
                foot.y - state.ball.y,
                foot.z - Math.max(0.11, state.ball.height ?? 0.11),
              ),
            ).toBeGreaterThanOrEqual(0.145 - 1e-7);
        }
      }
      state = next;
      if (releasedAt !== undefined && state.time > releasedAt + 1) break;
    }
    expect(releasedAt).toBeGreaterThan(initial.time);
    expect(state.time).toBeGreaterThan(releasedAt! + 1);
  });
}
