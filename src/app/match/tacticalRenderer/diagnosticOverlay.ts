import { z } from 'zod';
import { BALL_RADIUS } from '../../../core/matchSimulation/ballFlight';
import { type TacticalFrame, type TacticalPlayer, type TacticalPoint } from './model';

export const tacticalDiagnosticOptionsSchema = z.object({
  identity: z.boolean(),
  movement: z.boolean(),
  shape: z.boolean(),
  assignments: z.boolean(),
  contacts: z.boolean(),
  fitness: z.boolean(),
  ball: z.boolean(),
});
export type TacticalDiagnosticOptions = z.infer<typeof tacticalDiagnosticOptionsSchema>;
export const DEFAULT_TACTICAL_DIAGNOSTICS: TacticalDiagnosticOptions = {
  identity: false,
  movement: false,
  shape: false,
  assignments: false,
  contacts: false,
  fitness: false,
  ball: false,
};
export const DIAGNOSTIC_COLORS = {
  actual: 0xffffff,
  movement: 0xf3d65f,
  anchor: 0x60a6ff,
  tactical: 0xcb8cff,
  facing: 0xa6eedc,
  assignment: 0xff94a4,
  contact: 0xffa65e,
  ball: 0xffffff,
} as const;
const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  height: z.number().finite().optional(),
});
export const diagnosticLineSchema = z.object({
  start: pointSchema,
  end: pointSchema,
  color: z.number().int().nonnegative(),
  kind: z.enum([
    'actual',
    'velocity',
    'facing',
    'movement',
    'anchor',
    'tactical',
    'assignment',
    'contact',
    'ball',
  ]),
  playerId: z.string().optional(),
});
export const diagnosticLabelSchema = z.object({
  id: z.string(),
  position: pointSchema,
  text: z.string(),
});
export type DiagnosticLine = z.infer<typeof diagnosticLineSchema>;
export type DiagnosticLabel = z.infer<typeof diagnosticLabelSchema>;
export const MAX_DIAGNOSTIC_LINES = 640;

