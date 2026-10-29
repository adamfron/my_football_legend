import { describe, expect, it } from 'vitest';
import { createProspectiveFixture } from './prospectivePlayLaboratory';
import { advanceActivePerception } from './activePerception';
import { advanceLiveBallFlight } from './liveBallFlight';
import { advanceReceivingPositions, evaluateProspectivePosition, receivingPositionTarget } from './receivingPositions';

const supportedFixture = () => {
  const f = createProspectiveFixture({ seed: 'pr204-continuity' });
  const s = advanceReceivingPositions(advanceActivePerception(advanceLiveBallFlight(f.state)));
  const job = s.activePerceptionRuntime!.positions[f.c.id]!;
  const memory = s.activePerceptionRuntime!.memory[f.c.id]!;
  s.time = job.prospective!.horizonAt + 0.01;
  s.prospectiveMovement = 'two-pass-continuity-dev-v1';
  delete s.integrationProfile; // explicit development intervention, not a saved profile
  const intermediary = memory.entities.find((p) => p.id === f.b.id)!;
  intermediary.observedAt = s.time;
  memory.directIds = [f.b.id];
  memory.situation!.possessor = {
    id: f.b.id, team: f.b.team, evidenceAt: s.time, source: 'inferred', confidence: 0.75,
  };
  memory.situation!.phase = 'team_possession';
  job.prospective!.status = 'supported';
  return { ...f, state: s, job, memory };
};

describe('PR204 supported-intention development intervention', () => {
  it('refreshes on the first supported observation before the original expiry', () => {
    const f = supportedFixture();
    f.state.time = f.job.prospective!.horizonAt - 0.2;
    f.job.prospective!.status = 'conditional';
    f.memory.situation!.possessor!.evidenceAt = f.state.time;
    f.memory.entities.find((p) => p.id === f.b.id)!.observedAt = f.state.time;
    const next = evaluateProspectivePosition(f.state, f.c, f.job)!;
    expect(next.prospective?.status).toBe('supported');
    expect(next.expiresAt).toBeGreaterThan(f.job.prospective!.horizonAt);
    f.state.activePerceptionRuntime!.positions[f.c.id] = next;
    expect(receivingPositionTarget({ ...f.state, time: f.job.prospective!.horizonAt + 0.025 }, f.c)).toEqual(f.job.target);
  });
  it('refreshes the same target only while the intermediary has fresh lawful evidence', () => {
    const f = supportedFixture();
    const next = evaluateProspectivePosition(f.state, f.c, f.job)!;
    expect(next.prospective?.status).toBe('supported');
    expect(next.target).toEqual(f.job.target);
    expect(next.expiresAt).toBeGreaterThan(f.state.time);
    expect(next.expiresAt).toBeLessThanOrEqual(f.memory.situation!.possessor!.evidenceAt + 0.6);
    f.state.activePerceptionRuntime!.positions[f.c.id] = next;
    expect(receivingPositionTarget(f.state, f.c)).toEqual(f.job.target);
    expect(receivingPositionTarget({ ...f.state, time: next.expiresAt + 0.001 }, f.c)).toBeUndefined();
  });
  it('preserves historical expiry and never extends a conditional prediction', () => {
    const f = supportedFixture();
    f.state.prospectiveMovement = 'two-pass-v1';
    expect(evaluateProspectivePosition(f.state, f.c, f.job)?.prospective?.status).toBe('withdrawn');
    f.state.prospectiveMovement = 'two-pass-continuity-dev-v1';
    f.job.prospective!.status = 'conditional';
    expect(evaluateProspectivePosition(f.state, f.c, f.job)?.prospective?.status).toBe('withdrawn');
  });
  it('withdraws with stale or contradictory evidence, an unseen intermediary, or a protected role', () => {
    for (const mode of ['stale', 'opponent', 'unseen', 'role'] as const) {
      const f = supportedFixture();
      if (mode === 'stale') f.memory.situation!.possessor!.evidenceAt = f.state.time - 0.61;
      if (mode === 'opponent') f.memory.situation!.possessor!.team = f.opponent.team;
      if (mode === 'unseen') f.memory.directIds = [];
      if (mode === 'role') f.c.duty = 'defend';
      expect(evaluateProspectivePosition(f.state, f.c, f.job)?.prospective?.status).toBe('withdrawn');
    }
  });
  it('withdraws a protected role even before the original horizon', () => {
    for (const role of ['duty', 'center_back'] as const) {
      const f = supportedFixture();
      f.state.time = f.job.prospective!.horizonAt - 0.2;
      if (role === 'duty') f.c.duty = 'defend';
      else f.c.slot = { ...f.c.slot, position: 'center_back' };
      const job = evaluateProspectivePosition(f.state, f.c, f.job)!;
      expect(job.prospective?.status).toBe('withdrawn');
      expect(job.reason).toBe('carrier_unavailable_or_role_protected');
    }
  });
  it('withdraws on freshly observed fast ball motion near visible B, not hidden velocity', () => {
    const f = supportedFixture();
    f.state.time = f.job.prospective!.horizonAt - 0.2;
    f.memory.situation!.possessor!.evidenceAt = f.state.time;
    f.memory.entities.find((p) => p.id === f.b.id)!.observedAt = f.state.time;
    const sensor = f.state.liveBallFlightRuntime!.sensors[f.c.id]!;
    const belief = sensor.belief!;
    belief.evidenceAt = f.state.time;
    belief.motionEvidenceAt = f.state.time;
    belief.velocity = { x: 10, y: 0, z: 0 };
    belief.lastObservation = {
      at: f.state.time, position: { ...f.b.position, z: 0.11 }, positionError: 0.02,
    };
    const next = evaluateProspectivePosition(f.state, f.c, f.job)!;
    expect(next.reason).toBe('observed_flight_contradicts_supported_possession');
    const hidden = structuredClone(f.state);
    hidden.ball.velocity = { x: -100, y: 100, z: 0 };
    expect(evaluateProspectivePosition(hidden, hidden.players.find((p) => p.id === f.c.id)!, f.job)).toEqual(next);
    belief.motionEvidenceAt = f.state.time - 0.31;
    expect(evaluateProspectivePosition(f.state, f.c, f.job)?.reason).not.toBe('observed_flight_contradicts_supported_possession');
  });
  it('lets a real reception, human control and a restart preempt the support target', () => {
    const f = supportedFixture();
    f.state.activePerceptionRuntime!.positions[f.c.id] = evaluateProspectivePosition(f.state, f.c, f.job)!;
    const receiving = { ...f.state, receptionPreparation: { ...f.state.receptionPreparation!, actorId: f.c.id } };
    expect(receivingPositionTarget(receiving, f.c)).toBeUndefined();
    f.state.controlledFootballerId = f.c.id;
    const human = advanceReceivingPositions({ ...f.state, time: f.state.time + 0.4 });
    expect(human.activePerceptionRuntime!.positions[f.c.id]).toBeUndefined();
    expect(receivingPositionTarget({ ...f.state, postGoal: {} as NonNullable<typeof f.state.postGoal> }, f.c)).toBeUndefined();
  });
});
