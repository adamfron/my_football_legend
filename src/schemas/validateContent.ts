import { sampleContent } from '../content/sampleContent';
import {
  archetypeSchema,
  careerPremiseSchema,
  clubSchema,
  eventDefinitionSchema,
  historyFactSchema,
  personSchema,
  storyThreadSchema,
} from './domainSchemas';

export const validateSampleContent = () => ({
  archetypes: sampleContent.archetypes.map((item) => archetypeSchema.parse(item)),
  careerPremises: sampleContent.careerPremises.map((item) => careerPremiseSchema.parse(item)),
  clubs: sampleContent.clubs.map((item) => clubSchema.parse(item)),
  people: sampleContent.people.map((item) => personSchema.parse(item)),
  events: sampleContent.events.map((item) => eventDefinitionSchema.parse(item)),
  historyFacts: sampleContent.historyFacts.map((item) => historyFactSchema.parse(item)),
  storyThreads: sampleContent.storyThreads.map((item) => storyThreadSchema.parse(item)),
});
