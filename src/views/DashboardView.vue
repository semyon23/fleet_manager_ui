<script setup>
import { useRobotsStore } from '../stores/robots'
import { NCard, NDataTable } from 'naive-ui'
import { computed, h } from 'vue'
import { previewSpriteFor, tintStyle } from '../lib/robotSprite'

const store = useRobotsStore()

const kpis = computed(() => [
  { label: 'Total robots', value: store.counts.total, tone: 'brand' },
  { label: 'Moving', value: store.counts.moving, tone: 'moving' },
  { label: 'Charging', value: store.counts.charging, tone: 'charging' },
  { label: 'Idle', value: store.counts.idle, tone: 'idle' },
  { label: 'Errors', value: store.counts.error, tone: 'error' },
  { label: 'Avg battery', value: `${store.totalBattery}%`, tone: 'brand' },
])

// Демо-события убраны 2026-08-31. Пока WebSocket-стрим не подключён — таблица пуста.
const events = []

const columns = [
  { title: 'Time', key: 'time', render: (r) => h('span', { class: 'font-mono text-xs text-slate-500' }, r.time) },
  { title: 'Robot', key: 'robot', render: (r) => h('span', { class: 'font-mono text-xs text-brand-800' }, r.robot) },
  { title: 'Event', key: 'text' },
]
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      <NCard v-for="kpi in kpis" :key="kpi.label" size="small" class="!bg-white dark:!bg-slate-900">
        <div class="text-xs uppercase tracking-wider text-slate-500">{{ kpi.label }}</div>
        <div class="mt-2 font-mono text-3xl font-bold text-brand-900">{{ kpi.value }}</div>
      </NCard>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <NCard title="Recent events" size="small" class="lg:col-span-2 !bg-white dark:!bg-slate-900">
        <NDataTable :columns="columns" :data="events" :bordered="false" size="small" />
      </NCard>
      <NCard title="Fleet snapshot" size="small" class="!bg-white dark:!bg-slate-900">
        <div class="flex flex-col gap-1">
          <div
            v-for="r in store.robots"
            :key="r.id"
            class="flex items-center gap-3 rounded border border-slate-100 px-2 py-1.5"
          >
            <img
              :src="previewSpriteFor(r)"
              :alt="r.id"
              class="h-8 w-8 object-contain"
              :style="tintStyle(r.status)"
            />
            <span class="flex-1 font-mono text-xs text-brand-800">{{ r.id }}</span>
            <span class="w-16 text-xs text-slate-500">{{ r.status }}</span>
            <span class="w-10 text-right font-mono text-xs text-slate-700">{{ r.battery }}%</span>
          </div>
        </div>
      </NCard>
    </div>
  </div>
</template>
