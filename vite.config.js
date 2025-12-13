import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      // specify all HTML entry points you want Vite to copy/build
      input: {
        popup: resolve(__dirname, 'src/presentation/popup/popup.html'),
        preview: resolve(__dirname, "src/presentation/preview/preview.html")
        // options: resolve(__dirname, 'options.html'),
        // background: resolve(__dirname, 'background.html'),
      }
    },
    outDir: 'dist', // default is dist
  }
});
