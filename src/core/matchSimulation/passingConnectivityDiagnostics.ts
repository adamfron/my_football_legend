import { z } from 'zod';
import type { TacticalMatchState } from './matchState';
import { rankAvailableActionsForAI, scoreActionForAI } from './matchActions';
import { evaluatePassDecision } from './passDecision';
import { distance, signedForwardDistance } from './matchSpace';
import { angleForVector, normalizeAngle } from './playerOrientation';

export const passDistanceBand = (metres: number) =>
  metres < 8
    ? 'very_short'
    : metres < 18
      ? 'short'
      : metres < 30
        ? 'medium'
        : metres < 45
          ? 'long'
          : 'very_long';
const distanceBandSchema = z.enum(['very_short', 'short', 'medium', 'long', 'very_long']);
const centralOptionSchema = z.object({
  at: z.number(),
  phase: z.string(),
  ownerId: z.string(),
  receiverId: z.string(),
  distance: z.number(),
  orientation: z.number(),
  markerClearance: z.number(),
  receiverEta: z.number(),
  defenderEta: z.number(),
  laneOccupation: z.number(),
  expectedCompletion: z.number(),
  uncertaintyMetres: z.number().nullable(),
  expectedReception: z.number().nullable(),
  expectedRetention: z.number().nullable(),
  credibleLane: z.boolean(),
  selectedAlternative: z.string(),
  selectedDistance: z.number(),
  utilityDifference: z.number(),
  reason: z.enum([
    'lane_occupied',
    'receiver_late',
    'defender_first',
    'execution_or_reception_risk',
    'alternative_football_value',
  ]),
});
const edgeSchema = z.object({
  passerId: z.string(),
  receiverId: z.string(),
  roles: z.string(),
  attempts: z.number(),
  completed: z.number(),
  actualReceives: z.number(),
  distanceSum: z.number(),
  distances: z.record(distanceBandSchema, z.number()),
  longSwitches: z.number(),
});
const sequenceSchema = z.object({
  at: z.number(),
  players: z.array(z.string()).max(3),
  length: z.number(),
  progression: z.number(),
  displacement: z.number(),
  returnsToSameArea: z.boolean(),
});
export const passingConnectivityEvidenceSchema = z.object({
  centralOptions: z.array(centralOptionSchema).max(512),
  centralOptionsObserved: z.number(),
  edges: z.array(edgeSchema).max(462),
  distanceDistribution: z.record(distanceBandSchema, z.number()),
  sequences: z.array(sequenceSchema).max(256),
  maximumSmallGroupSequence: z.number(),
  reciprocalAttemptShare: z.number(),
  veryLongReciprocalAttempts: z.number(),
});

/** Optional bounded observer. All selection diagnostics call the current canonical policy.
 * No observer result feeds back into positioning, action utility, statistics or random streams. */
