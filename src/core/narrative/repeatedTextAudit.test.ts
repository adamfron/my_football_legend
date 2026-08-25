import { describe, expect, it } from 'vitest';
import { auditRepeatedPlayerFacingText } from './repeatedTextAudit';
describe('player-facing text audit', () => {
  it('normalizes punctuation and reports keys without flagging short controls', () => {
    const report = auditRepeatedPlayerFacingText({
      a: 'Konkretna dłuższa wiadomość dla zawodnika.',
      b: '  Konkretna  dłuższa wiadomość dla zawodnika! ',
      c: 'Konkretna dłuższa wiadomość dla zawodnika',
      d: 'Dalej',
      e: 'Dalej',
      f: 'Dalej',
    });
    expect(report).toEqual([
      {
        text: 'Konkretna dłuższa wiadomość dla zawodnika.',
        count: 3,
        localizationKeys: ['a', 'b', 'c'],
      },
    ]);
  });
});
