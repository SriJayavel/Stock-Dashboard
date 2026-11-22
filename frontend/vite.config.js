import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // Hosting environment variables take precedence over .env.demo. Keep
  // the static build pinned to fixtures even on a project with live settings.
  define: mode === 'demo' ? {
    'import.meta.env.VITE_DEMO_MODE': JSON.stringify('true'),
    'import.meta.env.VITE_API_BASE_URL': '""',
    'import.meta.env.VITE_API_URL': '""',
    'import.meta.env.VITE_SUPABASE_URL': '""',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '""',
  } : {},
  server: {
    port: 5173,
    proxy: {
      // Match the FastAPI default and the Dockerfile.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
      '/internal': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-supabase': ['@supabase/supabase-js'],
          'charts': ['./src/chart.js', './src/indicators.js'],
          'analytics': ['./src/backtester.js', './src/screener_builder.js', './src/report_generator.js'],
        }
      }
    },
    chunkSizeWarningLimit: 600,
    cssCodeSplit: true,
    minify: 'esbuild',
    sourcemap: false,
  }
}));