/** Every landmark is separately projected. Missing persisted assignments stay unobservable. */
export const projectTacticalDiagnostics = (
  frame: TacticalFrame,
  options: TacticalDiagnosticOptions,
) => {
  const lines: DiagnosticLine[] = [];
  const labels: DiagnosticLabel[] = [];
  if (!Object.values(options).some(Boolean)) return { lines, labels };
  const line = (
    start: TacticalPoint,
    end: TacticalPoint,
    kind: DiagnosticLine['kind'],
    color: number,
    playerId?: string,
  ) => {
    if (lines.length < MAX_DIAGNOSTIC_LINES)
      lines.push({
        start: { ...start },
        end: { ...end },
        kind,
        color,
        ...(playerId ? { playerId } : {}),
      });
  };
  const cross = (
    point: TacticalPoint,
    kind: DiagnosticLine['kind'],
    color: number,
    playerId?: string,
    size = 0.45,
  ) => {
    line(
      { x: point.x - size, y: point.y },
      { x: point.x + size, y: point.y },
      kind,
      color,
      playerId,
    );
    line(
      { x: point.x, y: point.y - size },
      { x: point.x, y: point.y + size },
      kind,
      color,
      playerId,
    );
  };
  const playerById = new Map(frame.players.map((player) => [player.id, player]));
  for (const player of frame.players) {
    const labelParts: string[] = [];
    if (options.identity)
      labelParts.push(
        `${player.displayNumber ?? player.id} ${player.role ?? '?'} / ${player.duty ?? '?'}`,
      );
    if (options.movement) {
      cross(player, 'actual', DIAGNOSTIC_COLORS.actual, player.id, 0.27);
      if (player.target) {
        line(player, player.target, 'movement', DIAGNOSTIC_COLORS.movement, player.id);
        cross(player.target, 'movement', DIAGNOSTIC_COLORS.movement, player.id);
      }
      const velocity = player.velocity;
      if (velocity && Math.hypot(velocity.x, velocity.y) > 0.05)
        line(
          player,
          { x: player.x + velocity.x * 0.6, y: player.y + velocity.y * 0.6 },
          'velocity',
          DIAGNOSTIC_COLORS.actual,
          player.id,
        );
      if (player.facing !== undefined)
        line(
          player,
          {
            x: player.x + Math.sin(player.facing) * 1.6,
            y: player.y + Math.cos(player.facing) * 1.6,
          },
          'facing',
          DIAGNOSTIC_COLORS.facing,
          player.id,
        );
      if (Math.abs(player.angularVelocity ?? 0) > 0.3)
        labelParts.push(`obrót ${((player.angularVelocity! * 180) / Math.PI).toFixed(0)}°/s`);
    }
    if (options.shape) {
      for (const [kind, point, color] of [
        ['anchor', player.anchor, DIAGNOSTIC_COLORS.anchor],
        ['tactical', player.idealTarget, DIAGNOSTIC_COLORS.tactical],
      ] as const)
        if (point) {
          line(player, point, kind, color, player.id);
          cross(point, kind, color, player.id);
        }
    }
    if (options.assignments) {
      const ids = [
        player.markingTargetId,
        player.pressAssignment?.targetId,
        player.defensive?.targetId,
      ];
      for (const id of new Set(ids)) {
        const target = id && playerById.get(id);
        if (target) line(player, target, 'assignment', DIAGNOSTIC_COLORS.assignment, player.id);
      }
      if (player.supportAssignment) {
        line(
          player,
          player.supportAssignment.target,
          'assignment',
          DIAGNOSTIC_COLORS.assignment,
          player.id,
        );
        cross(
          player.supportAssignment.target,
          'assignment',
          DIAGNOSTIC_COLORS.assignment,
          player.id,
        );
        labelParts.push(player.supportAssignment.kind);
      }
      if (player.pressAssignment || player.defensive)
        labelParts.push((player.pressAssignment ?? player.defensive)!.intent);
      // Unpersisted marking/support decisions are never recomputed just to fill an overlay.
    }
    if (options.contacts && player.contact) {
      const contact = player.contact;
      if (contact.plannedPoint) {
        line(player, contact.plannedPoint, 'contact', DIAGNOSTIC_COLORS.contact, player.id);
        cross(contact.plannedPoint, 'contact', DIAGNOSTIC_COLORS.contact, player.id, 0.2);
      }
      if (
        contact.lastPoint &&
        contact.lastAtMs !== undefined &&
        frame.timestampMs - contact.lastAtMs < 220
      )
        cross(contact.lastPoint, 'contact', DIAGNOSTIC_COLORS.actual, player.id, 0.24);
      labelParts.push(
        `${contact.region ?? '?'} · ${contact.physicalCount ?? '?'} kontaktów${contact.nextFailed ? ' · błąd' : contact.retained === false ? ' · strata' : ''}`,
      );
      if (contact.plannedAtMs !== undefined)
        labelParts.push(`plan ${Math.round(contact.plannedAtMs - frame.timestampMs)} ms`);
    }
    if (options.fitness && player.fitness) {
      labelParts.push(
        `pojemność ${Math.round(player.fitness.capacity * 100)}% / gotowość ${Math.round(player.fitness.burstReadiness * 100)}%`,
      );
      if (player.injury) labelParts.push(`uraz: ${player.injury.status}`);
      if (player.participation && player.participation !== 'active')
        labelParts.push(player.participation);
    }
    if (labelParts.length)
      labels.push({
        id: player.id,
        position: { x: player.x, y: player.y, height: 2.5 },
        text: labelParts.join(' · '),
      });
  }
  if (options.ball) {
    for (let step = 0; step < 24; step++) {
      const a = (step * Math.PI * 2) / 24,
        b = ((step + 1) * Math.PI * 2) / 24;
      line(
        {
          x: frame.ball.x + Math.cos(a) * BALL_RADIUS,
          y: frame.ball.y + Math.sin(a) * BALL_RADIUS,
        },
        {
          x: frame.ball.x + Math.cos(b) * BALL_RADIUS,
          y: frame.ball.y + Math.sin(b) * BALL_RADIUS,
        },
        'ball',
        DIAGNOSTIC_COLORS.ball,
      );
    }
    if (frame.ball.velocity)
      line(
        frame.ball,
        {
          x: frame.ball.x + frame.ball.velocity.x * 0.35,
          y: frame.ball.y + frame.ball.velocity.y * 0.35,
        },
        'ball',
        DIAGNOSTIC_COLORS.contact,
      );
    labels.push({
      id: 'ball',
      position: { x: frame.ball.x, y: frame.ball.y, height: (frame.ball.height ?? 0) + 0.8 },
      text: `piłka (${frame.ball.x.toFixed(3)}, ${frame.ball.y.toFixed(3)}) · r=${BALL_RADIUS} m${frame.restart ? ` · ${frame.restart.phase}` : ''}`,
    });
  }
  return { lines, labels };
};

