<script setup>
import { useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()
const title = computed(() => route.meta?.title || 'Fleet Manager')
</script>

<template>
  <header class="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
    <div class="flex items-center gap-4">
      <h1 class="text-lg font-semibold text-slate-900">{{ title }}</h1>
    </div>
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2 font-mono text-xs text-slate-500">
        <span class="inline-block h-2 w-2 rounded-full bg-slate-400 animate-pulse"></span>
        <span>backend offline · mocks</span>
      </div>
      <div class="grid h-8 w-8 place-items-center rounded-full bg-brand-100 font-mono text-xs font-semibold text-brand-800">
        AL
      </div>
    </div>
  </header>
</template>
