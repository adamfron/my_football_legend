// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appendIdentityHistory, containsIdentity } from './identityHistory';

describe('immutable football identity history index', () => {
  it('keeps earlier snapshots and differently positioned sibling IDs independent', () => {
    const root = Object.freeze(['a']);
    const left = appendIdentityHistory(root, 'b');
    const right = appendIdentityHistory(appendIdentityHistory(root, 'c'), 'b');
    const late = appendIdentityHistory(left, 'd');
    expect(root).toEqual(['a']); expect(left).toEqual(['a', 'b']);
    expect(containsIdentity(root, 'b')).toBe(false);
    expect(containsIdentity(left, 'b')).toBe(true);
    expect(containsIdentity(left, 'c')).toBe(false);
    expect(containsIdentity(right, 'b')).toBe(true);
    expect(containsIdentity(right, 'd')).toBe(false);
    expect(containsIdentity(late, 'd')).toBe(true);
  });
  it('matches array membership through repeated branching, duplicates and JSON hydration', () => {
    const histories: string[][] = [[]];
    for (let i = 0; i < 240; i++) {
      const branch = histories[(i * 37) % histories.length]!;
      const next = appendIdentityHistory(branch, `event:${i % 31}`);
      histories.push(next);
      if (i % 11 === 0) histories.push(JSON.parse(JSON.stringify(next)) as string[]);
    }
    for (const history of histories) for (let i = 0; i < 33; i++)
      expect(containsIdentity(history, `event:${i}`)).toBe(history.includes(`event:${i}`));
  });
});
