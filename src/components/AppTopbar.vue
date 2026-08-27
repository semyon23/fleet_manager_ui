<script setup>
import { useRoute } from 'vue-router'
import { computed, inject, ref, onMounted, onBeforeUnmount } from 'vue'
import { getMockMode } from '../api'

const route = useRoute()
const title = computed(() => route.meta?.title || 'Fleet Manager')
const tour = inject('tour', null)
function startTour() { tour?.startTour() }

// Polling mock-режима — user может переключить в Settings без reload
const isMock = ref(getMockMode())
let modeTimer = null
onMounted(() => { modeTimer = setInterval(() => { isMock.value = getMockMode() }, 1000) })
onBeforeUnmount(() => { if (modeTimer) clearInterval(modeTimer) })
</script>

<template>
  <header class="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
    <div class="flex items-center gap-4">
      <h1 class="text-lg font-semibold text-slate-900">{{ title }}</h1>
    </div>
    <div class="flex items-center gap-4">
      <button
        @click="startTour"
        class="flex items-center gap-1.5 rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:border-brand-800 hover:text-brand-800"
        title="Онбординг — тур по функциям"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 3.5M12 17h.01"/></svg>
        Take a tour
      </button>
      <router-link
        to="/settings"
        class="flex items-center gap-2 font-mono text-xs text-slate-500 hover:text-brand-800"
        :title="isMock ? 'Все запросы идут в localStorage. Клик — открыть Settings' : 'Real API — запросы к бэкенду'"
      >
        <span
          class="inline-block h-2 w-2 rounded-full"
          :class="isMock ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'"
        ></span>
        <span>{{ isMock ? 'backend offline · mocks' : 'backend · real' }}</span>
      </router-link>
      <div class="grid h-8 w-8 place-items-center rounded-full bg-brand-100 font-mono text-xs font-semibold text-brand-800">
        AL
      </div>
    </div>
  </header>
</template>
