import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'

// Bundle analyze: `ANALYZE=1 npm run build` откроет dist/stats.html
const isAnalyze = process.env.ANALYZE === '1'

export default defineConfig({
  base: '/fleet-manager/',
  plugins: [
    vue(),
    tailwindcss(),
    isAnalyze && visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        // Ручные chunks: тяжёлый naive-ui в отдельный, чтобы главный бандл
        // был меньше и грузился быстрее до первого рендера.
        manualChunks: {
          'naive-ui': ['naive-ui'],
          'v-network-graph': ['v-network-graph'],
          konva: ['konva', 'vue-konva'],
          mqtt: ['mqtt'],
          roslib: ['roslib'],
        },
      },
    },
  },
  server: {
    port: 5175,
  },
})
