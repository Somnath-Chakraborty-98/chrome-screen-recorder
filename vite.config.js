import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Required for Chrome extension — absolute /assets/ paths fail in extension pages
  base: './',
  build: {
    rollupOptions: {
      // specify all HTML entry points you want Vite to copy/build
      input: {
        popup: resolve(__dirname, 'src/presentation/popup/popup.html'),
        preview: resolve(__dirname, 'src/presentation/preview/preview.html'),
        login: resolve(__dirname, 'src/presentation/auth/login.html'),
        pricing: resolve(__dirname, 'src/presentation/pricing/pricing.html')
      }
    },
    outDir: 'dist', // default is dist
  }
});
