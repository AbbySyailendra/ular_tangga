import { defineConfig } from 'vitest/config';

export default defineConfig({
  // client memakai origin yang sama; saat dev, soket diteruskan ke server multiplayer
  server: { proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } } },
  build: { chunkSizeWarningLimit: 900 },
  test: { include: ['tests/**/*.test.ts'] },
});
