import { defineConfig } from 'vite';

export default defineConfig({
  envDir: '../',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/internal': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
});
