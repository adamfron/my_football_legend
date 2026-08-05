import { describe, expect, it } from 'vitest';
import { isDevToolsEnabled } from './App';

describe('devtools visibility flag', () => {
  it('hides devtools without the query parameter', () => {
    expect(isDevToolsEnabled('')).toBe(false);
    expect(isDevToolsEnabled('?devtools=0')).toBe(false);
  });

  it('shows devtools with ?devtools=1', () => {
    expect(isDevToolsEnabled('?devtools=1')).toBe(true);
  });
});
