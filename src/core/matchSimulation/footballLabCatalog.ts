import {
  footballSkillTrialConfigSchema,
  type FootballSkillTrialConfig,
} from './footballPerformanceLab';
import type { z } from 'zod';

const target = (x: number, z = 0.4, width = 2, height = 0.8) => ({
  id: 'target',
  kind: 'target' as const,
  position: { x, y: 34, z },
  normal: { x: 1, y: 0, z: 0 },
  width,
  height,
});
const delivery = {
  position: { x: 18, y: 34, z: 0.2 },
  velocity: { x: 8, y: 0, z: 0 },
  spin: { x: 0, y: 0, z: 0 },
  airborne: true,
  bounceCount: 0,
};
/** Protocols are data. Only the 505 approach/gate/turn distances reproduce published geometry;
 * no footwear, plant biomechanics or familiarisation equivalence is claimed. */
export const createFootballDrillCatalog = (): FootballSkillTrialConfig[] => {
  const rows: z.input<typeof footballSkillTrialConfigSchema>[] = [];
  for (const metres of [5, 10, 20, 30, 40])
    for (const movingStart of [0, 4])
      rows.push({
        id: `sprint-${metres}-${movingStart ? 'moving' : 'standing'}`,
        drill: 'sprint',
        distance: metres,
        movingStart,
        maximumSeconds: 15,
        objects: [
          {
            id: 'finish',
            kind: 'gate',
            subject: 'player',
            position: { x: 20 + metres, y: 34, z: 0.9 },
            normal: { x: 1, y: 0, z: 0 },
            width: 4,
            height: 2,
          },
          ...[5, 10, 20, 30]
            .filter((m) => m < metres)
            .map((m) => ({
              id: `split-${m}`,
              kind: 'gate' as const,
              subject: 'player' as const,
              position: { x: 20 + m, y: 34, z: 0.9 },
              normal: { x: 1, y: 0, z: 0 },
              width: 4,
              height: 2,
            })),
        ],
      });
  for (const turnDirection of ['left', 'right'] as const) {
    rows.push({
      id: `505-${turnDirection}`,
      drill: 'turn',
      protocol: 'published_geometry',
      turnDirection,
      maximumSeconds: 20,
      route: [
        { x: 35, y: 34 },
        { x: 30, y: 34 },
      ],
      objects: [
        {
          id: '505-timing',
          kind: 'gate',
          subject: 'player',
          position: { x: 30, y: 34, z: 0.9 },
          normal: { x: 1, y: 0, z: 0 },
          direction: 'both',
          width: 4,
          height: 2,
        },
      ],
    });
    rows.push({
      id: `out-back-${turnDirection}`,
      drill: 'turn',
      turnDirection,
      maximumSeconds: 20,
      route: [
        { x: 30, y: 34 },
        { x: 20, y: 34 },
      ],
    });
    rows.push({
      id: `shuttle-${turnDirection}`,
      drill: 'turn',
      turnDirection,
      maximumSeconds: 90,
      route: Array.from({ length: 12 }, (_, i) => ({ x: i % 2 === 0 ? 30 : 20, y: 34 })),
    });
  }
  for (const spacing of [2, 4, 6])
    for (const foot of ['dominant', 'weak', 'unrestricted'] as const) {
      const outbound = Array.from({ length: 4 }, (_, i) => ({
        x: 22 + i * spacing,
        y: 34 + (i % 2 === 0 ? 1.3 : -1.3),
      }));
      const outboundRoute = outbound.flatMap((p) => [
        { x: p.x - 0.7, y: p.y },
        { x: p.x + 0.7, y: p.y },
      ]);
      const route = [
        ...outboundRoute,
        { x: 24 + 3 * spacing, y: 34 },
        ...[...outboundRoute].reverse().map((p) => ({ ...p, y: 68 - p.y })),
        { x: 20, y: 34 },
      ];
      rows.push({
        id: `slalom-${spacing}-${foot}`,
        drill: 'slalom',
        protocol: 'adapted_mfl',
        route,
        foot,
        checkpointRadius: 0.65,
        maximumSeconds: 90,
        objects: outbound.map((p, i) => ({
          id: `cone-${i}`,
          kind: 'cone',
          position: { x: p.x, y: 34, z: 0 },
          radius: 0.12,
          height: 0.35,
          collision: true,
          checkpoint: `cone-${i}`,
        })),
      });
    }
  for (const metres of [5, 10, 20, 30])
    for (const foot of ['dominant', 'weak'] as const)
      for (const elevated of [false, true]) {
        rows.push({
          id: `pass-${metres}-${foot}-${elevated ? 'elevated' : 'ground'}`,
          drill: 'pass',
          foot,
          facingAngle: Math.PI / 2 + (foot === 'weak' ? 1 : -1),
          delivery: elevated ? 'lofted' : 'ground',
          maximumSeconds: 12,
          objects: [
            target(20 + metres, elevated ? 0.8 : 0.4, elevated ? 2 : 1.2, elevated ? 1.4 : 0.8),
          ],
          targetId: 'target',
        });
      }
  rows.push({
    id: 'pass-first-time',
    drill: 'pass',
    firstTime: true,
    initialBall: delivery,
    maximumSeconds: 12,
    objects: [target(30)],
    targetId: 'target',
  });
  rows.push({
    id: 'pass-large-target',
    drill: 'pass',
    maximumSeconds: 12,
    objects: [target(40, 0.8, 6, 1.6)],
    targetId: 'target',
  });
  rows.push({
    id: 'wall-receive-turn',
    drill: 'rebound',
    protocol: 'custom_physics',
    maximumSeconds: 40,
    route: [
      { x: 23, y: 37.5 },
      { x: 25, y: 37.5 },
      { x: 25, y: 34 },
    ],
    objects: [
      target(27.8),
      {
        id: 'wall',
        kind: 'wall',
        position: { x: 28, y: 34, z: 1.5 },
        normal: { x: -1, y: 0, z: 0 },
        width: 10,
        height: 3,
        restitution: 0.8,
        tangentRetention: 0.9,
      },
      {
        id: 'turn-pole',
        kind: 'pole',
        position: { x: 24, y: 36, z: 0 },
        radius: 0.08,
        height: 1.8,
        collision: true,
      },
    ],
    targetId: 'target',
  });
  for (const speed of [6, 18, 26])
    for (const spin of [0, 60])
      rows.push({
        id: `receive-${speed}-spin-${spin}`,
        drill: 'receive',
        maximumSeconds: 12,
        facingAngle: -Math.PI / 2,
        initialBall: {
          ...delivery,
          position: { x: 14, y: 34, z: 0.8 },
          velocity: { x: speed, y: 0, z: 1.5 },
          spin: { x: 0, y: spin, z: 0 },
        },
        objects: [],
      });
  for (const foot of ['dominant', 'weak'] as const)
    for (const technique of ['placed', 'driven', 'chip'] as const)
      for (const variant of ['stationary', 'carry', 'turn', 'first-time'] as const) {
        rows.push({
          id: `shot-${variant}-${technique}-${foot}`,
          drill: 'shot',
          foot,
          position: { x: 87, y: 34 },
          shotTechnique: technique,
          maximumSeconds: 25,
          targetHeight: technique === 'chip' ? 1.5 : 0.5,
          route:
            variant === 'carry'
              ? [{ x: 89, y: 34 }]
              : variant === 'turn'
                ? [
                    { x: 85, y: 34 },
                    { x: 87, y: 34 },
                  ]
                : [],
          ...(variant === 'first-time'
            ? { firstTime: true, initialBall: { ...delivery, position: { x: 85, y: 34, z: 0.2 } } }
            : {}),
          objects: [
            { ...target(105, technique === 'chip' ? 1.5 : 0.5, 2, 1), id: 'target' },
            {
              id: 'goal',
              kind: 'goal',
              position: { x: 105, y: 34, z: 1.22 },
              normal: { x: 1, y: 0, z: 0 },
              width: 7.32,
              height: 2.44,
            },
          ],
          targetId: 'target',
        });
      }
  return rows.map((r) => footballSkillTrialConfigSchema.parse(r));
};
