import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
export default defineConfig({ plugins: [(uni.default || uni)()], optimizeDeps: { include: ['fflate', 'exceljs/dist/exceljs.min.js'] }, server: { host: '127.0.0.1', port: 5188, strictPort: true, watch: { ignored: ['**/.preview/**','**/test-results/**','**/playwright-report/**','**/dist/**'] } } });
