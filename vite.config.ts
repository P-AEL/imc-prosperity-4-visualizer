import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repositoryName =
  process.env.GITHUB_REPOSITORY?.split('/')[1] ?? process.env.npm_package_name ?? 'imc-prosperity-4-visualizer';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'serve' ? '/' : `/${repositoryName}/`,
  build: {
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@tabler/icons-react': '@tabler/icons-react/dist/esm/icons/index.mjs',
    },
  },
}));
