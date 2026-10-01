// Собирает игру в один HTML-файл для публикации страницей на claude.ai:
// стили и скрипт встраиваются прямо в разметку, обёртку <html>/<head>/<body> добавляет сам claude.ai.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

execSync('npx vite build --base ./ --outDir dist-artifact --emptyOutDir', { stdio: 'inherit' });

const html = readFileSync('dist-artifact/index.html', 'utf8');
const asset = (re) => readFileSync('dist-artifact/' + html.match(re)[1], 'utf8');
const css = asset(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"/);
const js = asset(/<script type="module"[^>]*src="\.\/([^"]+)"/);
const fonts = html.match(/<link\s+href="(https:\/\/fonts\.googleapis\.com[^"]+)"/)[1];
const body = html
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .trim();

const page = `<title>Русские шашки</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${fonts.replace(/&amp;/g, '&')}" />
<style>
${css}
</style>
${body}
<script type="module">
${js.replace(/<\/script/gi, '<\\/script')}
</script>
`;

mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/checkers.html', page);
console.log(`dist-artifact/checkers.html: ${(page.length / 1024).toFixed(1)} KB`);
