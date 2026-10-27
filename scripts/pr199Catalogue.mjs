export const catalogue = {
  baseline: ['forensics-baseline-v1.json.gz', 'benchmarkPr199Forensics.mjs', '--mode=baseline'],
  forensics: ['forensics-changed-v1.json.gz', 'benchmarkPr199Forensics.mjs', '--mode=changed'],
  uncertainty: [
    'forensics-uncertainty-v1.json.gz',
    'benchmarkPr199Forensics.mjs',
    '--mode=uncertainty',
  ],
  audit: ['information-audit-v1.json.gz', 'benchmarkPr199Audit.mjs'],
  neutrality: ['neutrality-v1.json.gz', 'benchmarkPr199Neutrality.mjs'],
  'neutrality-v2': ['neutrality-v2.json.gz', 'benchmarkPr199Neutrality.mjs', '--version=v2'],
  'perception-v3': ['perception-v3.json.gz', 'benchmarkPr199Perception.mjs', '--version=v3'],
  'receivers-v3': [
    'receivers-visibility-v3.json.gz',
    'benchmarkPr199Receivers.mjs',
    '--mode=visibility',
    '--version=v3',
  ],
  'attributes-v3': [
    'receivers-attributes-v3.json.gz',
    'benchmarkPr199Receivers.mjs',
    '--mode=attributes',
    '--version=v3',
  ],
  'keepers-v6': ['goalkeepers-v6.json.gz', 'benchmarkPr199Goalkeepers.mjs', '--version=v6'],
  'keepers-v7': ['goalkeepers-v7.json.gz', 'benchmarkPr199Goalkeepers.mjs', '--version=v7'],
  'performance-v3': ['performance-v3.json', 'benchmarkPr199Performance.mjs', '--version=v3'],
  'failures-v3': ['failures-v3.json.gz', 'benchmarkPr199Failures.mjs', '--version=v3'],
  perception: ['perception-v1.json.gz', 'benchmarkPr199Perception.mjs'],
  'perception-v2': ['perception-v2.json.gz', 'benchmarkPr199Perception.mjs', '--version=v2'],
  'receivers-v2': [
    'receivers-visibility-v2.json.gz',
    'benchmarkPr199Receivers.mjs',
    '--mode=visibility',
    '--version=v2',
  ],
  receivers: [
    'receivers-visibility-v1.json.gz',
    'benchmarkPr199Receivers.mjs',
    '--mode=visibility',
  ],
  attributes: [
    'receivers-attributes-v1.json.gz',
    'benchmarkPr199Receivers.mjs',
    '--mode=attributes',
  ],
  'attributes-v2': [
    'receivers-attributes-v2.json.gz',
    'benchmarkPr199Receivers.mjs',
    '--mode=attributes',
    '--version=v2',
  ],
  keepers: ['goalkeepers-v1.json.gz', 'benchmarkPr199Goalkeepers.mjs'],
  'keepers-v2': ['goalkeepers-v2.json.gz', 'benchmarkPr199Goalkeepers.mjs', '--version=v2'],
  'keepers-v3': ['goalkeepers-v3.json.gz', 'benchmarkPr199Goalkeepers.mjs', '--version=v3'],
  'keepers-v4': ['goalkeepers-v4.json.gz', 'benchmarkPr199Goalkeepers.mjs', '--version=v4'],
  'keepers-v5': ['goalkeepers-v5.json.gz', 'benchmarkPr199Goalkeepers.mjs', '--version=v5'],
  performance: ['performance-v1.json', 'benchmarkPr199Performance.mjs'],
  'performance-v2': ['performance-v2.json', 'benchmarkPr199Performance.mjs', '--version=v2'],
  failures: ['failures-v1.json.gz', 'benchmarkPr199Failures.mjs'],
  'failures-v2': ['failures-v2.json.gz', 'benchmarkPr199Failures.mjs', '--version=v2'],
};
export const groups = {
  forensics: ['baseline', 'forensics', 'uncertainty'],
  receivers: Object.keys(catalogue).filter(
    (k) =>
      k === 'receivers' ||
      k.startsWith('receivers-') ||
      k === 'failures' ||
      k.startsWith('failures-'),
  ),
  attributes: Object.keys(catalogue).filter(
    (k) => k === 'attributes' || k.startsWith('attributes-'),
  ),
};
groups.diagnostics = Object.keys(catalogue).filter(
  (k) => !Object.values(groups).flat().includes(k),
);
