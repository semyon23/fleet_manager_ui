<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { NCard, NTag, NButton, NEmpty, useMessage } from 'naive-ui'
import * as api from '../api'

const msg = useMessage()

const alerts = ref([])
const alertsError = ref(null)

async function refresh() {
  try {
    alerts.value = await api.alerts.listAlerts()
    alertsError.value = null
  } catch (e) {
    alertsError.value = e?.message || 'Failed to load alerts'
  }
}
let timer = null
onMounted(async () => { await refresh(); timer = setInterval(refresh, 5000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

// === Filter ===
const filter = ref('all')  // 'all' | 'error' | 'warning' | 'info' | 'unack'

const filterButtons = computed(() => [
  { key: 'all',     label: 'All',      count: alerts.value.length },
  { key: 'error',   label: 'Errors',   count: alerts.value.filter((a) => a.severity === 'error').length },
  { key: 'warning', label: 'Warnings', count: alerts.value.filter((a) => a.severity === 'warning').length },
  { key: 'info',    label: 'Info',     count: alerts.value.filter((a) => a.severity === 'info').length },
  { key: 'unack',   label: 'Unack',    count: alerts.value.filter((a) => !a.acknowledged).length },
])

const visible = computed(() => {
  switch (filter.value) {
    case 'error':
    case 'warning':
    case 'info':
      return alerts.value.filter((a) => a.severity === filter.value)
    case 'unack':
      return alerts.value.filter((a) => !a.acknowledged)
    default:
      return alerts.value
  }
})

// Группировка по severity — тольков режиме 'all'
const grouped = computed(() => {
  const groups = { error: [], warning: [], info: [] }
  for (const a of visible.value) {
    (groups[a.severity] || (groups[a.severity] = [])).push(a)
  }
  return groups
})

const severityColor = { error: '#ef4444', warning: '#eab308', info: '#3b82f6' }
const severityBg = {
  error: 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900',
  warning: 'bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-900',
  info: 'bg-sky-50 dark:bg-sky-950/50 border-sky-200 dark:border-sky-900',
}
const severityTitle = { error: 'Errors', warning: 'Warnings', info: 'Info' }

async function ack(a) {
  try {
    await api.alerts.ackAlert(a.id)
    refresh()
  } catch (e) {
    msg.error(e?.message || `Failed to acknowledge "${a.id}"`)
  }
}

function fmtTime(iso) {
  try { return new Date(iso).toLocaleString() } catch { return iso }
}
</script>

<template>
  <NCard title="Alerts" size="small" class="!bg-white dark:!bg-slate-900">
    <template #header-extra>
      <div class="flex items-center gap-1.5">
        <NButton
          v-for="b in filterButtons"
          :key="b.key"
          size="tiny"
          :type="filter === b.key ? 'primary' : 'default'"
          :tertiary="filter !== b.key"
          @click="filter = b.key"
        >
          {{ b.label }}
          <span
            v-if="b.count > 0"
            class="ml-1 rounded bg-white/25 px-1 text-[10px] font-mono"
            :class="filter === b.key ? '' : 'bg-slate-200/60 dark:bg-slate-700/50'"
          >{{ b.count }}</span>
        </NButton>
      </div>
    </template>

    <div v-if="alertsError" class="mb-3 rounded bg-rose-50 dark:bg-rose-950 p-2 text-xs text-rose-700 dark:text-rose-300">
      {{ alertsError }}
    </div>

    <div v-if="!alerts.length" class="py-10">
      <NEmpty description="No alerts — everything is quiet" />
    </div>

    <div v-else-if="visible.length === 0" class="py-6 text-center text-xs text-slate-500">
      No alerts match this filter.
      <NButton size="tiny" tertiary @click="filter = 'all'">Show all</NButton>
    </div>

    <!-- Grouped view (filter=all) -->
    <div v-else-if="filter === 'all'" class="flex flex-col gap-4">
      <template v-for="sev in ['error', 'warning', 'info']" :key="sev">
        <div v-if="grouped[sev]?.length">
          <div class="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span class="inline-block h-2 w-2 rounded-full" :style="{ backgroundColor: severityColor[sev] }"></span>
            {{ severityTitle[sev] }}
            <span class="font-mono text-slate-400">({{ grouped[sev].length }})</span>
          </div>
          <div class="flex flex-col gap-2">
            <div
              v-for="a in grouped[sev]"
              :key="a.id"
              class="flex items-start gap-3 rounded border p-3"
              :class="[severityBg[sev], a.acknowledged ? 'opacity-60' : '']"
            >
              <NTag :color="{ color: severityColor[sev], textColor: 'white' }" size="small">{{ a.severity }}</NTag>
              <div class="flex flex-col gap-1 flex-1 min-w-0">
                <div class="text-sm text-slate-900 dark:text-slate-100">{{ a.message }}</div>
                <div class="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  <span>{{ fmtTime(a.createdAt) }}</span>
                  <span v-if="a.robotId" class="text-brand-800 dark:text-brand-300">{{ a.robotId }}</span>
                  <span v-if="a.code">code: {{ a.code }}</span>
                  <span v-if="a.acknowledged" class="text-emerald-600 dark:text-emerald-400">✓ acknowledged</span>
                </div>
              </div>
              <NButton v-if="!a.acknowledged" size="tiny" tertiary @click="ack(a)">Ack</NButton>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Filtered view (single-severity or unack) -->
    <div v-else class="flex flex-col gap-2">
      <div
        v-for="a in visible"
        :key="a.id"
        class="flex items-start gap-3 rounded border p-3"
        :class="[severityBg[a.severity] || 'bg-slate-50 border-slate-200', a.acknowledged ? 'opacity-60' : '']"
      >
        <NTag :color="{ color: severityColor[a.severity], textColor: 'white' }" size="small">{{ a.severity }}</NTag>
        <div class="flex flex-col gap-1 flex-1 min-w-0">
          <div class="text-sm text-slate-900 dark:text-slate-100">{{ a.message }}</div>
          <div class="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span>{{ fmtTime(a.createdAt) }}</span>
            <span v-if="a.robotId" class="text-brand-800 dark:text-brand-300">{{ a.robotId }}</span>
            <span v-if="a.code">code: {{ a.code }}</span>
            <span v-if="a.acknowledged" class="text-emerald-600 dark:text-emerald-400">✓ acknowledged</span>
          </div>
        </div>
        <NButton v-if="!a.acknowledged" size="tiny" tertiary @click="ack(a)">Ack</NButton>
      </div>
    </div>
  </NCard>
</template>
