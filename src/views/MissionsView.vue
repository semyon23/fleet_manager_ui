<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  NCard, NDataTable, NTag, NButton, NModal, NInput, NSelect, NEmpty, useMessage,
} from 'naive-ui'
import { h } from 'vue'
import { useMapsStore } from '../stores/maps'
import * as api from '../api'

const maps = useMapsStore()
const msg = useMessage()

// === Список миссий (моки убраны; сюда будет наливать бэк через api.missions.listMissions) ===
const missions = ref([])
const missionsError = ref(null)

async function refreshMissions() {
  try {
    missions.value = await api.missions.listMissions()
    missionsError.value = null
  } catch (e) {
    missionsError.value = e?.message || 'Failed to load missions'
  }
}

let missionsTimer = null
onMounted(async () => {
  await refreshMissions()
  // Опрашиваем миссии каждые 3 секунды — реже чем роботов, статус меняется медленнее.
  missionsTimer = setInterval(refreshMissions, 3000)
})
onBeforeUnmount(() => { if (missionsTimer) clearInterval(missionsTimer) })

const stateColor = {
  running: '#22c55e', succeeded: '#3b82f6', completed: '#3b82f6',
  failed: '#ef4444', cancelled: '#94a3b8', queued: '#94a3b8', pending: '#94a3b8',
}

const priorityOptions = [
  { label: 'Low', value: 'low' },
  { label: 'Normal', value: 'normal' },
  { label: 'High', value: 'high' },
  { label: 'Critical', value: 'critical' },
]

// === Mission builder state ===
const showBuilder = ref(false)
const submitting = ref(false)
const showPreview = ref(false)

const form = ref({
  name: '',
  mapId: null,
  priority: 'normal',
  steps: [],  // [{ nodeId }] — упорядоченная последовательность точек
})

function openBuilder() {
  const firstMap = maps.maps[0]
  form.value = {
    name: '',
    mapId: firstMap?.id || null,
    priority: 'normal',
    steps: firstMap?.waypoints?.length
      ? [{ nodeId: firstMap.waypoints[0].id }, { nodeId: firstMap.waypoints[Math.min(1, firstMap.waypoints.length - 1)].id }]
      : [],
  }
  showBuilder.value = true
}

const mapOptions = computed(() =>
  maps.maps.map((m) => ({ label: m.name, value: m.id })),
)

const currentMap = computed(() => (form.value.mapId ? maps.get(form.value.mapId) : null))

// Waypoints выбранной карты — dropdown для каждого step
const waypointOptions = computed(() => {
  if (!currentMap.value?.waypoints?.length) return []
  return currentMap.value.waypoints.map((w) => ({
    label: w.name && w.name !== w.id ? `${w.id} · ${w.name}` : w.id,
    value: w.id,
  }))
})

// При смене карты — сбрасываем steps (id из старой карты не валидны)
watch(() => form.value.mapId, (mapId, prev) => {
  if (mapId === prev) return
  const m = mapId ? maps.get(mapId) : null
  form.value.steps = m?.waypoints?.length ? [{ nodeId: m.waypoints[0].id }] : []
})

// === Step operations ===
function addStep() {
  const wps = currentMap.value?.waypoints || []
  if (!wps.length) return msg.warning('Selected map has no waypoints — add some in the Map Editor first')
  const last = form.value.steps.at(-1)?.nodeId
  const fallback = wps.find((w) => w.id !== last) || wps[0]
  form.value.steps.push({ nodeId: fallback.id })
}
function removeStep(i) { form.value.steps.splice(i, 1) }
function moveStep(i, dir) {
  const j = i + dir
  if (j < 0 || j >= form.value.steps.length) return
  const [x] = form.value.steps.splice(i, 1)
  form.value.steps.splice(j, 0, x)
}

// Actions привязанные к ноде в редакторе — показываем как info
function actionsFor(nodeId) {
  const wp = currentMap.value?.waypoints?.find((w) => w.id === nodeId)
  return wp?.actions || []
}

// === Payload ===
const payload = computed(() => ({
  name: form.value.name.trim() || `Mission ${new Date().toISOString().slice(11, 19)}`,
  mapId: form.value.mapId,
  nodeIds: form.value.steps.map((s) => s.nodeId).filter(Boolean),
  priority: form.value.priority,
}))

