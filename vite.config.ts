import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const sourceDigest = createHash('sha256');
for (const file of readdirSync('src', { recursive: true }).map(String).sort()) {
  if (/\.(ts|tsx|css)$/.test(file)) sourceDigest.update(file).update(readFileSync(`src/${file}`));
}
const revision = `${execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()}:${sourceDigest.digest('hex')}`;

export default defineConfig({
  base: '/my_football_legend/',
  publicDir: '.generated-public',
  plugins: [react()],
  define: { 'import.meta.env.VITE_MFL_REVISION': JSON.stringify(revision) },
});
