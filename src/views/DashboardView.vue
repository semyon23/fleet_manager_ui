<script setup>
import { useRobotsStore } from '../stores/robots'
import { NCard, NDataTable } from 'naive-ui'
import { computed, h } from 'vue'

const store = useRobotsStore()

const kpis = computed(() => [
  { label: 'Total robots', value: store.counts.total, tone: 'brand' },
  { label: 'Moving', value: store.counts.moving, tone: 'moving' },
  { label: 'Charging', value: store.counts.charging, tone: 'charging' },
  { label: 'Idle', value: store.counts.idle, tone: 'idle' },
  { label: 'Errors', value: store.counts.error, tone: 'error' },
  { label: 'Avg battery', value: `${store.totalBattery}%`, tone: 'brand' },
])

const events = [
  { time: '15:42:11', robot: 'amr-04', text: 'Started mission M-107' },
  { time: '15:41:58', robot: 'amr-05', text: 'Error: obstacle detected, halted' },
  { time: '15:40:12', robot: 'amr-02', text: 'Arrived at charger CH-02' },
  { time: '15:38:04', robot: 'amr-01', text: 'Mission M-104 waypoint 3/5' },
  { time: '15:35:19', robot: 'amr-03', text: 'Waiting for task' },
]

const columns = [
  { title: 'Time', key: 'time', render: (r) => h('span', { class: 'font-mono text-xs text-slate-500' }, r.time) },
  { title: 'Robot', key: 'robot', render: (r) => h('span', { class: 'font-mono text-xs text-brand-800' }, r.robot) },
  { title: 'Event', key: 'text' },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      <NCard v-for="kpi in kpis" :key="kpi.label" size="small" class="!bg-white">
        <div class="text-xs uppercase tracking-wider text-slate-500">{{ kpi.label }}</div>
        <div class="mt-2 font-mono text-3xl font-bold text-brand-900">{{ kpi.value }}</div>
      </NCard>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <NCard title="Recent events" size="small" class="lg:col-span-2 !bg-white">
        <NDataTable :columns="columns" :data="events" :bordered="false" size="small" />
      </NCard>
      <NCard title="Fleet snapshot" size="small" class="!bg-white">
        <div class="flex flex-col gap-3">
          <div v-for="r in store.robots" :key="r.id" class="flex items-center justify-between rounded border border-slate-100 px-3 py-2">
            <span class="font-mono text-xs text-brand-800">{{ r.id }}</span>
            <span class="text-xs text-slate-500">{{ r.status }}</span>
            <span class="font-mono text-xs text-slate-700">{{ r.battery }}%</span>
          </div>
        </div>
      </NCard>
    </div>
  </div>
</template>
