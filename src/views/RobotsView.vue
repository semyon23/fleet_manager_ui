<script setup>
import { ref } from 'vue'
import { useRobotsStore } from '../stores/robots'
import { NCard, NDataTable, NTag, NButton, NModal, NInput, NSelect, NSwitch, NPopconfirm, useMessage } from 'naive-ui'
import { h } from 'vue'
import { previewSpriteFor, tintStyle } from '../lib/robotSprite'
import * as api from '../api'

const store = useRobotsStore()
const msg = useMessage()

// Polling живёт в store и стартует один раз в App.vue.onMounted.
// Здесь только тумблер: пауза/возобновление для этого экрана.
function toggleLive(val) {
  if (val) store.startPolling()
  else store.stopPolling()
}

async function deleteRobot(id) {
  try {
    await api.robots.deleteRobot(id)
    store.removeRobot(id)
    msg.success(`Робот "${id}" удалён`)
  } catch (e) {
    msg.error(deleteErrorText(e, id))
  }
}

const statusColor = {
  moving: '#22c55e',
  charging: '#eab308',
  idle: '#64748b',
  error: '#ef4444',
  offline: '#94a3b8',
  teleop: '#8b5cf6',
  deploying: '#f97316',
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
    render: (r) =>
      h('div', { class: 'flex gap-1' }, [
        h(NButton, { size: 'tiny' }, { default: () => 'Pause' }),
        h(NButton, { size: 'tiny', type: 'error' }, { default: () => 'Stop' }),
        h(NButton, { size: 'tiny', type: 'primary' }, { default: () => 'Home' }),
        h(NPopconfirm, {
          onPositiveClick: () => deleteRobot(r.id),
          positiveText: 'Delete',
          negativeText: 'Cancel',
        }, {
          default: () => `Delete robot "${r.id}"? Это уберёт его из fleet на бэке.`,
          trigger: () => h(NButton, { size: 'tiny', tertiary: true, type: 'error', title: 'Delete robot' }, { default: () => '✕' }),
        }),
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

// Читаемые сообщения по статусам от бэка Семёна вместо технических кодов.
function registerErrorText(e, name) {
  if (e?.status === 409) return `Робот с именем "${name}" уже существует в системе`
  if (e?.status === 400) return 'Неверные данные — проверь имя робота и попробуй ещё раз'
  if (e?.status === 0 || e?.code === 'NETWORK') return 'Нет связи с бэкендом — проверь что сервер запущен'
  if (e?.code === 'TIMEOUT') return 'Бэкенд слишком долго не отвечает'
  if (e?.status >= 500) return 'Ошибка на стороне бэкенда, попробуй позже'
  return e?.message || 'Не удалось добавить робота'
}
function deleteErrorText(e, name) {
  if (e?.status === 404) return `Робот "${name}" уже удалён или его нет в системе`
  if (e?.status === 400) return 'Не удалось удалить — некорректный запрос'
  if (e?.status === 0 || e?.code === 'NETWORK') return 'Нет связи с бэкендом'
  if (e?.code === 'TIMEOUT') return 'Бэкенд слишком долго не отвечает'
  if (e?.status >= 500) return 'Ошибка на стороне бэкенда'
  return e?.message || `Не удалось удалить робота "${name}"`
}

async function submitRegister() {
  if (!form.value.name.trim()) return msg.error('Укажи имя робота')
  submitting.value = true
  const name = form.value.name.trim()
  try {
    const resp = await api.robots.registerRobot({
      name,
      manufacturer: form.value.manufacturer.trim(),  // may be empty per Semyon
      amr_class: form.value.amr_class,
    })
    store.addRobot({ ...form.value, name })
    msg.success(api.getMockMode()
      ? `Робот "${resp.robot_id}" добавлен (mock)`
      : `Робот "${resp.robot_id}" добавлен`)
    showRegister.value = false
  } catch (e) {
    msg.error(registerErrorText(e, name))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <NCard title="Robots" size="small" class="!bg-white">
    <template #header-extra>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 text-xs text-slate-500">
          <span :class="store.pollingActive ? 'inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse' : 'inline-block h-2 w-2 rounded-full bg-slate-400'"></span>
          <span>Live (1s)</span>
          <NSwitch :value="store.pollingActive" size="small" @update:value="toggleLive" />
        </div>
        <span v-if="store.lastPollError" class="text-xs text-rose-600 font-mono" :title="store.lastPollError">poll error</span>
        <span v-else-if="store.lastPollAt" class="text-xs text-slate-400 font-mono">{{ store.lastPollAt.toLocaleTimeString() }}</span>
        <NButton type="primary" size="small" @click="openRegister">+ Register robot</NButton>
      </div>
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
