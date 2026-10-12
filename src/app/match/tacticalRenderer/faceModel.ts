import * as THREE from 'three';
import type { ResolvedAppearance } from '../../../core/visualIdentity';

/** The same face construction is used by the articulated pitch rig and every portrait. */
export interface FaceModelResources {
  box: THREE.BufferGeometry;
  sphere: THREE.BufferGeometry;
  cylinder: THREE.BufferGeometry;
  material: (color: string | number) => THREE.MeshStandardMaterial;
}

const skinPalette = [0xf3cfaa, 0xe8ba90, 0xd5a079, 0xbc815d, 0x9b6346, 0x714630];
const hairPalette = [0x171919, 0x30221b, 0x563725, 0x875634, 0xbd8950, 0xe0bd78];
const eyePalette = [0x563b24, 0x745c32, 0x557448, 0x567b91, 0x8b9092];
const palette = (colors: number[], value: number) =>
  colors[Math.min(colors.length - 1, Math.floor(Math.max(0, value) * colors.length))]!;

export const appearanceColors = (appearance: ResolvedAppearance) => {
  const hair = new THREE.Color(palette(hairPalette, appearance.face.hairColor));
  hair.lerp(new THREE.Color(0xc8c4bc), Math.round(appearance.greyFraction * 8) / 8);
  return {
    skin: palette(skinPalette, appearance.face.skinTone),
    hair: hair.getHex(),
    eye: palette(eyePalette, appearance.face.eyeColor),
    lips: new THREE.Color(palette(skinPalette, appearance.face.skinTone))
      .multiplyScalar(0.68)
      .getHex(),
  };
};

