<script setup>
import { NConfigProvider, NMessageProvider, darkTheme } from 'naive-ui'
import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'
import { ref } from 'vue'

const isDark = ref(false)
</script>

<template>
  <NConfigProvider :theme="isDark ? darkTheme : null" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <div class="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">
        <AppSidebar />
        <div class="flex flex-1 flex-col overflow-hidden">
          <AppTopbar v-model:dark="isDark" />
          <main class="flex-1 overflow-auto p-6">
            <RouterView />
          </main>
        </div>
      </div>
    </NMessageProvider>
  </NConfigProvider>
</template>

<script>
const themeOverrides = {
  common: {
    primaryColor: '#1e40af',
    primaryColorHover: '#1d4ed8',
    primaryColorPressed: '#1e3a8a',
    primaryColorSuppl: '#3b82f6',
    borderRadius: '6px',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontFamilyMono: 'JetBrains Mono, ui-monospace, monospace',
  },
}
export default { themeOverrides }
</script>
