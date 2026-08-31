<script setup>
import { NCard, NTag } from 'naive-ui'

// Демо-алерты убраны 2026-08-31. Пусто пока бэк не начнёт стримить.
const alerts = []

const color = { critical: '#ef4444', warning: '#eab308', info: '#3b82f6' }
</script>

<template>
  <NCard title="Alerts (view-only — telemetry from backend)" size="small" class="!bg-white dark:!bg-slate-900">
    <div class="flex flex-col gap-2">
      <div v-for="a in alerts" :key="a.time" class="flex items-center gap-4 rounded border border-slate-100 p-3">
        <NTag :color="{ color: color[a.level], textColor: 'white' }" size="small">{{ a.level }}</NTag>
        <span class="font-mono text-xs text-slate-500">{{ a.time }}</span>
        <span class="font-mono text-xs text-brand-800">{{ a.robot }}</span>
        <span class="text-sm text-slate-900">{{ a.text }}</span>
      </div>
    </div>
  </NCard>
</template>
