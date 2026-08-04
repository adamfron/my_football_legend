export interface RandomState {
  seedHash: number;
  state: number;
  calls: number;
}

const hashString = (value: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

export class RandomGenerator {
  private constructor(
    private readonly seedHash: number,
    private state: number,
    private calls: number,
  ) {}

  static fromSeed(seed: string): RandomGenerator {
    return new RandomGenerator(hashString(seed), hashString(seed) || 1, 0);
  }

  static import(serialized: string): RandomGenerator {
    const state = JSON.parse(serialized) as RandomState;
    return new RandomGenerator(state.seedHash, state.state, state.calls);
  }

  export(): string {
    return JSON.stringify({
      seedHash: this.seedHash,
      state: this.state,
      calls: this.calls,
    } satisfies RandomState);
  }

  fork(key: string): RandomGenerator {
    const forkSeed = `${this.seedHash}:${this.state}:${key}`;
    return new RandomGenerator(hashString(forkSeed), hashString(`${this.export()}:${key}`) || 1, 0);
  }

  float(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    this.calls += 1;
    return this.state / 0x100000000;
  }

  int(min: number, max: number): number {
    return Math.floor(this.float() * (max - min + 1)) + min;
  }

  bool(probability = 0.5): boolean {
    return this.float() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty array.');
    }

    return items[this.int(0, items.length - 1)] as T;
  }

  weighted<T>(items: readonly { item: T; weight: number }[]): T {
    const total = items.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);

    if (total <= 0) {
      throw new Error('Weighted pick requires a positive total weight.');
    }

    let roll = this.float() * total;

    for (const entry of items) {
      roll -= Math.max(0, entry.weight);
      if (roll <= 0) {
        return entry.item;
      }
    }

    return items[items.length - 1]!.item;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];

    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(0, index);
      [result[index], result[swapIndex]] = [result[swapIndex] as T, result[index] as T];
    }

    return result;
  }
}
