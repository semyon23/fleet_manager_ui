<script setup>
import { NCard, NDataTable, NTag } from 'naive-ui'
import { h } from 'vue'

const missions = [
  { id: 'M-107', robot: 'amr-04', from: 'A-12', to: 'B-04', progress: 65, state: 'running' },
  { id: 'M-104', robot: 'amr-01', from: 'CH-01', to: 'A-03', progress: 40, state: 'running' },
  { id: 'M-103', robot: 'amr-03', from: 'B-08', to: 'CH-02', progress: 100, state: 'completed' },
  { id: 'M-102', robot: 'amr-02', from: 'A-01', to: 'B-11', progress: 12, state: 'failed' },
]

const stateColor = { running: '#22c55e', completed: '#3b82f6', failed: '#ef4444', queued: '#94a3b8' }

const columns = [
  { title: 'Mission', key: 'id', render: (m) => h('span', { class: 'font-mono text-brand-800' }, m.id) },
  { title: 'Robot', key: 'robot', render: (m) => h('span', { class: 'font-mono text-xs' }, m.robot) },
  { title: 'From', key: 'from', render: (m) => h('span', { class: 'font-mono text-xs' }, m.from) },
  { title: 'To', key: 'to', render: (m) => h('span', { class: 'font-mono text-xs' }, m.to) },
  {
    title: 'Progress',
    key: 'progress',
    render: (m) =>
      h('div', { class: 'flex items-center gap-2' }, [
        h('div', { class: 'h-1.5 w-24 rounded bg-slate-200 overflow-hidden' }, [
          h('div', { class: 'h-full bg-brand-600', style: `width: ${m.progress}%` }),
        ]),
        h('span', { class: 'font-mono text-xs text-slate-500' }, `${m.progress}%`),
      ]),
  },
  {
    title: 'State',
    key: 'state',
    render: (m) => h(NTag, { color: { color: stateColor[m.state], textColor: 'white' }, size: 'small' }, { default: () => m.state }),
  },
]
</script>

<template>
  <NCard title="Missions (view-only — controlled by backend)" size="small" class="!bg-white">
    <NDataTable :columns="columns" :data="missions" :bordered="false" />
    <div class="mt-4 rounded bg-slate-50 p-3 text-xs text-slate-600">
      Missions are dispatched by the backend via VDA5050 Order messages. This view is read-only telemetry.
    </div>
  </NCard>
</template>
