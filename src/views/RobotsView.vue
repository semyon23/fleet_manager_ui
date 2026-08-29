<script setup>
import { ref } from 'vue'
import { useRobotsStore } from '../stores/robots'
import { NCard, NDataTable, NTag, NButton, NModal, NInput, NSelect, useMessage } from 'naive-ui'
import { h } from 'vue'
import { previewSpriteFor, tintStyle } from '../lib/robotSprite'
import * as api from '../api'

const store = useRobotsStore()
const msg = useMessage()

const statusColor = {
  moving: '#22c55e',
  charging: '#eab308',
  idle: '#64748b',
  error: '#ef4444',
  offline: '#94a3b8',
}

const columns = [
  {
    title: '',
    key: 'sprite',
    width: 64,
    render: (r) =>
      h('img', {
        src: previewSpriteFor(r),
        alt: r.id,
        class: 'h-10 w-10 object-contain',
        style: tintStyle(r.status),
      }),
  },
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

// === Register robot modal ===
const showRegister = ref(false)
const submitting = ref(false)
const form = ref({ name: '', manufacturer: '', amr_class: 'CARRIER' })

const amrClassOptions = [
  { label: 'CARRIER — грузовая тележка', value: 'CARRIER' },
  { label: 'FORKLIFT — вилочный погрузчик', value: 'FORKLIFT' },
  { label: 'TUGGER — тягач', value: 'TUGGER' },
  { label: 'TOWING — буксировщик', value: 'TOWING' },
  { label: 'MOBILE_ROBOT — прочий AMR', value: 'MOBILE_ROBOT' },
]

function openRegister() {
  form.value = { name: '', manufacturer: '', amr_class: 'CARRIER' }
  showRegister.value = true
}

async function submitRegister() {
  if (!form.value.name.trim()) return msg.error('Name is required')
  submitting.value = true
  try {
    const resp = await api.robots.registerRobot({
      name: form.value.name.trim(),
      manufacturer: form.value.manufacturer.trim(),  // may be empty per Semyon
      amr_class: form.value.amr_class,
    })
    store.addRobot({ ...form.value })
    msg.success(api.getMockMode()
      ? `Robot ${resp.robot_id} registered (mock)`
      : `Robot ${resp.robot_id} registered`)
    showRegister.value = false
  } catch (e) {
    if (e instanceof api.ApiError) msg.error(`${e.code} — ${e.message}`)
    else if (e.status === 409) msg.error('Robot with this name already exists')
    else msg.error(e.message || 'Register failed')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <NCard title="Robots" size="small" class="!bg-white">
    <template #header-extra>
      <NButton type="primary" size="small" @click="openRegister">+ Register robot</NButton>
    </template>
    <NDataTable :columns="columns" :data="store.robots" :bordered="false" />

    <NModal
      v-model:show="showRegister"
      preset="card"
      title="Register new robot"
      style="width: 480px"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div class="flex flex-col gap-4">
        <label class="text-sm text-slate-600">
          Name (unique id)
          <NInput v-model:value="form.name" placeholder="amr-10" class="mt-1" />
        </label>

        <label class="text-sm text-slate-600">
          Manufacturer <span class="text-slate-400 text-xs">(optional)</span>
          <NInput v-model:value="form.manufacturer" placeholder="Transporter Corp" class="mt-1" />
        </label>

        <label class="text-sm text-slate-600">
          AMR class
          <NSelect v-model:value="form.amr_class" :options="amrClassOptions" size="medium" class="mt-1" />
        </label>

        <div class="rounded bg-slate-50 p-3 text-xs text-slate-600">
          Отправит <code>POST /api/fms/robots</code> на бэк. После success робот
          появится в списке. Позиция/статус придут по WebSocket когда робот выйдет на связь.
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton :disabled="submitting" @click="showRegister = false">Cancel</NButton>
          <NButton type="primary" :loading="submitting" @click="submitRegister">Register</NButton>
        </div>
      </template>
    </NModal>
  </NCard>
</template>
