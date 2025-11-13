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
  define: {
    'process.env.BACKEND_API_URL': JSON.stringify(process.env.BACKEND_API_URL || 'http://localhost:8000/api/v1'),
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
