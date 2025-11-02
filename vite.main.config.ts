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
    rollupOptions: {
      external: ['better-sqlite3'],
      output: {
        // Preserve module structure for better debugging
        manualChunks: undefined,
      },
    },
  }
});
