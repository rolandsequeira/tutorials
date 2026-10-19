import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const mocks = fileURLToPath(new URL('./wix-mocks.ts', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  resolve: { alias: { '@wix/dashboard': mocks, '@wix/app-management': mocks } },
  esbuild: { jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' },
  define: { 'process.env.NODE_ENV': '"production"' },
  build: { outDir: '../out/dashboard', emptyOutDir: true },
});
