import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { prepare } = await server.ssrLoadModule('/scripts/preparePr169Browser.ts');
  prepare();
} finally {
  await server.close();
}
