import {build} from 'vite';
import vue from '@vitejs/plugin-vue';
import {copyFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {excludePrivateArt} from './private-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = path.join(root, 'oral-assistant/.desktop');
await build({
  root, configFile: false, publicDir: false, plugins: [excludePrivateArt(), vue()],
  define: {'process.env.NODE_ENV': '"production"'},
  build: {
    outDir, emptyOutDir: true,
    lib: {entry: path.join(root, 'src/oral/desktop/entry.js'), formats: ['es'], fileName: () => 'desktop.js'},
    rollupOptions: {output: {assetFileNames: 'desktop.[ext]'}},
  },
});
await copyFile(path.join(root, 'src/game/art/opening-comic.png'), path.join(outDir, 'opening-comic.png'));
await writeFile(path.join(outDir, 'desktop.html'), `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>口语练习室 · 启航法语</title><link rel="stylesheet" href="/assets/desktop.css"></head>
<body><div id="atelier"></div><script type="module" src="/assets/desktop.js"></script></body></html>`);
