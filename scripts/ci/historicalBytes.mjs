import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
/** Some historical blobs intentionally contain CRLF despite old text attributes.
 * In a private worktree compare their actual archived bytes, never checkout conversion. */
export const preserveHistoricalBytes = (root) =>
  appendFileSync(join(root, '.gitattributes'), '\ndocs/performance/** -text\n');
