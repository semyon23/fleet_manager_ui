<script setup>
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { useBackendHealth } from '../composables/useBackendHealth'

const route = useRoute()
const title = computed(() => route.meta?.title || 'Fleet Manager')

// Индикатор соединения возвращён по просьбе Семёна (2026-09-08):
// кружок состояния + latency в мс. Переключатель темы убран — он в Settings.
const health = useBackendHealth()
const healthTitle = computed(() => {
  const parts = [health.label.value]
  if (health.latencyMs.value != null) parts.push(`${health.latencyMs.value} ms`)
  if (health.lastCheckedAt.value) parts.push(`checked ${health.lastCheckedAt.value.toLocaleTimeString()}`)
  return parts.join(' · ')
})
</script>

<template>
  <header class="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
    <div class="flex items-center gap-4">
      <h1 class="text-lg font-semibold text-slate-900 dark:text-slate-100">{{ title }}</h1>
    </div>
    <div class="flex items-center gap-4">
      <router-link
        to="/settings"
        class="flex items-center gap-2 font-mono text-xs text-slate-500 hover:text-brand-800 dark:text-slate-400 dark:hover:text-brand-300"
        :title="healthTitle"
      >
        <span
          class="relative inline-block h-2.5 w-2.5 rounded-full"
          :style="{ backgroundColor: health.color.value }"
        >
          <span
            v-if="health.state.value === 'mock' || health.state.value === 'offline'"
            class="absolute inset-0 rounded-full animate-ping"
            :style="{ backgroundColor: health.color.value, opacity: 0.55 }"
          ></span>
        </span>
        <span v-if="health.latencyMs.value != null" class="text-slate-400">{{ health.latencyMs.value }} ms</span>
      </router-link>
      <div class="grid h-8 w-8 place-items-center rounded-full bg-brand-100 font-mono text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
        AL
      </div>
    </div>
  </header>
</template>
