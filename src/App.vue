<script setup>
import { NConfigProvider, NMessageProvider, darkTheme } from 'naive-ui'
import { useRouter } from 'vue-router'
import { onMounted, onBeforeUnmount, provide, computed } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'
import { useOnboardingTour } from './composables/useOnboardingTour'
import { useRobotsStore } from './stores/robots'
import { useTheme } from './composables/useTheme'
import { useBackendHealth } from './composables/useBackendHealth'
import { useTelemetryWs } from './composables/useTelemetryWs'

const router = useRouter()
const tour = useOnboardingTour(router)
// Прокидываем в глубину чтобы Topbar/Editor могли позвать startTour()
provide('tour', tour)

const robots = useRobotsStore()
const { isDark } = useTheme()
const naiveTheme = computed(() => (isDark.value ? darkTheme : null))
const health = useBackendHealth()
const telemetry = useTelemetryWs()

onMounted(() => {
  tour.startIfFirstVisit()
  // Глобальный polling GET /fms/robots — раз в 5с, только для таблицы Robots.
  // Live Map получает координаты быстрее через WS-стрим (см. ниже).
  robots.startPolling()
  // Health-ping /api/health каждые 3 сек — sidebar footer показывает индикатор.
  health.startPing()
  // WebSocket телеметрия от Семёна: {type:"state", robot_id, data:{x,y,theta,battery,status}}.
  // В mock-режиме connect() ничего не делает. Авто-reconnect с backoff.
  telemetry.connect()
})
onBeforeUnmount(() => {
  robots.stopPolling()
  health.stopPing()
  telemetry.disconnect()
})
</script>

<template>
  <NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <div class="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <AppSidebar />
        <div class="flex flex-1 flex-col overflow-hidden">
          <AppTopbar />
          <main class="flex-1 overflow-auto bg-slate-50 p-6 dark:bg-slate-950">
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
