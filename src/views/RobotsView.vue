<script setup>
import { useRobotsStore } from '../stores/robots'
import { NCard, NDataTable, NTag, NButton } from 'naive-ui'
import { h } from 'vue'

const store = useRobotsStore()

const statusColor = {
  moving: '#22c55e',
  charging: '#eab308',
  idle: '#94a3b8',
  error: '#ef4444',
  offline: '#64748b',
}

const columns = [
  { title: 'ID', key: 'id', render: (r) => h('span', { class: 'font-mono text-brand-800' }, r.id) },
  { title: 'Model', key: 'model' },
  {
    title: 'Status',
    key: 'status',
    render: (r) => h(NTag, { color: { color: statusColor[r.status], textColor: 'white' }, size: 'small' }, { default: () => r.status }),
  },
  { title: 'Battery', key: 'battery', render: (r) => h('span', { class: 'font-mono' }, `${r.battery}%`) },
  { title: 'Mission', key: 'mission', render: (r) => h('span', { class: 'font-mono text-xs text-slate-500' }, r.mission || '—') },
  { title: 'Uptime', key: 'uptime', render: (r) => h('span', { class: 'font-mono text-xs' }, r.uptime) },
  {
    title: 'Actions',
    key: 'actions',
    render: () =>
      h('div', { class: 'flex gap-1' }, [
        h(NButton, { size: 'tiny' }, { default: () => 'Pause' }),
        h(NButton, { size: 'tiny', type: 'error' }, { default: () => 'Stop' }),
        h(NButton, { size: 'tiny', type: 'primary' }, { default: () => 'Home' }),
      ]),
  },
]
</script>

<template>
  <NCard title="Robots" size="small" class="!bg-white">
    <template #header-extra>
      <NButton type="primary" size="small">+ Register robot</NButton>
    </template>
    <NDataTable :columns="columns" :data="store.robots" :bordered="false" />
  </NCard>
</template>
