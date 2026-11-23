import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
import { excludePrivateArt } from './scripts/private-assets.mjs';
export default defineConfig({ publicDir: false, plugins: [excludePrivateArt(), (uni.default || uni)()], optimizeDeps: { include: ['fflate', 'exceljs/dist/exceljs.min.js'] }, server: { host: '127.0.0.1', port: 5194, strictPort: true, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/assets-private/**'] }, watch: { ignored: ['**/.preview/**','**/test-results/**','**/playwright-report/**','**/dist/**','**/assets-private/**'] } } });
