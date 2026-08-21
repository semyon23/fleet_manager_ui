<script setup>
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { NSelect, NSwitch } from 'naive-ui'

defineProps({ dark: Boolean })
defineEmits(['update:dark'])

const route = useRoute()
const title = computed(() => route.meta?.title || 'Fleet Manager')

const mapOptions = [
  { label: 'Warehouse — Floor 1', value: 'wh-f1' },
  { label: 'Warehouse — Floor 2', value: 'wh-f2' },
  { label: 'Assembly Hall', value: 'hall' },
]
</script>

<template>
  <header class="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
    <div class="flex items-center gap-4">
      <h1 class="text-lg font-semibold text-slate-900">{{ title }}</h1>
      <div class="hidden items-center gap-2 md:flex">
        <span class="text-xs text-slate-500">Map:</span>
        <NSelect :options="mapOptions" default-value="wh-f1" size="small" style="width: 220px" />
      </div>
    </div>
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2 font-mono text-xs text-slate-500">
        <span class="inline-block h-2 w-2 rounded-full bg-status-idle animate-pulse"></span>
        <span>backend offline · mocks</span>
      </div>
      <div class="flex items-center gap-2 text-xs text-slate-500">
        <span>Dark</span>
        <NSwitch :value="dark" size="small" @update:value="$emit('update:dark', $event)" />
      </div>
      <div class="grid h-8 w-8 place-items-center rounded-full bg-brand-100 font-mono text-xs font-semibold text-brand-800">
        AL
      </div>
    </div>
  </header>
</template>
