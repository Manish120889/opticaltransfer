import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@optical/codec-core': path.resolve(__dirname, '../../packages/codec-core/src/index.ts'),
      '@optical/compression': path.resolve(__dirname, '../../packages/compression/src/index.ts'),
      '@optical/crypto': path.resolve(__dirname, '../../packages/crypto/src/index.ts'),
      '@optical/erasure-recovery': path.resolve(__dirname, '../../packages/erasure-recovery/src/index.ts'),
      '@optical/visual-renderer': path.resolve(__dirname, '../../packages/visual-renderer/src/index.ts'),
      '@optical/visual-decoder': path.resolve(__dirname, '../../packages/visual-decoder/src/index.ts')
    }
  },
  server: {
    port: 3000,
    host: true
  }
});
