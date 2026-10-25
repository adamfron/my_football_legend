import { firstTouchLabConfigSchema, type FirstTouchLabConfig } from './firstTouchLaboratory';
import { neutralLowerBodyPose } from './lowerBodyGeometry';

/** Representative contrasts, not a Cartesian product. Seed dispersion is shared
 * by paired attribute variants. Initial placement is apparatus setup, not a replay. */
export const createFirstTouchLabCatalog = (): FirstTouchLabConfig[] => {
  const base = {
    family: 'reception',
    objective: 'settle',
    surface: 'cushion',
    pose: neutralLowerBodyPose(),
    maximumSeconds: 6,
    launcher: {
      id: 'launcher',
      kind: 'launcher',
      position: { x: 16, y: 34, z: 0.11 },
      velocity: { x: 6, y: 0, z: 0 },
      spin: { x: 0, y: 0, z: 0 },
      releaseAt: 0,
    },
  };
  const variants = [
    { id: 'ground' },
    { id: 'fast_low', launcher: { ...base.launcher, velocity: { x: 24, y: 0, z: 0 } } },
    { id: 'rising', launcher: { ...base.launcher, velocity: { x: 10, y: 0, z: 4 } } },
    {
      id: 'flat_aerial',
      surface: 'chest',
      launcher: {
        ...base.launcher,
        position: { x: 17, y: 34, z: 1.65 },
        velocity: { x: 10, y: 0, z: 1 },
      },
    },
    {
      id: 'descending_chest',
      surface: 'chest',
      launcher: {
        ...base.launcher,
        position: { x: 20.25, y: 34, z: 4 },
        velocity: { x: 0, y: 0, z: -1 },
      },
    },
    {
      id: 'descending_thigh',
      surface: 'thigh',
      launcher: {
        ...base.launcher,
        position: { x: 19.4, y: 33.83, z: 1 },
        velocity: { x: 3, y: 0, z: -1 },
      },
    },
    {
      id: 'blocked_thigh',
      surface: 'thigh',
      launcher: {
        ...base.launcher,
        position: { x: 20.2, y: 34, z: 2 },
        velocity: { x: 0, y: 0, z: -1 },
      },
    },
    {
      id: 'knee',
      surface: 'knee',
      launcher: {
        ...base.launcher,
        position: { x: 20.2, y: 33.83, z: 1 },
        velocity: { x: 0, y: 0, z: -1 },
      },
    },
    {
      id: 'lower_leg',
      surface: 'lower_leg',
      launcher: {
        ...base.launcher,
        position: { x: 20.2, y: 33.83, z: 0.8 },
        velocity: { x: 0, y: 0, z: -1 },
      },
    },
    {
      id: 'bouncing',
      launcher: {
        ...base.launcher,
        position: { x: 16, y: 34, z: 0.5 },
        velocity: { x: 8, y: 0, z: -3 },
      },
    },
    ...['side', 'top', 'back'].map((spin, i) => ({
      id: spin + '_spin',
      launcher: {
        ...base.launcher,
        spin: { x: 0, y: i === 1 ? 70 : i === 2 ? -70 : 0, z: i === 0 ? 70 : 0 },
      },
    })),
    { id: 'behind', facingAngle: Math.PI / 2 },
    { id: 'weak_foot', foot: 'left' },
    { id: 'late_preparation', awarenessAt: 0.5 },
    ...[45, 90, 180].map((angle) => ({
      id: 'direction_' + angle,
      family: 'directional',
      objective: 'directional',
      surface: 'inside',
      target: {
        x: 20 + 8 * Math.cos((angle * Math.PI) / 180),
        y: 34 + 8 * Math.sin((angle * Math.PI) / 180),
      },
      desiredSpeed: 4,
    })),
    {
      id: 'continue_run',
      family: 'directional',
      objective: 'directional',
      surface: 'inside',
      bodyVelocity: { x: 2, y: 0 },
      facingAngle: Math.PI / 2,
      desiredSpeed: 4,
    },
    {
      id: 'pressure',
      family: 'directional',
      objective: 'directional',
      surface: 'inside',
      defender: 'active',
      defenderPosition: { x: 21, y: 35.2 },
      target: { x: 25, y: 31 },
      desiredSpeed: 4,
    },
    {
      id: 'lifted_thigh',
      family: 'directional',
      objective: 'directional',
      surface: 'thigh',
      desiredLift: 3,
      defender: 'active',
      launcher: {
        ...base.launcher,
        position: { x: 20.2, y: 34, z: 2 },
        velocity: { x: 0, y: 0, z: -1 },
      },
    },
    {
      id: 'first_time_pass',
      family: 'one_touch',
      objective: 'pass',
      surface: 'inside',
      target: { x: 27, y: 34 },
      desiredSpeed: 9,
    },
    {
      id: 'outside_pass',
      family: 'one_touch',
      objective: 'pass',
      surface: 'outside',
      target: { x: 25, y: 38 },
      desiredSpeed: 9,
    },
    {
      id: 'close_shot',
      family: 'one_touch',
      objective: 'shot',
      surface: 'inside',
      position: { x: 103, y: 34 },
      target: { x: 105, y: 34 },
      desiredSpeed: 8,
      facingAngle: Math.PI / 2,
      launcher: {
        ...base.launcher,
        position: { x: 100, y: 34, z: 0.11 },
        velocity: { x: 6, y: 0, z: 0 },
      },
    },
    {
      id: 'chest_redirect',
      family: 'one_touch',
      objective: 'shot',
      surface: 'chest',
      position: { x: 103.8, y: 34 },
      target: { x: 105, y: 34 },
      desiredSpeed: 3,
      launcher: {
        ...base.launcher,
        position: { x: 103.95, y: 34, z: 2 },
        velocity: { x: 0, y: 0, z: -1 },
      },
    },
    ...[2, 5, 10].map((touches) => ({
      id: 'juggle_' + touches,
      family: 'juggling',
      objective: 'juggle',
      touches,
      maximumSeconds: 10,
      desiredLift: 3,
      launcher: {
        ...base.launcher,
        position: { x: 19.4, y: 34, z: 0.8 },
        velocity: { x: 0, y: 0, z: -1 },
      },
    })),
    {
      id: 'alternating_juggle',
      family: 'juggling',
      objective: 'juggle',
      alternateFeet: true,
      maximumSeconds: 10,
      desiredLift: 3,
      launcher: {
        ...base.launcher,
        position: { x: 19.4, y: 34, z: 0.8 },
        velocity: { x: 0, y: 0, z: -1 },
      },
    },
    {
      id: 'mixed_juggle',
      family: 'juggling',
      objective: 'juggle',
      sequence: ['thigh', 'cushion', 'cushion'],
      maximumSeconds: 10,
      desiredLift: 3,
      launcher: {
        ...base.launcher,
        position: { x: 20.2, y: 34, z: 2 },
        velocity: { x: 0, y: 0, z: -1 },
      },
    },
    {
      id: 'unsupported_header',
      surface: 'head',
      launcher: {
        ...base.launcher,
        position: { x: 20, y: 34, z: 2 },
        velocity: { x: 0, y: 0, z: -1 },
      },
    },
    { id: 'unsupported_overhead', surface: 'overhead' },
    { id: 'autonomous_ground', mode: 'autonomous' },
    {
      id: 'autonomous_aerial',
      mode: 'autonomous',
      launcher: {
        ...base.launcher,
        position: { x: 20.25, y: 34, z: 4 },
        velocity: { x: 0, y: 0, z: -1 },
      },
    },
    { id: 'manual_ground', mode: 'manual', manualSurface: 'inside' },
  ];
  return variants.map((v) => firstTouchLabConfigSchema.parse({ ...base, ...v }));
};
