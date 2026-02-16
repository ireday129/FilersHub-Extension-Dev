import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // Use '/' base for Vercel (web) to support client-side routing, './' for extension (local)
  const isVercel = process.env.VERCEL === '1';

  return {
    base: isVercel ? '/' : './',
    server: {
      port: 3000,
      host: '0.0.0.0',
      headers: {
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': "frame-ancestors 'self' chrome-extension://*"
      }
    },
    plugins: [tailwindcss(), react()],
    // GEMINI_API_KEY removed from client bundle — move AI calls to a server-side route
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});