import { z } from 'zod';

export const positioningContextSchema = z.enum([
  'settled_build_up','middle_third_possession','final_third_positional_attack','high_block','mid_block','low_block',
  'attacking_transition','defensive_transition','counterpress','second_ball','goal_kick_long','goal_kick_short','corner',
  'free_kick_far','free_kick_close','free_kick_wide','penalty','throw_in',
]);
export type PositioningContext = z.infer<typeof positioningContextSchema>;
export const positioningReferenceEnvelopeSchema = z.object({
  metric:z.enum(['length','width','stretchIndex','convexHullArea']), context:positioningContextSchema,
  typicalRange:z.tuple([z.number(),z.number()]), note:z.string(), sourceId:z.string(),
});
export type PositioningReferenceEnvelope=z.infer<typeof positioningReferenceEnvelopeSchema>;
/** Broad professional-football sanity references. Diagnostics only: never simulation constraints. */
export const POSITIONING_REFERENCE_ENVELOPES:PositioningReferenceEnvelope[] = [
  {metric:'length',context:'middle_third_possession',typicalRange:[31,46],note:'Context may legitimately produce values outside this range.',sourceId:'pr110-reference-study'},
  {metric:'width',context:'middle_third_possession',typicalRange:[35,48],note:'Width depends strongly on phase and opponent.',sourceId:'pr110-reference-study'},
  {metric:'stretchIndex',context:'middle_third_possession',typicalRange:[7,16],note:'Aggregate dispersion, with goalkeeper excluded.',sourceId:'pr110-reference-study'},
  {metric:'convexHullArea',context:'middle_third_possession',typicalRange:[700,1100],note:'Broad envelope around an approximately 900 m² mean.',sourceId:'pr110-reference-study'},
].map(value=>positioningReferenceEnvelopeSchema.parse(value));
