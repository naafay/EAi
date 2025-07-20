import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  build: {
    target: 'esnext',
    base: './'
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-dev-runtime'],
    force: true // Force re-optimization
  }
});