const payloadJson = computed(() => JSON.stringify(payload.value, null, 2))

const canSubmit = computed(() =>
  !!form.value.mapId && payload.value.nodeIds.length >= 2,
)

async function submit() {
  if (!canSubmit.value) return msg.error('Select a map and at least 2 waypoints')
  submitting.value = true
  try {
    const created = await api.missions.createMission(payload.value)
    msg.success(api.getMockMode()
      ? `Mission "${created.id}" queued (mock)`
      : `Mission "${created.id}" created — backend will dispatch`)
    showBuilder.value = false
    refreshMissions()
  } catch (e) {
    if (e?.status === 400) msg.error('Invalid mission — check waypoints')
    else if (e?.status === 0 || e?.code === 'NETWORK') msg.error('No connection to the backend')
    else if (e?.code === 'TIMEOUT') msg.error('Backend is not responding')
    else if (e?.status >= 500) msg.error('Backend error')
    else msg.error(e?.message || 'Failed to create mission')
  } finally {
    submitting.value = false
  }
}

// === Cancel existing mission ===
async function cancelMission(id) {
  try {
    await api.missions.cancelMission(id)
    msg.success(`Mission "${id}" cancelled`)
    refreshMissions()
  } catch (e) {
    msg.error(e?.message || `Failed to cancel "${id}"`)
  }
}

const columns = [
  { title: 'Mission', key: 'id', render: (m) => h('span', { class: 'font-mono text-brand-800 dark:text-brand-300' }, m.id) },
  { title: 'Name', key: 'name', render: (m) => h('span', { class: 'text-sm' }, m.name || '—') },
  { title: 'Robot', key: 'robotId', render: (m) => h('span', { class: 'font-mono text-xs' }, m.robotId || '(pending)') },
  { title: 'Steps', key: 'nodeIds', render: (m) => h('span', { class: 'font-mono text-xs text-slate-500' }, (m.nodeIds || []).join(' → ')) },
  {
    title: 'Status',
    key: 'status',
    render: (m) => h(NTag, { color: { color: stateColor[m.status] || '#94a3b8', textColor: 'white' }, size: 'small' }, { default: () => m.status }),
  },
  {
    title: 'Actions',
    key: 'actions',
    render: (m) =>
      h('div', { class: 'flex gap-1' }, [
        (m.status === 'pending' || m.status === 'running')
          ? h(NButton, { size: 'tiny', type: 'error', tertiary: true, onClick: () => cancelMission(m.id) }, { default: () => 'Cancel' })
          : null,
      ].filter(Boolean)),
  },
]
</script>

