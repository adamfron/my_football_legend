import { writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { performance } from 'node:perf_hooks';
import { createPr167Career, pr167World } from './pr167Fixtures';
import {
  createCareerMatchInput,
  startCareerMatch,
  finishCareerMatch,
  applyCareerMatchResult,
  CareerMatchEvidence,
} from '../src/core/careerMatchContract';
import {
  stepTacticalMatchAfterDecisionProbe,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation';
import {
  tacticalMatchStateSchema,
  type TacticalMatchState,
} from '../src/core/matchSimulation/matchState';
import {
  projectPlayerDecisionOpportunity,
  applyPlayerDecision,
} from '../src/core/matchSimulation/playerDecision';
import {
  serializeCurrentCareerSave,
  parseCareerSave,
  hydrateCareerWithWorld,
} from '../src/core/persistence';
import { advanceCareerWeek, getCurrentFixture } from '../src/core/careerWeeks';
import { pr172Manifest, pr172Hash } from './pr172Evidence';

const manifest = pr172Manifest();
const rows = [];
for (const professional of [false, true]) {
  const career = createPr167Career(professional, `pr175-career-${professional}`, 'left_winger');
  const input = createCareerMatchInput(career, pr167World);
  let state = startCareerMatch(input),
    choices = 0,
    ticks = 0,
    reloads = 0,
    activeReloads = 0,
    stalled = 0;
  const evidence = new CareerMatchEvidence(),
    start = performance.now();
  while (!['full_time', 'abandoned'].includes(state.status ?? '') && ticks++ < 430000) {
    if (state.status === 'half_time') state = startSecondHalf(state);
    const opportunity = projectPlayerDecisionOpportunity(state);
    if (opportunity) {
      const option =
        opportunity.options.find(
          (o) => o.kind === 'action' && ['pass', 'shot', 'cross'].includes(o.action.type),
        ) ?? opportunity.options[0];
      if (!option) throw new Error('Empty deliberate human choice');
      state = applyPlayerDecision(state, opportunity, option.id);
      choices++;
      evidence.observe(state);
    }
    const beforeTime = state.time;
    state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    evidence.observe(state);
    stalled = state.time === beforeTime ? stalled + 1 : 0;
    if (stalled > 20) {
      writeFileSync('../pr175-career-stalled.json', JSON.stringify(state));
      throw new Error(`Human policy did not advance at ${state.time}`);
    }
    if (ticks % 4800 === 0 || (state.combinationIntent && activeReloads < 4)) {
      const normal = tacticalMatchStateSchema.parse(state) as unknown as TacticalMatchState;
      const loaded = tacticalMatchStateSchema.parse(
        JSON.parse(JSON.stringify(state)),
      ) as unknown as TacticalMatchState;
      const continued = stepTacticalMatchAfterDecisionProbe(normal, 0.025),
        restored = stepTacticalMatchAfterDecisionProbe(loaded, 0.025);
      if (!isDeepStrictEqual(continued, restored)) {
        const canonicalEqual = isDeepStrictEqual(
          JSON.parse(JSON.stringify(continued)),
          JSON.parse(JSON.stringify(restored)),
        );
        console.log(
          JSON.stringify({
            checkpoint: state.time,
            canonicalEqual,
            completeJsonEqual: pr172Hash(continued) === pr172Hash(restored),
          }),
        );
        if (!canonicalEqual) {
          writeFileSync(
            '../pr175-career-reload-difference.json',
            JSON.stringify({ state, continued, restored }, null, 2),
          );
          throw new Error('Complete serialisable canonical continuation differs');
        }
      }
      reloads++;
      if (state.combinationIntent) activeReloads++;
    }
    if (ticks % 24000 === 0)
      console.log(
        `career professional=${professional} t=${state.time.toFixed(1)} choices=${choices}`,
      );
  }
  if (state.status !== 'full_time' || choices === 0)
    throw new Error('Career not completed with deliberate human actions');
  const result = finishCareerMatch(input, state, evidence);
  const committed = applyCareerMatchResult(career, pr167World, input, result);
  const serialized = serializeCurrentCareerSave(committed),
    parsed = parseCareerSave(serialized);
  if (!parsed.ok) throw new Error('Career save validation failed');
  const hydrated = hydrateCareerWithWorld(parsed.save.career, pr167World);
  if (applyCareerMatchResult(hydrated, pr167World, input, result) !== hydrated)
    throw new Error('Duplicate result committed');
  const next = advanceCareerWeek(hydrated);
  const row = committed.seasonParticipation?.find((r) => r.fixtureId === input.fixture.id);
  if (
    !row ||
    row.score?.home !== result.score.home ||
    row.score?.away !== result.score.away ||
    !getCurrentFixture(next)
  )
    throw new Error('Career accounting/calendar failed');
  rows.push({
    professional,
    fixture: input.fixture,
    seed: input.footballSeed,
    inputFingerprint: input.footballFingerprint,
    score: result.score,
    endedAt: result.endedAt,
    choices,
    ticks,
    reloads,
    activeReloads,
    statistics: state.statistics,
    player: row,
    participants: result.participants.length,
    substitutions: result.substitutions,
    duplicateNoOp: true,
    saveBytes: Buffer.byteLength(serialized),
    saveHash: pr172Hash(serialized),
    nextFixture: getCurrentFixture(next),
    wallMs: performance.now() - start,
  });
  console.log(`completed career professional=${professional}`);
}
writeFileSync(
  'docs/performance/PR175-career.json',
  JSON.stringify({ manifest, rows }, null, 2) + '\n',
);
