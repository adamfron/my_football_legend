import { z } from 'zod';
import { RealismEvidence as BaseRealismEvidence } from './pr183Observation';
import { attacksRight, physicalPointSchema } from '../src/core/matchSimulation/matchSpace';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';

export const retreatExcursionSchema = z.object({
  id: z.string(),
  team: z.enum(['home', 'away']),
  at: z.number().nonnegative(),
  endAt: z.number().nonnegative(),
  peakAt: z.number().nonnegative(),
  origin: physicalPointSchema,
  end: physicalPointSchema,
  peak: physicalPointSchema,
  peakMetres: z.number().nonnegative(),
  netMetres: z.number().finite(),
  recoveredForwardMetres: z.number().nonnegative(),
  duration: z.number().nonnegative(),
  meanPressure: z.number().min(0).max(1),
  pressureAtPeak: z.number().min(0).max(1),
  endedWithPass: z.boolean(),
});
type Excursion = z.infer<typeof retreatExcursionSchema>;

/** Peak own-goal displacement, including a later recovery which can conceal it in a net-only metric. */
export class RealismEvidence extends BaseRealismEvidence {
  private episode?: {
    id: string;
    team: 'home' | 'away';
    at: number;
    dir: number;
    origin: { x: number; y: number };
    end: { x: number; y: number };
    peak: { x: number; y: number };
    peakMetres: number;
    peakAt: number;
    pressureAtPeak: number;
    pressureIntegral: number;
    seconds: number;
  };
  private excursions: Excursion[] = [];
  private row(state: TacticalMatchState, endAt: number): Excursion | undefined {
    const e = this.episode;
    if (!e || e.peakMetres <= 6 || endAt - e.at < 3) return undefined;
    const netMetres = (e.origin.x - e.end.x) * e.dir;
    return retreatExcursionSchema.parse({
      id: e.id,
      team: e.team,
      at: e.at,
      endAt,
      peakAt: e.peakAt,
      origin: e.origin,
      end: e.end,
      peak: e.peak,
      peakMetres: e.peakMetres,
      netMetres,
      recoveredForwardMetres: Math.max(0, e.peakMetres - netMetres),
      duration: endAt - e.at,
      meanPressure: e.seconds > 0 ? e.pressureIntegral / e.seconds : 0,
      pressureAtPeak: e.pressureAtPeak,
      endedWithPass:
        state.lastPassDiagnostic?.passerId === e.id && state.lastPassDiagnostic.releasedAt >= e.at,
    });
  }
  override observe(previous: TacticalMatchState, next: TacticalMatchState) {
    super.observe(previous, next);
    const owner = next.players.find((p) => p.id === next.ball.ownerId);
    if (owner?.id !== this.episode?.id) {
      const row = this.row(next, previous.time);
      if (row) this.excursions.push(row);
      this.episode = owner
        ? {
            id: owner.id,
            team: owner.team,
            at: next.time,
            dir: attacksRight(owner) ? 1 : -1,
            origin: { ...owner.position },
            end: { ...owner.position },
            peak: { ...owner.position },
            peakMetres: 0,
            peakAt: next.time,
            pressureAtPeak: next.currentPressure,
            pressureIntegral: 0,
            seconds: 0,
          }
        : undefined;
      return;
    }
    if (owner && this.episode) {
      const e = this.episode,
        dt = next.time - previous.time;
      e.end = { ...owner.position };
      e.seconds += dt;
      e.pressureIntegral += next.currentPressure * dt;
      const retreat = (e.origin.x - owner.position.x) * e.dir;
      if (retreat > e.peakMetres) {
        e.peakMetres = retreat;
        e.peakAt = next.time;
        e.peak = { ...owner.position };
        e.pressureAtPeak = next.currentPressure;
      }
    }
  }
  override export(state: TacticalMatchState) {
    const current = this.row(state, state.time);
    return {
      ...super.export(state),
      excursionDefinition:
        'Maximum own-goal displacement during a continuous owner episode (>6m peak, >=3s); net displacement and recovered forward metres retained separately. No production limit.',
      retreatExcursions: current ? [...this.excursions, current] : this.excursions,
    };
  }
}
