import {build} from 'vite';
import vue from '@vitejs/plugin-vue';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = path.join(root, 'oral-assistant/.desktop');
await build({
  root, configFile: false, publicDir: false, plugins: [vue()],
  define: {'process.env.NODE_ENV': '"production"'},
  build: {
    outDir, emptyOutDir: true,
    lib: {entry: path.join(root, 'src/oral/desktop/entry.js'), formats: ['es'], fileName: () => 'desktop.js'},
    rollupOptions: {output: {assetFileNames: 'desktop.[ext]'}},
  },
});
await writeFile(path.join(outDir, 'index.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>读课文 · 启航法语</title><link rel="stylesheet" href="/assets/desktop.css"></head>
<body><div id="atelier"></div><script type="module" src="/assets/desktop.js"></script></body></html>`);
