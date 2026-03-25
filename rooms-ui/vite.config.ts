import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';


export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/rooms': {
        target: 'http://localhost:3335',
        changeOrigin: true,
        ws: false, 
      },
    },
  },
  build: {
    outDir: '../src/modules/rooms/static', 
    emptyOutDir: true,
  },
});
