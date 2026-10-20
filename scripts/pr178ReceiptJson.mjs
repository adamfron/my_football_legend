/** Keep complete machine-readable records without burying the source-code diff
 * under hundreds of thousands of generated indentation lines. Each root-array
 * record occupies one line; frozen inputs and historical receipts are untouched. */
export const stringifyPr178Receipt = (value) =>
  '{\n' +
  Object.entries(value)
    .filter(([, entry]) => entry !== undefined)
    .map(
      ([key, entry]) =>
        `  ${JSON.stringify(key)}: ${
          Array.isArray(entry)
            ? '[\n' + entry.map((row) => '    ' + JSON.stringify(row)).join(',\n') + '\n  ]'
            : JSON.stringify(entry)
        }`,
    )
    .join(',\n') +
  '\n}\n';
