<script setup>
import { useRoute } from 'vue-router'
import { computed, inject } from 'vue'
import { useTheme } from '../composables/useTheme'
import { useBackendHealth } from '../composables/useBackendHealth'

const route = useRoute()
const title = computed(() => route.meta?.title || 'Fleet Manager')
const tour = inject('tour', null)
function startTour() { tour?.startTour() }

const { isDark, toggle: toggleTheme } = useTheme()

// Connection indicator — graphic circle instead of the old "backend · real" text.
// State from /api/health ping (every 3s) or 'mock' when localStorage mock mode is on.
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
      <button
        @click="toggleTheme"
        class="grid h-8 w-8 place-items-center rounded border border-slate-200 text-slate-600 transition hover:border-brand-800 hover:text-brand-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-brand-400 dark:hover:text-brand-300"
        :title="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
      >
        <svg v-if="isDark" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
        </svg>
        <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </button>
      <button
        @click="startTour"
        class="flex items-center gap-1.5 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:border-brand-800 hover:text-brand-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-brand-400 dark:hover:text-brand-300"
        title="Onboarding — feature tour"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5M12 17h.01"/></svg>
        Take a tour
      </button>
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
        <span v-if="health.latencyMs.value != null" class="text-slate-400">{{ health.latencyMs.value }}ms</span>
      </router-link>
      <div class="grid h-8 w-8 place-items-center rounded-full bg-brand-100 font-mono text-xs font-semibold text-brand-800 dark:bg-brand-900 dark:text-brand-200">
        AL
      </div>
    </div>
  </header>
</template>
