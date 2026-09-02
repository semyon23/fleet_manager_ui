<script setup>
import { computed, h, onMounted } from 'vue'
import { useRobotsStore } from '../stores/robots'
import { NCard, NDataTable, NEmpty, NButton } from 'naive-ui'
import { RouterLink } from 'vue-router'
import { previewSpriteFor, tintStyle } from '../lib/robotSprite'
import { useTheme } from '../composables/useTheme'

import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js'
import { Doughnut, Bar } from 'vue-chartjs'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend)

const store = useRobotsStore()
const { isDark } = useTheme()

const STATUS_COLORS = {
  moving: '#22c55e',
  charging: '#eab308',
  idle: '#94a3b8',
  error: '#ef4444',
  offline: '#64748b',
  teleop: '#8b5cf6',
  deploying: '#f97316',
}

const kpis = computed(() => [
  { label: 'Total', value: store.counts.total },
  { label: 'Moving', value: store.counts.moving },
  { label: 'Charging', value: store.counts.charging },
  { label: 'Idle', value: store.counts.idle },
  { label: 'Errors', value: store.counts.error },
  { label: 'Avg battery', value: `${store.totalBattery}%` },
])

// === Doughnut: распределение статусов ===
const statusData = computed(() => {
  const labels = []
  const data = []
  const colors = []
  for (const [status, color] of Object.entries(STATUS_COLORS)) {
    const n = store.counts[status] || 0
    if (n > 0) { labels.push(status); data.push(n); colors.push(color) }
  }
  return {
    labels,
    datasets: [{ data, backgroundColor: colors, borderColor: isDark.value ? '#0f172a' : '#ffffff', borderWidth: 2 }],
  }
})

const statusOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '65%',
  plugins: {
    legend: {
      position: 'right',
      labels: {
        color: isDark.value ? '#cbd5e1' : '#334155',
        boxWidth: 12,
        boxHeight: 12,
        font: { family: 'JetBrains Mono, monospace', size: 11 },
      },
    },
  },
}))

// === Bar: батарея каждого робота ===
const batteryData = computed(() => {
  const items = store.robots.slice(0, 20)  // safety-cap на 20 столбиков
  return {
    labels: items.map((r) => r.id),
    datasets: [{
      label: 'Battery %',
      data: items.map((r) => r.battery),
      backgroundColor: items.map((r) => r.battery < 20 ? '#ef4444' : r.battery < 50 ? '#eab308' : '#22c55e'),
      borderRadius: 4,
    }],
  }
})

const batteryOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: {
      ticks: { color: isDark.value ? '#94a3b8' : '#64748b', font: { family: 'JetBrains Mono, monospace', size: 10 } },
      grid: { display: false },
    },
    y: {
      min: 0, max: 100,
      ticks: {
        color: isDark.value ? '#94a3b8' : '#64748b',
        callback: (v) => `${v}%`,
      },
      grid: { color: isDark.value ? '#1e293b' : '#e2e8f0' },
    },
  },
}))

// === Пустая лента событий пока WebSocket-стрим не подключён ===
const events = []
const columns = [
  { title: 'Time', key: 'time', render: (r) => h('span', { class: 'font-mono text-xs text-slate-500' }, r.time) },
  { title: 'Robot', key: 'robot', render: (r) => h('span', { class: 'font-mono text-xs text-brand-800' }, r.robot) },
  { title: 'Event', key: 'text' },
]

// Force reactivity kick после первого mount — чтоб графики нарисовались когда poll долетит.
onMounted(() => {})
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- ================ Top: KPI row ================ -->
    <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      <NCard v-for="kpi in kpis" :key="kpi.label" size="small" class="!bg-white dark:!bg-slate-900">
        <div class="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{{ kpi.label }}</div>
        <div class="mt-2 font-mono text-3xl font-bold text-brand-900 dark:text-brand-200">{{ kpi.value }}</div>
      </NCard>
    </div>

    <!-- ================ Charts row ================ -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <NCard title="Status distribution" size="small" class="!bg-white dark:!bg-slate-900">
        <div v-if="store.counts.total === 0" class="grid place-items-center py-8">
          <NEmpty description="No robots registered yet" size="small">
            <template #extra>
              <RouterLink to="/robots">
                <NButton size="small" type="primary">Register first robot</NButton>
              </RouterLink>
            </template>
          </NEmpty>
        </div>
        <div v-else class="relative h-56">
          <Doughnut :data="statusData" :options="statusOptions" />
        </div>
      </NCard>

      <NCard title="Battery levels" size="small" class="!bg-white dark:!bg-slate-900">
        <div v-if="store.counts.total === 0" class="grid place-items-center py-8">
          <NEmpty description="Register robots to see their battery levels" size="small" />
        </div>
        <div v-else class="relative h-56">
          <Bar :data="batteryData" :options="batteryOptions" />
        </div>
      </NCard>
    </div>

    <!-- ================ Bottom: events + snapshot ================ -->
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <NCard title="Recent events" size="small" class="lg:col-span-2 !bg-white dark:!bg-slate-900">
        <div v-if="!events.length" class="grid place-items-center py-6">
          <NEmpty description="Event stream will appear once the backend WebSocket is connected" size="small" />
        </div>
        <NDataTable v-else :columns="columns" :data="events" :bordered="false" size="small" />
      </NCard>

      <NCard title="Fleet snapshot" size="small" class="!bg-white dark:!bg-slate-900">
        <div v-if="!store.robots.length" class="grid place-items-center py-6">
          <NEmpty description="No robots" size="small" />
        </div>
        <div v-else class="flex flex-col gap-1">
          <div
            v-for="r in store.robots"
            :key="r.id"
            class="flex items-center gap-3 rounded border border-slate-100 dark:border-slate-800 px-2 py-1.5"
          >
            <img
              :src="previewSpriteFor(r)"
              :alt="r.id"
              class="h-8 w-8 object-contain"
              :style="tintStyle(r.status)"
            />
            <span class="flex-1 font-mono text-xs text-brand-800 dark:text-brand-300">{{ r.id }}</span>
            <span class="w-16 text-xs text-slate-500 dark:text-slate-400">{{ r.status }}</span>
            <span class="w-10 text-right font-mono text-xs text-slate-700 dark:text-slate-300">{{ r.battery }}%</span>
          </div>
        </div>
      </NCard>
    </div>
  </div>
</template>
