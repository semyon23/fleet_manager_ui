<script setup>
import { ref } from 'vue'
import { NCard, NDataTable, NTag, NButton, NModal, NInput, NSelect, useMessage } from 'naive-ui'
import { h } from 'vue'
import { useMapsStore } from '../stores/maps'

const maps = useMapsStore()
const msg = useMessage()

// Демо-миссии убраны 2026-08-31: реальные приходят с бэка через GET /fms/missions.
const missions = ref([])

const stateColor = { running: '#22c55e', completed: '#3b82f6', failed: '#ef4444', queued: '#94a3b8', pending: '#94a3b8' }

const showModal = ref(false)
const form = ref({ mapId: null, from: '', to: '', priority: 'normal' })

function openCreate() {
  form.value = { mapId: maps.maps[0]?.id || null, from: '', to: '', priority: 'normal' }
  showModal.value = true
}

function submit() {
  if (!form.value.from || !form.value.to) return msg.error('Set from and to waypoints')
  const nextId = 'M-' + String(Math.floor(Math.random() * 900) + 110)
  missions.value.unshift({
    id: nextId,
    robot: '(pending)',
    from: form.value.from,
    to: form.value.to,
    progress: 0,
    state: 'pending',
  })
  msg.success(`Mission ${nextId} queued — backend will assign a robot`)
  showModal.value = false
}

const mapOptions = maps.maps.map((m) => ({ label: m.name, value: m.id }))

const priorityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
]

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
  <NCard title="Missions" size="small" class="!bg-white dark:!bg-slate-900">
    <template #header-extra>
      <NButton type="primary" size="small" @click="openCreate">+ Create mission</NButton>
    </template>

    <NDataTable :columns="columns" :data="missions" :bordered="false" />

    <div class="mt-4 rounded bg-slate-50 p-3 text-xs text-slate-600">
      Missions are dispatched by the backend via VDA5050 Order messages. This view mostly renders read-only telemetry;
      "Create mission" queues an order on the backend (mock).
    </div>

    <NModal
      v-model:show="showModal"
      preset="card"
      title="Create mission"
      style="width: 480px"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div class="flex flex-col gap-4">
        <label class="text-sm text-slate-600">
          Map
          <NSelect
            v-model:value="form.mapId"
            :options="mapOptions"
            placeholder="Which map / floor"
            size="medium"
            class="mt-1"
          />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="text-sm text-slate-600">
            From waypoint
            <NInput v-model:value="form.from" placeholder="wp-a1" class="mt-1" />
          </label>
          <label class="text-sm text-slate-600">
            To waypoint
            <NInput v-model:value="form.to" placeholder="wp-b4" class="mt-1" />
          </label>
        </div>

        <label class="text-sm text-slate-600">
          Priority
          <NSelect v-model:value="form.priority" :options="priorityOptions" size="medium" class="mt-1" />
        </label>

        <div class="rounded bg-slate-50 p-3 text-xs text-slate-600">
          Backend dispatcher will pick a free robot automatically and reply with the assigned robot in the response.
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton @click="showModal = false">Cancel</NButton>
          <NButton type="primary" @click="submit">Queue mission</NButton>
        </div>
      </template>
    </NModal>
  </NCard>
</template>