export class PassingConnectivityTracker {
  constructor(
    private readonly probes = { rankAvailableActionsForAI, scoreActionForAI, evaluatePassDecision },
  ) {}
  private central: z.infer<typeof centralOptionSchema>[] = [];
  private edges = new Map<string, z.infer<typeof edgeSchema>>();
  private releases = new Map<string, { x: number; y: number }>();
  private sequences: z.infer<typeof sequenceSchema>[] = [];
  private recent: {
    passer: string;
    receiver: string;
    origin: { x: number; y: number };
    target: { x: number; y: number };
    team: 'home' | 'away';
  }[] = [];
  private maximumSequence = 0;
  private centralObserved = 0;
  private distances = { very_short: 0, short: 0, medium: 0, long: 0, very_long: 0 };
  observe(previous: TacticalMatchState, next: TacticalMatchState) {
    const pass = next.lastPassDiagnostic;
    if (pass && pass.passId !== previous.lastPassDiagnostic?.passId) {
      const actor = previous.players.find((p) => p.id === pass.passerId);
      const receiver = previous.players.find((p) => p.id === pass.intendedReceiverId);
      if (!actor || !receiver) return;
      const target = pass.intendedTarget ?? pass.predictedReceptionPoint;
      const metres = distance(previous.ball, target),
        band = passDistanceBand(metres);
      this.distances[band]++;
      const key = `${actor.id}:${receiver.id}`;
      this.releases.set(pass.passId, { x: previous.ball.x, y: previous.ball.y });
      if (this.releases.size > 64) this.releases.delete(this.releases.keys().next().value!);
      const edge = this.edges.get(key) ?? {
        passerId: actor.id,
        receiverId: receiver.id,
        roles: `${actor.slot.position}->${receiver.slot.position}`,
        attempts: 0,
        completed: 0,
        actualReceives: 0,
        distanceSum: 0,
        distances: { very_short: 0, short: 0, medium: 0, long: 0, very_long: 0 },
        longSwitches: 0,
      };
      edge.attempts++;
      edge.distanceSum += metres;
      edge.distances[band]++;
      edge.longSwitches += Number(metres >= 30 && Math.abs(target.y - previous.ball.y) >= 24);
      this.edges.set(key, edge);
      const ranking = this.probes.rankAvailableActionsForAI(previous, actor.id);
      const selected = ranking.find(
        (r) => r.action.type === 'pass' && r.action.receiverId === receiver.id,
      );
      const releasedAction = next.latestAction;
      const selectedScore =
        releasedAction?.type === 'pass' && releasedAction.actorId === actor.id
          ? this.probes.scoreActionForAI(previous, actor.id, releasedAction)
          : (selected?.canonicalScore ?? ranking[0]?.canonicalScore ?? 0);
      for (const r of ranking) {
        if (r.action.type !== 'pass') continue;
        const action = r.action;
        const candidate = previous.players.find((p) => p.id === action.receiverId)!;
        if (candidate.slot.position !== 'central_midfielder') continue;
        const q = this.probes.evaluatePassDecision(
          previous,
          actor,
          candidate,
          r.action.target,
          r.action.intent,
          r.action.delivery,
        );
        const markerClearance = Math.min(
          99,
          ...previous.players
            .filter((p) => p.team !== actor.team)
            .map((p) => distance(p.position, candidate.position)),
        );
        const credible =
          q.laneOccupation === 0 && q.receiverLateBy < 0.3 && q.expectedCompletion > 0.5;
        const reason = q.laneOccupation
          ? 'lane_occupied'
          : q.receiverLateBy > 0.3
            ? 'receiver_late'
            : q.defenderEta < q.receiverEta
              ? 'defender_first'
              : (q.expectedRetainedPossession ?? q.expectedCompletion) < 0.6
                ? 'execution_or_reception_risk'
                : 'alternative_football_value';
        this.centralObserved++;
        this.central.push({
          at: previous.time,
          phase: previous.teams[actor.team].phase,
          ownerId: actor.id,
          receiverId: candidate.id,
          distance: q.length,
          orientation: Math.abs(
            normalizeAngle(
              candidate.facingAngle -
                angleForVector({
                  x: actor.position.x - candidate.position.x,
                  y: actor.position.y - candidate.position.y,
                }),
            ),
          ),
          markerClearance,
          receiverEta: q.receiverEta,
          defenderEta: q.defenderEta,
          laneOccupation: q.laneOccupation,
          expectedCompletion: q.expectedCompletion,
          uncertaintyMetres: q.executionUncertaintyMetres ?? null,
          expectedReception: q.expectedReceptionQuality ?? null,
          expectedRetention: q.expectedRetainedPossession ?? null,
          credibleLane: credible,
          selectedAlternative: receiver.id,
          selectedDistance: metres,
          utilityDifference: selectedScore - r.canonicalScore,
          reason,
        });
      }
      this.central = this.central.slice(-512);
    }
    const result = next.lastResolvedPass;
    if (
      result?.finalResult === 'completed' &&
      result.passId !== previous.lastResolvedPass?.passId
    ) {
      const actual = result.actualReceiverId ?? result.intendedReceiverId;
      const edge = this.edges.get(`${result.passerId}:${result.intendedReceiverId}`);
      if (edge && actual === result.intendedReceiverId) edge.completed++;
      const actor = next.players.find((p) => p.id === result.passerId);
      if (!actor) return;
      const receiver = next.players.find((p) => p.id === actual);
      if (receiver) {
        const key = `${actor.id}:${actual}`;
        const realized = this.edges.get(key) ?? {
          passerId: actor.id,
          receiverId: actual,
          roles: `${actor.slot.position}->${receiver.slot.position}`,
          attempts: 0,
          completed: 0,
          actualReceives: 0,
          distanceSum: 0,
          distances: { very_short: 0, short: 0, medium: 0, long: 0, very_long: 0 },
          longSwitches: 0,
        };
        realized.actualReceives++;
        this.edges.set(key, realized);
      }
      const origin =
        this.releases.get(result.passId) ??
        previous.players.find((p) => p.id === actor.id)?.position ??
        previous.ball;
      this.releases.delete(result.passId);
      const target = result.actualContactPoint ?? result.predictedReceptionPoint;
      if (this.recent.at(-1)?.receiver !== actor.id || this.recent.at(-1)?.team !== actor.team)
        this.recent = [];
      this.recent.push({ passer: actor.id, receiver: actual, origin, target, team: actor.team });
      while (new Set(this.recent.flatMap((p) => [p.passer, p.receiver])).size > 3)
        this.recent.shift();
      this.recent = this.recent.slice(-64);
      this.maximumSequence = Math.max(this.maximumSequence, this.recent.length);
      if (this.recent.length >= 4) {
        const first = this.recent[0]!;
        const displacement = distance(first.origin, target);
        this.sequences.push({
          at: next.time,
          players: [...new Set(this.recent.flatMap((p) => [p.passer, p.receiver]))],
          length: this.recent.length,
          progression: signedForwardDistance(first.origin, target, actor.team),
          displacement,
          returnsToSameArea: displacement < 3,
        });
        this.sequences = this.sequences.slice(-256);
      }
    }
  }
  snapshot() {
    const edges = [...this.edges.values()];
    const total = edges.reduce((s, e) => s + e.attempts, 0);
    const paired = edges.reduce(
      (s, e) =>
        s + Math.min(e.attempts, this.edges.get(`${e.receiverId}:${e.passerId}`)?.attempts ?? 0),
      0,
    );
    const longPaired = edges.reduce(
      (s, e) =>
        s +
        Math.min(
          e.distances.very_long,
          this.edges.get(`${e.receiverId}:${e.passerId}`)?.distances.very_long ?? 0,
        ),
      0,
    );
    return passingConnectivityEvidenceSchema.parse({
      centralOptions: this.central,
      centralOptionsObserved: this.centralObserved,
      edges: edges.sort((a, b) => b.attempts - a.attempts),
      distanceDistribution: this.distances,
      sequences: this.sequences,
      maximumSmallGroupSequence: this.maximumSequence,
      reciprocalAttemptShare: paired / Math.max(1, total),
      veryLongReciprocalAttempts: longPaired,
    });
  }
}