export const buildParametricHead = (
  parent: THREE.Group,
  appearance: ResolvedAppearance,
  resources: FaceModelResources,
) => {
  const f = appearance.face;
  const colors = appearanceColors(appearance);
  parent.userData.visualIdentity = {
    identityId: appearance.identityId,
    faceSeed: appearance.faceSeed,
    version: appearance.version,
    baseFace: { ...appearance.baseFace },
    face: { ...appearance.face },
    cosmetics: { ...appearance.cosmetics },
    ageYears: appearance.ageYears,
  };
  const mesh = (
    name: string,
    geometry: THREE.BufferGeometry,
    color: number,
    size: [number, number, number],
    position: [number, number, number],
  ) => {
    const part = new THREE.Mesh(geometry, resources.material(color));
    part.name = name;
    part.scale.set(...size);
    part.position.set(...position);
    parent.add(part);
    return part;
  };
  const width = 0.138 + f.headProportion * 0.044;
  const height = 0.168 + (1 - f.headProportion) * 0.034;
  const jaw = 0.108 + f.jawWidth * 0.07;
  mesh('cranium', resources.sphere, colors.skin, [width, height, 0.139], [0, 0.014, 0]);
  mesh('jaw', resources.sphere, colors.skin, [jaw, 0.106, 0.123], [0, -0.063, 0.02]);
  mesh(
    'chin',
    resources.sphere,
    colors.skin,
    [jaw * 0.63, 0.026 + f.chinLength * 0.025, 0.063],
    [0, -0.13 - f.chinLength * 0.018, 0.055],
  );
  const nose = mesh(
    'nose',
    resources.box,
    colors.skin,
    [0.018 + f.noseWidth * 0.028, 0.036 + f.noseLength * 0.042, 0.026 + f.noseLength * 0.025],
    [0, -0.025, 0.147],
  );
  nose.userData.orientationFeature = 'local_forward_face';
  const eyeX = 0.042 + f.eyeSpacing * 0.039;
  const eyeSize = 0.009 + f.eyeSize * 0.012;
  for (const side of [-1, 1]) {
    mesh(
      `ear-${side}`,
      resources.sphere,
      colors.skin,
      [0.015 + f.earSize * 0.012, 0.027 + f.earSize * 0.021, 0.022],
      [side * (width - 0.002), -0.013, -0.004],
    );
    mesh(
      `eye-white-${side}`,
      resources.sphere,
      0xe9e8d8,
      [eyeSize * 1.42, eyeSize, 0.012],
      [side * eyeX, 0.033, 0.129],
    );
    mesh(
      `iris-${side}`,
      resources.sphere,
      colors.eye,
      [eyeSize * 0.68, eyeSize * 0.79, 0.005],
      [side * eyeX, 0.033, 0.14],
    );
    mesh(
      `pupil-${side}`,
      resources.sphere,
      0x161c1f,
      [eyeSize * 0.31, eyeSize * 0.47, 0.003],
      [side * eyeX, 0.033, 0.144],
    );
    const brow = mesh(
      `brow-${side}`,
      resources.box,
      colors.hair,
      [eyeSize * 2.8, 0.005 + f.browShape * 0.007, 0.009],
      [side * eyeX, 0.062, 0.122],
    );
    brow.rotation.z = side * (f.browShape - 0.5) * 0.4;
  }
  mesh(
    'mouth',
    resources.box,
    colors.lips,
    [0.036 + f.mouthWidth * 0.06, 0.007, 0.008],
    [0, -0.089, 0.147],
  );
  // Restrained age cues follow canonical age; bone morphology remains recognisable.
  if (appearance.ageLines > 0.2) {
    const lineColor = new THREE.Color(colors.skin).multiplyScalar(0.83).getHex();
    for (const side of [-1, 1]) {
      const line = mesh(
        `age-line-${side}`,
        resources.box,
        lineColor,
        [0.018 + appearance.ageLines * 0.015, 0.003, 0.004],
        [side * (eyeX + 0.02), 0.006, 0.12],
      );
      line.rotation.z = side * 0.24;
    }
    mesh(
      'forehead-line',
      resources.box,
      lineColor,
      [width * 0.85, 0.0025, 0.005],
      [0, 0.094, 0.126],
    );
  }
  const style = appearance.cosmetics.hairstyle;
  if (style !== 'shaved') {
    const hair = mesh(
      'hair-cap',
      resources.sphere,
      colors.hair,
      [width * 1.035, style === 'cropped' ? 0.051 : 0.075, 0.145],
      [0, height * 0.79, -0.009],
    );
    hair.userData.hairStyle = style;
    if (style === 'short') {
      for (const x of [-0.07, 0, 0.07]) {
        const tuft = mesh(
          `hair-tuft-${x}`,
          resources.box,
          colors.hair,
          [0.071, 0.055, 0.1],
          [x, height * 1.05, 0.003],
        );
        tuft.rotation.z = -0.15;
      }
    }
    if (style === 'side_part') {
      const fringe = mesh(
        'side-part-fringe',
        resources.box,
        colors.hair,
        [width * 1.55, 0.047, 0.105],
        [-0.018, height * 0.83, 0.075],
      );
      fringe.rotation.z = -0.2;
    }
    if (style === 'curly') {
      for (const [index, x, y, z] of [
        [0, -0.1, 0.14, 0.01],
        [1, 0, 0.19, 0.03],
        [2, 0.1, 0.14, 0.01],
        [3, -0.065, 0.16, 0.095],
        [4, 0.065, 0.16, 0.095],
        [5, 0, 0.16, -0.085],
      ])
        mesh(`curl-${index}`, resources.sphere, colors.hair, [0.069, 0.067, 0.068], [x!, y!, z!]);
    }
    if (style === 'long') {
      mesh(
        'long-hair-back',
        resources.sphere,
        colors.hair,
        [width * 1.05, height * 1.17, 0.055],
        [0, -0.037, -0.116],
      );
      for (const side of [-1, 1]) {
        mesh(
          `long-hair-side-${side}`,
          resources.sphere,
          colors.hair,
          [0.043, 0.191, 0.063],
          [side * width * 0.97, -0.025, -0.027],
        );
      }
    }
  }
  if (appearance.cosmetics.facialHair !== 'none') {
    mesh(
      'facial-hair',
      resources.sphere,
      colors.hair,
      [jaw * 0.85, appearance.cosmetics.facialHair === 'beard' ? 0.08 : 0.038, 0.025],
      [0, -0.105, 0.108],
    );
    // Mouth remains visible in the beard, rather than being covered by the hair mesh.
    mesh(
      'beard-mouth',
      resources.box,
      colors.lips,
      [0.036 + f.mouthWidth * 0.06, 0.007, 0.008],
      [0, -0.089, 0.139],
    );
  }
  if (appearance.cosmetics.accessories === 'headband') {
    mesh('headband', resources.cylinder, 0xe5e6df, [width * 1.065, 0.027, 0.148], [0, 0.119, 0]);
  }
  if (appearance.cosmetics.accessories === 'glasses') {
    for (const side of [-1, 1]) {
      for (const y of [0.014, 0.053])
        mesh(
          `glasses-horizontal-${side}-${y}`,
          resources.box,
          0x292d33,
          [eyeSize * 3.3, 0.004, 0.004],
          [side * eyeX, y, 0.151],
        );
      for (const x of [-eyeSize * 1.65, eyeSize * 1.65])
        mesh(
          `glasses-vertical-${side}-${x}`,
          resources.box,
          0x292d33,
          [0.004, 0.039, 0.004],
          [side * eyeX + x, 0.033, 0.151],
        );
    }
    mesh('glasses-bridge', resources.box, 0x292d33, [0.037, 0.004, 0.004], [0, 0.038, 0.151]);
  }
  return parent;
};
