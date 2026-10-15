import { writeFileSync } from 'node:fs';
import { createPr167Career } from './pr167Fixtures';
import { serializeCareerSave } from '../src/core/persistence';
writeFileSync('../pr167-professional-before.json', serializeCareerSave(createPr167Career(true)));
