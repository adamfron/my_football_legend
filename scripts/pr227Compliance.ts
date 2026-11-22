// Offline normal-contact experiment. A certified active manifold is needed
// before this calculation can own a live slice of the shared timeline.
type Pair = readonly [number, number];
type Mobility = { a: number; b: number; cross: number };
type Compression = { depth: Pair; closure: Pair };

/** Backward Euler in two normal modes with a unilateral active set. */
export const stepPairCompression = (
  before: Compression,
  mobility: Mobility,
  seconds: number,
  material: { stiffness: number; damping: number; maximumDepth: number },
) => {
  const { stiffness: k, damping: c, maximumDepth } = material;
  const { a, b, cross } = mobility;
  if (seconds <= 0 || k <= 0 || c < 0 || a <= 0 || b <= 0 || a * b <= cross ** 2)
    throw Error('Compression requires a positive step and positive-definite effective mobility');
  const compliance = 1 / (seconds * (k * seconds + c));
  const rhsA = before.closure[0] + (k * before.depth[0]) / (k * seconds + c);
  const rhsB = before.closure[1] + (k * before.depth[1]) / (k * seconds + c);
  const aa = a + compliance;
  const bb = b + compliance;
  const determinant = aa * bb - cross ** 2;
  const candidates: Pair[] = [
    [(bb * rhsA - cross * rhsB) / determinant, (aa * rhsB - cross * rhsA) / determinant],
    [Math.max(0, rhsA / aa), 0],
    [0, Math.max(0, rhsB / bb)],
    [0, 0],
  ];
  const impulse = candidates.find(
    ([j0, j1]) =>
      j0 >= 0 && j1 >= 0 && (j0 > 0 || rhsA <= cross * j1) && (j1 > 0 || rhsB <= cross * j0),
  );
  if (!impulse) throw Error('Positive-definite contact system has no admissible active set');
  const closure: Pair = [
    before.closure[0] - a * impulse[0] - cross * impulse[1],
    before.closure[1] - cross * impulse[0] - b * impulse[1],
  ];
  const depth: Pair = [
    Math.max(0, before.depth[0] + seconds * closure[0]),
    Math.max(0, before.depth[1] + seconds * closure[1]),
  ];
  const kineticChange =
    -(
      impulse[0] * (before.closure[0] + closure[0]) +
      impulse[1] * (before.closure[1] + closure[1])
    ) / 2;
  const energy = ([x, y]: Pair) => (k * (x * x + y * y)) / 2;
  const stored = energy(depth);
  return {
    closure,
    depth,
    impulse,
    stored,
    kineticChange,
    dissipated: -kineticChange - stored + energy(before.depth),
    supported: Math.max(...depth) <= maximumDepth,
  };
};
