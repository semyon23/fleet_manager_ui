<script setup>
import { ref, computed } from 'vue'
import { useRobotsStore } from '../stores/robots'
import {
  NCard, NDataTable, NTag, NButton, NModal, NInput, NSelect, NSwitch, NPopconfirm,
  NDrawer, NDrawerContent, NEmpty, useMessage,
} from 'naive-ui'
import { h } from 'vue'
import { previewSpriteFor, tintStyle } from '../lib/robotSprite'
import * as api from '../api'

const store = useRobotsStore()
const msg = useMessage()

function toggleLive(val) {
  if (val) store.startPolling()
  else store.stopPolling()
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
const statusOptions = [
  { label: 'Moving', value: 'moving' },
  { label: 'Charging', value: 'charging' },
  { label: 'Idle', value: 'idle' },
  { label: 'Error', value: 'error' },
  { label: 'Offline', value: 'offline' },
  { label: 'Teleop', value: 'teleop' },
  { label: 'Deploying', value: 'deploying' },
]

// === Filter by status ===
const statusFilter = ref([])  // pустой = все

const filteredRobots = computed(() => {
  if (!statusFilter.value.length) return store.robots
  const set = new Set(statusFilter.value)
  return store.robots.filter((r) => set.has(r.status))
})

// === Drawer with robot details ===
const selectedId = ref(null)
const showDrawer = ref(false)
const selectedRobot = computed(() =>
  selectedId.value ? store.robots.find((r) => r.id === selectedId.value) : null,
)
function openDrawer(id) {
  selectedId.value = id
  showDrawer.value = true
}

// === Delete ===
function deleteErrorText(e, name) {
  if (e?.status === 404) return `Robot "${name}" is already deleted or not in the system`
  if (e?.status === 409) return `Robot "${name}" is currently active — stop it first, then delete`
  if (e?.status === 400) return 'Failed to delete — invalid request'
  if (e?.status === 0 || e?.code === 'NETWORK') return 'No connection to the backend'
  if (e?.code === 'TIMEOUT') return 'Backend is not responding'
  if (e?.status >= 500) return 'Backend error'
  return e?.message || `Failed to delete robot "${name}"`
}
async function deleteRobot(id) {
  try {
    await api.robots.deleteRobot(id)
    store.removeRobot(id)
    if (selectedId.value === id) { selectedId.value = null; showDrawer.value = false }
    msg.success(`Robot "${id}" deleted`)
  } catch (e) {
    msg.error(deleteErrorText(e, id))
  }
}

// === Table columns ===
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
  {
    title: 'ID', key: 'id', sorter: 'default',
    render: (r) => h('button', {
      class: 'font-mono text-brand-800 dark:text-brand-300 hover:underline',
      onClick: (e) => { e.stopPropagation(); openDrawer(r.id) },
    }, r.id),
  },
  { title: 'Model', key: 'model' },
  {
    title: 'Status', key: 'status',
    filterOptions: statusOptions,
    filter: (val, row) => row.status === val,
    render: (r) => h(NTag, { color: { color: statusColor[r.status], textColor: 'white' }, size: 'small' }, { default: () => r.status }),
  },
  {
    title: 'Battery', key: 'battery', sorter: (a, b) => a.battery - b.battery,
    render: (r) => h('div', { class: 'flex items-center gap-2 min-w-[70px]' }, [
      h('div', { class: 'h-1.5 flex-1 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden' }, [
        h('div', {
          class: 'h-full',
          style: `width: ${r.battery}%; background: ${r.battery < 20 ? '#ef4444' : r.battery < 50 ? '#eab308' : '#22c55e'}`,
        }),
      ]),
      h('span', { class: 'font-mono text-xs w-8 text-right' }, `${r.battery}%`),
    ]),
  },
  { title: 'Mission', key: 'mission', render: (r) => h('span', { class: 'font-mono text-xs text-slate-500' }, r.mission || '—') },
  { title: 'Uptime', key: 'uptime', render: (r) => h('span', { class: 'font-mono text-xs' }, r.uptime) },
  {
    title: 'Actions', key: 'actions',
    render: (r) =>
      h('div', { class: 'flex gap-1' }, [
        h(NButton, { size: 'tiny', tertiary: true, onClick: () => openDrawer(r.id) }, { default: () => 'Details' }),
        h(NPopconfirm, {
          onPositiveClick: () => deleteRobot(r.id),
          positiveText: 'Delete',
          negativeText: 'Cancel',
        }, {
          default: () => `Delete robot "${r.id}"? It will be removed from the fleet on the backend.`,
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
  { label: 'CARRIER — cargo cart', value: 'CARRIER' },
  { label: 'FORKLIFT — forklift', value: 'FORKLIFT' },
  { label: 'TUGGER — tugger', value: 'TUGGER' },
  { label: 'TOWING — towing', value: 'TOWING' },
  { label: 'MOBILE_ROBOT — other AMR', value: 'MOBILE_ROBOT' },
]

function openRegister() {
  form.value = { name: '', manufacturer: '', amr_class: 'CARRIER' }
  showRegister.value = true
}

function registerErrorText(e, name) {
  if (e?.status === 409) return `A robot named "${name}" already exists in the system`
  if (e?.status === 400) return 'Invalid data — check the robot name and try again'
  if (e?.status === 0 || e?.code === 'NETWORK') return 'No connection to the backend — check that the server is running'
  if (e?.code === 'TIMEOUT') return 'Backend is not responding'
  if (e?.status >= 500) return 'Backend error, please try again later'
  return e?.message || 'Failed to register the robot'
}

async function submitRegister() {
  if (!form.value.name.trim()) return msg.error('Name is required')
  submitting.value = true
  const name = form.value.name.trim()
  try {
    const resp = await api.robots.registerRobot({
      name,
      manufacturer: form.value.manufacturer.trim(),
      amr_class: form.value.amr_class,
    })
    store.addRobot({ ...form.value, name })
    msg.success(api.getMockMode()
      ? `Robot "${resp.robot_id}" registered (mock)`
      : `Robot "${resp.robot_id}" registered`)
    showRegister.value = false
  } catch (e) {
    msg.error(registerErrorText(e, name))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <NCard title="Robots" size="small" class="!bg-white dark:!bg-slate-900">
    <template #header-extra>
      <div class="flex items-center gap-3">
        <NSelect
          v-model:value="statusFilter"
          :options="statusOptions"
          multiple
          size="small"
          placeholder="All statuses"
          clearable
          style="width: 220px"
        />
        <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span :class="store.pollingActive ? 'inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse' : 'inline-block h-2 w-2 rounded-full bg-slate-400'"></span>
          <span>Live (1s)</span>
          <NSwitch :value="store.pollingActive" size="small" @update:value="toggleLive" />
        </div>
        <span v-if="store.lastPollError" class="text-xs text-rose-600 font-mono" :title="store.lastPollError">poll error</span>
        <span v-else-if="store.lastPollAt" class="text-xs text-slate-400 font-mono">{{ store.lastPollAt.toLocaleTimeString() }}</span>
        <NButton type="primary" size="small" @click="openRegister">+ Register robot</NButton>
      </div>
    </template>

    <div v-if="!store.robots.length" class="py-10">
      <NEmpty description="No robots in the fleet yet">
        <template #extra>
          <NButton type="primary" size="small" @click="openRegister">Register first robot</NButton>
        </template>
      </NEmpty>
    </div>
    <NDataTable
      v-else
      :columns="columns"
      :data="filteredRobots"
      :bordered="false"
      :row-props="(row) => ({ style: 'cursor: pointer', onClick: () => openDrawer(row.id) })"
    />
    <div v-if="store.robots.length && filteredRobots.length === 0" class="mt-3 text-center text-xs text-slate-500">
      No robots match the current filter.
      <NButton size="tiny" tertiary @click="statusFilter = []">Clear filter</NButton>
    </div>

    <!-- ============================================================= -->
    <!-- Register modal                                                 -->
    <!-- ============================================================= -->
    <NModal
      v-model:show="showRegister"
      preset="card"
      title="Register new robot"
      style="width: 480px"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div class="flex flex-col gap-4">
        <label class="text-sm text-slate-600 dark:text-slate-400">
          Name (unique id)
          <NInput v-model:value="form.name" placeholder="amr-10" class="mt-1" />
        </label>

        <label class="text-sm text-slate-600 dark:text-slate-400">
          Manufacturer <span class="text-slate-400 text-xs">(optional)</span>
          <NInput v-model:value="form.manufacturer" placeholder="Transporter Corp" class="mt-1" />
        </label>

        <label class="text-sm text-slate-600 dark:text-slate-400">
          AMR class
          <NSelect v-model:value="form.amr_class" :options="amrClassOptions" size="medium" class="mt-1" />
        </label>

        <div class="rounded bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400">
          Sends <code>POST /api/fms/robots</code> to the backend. After a success
          response the robot appears in the list. Position and status will arrive over
          WebSocket once the robot comes online.
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton :disabled="submitting" @click="showRegister = false">Cancel</NButton>
          <NButton type="primary" :loading="submitting" @click="submitRegister">Register</NButton>
        </div>
      </template>
    </NModal>

    <!-- ============================================================= -->
    <!-- Details drawer                                                 -->
    <!-- ============================================================= -->
    <NDrawer v-model:show="showDrawer" :width="420">
      <NDrawerContent :title="selectedRobot?.id || 'Robot details'" closable>
        <div v-if="selectedRobot" class="flex flex-col gap-4">
          <div class="grid place-items-center rounded bg-slate-100 dark:bg-slate-800 py-4">
            <img
              :src="previewSpriteFor(selectedRobot)"
              :alt="selectedRobot.id"
              class="h-32 w-32 object-contain"
              :style="tintStyle(selectedRobot.status)"
            />
          </div>

          <div class="grid grid-cols-2 gap-3 text-sm">
            <div class="text-slate-500">Status</div>
            <div><NTag :color="{ color: statusColor[selectedRobot.status], textColor: 'white' }" size="small">{{ selectedRobot.status }}</NTag></div>

            <div class="text-slate-500">Model</div>
            <div class="font-mono text-xs">{{ selectedRobot.model }}</div>

            <div class="text-slate-500">Battery</div>
            <div class="flex items-center gap-2">
              <div class="h-1.5 w-24 rounded bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  class="h-full"
                  :style="`width: ${selectedRobot.battery}%; background: ${selectedRobot.battery < 20 ? '#ef4444' : selectedRobot.battery < 50 ? '#eab308' : '#22c55e'}`"
                ></div>
              </div>
              <span class="font-mono text-xs">{{ selectedRobot.battery }}%</span>
            </div>

            <div class="text-slate-500">Position</div>
            <div class="font-mono text-xs">{{ selectedRobot.x.toFixed(2) }}, {{ selectedRobot.y.toFixed(2) }} m</div>

            <div class="text-slate-500">Heading</div>
            <div class="font-mono text-xs">{{ ((selectedRobot.theta * 180) / Math.PI).toFixed(1) }}°</div>

            <div class="text-slate-500">Mission</div>
            <div class="font-mono text-xs">{{ selectedRobot.mission || '—' }}</div>

            <div class="text-slate-500">Uptime</div>
            <div class="font-mono text-xs">{{ selectedRobot.uptime }}</div>
          </div>

          <div class="rounded bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-500 dark:text-slate-400">
            Pause / Stop / Home commands and live pose will be wired once the backend
            exposes <code>POST /api/fms/robots/:id/command</code> and WebSocket state.
          </div>

          <div class="flex gap-2">
            <NButton size="small" disabled title="Backend not yet implemented">Pause</NButton>
            <NButton size="small" type="error" disabled title="Backend not yet implemented">Stop</NButton>
            <NButton size="small" type="primary" disabled title="Backend not yet implemented">Home</NButton>
            <div class="flex-1"></div>
            <NPopconfirm
              :on-positive-click="() => deleteRobot(selectedRobot.id)"
              positive-text="Delete"
              negative-text="Cancel"
            >
              <template #trigger>
                <NButton size="small" type="error" tertiary>Delete</NButton>
              </template>
              Delete robot "{{ selectedRobot.id }}"?
            </NPopconfirm>
          </div>
        </div>
        <div v-else class="text-sm text-slate-500">No robot selected.</div>
      </NDrawerContent>
    </NDrawer>
  </NCard>
</template>
