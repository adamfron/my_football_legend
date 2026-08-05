export const isDevToolsEnabled = (search = globalThis.location?.search ?? '') => new URLSearchParams(search).get('devtools') === '1';