/** Synthetic diagnostic of canonical-like facts; deliberately not a tactical-success benchmark. */
export const createTacticalDiagnosticFixture = (): TacticalFrame => {
  const actor = (
    id: string,
    team: TacticalPlayer['team'],
    x: number,
    y: number,
    additions: Partial<TacticalPlayer>,
  ): TacticalPlayer => ({
    id,
    team,
    x,
    y,
    facing: team === 'home' ? Math.PI / 2 : -Math.PI / 2,
    velocity: { x: 0, y: 0 },
    role: 'CM',
    duty: 'support',
    fitness: { capacity: 0.86, burstReadiness: 0.62 },
    ...additions,
  });
  return {
    timestampMs: 12000,
    continuity: 'pr161-diagnostic-fixture',
    ball: { x: 57.32, y: 32.08, ownerId: 'carrier', height: 0, velocity: { x: 0.8, y: 0.15 } },
    players: [
      actor('carrier', 'home', 57, 32, {
        displayNumber: 8,
        preparation: 'turning',
        angularVelocity: 2.2,
        target: { x: 59, y: 34 },
        anchor: { x: 52, y: 26 },
        idealTarget: { x: 56, y: 29 },
        contact: {
          physicalCount: 7,
          balance: 0.54,
          region: 'left_foot',
          plannedAtMs: 12120,
          plannedPoint: { x: 57.5, y: 32.18 },
          lastAtMs: 11820,
          lastRegion: 'right_foot',
          lastPoint: { x: 57.22, y: 31.97 },
          retained: true,
        },
      }),
      actor('pivot', 'home', 49, 36, {
        displayNumber: 6,
        velocity: { x: 1.3, y: -0.7 },
        target: { x: 52, y: 34 },
        anchor: { x: 46, y: 35 },
        idealTarget: { x: 51, y: 34 },
        supportAssignment: { kind: 'pivot', target: { x: 52, y: 34 } },
      }),
      actor('lane', 'home', 65, 41, {
        displayNumber: 10,
        duty: 'attack',
        velocity: { x: 0.7, y: -1.1 },
        target: { x: 67, y: 36 },
        anchor: { x: 65, y: 47 },
        idealTarget: { x: 67, y: 36 },
        supportAssignment: { kind: 'passing_lane', target: { x: 67, y: 36 } },
      }),
      actor('presser', 'away', 59, 32.6, {
        displayNumber: 7,
        velocity: { x: -1.6, y: -0.3 },
        target: { x: 57.6, y: 32 },
        anchor: { x: 63, y: 27 },
        idealTarget: { x: 58, y: 32 },
        defensive: { intent: 'engage', targetId: 'carrier' },
        pressAssignment: { intent: 'engage', targetId: 'carrier' },
      }),
      actor('screen', 'away', 62, 39, {
        displayNumber: 6,
        duty: 'defend',
        velocity: { x: -0.4, y: -0.8 },
        target: { x: 61, y: 37 },
        anchor: { x: 64, y: 35 },
        idealTarget: { x: 61, y: 37 },
        defensive: { intent: 'contain' },
      }),
      actor('recovery-a', 'away', 70, 25, {
        displayNumber: 4,
        role: 'CB',
        duty: 'defend',
        velocity: { x: -1, y: 1 },
        target: { x: 67, y: 28 },
        anchor: { x: 68, y: 25 },
        idealTarget: { x: 67, y: 28 },
      }),
      actor('recovery-b', 'away', 71, 43, {
        displayNumber: 5,
        role: 'CB',
        duty: 'defend',
        velocity: { x: -1.2, y: -0.7 },
        target: { x: 67, y: 40 },
        anchor: { x: 68, y: 43 },
        idealTarget: { x: 67, y: 40 },
      }),
      actor('keeper', 'away', 99, 34, {
        displayNumber: 1,
        role: 'GK',
        duty: 'defend',
        goalkeeper: true,
        goalkeeperIntervention: { kind: 'ready' },
        target: { x: 99, y: 34 },
        anchor: { x: 101, y: 34 },
        idealTarget: { x: 99, y: 34 },
      }),
    ],
  };
};
