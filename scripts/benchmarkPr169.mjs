import process from 'node:process';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { measure } = await server.ssrLoadModule('/scripts/measurePr169.ts');
  await measure(process.env.MFL_MEASURE_LABEL ?? 'after');
} finally {
  await server.close();
}
