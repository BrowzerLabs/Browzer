import { defineConfig } from 'vite';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/main': path.resolve(__dirname, './src/main'),
      '@/renderer': path.resolve(__dirname, './src/renderer'),
      '@/shared': path.resolve(__dirname, './src/shared'),
    },
  },
  build: {
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: [
        'chromadb',
        '@chroma-core/default-embed',
        '@chroma-core/embedding',
        'node:fs',
        'node:path',
        'node:crypto',
        'node:util',
        'node:stream',
        'node:buffer',
        'node:events'
      ],
      output: {
        manualChunks: undefined,
      },
    },
  },
  optimizeDeps: {
    exclude: ['chromadb']
  },
  clearScreen: false,
});
