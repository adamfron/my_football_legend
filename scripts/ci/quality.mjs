export const qualityKeys = [
  'VERIFY_RESULT',
  'HISTORICAL_RESULT',
  'SOURCE_RESULT',
  'PR200_MATCHES_RESULT',
  'PR200_PLATFORM_RESULT',
];
export const qualityProgram = `process.exit(${JSON.stringify(qualityKeys)}.every(k=>process.env[k]===${JSON.stringify('success')})?0:1)`;
