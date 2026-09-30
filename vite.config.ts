import { defineConfig } from 'vite';

// GitHub Pages отдаёт сайт из подпапки /checkers/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/checkers/' : '/',
});
