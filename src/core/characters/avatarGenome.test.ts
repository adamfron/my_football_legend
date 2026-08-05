import { describe, expect, it } from 'vitest';
import { generateAvatarGenome } from './avatarGenome';
describe('avatar genome', () => { it('is deterministic and prevents full beard for minors', () => { expect(generateAvatarGenome('x',46)).toEqual(generateAvatarGenome('x',46)); expect(generateAvatarGenome('x',16).facialHair).toBe('none'); }); });
