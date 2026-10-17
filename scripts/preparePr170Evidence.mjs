import { createServer } from 'vite';
import process from 'node:process';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { prepare } = await server.ssrLoadModule('/scripts/preparePr170Evidence.ts');
  process.stdout.write(JSON.stringify(prepare(process.argv.includes('--full'))) + '\n');
} finally {
  await server.close();
}
