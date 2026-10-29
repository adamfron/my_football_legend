import type { BoundedScene } from './boundedPerception';
import type { Situation } from './situationalAwarenessState';
import { distance } from './matchSpace';

/** Consumes a direct, whitelisted scene and prior memory only. No world, release
 * metadata, physical velocity/spin, private intentions or future random state. */
export const updateSituation = (scene: BoundedScene, old?: Situation): Situation => {
  const now = scene.at;
  const direct =
    scene.ball && Math.abs((scene.ball.observedAt ?? -10) - now) < 1e-7 ? scene.ball : null;
  const evidenceAt = direct ? now : old?.ball?.evidenceAt;
  const age = evidenceAt === undefined ? Infinity : Math.max(0, now - evidenceAt);
  const position = direct?.position ?? old?.ball?.position;
  // Coarse orientation can outlive precise flight tracking. This is the last
  // seen location with a growing radius, never the hidden current coordinates.
  const ball: Situation['ball'] =
    position && age <= 3
      ? {
          position: { ...position },
          evidenceAt: evidenceAt!,
          source: direct ? 'direct' : 'remembered',
          uncertainty: direct
            ? (direct.uncertainty ?? 0.15)
            : old!.ball!.uncertainty + (now - old!.reviewedAt) * 4,
          confidence: Math.max(0, 0.9 * (1 - age / 3)),
          sector: {
            length: Math.max(0, Math.min(2, Math.floor(position.x / 35))),
            width: Math.max(0, Math.min(2, Math.floor(position.y / (68 / 3)))),
          },
        }
      : null;
  const opticalMotion =
    direct &&
    direct.motionEvidenceAt !== null &&
    direct.motionEvidenceAt !== undefined &&
    now - direct.motionEvidenceAt < 0.3 &&
    Math.hypot(direct.velocity.x, direct.velocity.y) > 4;
  const nearby =
    direct && direct.height < 0.7
      ? scene.visible
          .filter((p) => distance(p.position, direct.position) < 1.5)
          .sort(
            (a, b) =>
              distance(a.position, direct.position) - distance(b.position, direct.position) ||
              a.id.localeCompare(b.id),
          )
      : [];
  const unambiguous =
    nearby[0] &&
    (!nearby[1] ||
      distance(nearby[1].position, direct!.position) >
        distance(nearby[0].position, direct!.position) + 0.6);
  const candidate = unambiguous ? nearby[0] : undefined;
  const moving = opticalMotion && !candidate;
  const possessor: Situation['possessor'] = candidate
    ? {
        id: candidate.id,
        team: candidate.team,
        evidenceAt: now,
        source: 'inferred',
        confidence: Math.min(0.75, ball!.confidence),
      }
    : !direct && ball && old?.possessor && now - old.possessor.evidenceAt < 1.2
      ? {
          ...old.possessor,
          source: 'remembered',
          confidence: Math.max(0, 0.75 * (1 - (now - old.possessor.evidenceAt) / 1.2)),
        }
      : null;
  const phase = moving
    ? 'flight'
    : possessor
      ? possessor.team === scene.team
        ? 'team_possession'
        : 'opponent_possession'
      : 'unknown';
  return {
    reviewedAt: now,
    ball,
    possessor,
    phase,
    phaseSource: phase === 'unknown' ? 'unknown' : direct ? 'inferred' : 'remembered',
    changedAt:
      old && old.phase === phase && old.possessor?.id === possessor?.id ? old.changedAt : now,
  };
};
