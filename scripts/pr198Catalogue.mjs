export const catalogue = {
  releases: ['releases-v1.json.gz', 'freezePr198Releases.mjs'],
  ...Object.fromEntries(
    ['baseline', 'defence', 'height', 'receiver', 'dh', 'dr', 'hr', 'combined', 'synchronized'].map(
      (model) => [
        `reception-${model}`,
        [
          `receptions-${model}-${model === 'synchronized' ? 'v2' : 'v1'}.json.gz`,
          'benchmarkPr198Receptions.mjs',
          `--model=${model}`,
          `--version=${model === 'synchronized' ? 'v2' : 'v1'}`,
        ],
      ],
    ),
  ),
  'reception-rejected-v1': [
    'receptions-synchronized-v1.json.gz',
    'benchmarkPr198Receptions.mjs',
    '--model=synchronized',
    '--version=v1',
  ],
  sensitivity: ['sensitivity-v2.json.gz', 'benchmarkPr198Sensitivity.mjs', '--version=v2'],
  'opportunity-baseline': [
    'opportunities-baseline-v2.json.gz',
    'benchmarkPr198Opportunities.mjs',
    '--model=baseline',
    '--version=v2',
  ],
  'opportunity-loft': [
    'opportunities-loft-v2.json.gz',
    'benchmarkPr198Opportunities.mjs',
    '--model=loft',
    '--version=v2',
  ],
  disruption: ['disruption-v2.json.gz', 'benchmarkPr198Disruption.mjs', '--version=v2'],
  'disruption-final': ['disruption-v3.json.gz', 'benchmarkPr198Disruption.mjs', '--version=v3'],
  rebounds: ['rebounds-v1.json.gz', 'benchmarkPr198Rebounds.mjs', '--version=v1'],
  ...Object.fromEntries(
    ['serial', 'concurrent-1', 'concurrent-2'].map((mode) => [
      `performance-${mode}`,
      [
        `performance-${mode}-v2.json`,
        'benchmarkPr198Performance.mjs',
        `--mode=${mode}`,
        '--version=v2',
      ],
    ]),
  ),
};
export const groups = {
  receptions: Object.keys(catalogue).filter(
    (k) => k === 'releases' || k.startsWith('reception-') || k.startsWith('performance-'),
  ),
  opportunities: ['opportunity-baseline', 'opportunity-loft'],
  disruption: ['sensitivity', 'disruption', 'disruption-final', 'rebounds'],
};
