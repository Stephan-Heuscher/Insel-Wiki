import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
    open: true,
  },
  resolve: {
    alias: {
      // y-webrtc relies on some node modules that we need to stub
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
    }
  }
});
