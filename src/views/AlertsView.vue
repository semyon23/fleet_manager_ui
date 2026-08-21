<script setup>
import { NCard, NTag } from 'naive-ui'

const alerts = [
  { time: '15:41:58', robot: 'amr-05', level: 'critical', text: 'Obstacle detected, halted' },
  { time: '15:32:04', robot: 'amr-02', level: 'warning', text: 'Battery low: 34%' },
  { time: '14:28:41', robot: 'amr-06', level: 'critical', text: 'Connection lost' },
  { time: '14:12:15', robot: 'amr-04', level: 'info', text: 'Mission started' },
]

const color = { critical: '#ef4444', warning: '#eab308', info: '#3b82f6' }
</script>

<template>
  <NCard title="Alerts (view-only — telemetry from backend)" size="small" class="!bg-white">
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
