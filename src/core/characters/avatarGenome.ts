import { RandomGenerator } from '../random/RandomGenerator';
export interface AvatarGenome {
  skin: string;
  headWidth: number;
  headHeight: number;
  jawWidth: number;
  eyeSpacing: number;
  eyeSize: number;
  browY: number;
  noseLength: number;
  noseWidth: number;
  mouthWidth: number;
  hairstyle: 'short' | 'wave' | 'crop' | 'side';
  hair: string;
  facialHair: 'none' | 'stubble' | 'mustache' | 'beard';
  accent: string;
}
const skin = ['#f1c6a8', '#d9a77f', '#b97855', '#8d553a', '#f4d2b8'];
const hair = ['#2b1b14', '#5b3522', '#1c1a18', '#7a4a24', '#d6a34a'];
const accent = ['#1f6f58', '#234d8f', '#7a3f5c', '#6c7a2d', '#8f5b2a'];
export const generateAvatarGenome = (seed: string, age = 16, version = 1): AvatarGenome => {
  const rng = RandomGenerator.fromSeed(`avatar:${version}:${seed}`);
  const adult = age >= 23;
  return {
    skin: rng.pick(skin),
    headWidth: rng.int(58, 72),
    headHeight: rng.int(70, 84),
    jawWidth: rng.int(44, 62),
    eyeSpacing: rng.int(18, 28),
    eyeSize: rng.int(4, 7),
    browY: rng.int(69, 75),
    noseLength: rng.int(12, 20),
    noseWidth: rng.int(7, 13),
    mouthWidth: rng.int(18, 30),
    hairstyle: rng.pick(['short', 'wave', 'crop', 'side'] as const),
    hair: rng.pick(hair),
    facialHair: adult ? rng.pick(['none', 'stubble', 'mustache', 'beard'] as const) : 'none',
    accent: rng.pick(accent),
  };
};
