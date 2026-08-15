import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // The client is plain JavaScript, so its tests are too.
    include: ['src/**/*.test.ts', 'src/**/*.test.js', 'tests/**/*.test.ts'],

    // Much of this suite drives real git and OpenSpec subprocesses against real
    // repositories, because the behavior being protected is what those tools
    // actually do rather than what a mock says they do. Process spawning on a
    // cold Windows CI runner is several times slower than locally, so vitest's
    // 5s default, which assumes pure unit tests, is not enough headroom.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
