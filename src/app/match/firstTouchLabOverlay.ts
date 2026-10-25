import type { FirstTouchLabResult } from '../../core/matchSimulation/firstTouchLaboratory';
import type { TacticalFrame } from './tacticalRenderer/model';

/** Diagnostic truth is kept in the renderer projection, never passed back to a controller. */
export const projectFirstTouchLabOverlay = (
  result: FirstTouchLabResult,
  index: number,
  targets: boolean,
  trajectories: boolean,
): NonNullable<TacticalFrame['laboratoryLines']> => {
  const sample = result.samples[index];
  if (!sample) return [];
  const lines: NonNullable<TacticalFrame['laboratoryLines']> = [];
  const marker = (point: { x: number; y: number }, color: string) =>
    lines.push({
      color,
      points: [
        { x: point.x - 0.25, y: point.y },
        { x: point.x + 0.25, y: point.y },
        { x: point.x, y: point.y - 0.25 },
        { x: point.x, y: point.y + 0.25 },
      ],
    });
  if (trajectories && index > 0) {
    lines.push({
      color: '#fff36b',
      points: result.samples.slice(0, index + 1).map((s) => ({ ...s.ball })),
    });
    lines.push({
      color: '#79d6ff',
      points: result.samples.slice(0, index + 1).map((s) => ({ ...s.player, z: 0.14 })),
    });
  }
  if (targets) {
    marker(result.input.config.target, '#ff65d5');
    if (sample.movement) {
      marker(sample.movement.movementTarget, '#79d6ff');
      if (sample.movement.nextContact) marker(sample.movement.nextContact, '#80ff86');
    }
    const contact = result.contacts.filter((c) => c.at <= sample.at).at(-1);
    if (contact) {
      marker(contact.point, '#ffffff');
      const first =
        result.contacts.find((c) => c.playerId === result.input.player.id && c.at <= sample.at) ??
        contact;
      const velocity = result.metrics.firstRequestedVelocity;
      if (velocity)
        lines.push({
          color: '#ff65d5',
          points: [
            first.point,
            {
              x: first.point.x + velocity.x * 0.4,
              y: first.point.y + velocity.y * 0.4,
              z: Math.max(0.13, first.point.z + velocity.z * 0.4),
            },
          ],
        });
      lines.push({
        color: '#ff9a42',
        points: [
          first.point,
          {
            x: first.point.x + first.outgoingVelocity.x * 0.4,
            y: first.point.y + first.outgoingVelocity.y * 0.4,
            z: Math.max(0.13, first.point.z + first.outgoingVelocity.z * 0.4),
          },
        ],
      });
    }
  }
  return lines;
};
