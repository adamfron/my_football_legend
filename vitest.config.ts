import { configDefaults, defineConfig } from 'vitest/config';

// Historical replay trees contain their own frozen tests. They are independent
// source contexts, never additional tests of the current working tree.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: [...configDefaults.exclude, '.benchmark-artifacts/**'],
  },
});
