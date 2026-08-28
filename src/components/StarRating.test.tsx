// @vitest-environment jsdom
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { StarRating } from './StarRating';

describe('StarRating', () => {
  it('renders five stars, a literal half fill and an accessible label', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<StarRating strength={50} />));
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      '2.5 z 5 gwiazdek',
    );
    expect(container.querySelectorAll('.star-rating__star')).toHaveLength(5);
    expect(container.querySelectorAll('.star-rating__fill')[2]?.getAttribute('style')).toContain(
      '50%',
    );
    expect(container.textContent).not.toContain('½');
    act(() => root.unmount());
  });
});
