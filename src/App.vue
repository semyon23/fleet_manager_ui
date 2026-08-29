<script setup>
import { NConfigProvider, NMessageProvider } from 'naive-ui'
import { useRouter } from 'vue-router'
import { onMounted, onBeforeUnmount, provide } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'
import { useOnboardingTour } from './composables/useOnboardingTour'
import { useRobotsStore } from './stores/robots'

const router = useRouter()
const tour = useOnboardingTour(router)
// Прокидываем в глубину чтобы Topbar/Editor могли позвать startTour()
provide('tour', tour)

const robots = useRobotsStore()

onMounted(() => {
  tour.startIfFirstVisit()
  // Глобальный polling GET /fms/robots каждую секунду — таблица, Dashboard,
  // LiveMap и т.д. видят одни и те же живые данные.
  robots.startPolling()
})
onBeforeUnmount(() => {
  robots.stopPolling()
})
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NMessageProvider>
      <div class="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">
        <AppSidebar />
        <div class="flex flex-1 flex-col overflow-hidden">
          <AppTopbar />
          <main class="flex-1 overflow-auto bg-slate-50 p-6">
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
