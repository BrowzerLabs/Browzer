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
      output: {
        // Preserve module structure for better debugging
        manualChunks: undefined,
      },
    },
  },
  // Enable better error messages
  clearScreen: false,
});
