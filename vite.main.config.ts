import { defineConfig } from 'vite';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: true,
    minify: false,
    commonjsOptions: {
      ignore: ['better-sqlite3'],
    },
    rollupOptions: {
      external: ['better-sqlite3'],
      output: {
        manualChunks: undefined,
      },
    },
  }
});