<template>
  <NCard title="Missions" size="small" class="!bg-white dark:!bg-slate-900">
    <template #header-extra>
      <NButton type="primary" size="small" @click="openBuilder">+ Create mission</NButton>
    </template>

    <div v-if="missionsError" class="mb-3 rounded bg-rose-50 dark:bg-rose-950 p-2 text-xs text-rose-700 dark:text-rose-300">
      {{ missionsError }}
    </div>

    <div v-if="!missions.length" class="py-10">
      <NEmpty description="No missions in the queue yet">
        <template #extra>
          <NButton type="primary" size="small" @click="openBuilder">Create first mission</NButton>
        </template>
      </NEmpty>
    </div>
    <NDataTable v-else :columns="columns" :data="missions" :bordered="false" size="small" />

    <div class="mt-4 rounded bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400">
      Missions are dispatched by the backend via VDA5050 Order messages. The list refreshes every 3s from
      <code>GET /api/fms/missions</code>. Cancel calls <code>POST /api/fms/missions/:id/cancel</code>.
    </div>

    <!-- ============================================================= -->
    <!-- Mission builder                                                -->
    <!-- ============================================================= -->
    <NModal
      v-model:show="showBuilder"
      preset="card"
      title="Create mission"
      style="width: 640px"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-3">
          <label class="text-sm text-slate-600 dark:text-slate-400">
            Name <span class="text-slate-400 text-xs">(optional)</span>
            <NInput v-model:value="form.name" placeholder="Auto-generated if empty" class="mt-1" />
          </label>
          <label class="text-sm text-slate-600 dark:text-slate-400">
            Priority
            <NSelect v-model:value="form.priority" :options="priorityOptions" size="medium" class="mt-1" />
          </label>
        </div>

        <label class="text-sm text-slate-600 dark:text-slate-400">
          Map
          <NSelect
            v-model:value="form.mapId"
            :options="mapOptions"
            placeholder="Which map / floor"
            size="medium"
            class="mt-1"
          />
        </label>

        <!-- Steps -->
        <div class="rounded border border-slate-200 dark:border-slate-700 p-3">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium text-slate-700 dark:text-slate-300">Route (steps)</span>
            <NButton size="tiny" type="primary" tertiary @click="addStep" :disabled="!currentMap?.waypoints?.length">
              + Add step
            </NButton>
          </div>

          <NEmpty
            v-if="!form.steps.length"
            :description="currentMap?.waypoints?.length ? 'No steps yet — click Add step' : 'Selected map has no waypoints — add some in the Map Editor first'"
            size="small"
          />

          <div v-else class="flex flex-col gap-2">
            <div
              v-for="(step, i) in form.steps"
              :key="i"
              class="flex items-start gap-2 rounded border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-2"
            >
              <span class="mt-2 font-mono text-xs text-slate-400 w-6 text-right">{{ i + 1 }}.</span>
              <div class="flex-1 flex flex-col gap-1">
                <NSelect
                  v-model:value="step.nodeId"
                  :options="waypointOptions"
                  size="small"
                  placeholder="Select waypoint"
                />
                <div v-if="actionsFor(step.nodeId).length" class="flex flex-wrap gap-1 pl-1">
                  <NTag
                    v-for="a in actionsFor(step.nodeId)"
                    :key="a.actionId"
                    size="tiny"
                    :bordered="false"
                    type="info"
                  >
                    {{ a.actionType }}{{ a.blockingType && a.blockingType !== 'NONE' ? ' · ' + a.blockingType : '' }}
                  </NTag>
                </div>
                <div v-else class="pl-1 text-[10px] text-slate-400">no actions on this waypoint</div>
              </div>
              <div class="flex flex-col gap-1">
                <NButton size="tiny" tertiary :disabled="i === 0" @click="moveStep(i, -1)" title="Move up">↑</NButton>
                <NButton size="tiny" tertiary :disabled="i === form.steps.length - 1" @click="moveStep(i, 1)" title="Move down">↓</NButton>
              </div>
              <NButton size="tiny" tertiary type="error" @click="removeStep(i)" title="Remove step">✕</NButton>
            </div>
          </div>

          <div class="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Actions attached to each waypoint in the Map Editor travel with the mission automatically —
            the backend converts steps + actions into a VDA5050 Order.
          </div>
        </div>

        <!-- Live payload preview -->
        <div class="rounded bg-slate-50 dark:bg-slate-800 p-3">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-xs text-slate-500 dark:text-slate-400">Payload preview (POST /api/fms/missions)</span>
            <NButton size="tiny" tertiary @click="showPreview = !showPreview">
              {{ showPreview ? 'Hide' : 'Show' }} JSON
            </NButton>
          </div>
          <pre v-if="showPreview" class="max-h-48 overflow-auto rounded bg-slate-900 dark:bg-slate-950 p-2 font-mono text-[11px] text-slate-100">{{ payloadJson }}</pre>
          <div v-else class="font-mono text-[11px] text-slate-600 dark:text-slate-300">
            <span class="text-slate-400">steps:</span>
            <span v-if="!payload.nodeIds.length" class="text-slate-500">(empty)</span>
            <span v-else>{{ payload.nodeIds.join(' → ') }}</span>
            <span class="ml-3 text-slate-400">priority:</span>
            <span>{{ payload.priority }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between">
          <div class="text-xs text-slate-400 dark:text-slate-500">
            {{ payload.nodeIds.length }} step(s) · dispatcher picks the robot
          </div>
          <div class="flex gap-2">
            <NButton :disabled="submitting" @click="showBuilder = false">Cancel</NButton>
            <NButton type="primary" :loading="submitting" :disabled="!canSubmit" @click="submit">
              Queue mission
            </NButton>
          </div>
        </div>
      </template>
    </NModal>
  </NCard>
</template>
