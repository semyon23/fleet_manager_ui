<script setup>
import { computed, ref, onMounted, onBeforeUnmount, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMapsStore } from '../stores/maps'
import { useRobotsStore } from '../stores/robots'
import { pixelToWorld } from '../lib/nav2meta'
import { exportNav2GeoJson, downloadJson } from '../lib/exportGeoJson'
import { exportLif } from '../lib/exportLif'
import { graphConfigs } from '../lib/graphConfig'
import { NCard, NButton, NPopselect, NInput, NSelect, NModal, NTabs, NTabPane, useMessage } from 'naive-ui'

const route = useRoute()
const router = useRouter()
const store = useMapsStore()
const robotsStore = useRobotsStore()
const msg = useMessage()

const map = computed(() => store.get(route.params.id))

// v-network-graph требует нативно-reactive объекты
const nodes = reactive({})
const edges = reactive({})
const layouts = reactive({ nodes: {} })
const selectedNodes = ref([])
const selectedEdges = ref([])

const graph = ref(null)

const tool = ref('create-node') // 'create-node' | 'create-station' | 'select'

const STATION_KINDS = [
  { label: 'Charge', value: 'charge', color: '#eab308' },
  { label: 'Loading', value: 'loading', color: '#f97316' },
  { label: 'Parking', value: 'parking', color: '#8b5cf6' },
  { label: 'Custom', value: 'custom', color: '#0ea5e9' },
]
const nextStationKind = ref('charge')

function stationColorFor(kind) {
  return STATION_KINDS.find((k) => k.value === kind)?.color || '#0ea5e9'
}
const showGrid = ref(true)
const showLabels = ref(true)
const showNodes = ref(true)
const showEdges = ref(true)
const gridInterval = ref(1)

const showPreview = ref(false)
const previewTab = ref('geojson')

const previewGeoJson = computed(() => {
  if (!map.value) return ''
  try {
    return JSON.stringify(exportNav2GeoJson(map.value), null, 2)
  } catch (e) {
    return `// error: ${e.message}`
  }
})
const previewLif = computed(() => {
  if (!map.value) return ''
  try {
    return JSON.stringify(exportLif(map.value), null, 2)
  } catch (e) {
    return `// error: ${e.message}`
  }
})

async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text)
    msg.success(`${label} copied to clipboard`)
  } catch {
    msg.error('Clipboard access denied')
  }
}

const allMapsOptions = computed(() =>
  store.maps.map((m) => ({ label: m.name, value: m.id }))
)
function switchMap(id) {
  if (id && id !== map.value?.id) {
    router.replace({ name: 'map-editor', params: { id } })
  }
}

// История для undo/redo (snapshots waypoints+edges)
const history = ref([])
const historyIdx = ref(-1)

function snapshotFromMap(m) {
  return {
    waypoints: m.waypoints.map((w) => ({ ...w })),
    edges: m.edges.map((e) => ({ ...e })),
  }
}
function pushHistory() {
  if (!map.value) return
  const snap = snapshotFromMap(map.value)
  // Обрезаем ветку redo
  history.value = history.value.slice(0, historyIdx.value + 1)
  history.value.push(snap)
  historyIdx.value = history.value.length - 1
  // Ограничим 50
  if (history.value.length > 50) {
    history.value.shift()
    historyIdx.value--
  }
}
function undo() {
  if (historyIdx.value <= 0) return
  historyIdx.value--
  applySnapshot(history.value[historyIdx.value])
  msg.info('Undo')
}
function redo() {
  if (historyIdx.value >= history.value.length - 1) return
  historyIdx.value++
  applySnapshot(history.value[historyIdx.value])
  msg.info('Redo')
}
function applySnapshot(snap) {
  if (!map.value) return
  store.update(map.value.id, { waypoints: [...snap.waypoints], edges: [...snap.edges] })
  syncFromStore()
}

// Синхронизация store -> v-network-graph reactive maps
function syncFromStore() {
  if (!map.value) return
  const nodeIds = new Set(map.value.waypoints.map((w) => w.id))
  const edgeIds = new Set(map.value.edges.map((e) => e.id))

  // Удаляем edges которых больше нет
  for (const id of Object.keys(edges)) if (!edgeIds.has(id)) delete edges[id]

  // Добавляем/обновляем waypoints
  for (const wp of map.value.waypoints) {
    const world = pixelToWorld(map.value.meta, wp.u, wp.v, map.value.height)
    nodes[wp.id] = {
      name: wp.id,
      x: world.x,
      y: world.y,
      __kind: 'waypoint',
      color: '#1e40af',
    }
    if (!layouts.nodes[wp.id]) {
      layouts.nodes[wp.id] = { x: wp.u, y: wp.v }
    } else {
      layouts.nodes[wp.id].x = wp.u
      layouts.nodes[wp.id].y = wp.v
    }
  }
  // Добавляем/обновляем stations (тоже как ноды в графе, но с прямоугольной формой)
  const stations = map.value.stations || []
  const stationIds = new Set(stations.map((s) => s.id))
  for (const s of stations) {
    nodes[s.id] = {
      name: s.name || s.id,
      __kind: 'station',
      __stationKind: s.kind,
      color: stationColorFor(s.kind),
    }
    if (!layouts.nodes[s.id]) {
      layouts.nodes[s.id] = { x: s.u, y: s.v }
    } else {
      layouts.nodes[s.id].x = s.u
      layouts.nodes[s.id].y = s.v
    }
  }
  // Удаляем ноды/лейауты для станций, которых больше нет
  const allValidIds = new Set([...nodeIds, ...stationIds])
  for (const id of Object.keys(nodes)) if (!allValidIds.has(id)) delete nodes[id]
  for (const id of Object.keys(layouts.nodes)) if (!allValidIds.has(id)) delete layouts.nodes[id]

  // Добавляем/обновляем edges
  for (const e of map.value.edges) {
    edges[e.id] = {
      source: e.from,
      target: e.to,
      name: e.id,
      cost: e.cost,
      maxSpeed: e.maxSpeed,
    }
  }
}

// Пересчёт store при drag ноды (layouts обновляются самим v-network-graph)
function onNodeDragEnd() {
  if (!map.value) return
  const updatedW = map.value.waypoints.map((wp) => {
    const lp = layouts.nodes[wp.id]
    if (!lp) return wp
    return { ...wp, u: lp.x, v: lp.y }
  })
  const updatedS = (map.value.stations || []).map((s) => {
    const lp = layouts.nodes[s.id]
    if (!lp) return s
    return { ...s, u: lp.x, v: lp.y }
  })
  store.update(map.value.id, { waypoints: updatedW, stations: updatedS })
  pushHistory()
}

// Клик по пустому месту view — в режиме create-node/create-station создаём точку
function onViewClick(evt) {
  if (tool.value !== 'create-node' && tool.value !== 'create-station') return
  if (!map.value) return

  const pos = evt.point || (graph.value?.eventOffsetToSvg?.(evt.event) ?? null)
  if (!pos) return
  const u = pos.x, v = pos.y
  if (u < 0 || v < 0 || u > map.value.width || v > map.value.height) return

  if (tool.value === 'create-station') {
    const id = 'st-' + Math.random().toString(36).slice(2, 6)
    const station = {
      id,
      name: id,
      kind: nextStationKind.value,
      u,
      v,
      interactionNodeIds: [],
    }
    store.update(map.value.id, {
      stations: [...(map.value.stations || []), station],
    })
    syncFromStore()
    selectedNodes.value = [id]
    pushHistory()
    return
  }

  // create-node
  const id = 'wp-' + Math.random().toString(36).slice(2, 6)
  const wp = { id, u, v }
  let newEdges = map.value.edges
  if (selectedNodes.value.length === 1) {
    const fromId = selectedNodes.value[0]
    if (map.value.waypoints.some((x) => x.id === fromId)) {
      newEdges = [
        ...newEdges,
        {
          id: 'ed-' + Math.random().toString(36).slice(2, 6),
          from: fromId,
          to: id,
          cost: 0,
          maxSpeed: 1.0,
        },
      ]
    }
  }
  store.update(map.value.id, {
    waypoints: [...map.value.waypoints, wp],
    edges: newEdges,
  })
  syncFromStore()
  selectedNodes.value = [id]
  pushHistory()
}

function onNodeClick({ node }) {
  // node = id
  if (tool.value === 'create-node') {
    // Клик на существующей ноде в create — соединяем цепочку и продолжаем от неё
    if (selectedNodes.value.length === 1 && selectedNodes.value[0] !== node) {
      const fromId = selectedNodes.value[0]
      const toId = node
      const exists = map.value.edges.some((e) => e.from === fromId && e.to === toId)
      if (!exists) {
        store.update(map.value.id, {
          edges: [
            ...map.value.edges,
            {
              id: 'ed-' + Math.random().toString(36).slice(2, 6),
              from: fromId,
              to: toId,
              cost: 0,
              maxSpeed: 1.0,
            },
          ],
        })
        syncFromStore()
        pushHistory()
      }
    }
    selectedNodes.value = [node]
  }
}

function deleteSelected() {
  if (!map.value) return
  const nodeIds = new Set(selectedNodes.value)
  const edgeIds = new Set(selectedEdges.value)
  if (!nodeIds.size && !edgeIds.size) return
  const waypoints = map.value.waypoints.filter((w) => !nodeIds.has(w.id))
  const stationsLeft = (map.value.stations || []).filter((s) => !nodeIds.has(s.id))
  const edgesLeft = map.value.edges.filter(
    (e) => !edgeIds.has(e.id) && !nodeIds.has(e.from) && !nodeIds.has(e.to)
  )
  store.update(map.value.id, { waypoints, edges: edgesLeft, stations: stationsLeft })
  selectedNodes.value = []
  selectedEdges.value = []
  syncFromStore()
  pushHistory()
  msg.info('Deleted')
}

function clearAll() {
  if (!confirm('Delete all waypoints and edges?')) return
  store.update(map.value.id, { waypoints: [], edges: [] })
  selectedNodes.value = []
  selectedEdges.value = []
  syncFromStore()
  pushHistory()
}

// Динамический конфиг с переключением grid/labels/interval
const dynamicConfig = computed(() => ({
  ...graphConfigs,
  view: {
    ...graphConfigs.view,
    grid: {
      ...graphConfigs.view.grid,
      visible: showGrid.value,
      interval: gridInterval.value,
    },
  },
  node: {
    ...graphConfigs.node,
    normal: {
      ...graphConfigs.node.normal,
      type: (n) => (n.__kind === 'station' ? 'rect' : 'circle'),
      color: (n) => n.color || '#1e40af',
      radius: (n) => (n.__kind === 'station' ? 14 : 12),
      width: (n) => (n.__kind === 'station' ? 28 : 24),
      height: (n) => (n.__kind === 'station' ? 28 : 24),
      borderRadius: (n) => (n.__kind === 'station' ? 4 : undefined),
    },
    hover: {
      ...graphConfigs.node.hover,
      color: (n) => (n.__kind === 'station' ? n.color : '#3b82f6'),
    },
    label: {
      ...graphConfigs.node.label,
      visible: showLabels.value,
    },
  },
  edge: {
    ...graphConfigs.edge,
    label: {
      ...graphConfigs.edge.label,
      visible: showLabels.value,
    },
  },
}))

const visibleNodes = computed(() => (showNodes.value ? nodes : {}))
const visibleEdges = computed(() => (showEdges.value ? edges : {}))

const eventHandlers = {
  'view:click': onViewClick,
  'node:click': onNodeClick,
  'node:dragend': onNodeDragEnd,
}

// Фон-карта (PGM) - подложка под графом
const backgroundImage = computed(() => {
  if (!map.value) return null
  return {
    href: map.value.pgmDataUrl,
    x: 0,
    y: 0,
    width: map.value.width,
    height: map.value.height,
  }
})

// Экспорт
function doExportGeoJson() {
  const geo = exportNav2GeoJson(map.value)
  downloadJson(`${map.value.name.replace(/\s+/g, '_')}.geojson`, geo)
  msg.success(`Exported ${geo.features.length} features`)
}
function doExportLif() {
  const lif = exportLif(map.value)
  downloadJson(`${map.value.name.replace(/\s+/g, '_')}.lif.json`, lif)
  msg.success(`Exported LIF ${lif.metaInformation.lifVersion}`)
}
const exportOptions = [
  { label: 'Nav2 GeoJSON (Route Server)', value: 'geojson' },
  { label: 'VDA5050 LIF 1.0.0', value: 'lif' },
]
function onExport(v) {
  if (v === 'geojson') doExportGeoJson()
  else doExportLif()
}
function saveToBackend() {
  msg.success(`Saved (mock). Backend: POST /api/maps/${map.value.id}`)
}

// Клавиатура
function onKey(e) {
  const tag = e.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault(); undo(); return
  }
  if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')) {
    e.preventDefault(); redo(); return
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault(); deleteSelected(); return
  }
  if (e.key === 'Escape') {
    selectedNodes.value = []
    selectedEdges.value = []
  }
}

onMounted(() => {
  if (!map.value) { router.replace({ name: 'maps' }); return }
  syncFromStore()
  pushHistory()
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})

// Свойства выбранного элемента для правой панели
const selectedEdge = computed(() => {
  if (selectedEdges.value.length !== 1 || !map.value) return null
  return map.value.edges.find((e) => e.id === selectedEdges.value[0]) || null
})
const selectedNode = computed(() => {
  if (selectedNodes.value.length !== 1 || !map.value) return null
  return map.value.waypoints.find((w) => w.id === selectedNodes.value[0]) || null
})
const selectedStation = computed(() => {
  if (selectedNodes.value.length !== 1 || !map.value) return null
  return (map.value.stations || []).find((s) => s.id === selectedNodes.value[0]) || null
})
const selectedNodeWorld = computed(() => {
  if (!selectedNode.value || !map.value) return null
  return pixelToWorld(map.value.meta, selectedNode.value.u, selectedNode.value.v, map.value.height)
})
const selectedStationWorld = computed(() => {
  if (!selectedStation.value || !map.value) return null
  return pixelToWorld(map.value.meta, selectedStation.value.u, selectedStation.value.v, map.value.height)
})

function updateStationKind(kind) {
  if (!selectedStation.value) return
  const list = (map.value.stations || []).map((s) =>
    s.id === selectedStation.value.id ? { ...s, kind } : s
  )
  store.update(map.value.id, { stations: list })
  syncFromStore()
}
function updateStationName(name) {
  if (!selectedStation.value) return
  const list = (map.value.stations || []).map((s) =>
    s.id === selectedStation.value.id ? { ...s, name } : s
  )
  store.update(map.value.id, { stations: list })
  syncFromStore()
}

function updateEdgeCost(v) {
  if (!selectedEdge.value) return
  const list = map.value.edges.map((e) =>
    e.id === selectedEdge.value.id ? { ...e, cost: Number(v) } : e
  )
  store.update(map.value.id, { edges: list })
  syncFromStore()
}
function updateEdgeSpeed(v) {
  if (!selectedEdge.value) return
  const list = map.value.edges.map((e) =>
    e.id === selectedEdge.value.id ? { ...e, maxSpeed: Number(v) } : e
  )
  store.update(map.value.id, { edges: list })
  syncFromStore()
}
function renameNode(newId) {
  if (!selectedNode.value || !newId || newId === selectedNode.value.id) return
  const oldId = selectedNode.value.id
  const newIdSafe = newId.trim()
  if (!newIdSafe) return
  if (map.value.waypoints.some((w) => w.id === newIdSafe)) return msg.error('Waypoint id must be unique')
  const waypoints = map.value.waypoints.map((w) => (w.id === oldId ? { ...w, id: newIdSafe } : w))
  const edgesUpd = map.value.edges.map((e) => ({
    ...e,
    from: e.from === oldId ? newIdSafe : e.from,
    to: e.to === oldId ? newIdSafe : e.to,
  }))
  store.update(map.value.id, { waypoints, edges: edgesUpd })
  selectedNodes.value = [newIdSafe]
  syncFromStore()
  pushHistory()
}

const robotOptions = computed(() => robotsStore.robots.map((r) => ({ label: r.id, value: r.id })))
function toggleRobot(id) {
  const assigned = map.value.assignedRobots.includes(id)
    ? map.value.assignedRobots.filter((x) => x !== id)
    : [...map.value.assignedRobots, id]
  store.assignRobots(map.value.id, assigned)
}
</script>

<template>
  <div v-if="!map" class="grid place-items-center py-20 text-slate-500">Loading map…</div>
  <div v-else class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-3">
        <NButton size="small" @click="router.push({ name: 'maps' })">←</NButton>
        <NSelect
          size="small"
          :value="map.id"
          :options="allMapsOptions"
          style="width: 260px"
          @update:value="switchMap"
        />
        <span class="font-mono text-[10px] text-slate-500">
          {{ map.width }}×{{ map.height }} · {{ map.meta.resolution }} m/px · origin ({{ map.meta.origin[0] }}, {{ map.meta.origin[1] }})
        </span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-3 rounded border border-slate-200 px-3 py-1 text-xs text-slate-600">
          <label class="flex cursor-pointer items-center gap-1"><input type="checkbox" v-model="showNodes" /> Nodes</label>
          <label class="flex cursor-pointer items-center gap-1"><input type="checkbox" v-model="showEdges" /> Edges</label>
          <label class="flex cursor-pointer items-center gap-1"><input type="checkbox" v-model="showLabels" /> Labels</label>
          <label class="flex cursor-pointer items-center gap-1"><input type="checkbox" v-model="showGrid" /> Grid</label>
        </div>
        <NButton size="small" :disabled="historyIdx <= 0" @click="undo" title="Ctrl+Z">↶</NButton>
        <NButton size="small" :disabled="historyIdx >= history.length - 1" @click="redo" title="Ctrl+Y">↷</NButton>
        <NButton size="small" ghost @click="clearAll">Clear</NButton>
        <NButton size="small" @click="showPreview = true">Preview JSON</NButton>
        <NPopselect :options="exportOptions" @update:value="onExport" trigger="click">
          <NButton size="small" type="primary" ghost>Export ▾</NButton>
        </NPopselect>
        <NButton size="small" type="primary" @click="saveToBackend">Save</NButton>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-6">
      <NCard title="Tools" size="small" class="!bg-white lg:col-span-1">
        <div class="flex flex-col gap-1">
          <button
            :class="[
              'rounded border px-3 py-2 text-left text-sm transition',
              tool === 'create-node'
                ? 'border-brand-800 bg-brand-800 text-white'
                : 'border-slate-200 hover:bg-brand-50',
            ]"
            @click="tool = 'create-node'; selectedNodes = []"
          >Create Node</button>
          <button
            :class="[
              'rounded border px-3 py-2 text-left text-sm transition',
              tool === 'create-station'
                ? 'border-brand-800 bg-brand-800 text-white'
                : 'border-slate-200 hover:bg-brand-50',
            ]"
            @click="tool = 'create-station'; selectedNodes = []"
          >Create Station</button>
          <button
            :class="[
              'rounded border px-3 py-2 text-left text-sm transition',
              tool === 'select'
                ? 'border-brand-800 bg-brand-800 text-white'
                : 'border-slate-200 hover:bg-brand-50',
            ]"
            @click="tool = 'select'"
          >Select / Move</button>
        </div>

        <div class="mt-4 rounded bg-brand-50 p-3 text-xs text-brand-900">
          <template v-if="tool === 'create-node'">
            Click on the map to add a node. If a node is selected, the new node connects to it — draw routes fast.
          </template>
          <template v-else-if="tool === 'create-station'">
            Click on the map to drop a station of selected kind. Stations export as VDA5050 stations (with interactionNodeIds).
          </template>
          <template v-else>
            Click a node/edge to select. Drag nodes to move. Del to remove. Ctrl+Z / Ctrl+Y for undo/redo.
          </template>
        </div>

        <div v-if="tool === 'create-station'" class="mt-3">
          <div class="mb-1 text-xs uppercase tracking-wider text-slate-500">Station kind</div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="k in STATION_KINDS"
              :key="k.value"
              :class="[
                'rounded border px-2 py-1 text-xs transition',
                nextStationKind === k.value
                  ? 'border-slate-800 bg-slate-800 text-white'
                  : 'border-slate-200 hover:bg-slate-50',
              ]"
              :style="nextStationKind === k.value ? '' : `border-color: ${k.color}; color: ${k.color}`"
              @click="nextStationKind = k.value"
            >{{ k.label }}</button>
          </div>
        </div>

        <div class="mt-4">
          <div class="mb-1 text-xs uppercase tracking-wider text-slate-500">Grid step</div>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            v-model.number="gridInterval"
            class="w-full accent-brand-800"
            :disabled="!showGrid"
          />
          <div class="text-right font-mono text-[10px] text-slate-500">{{ gridInterval }} m</div>
        </div>

        <div class="mt-4">
          <div class="mb-2 text-xs uppercase tracking-wider text-slate-500">Assigned robots</div>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="opt in robotOptions"
              :key="opt.value"
              :class="[
                'rounded border px-2 py-1 font-mono text-xs transition',
                map.assignedRobots.includes(opt.value)
                  ? 'border-brand-800 bg-brand-800 text-white'
                  : 'border-slate-200 hover:bg-brand-50',
              ]"
              @click="toggleRobot(opt.value)"
            >{{ opt.label }}</button>
          </div>
        </div>

        <div class="mt-4 flex flex-col gap-1 font-mono text-xs text-slate-500">
          <div>Nodes: <span class="text-brand-800">{{ map.waypoints.length }}</span></div>
          <div>Stations: <span class="text-brand-800">{{ (map.stations || []).length }}</span></div>
          <div>Edges: <span class="text-brand-800">{{ map.edges.length }}</span></div>
        </div>
      </NCard>

      <NCard title="Graph" size="small" class="!bg-white lg:col-span-4">
        <div class="h-[640px] w-full overflow-hidden rounded border border-slate-200 bg-white">
          <v-network-graph
            ref="graph"
            :nodes="visibleNodes"
            :edges="visibleEdges"
            v-model:layouts="layouts"
            v-model:selected-nodes="selectedNodes"
            v-model:selected-edges="selectedEdges"
            :configs="dynamicConfig"
            :event-handlers="eventHandlers"
            :layers="{ map: 'base' }"
            class="h-full w-full"
          >
            <template #map v-if="backgroundImage">
              <image
                :href="backgroundImage.href"
                :x="backgroundImage.x"
                :y="backgroundImage.y"
                :width="backgroundImage.width"
                :height="backgroundImage.height"
                opacity="0.7"
              />
            </template>
          </v-network-graph>
        </div>
      </NCard>

      <NCard title="Properties" size="small" class="!bg-white lg:col-span-1">
        <div v-if="!selectedNode && !selectedEdge && !selectedStation" class="text-xs text-slate-500">
          Select a node, station or edge to edit its properties.
        </div>

        <div v-if="selectedNode" class="flex flex-col gap-2 text-sm">
          <div class="text-xs uppercase tracking-wider text-slate-500">Node</div>
          <label class="text-xs text-slate-500">
            ID
            <NInput
              size="small"
              :value="selectedNode.id"
              @update:value="renameNode"
              class="mt-1 font-mono"
            />
          </label>
          <div class="flex justify-between"><span class="text-slate-500">X</span><span class="font-mono text-xs">{{ selectedNodeWorld.x.toFixed(3) }} m</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Y</span><span class="font-mono text-xs">{{ selectedNodeWorld.y.toFixed(3) }} m</span></div>
          <NButton size="small" type="error" ghost @click="deleteSelected">Delete</NButton>
        </div>

        <div v-if="selectedStation" class="flex flex-col gap-2 text-sm">
          <div class="text-xs uppercase tracking-wider text-slate-500">Station</div>
          <label class="text-xs text-slate-500">
            Name
            <NInput
              size="small"
              :value="selectedStation.name || selectedStation.id"
              @update:value="updateStationName"
              class="mt-1"
            />
          </label>
          <div class="flex justify-between"><span class="text-slate-500">ID</span><span class="font-mono text-xs text-brand-800">{{ selectedStation.id }}</span></div>
          <div class="text-xs text-slate-500">
            Kind
            <div class="mt-1 flex flex-wrap gap-1">
              <button
                v-for="k in STATION_KINDS"
                :key="k.value"
                :class="[
                  'rounded border px-2 py-1 text-xs transition',
                  selectedStation.kind === k.value
                    ? 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 hover:bg-slate-50',
                ]"
                :style="selectedStation.kind === k.value ? '' : `border-color: ${k.color}; color: ${k.color}`"
                @click="updateStationKind(k.value)"
              >{{ k.label }}</button>
            </div>
          </div>
          <div class="flex justify-between"><span class="text-slate-500">X</span><span class="font-mono text-xs">{{ selectedStationWorld.x.toFixed(3) }} m</span></div>
          <div class="flex justify-between"><span class="text-slate-500">Y</span><span class="font-mono text-xs">{{ selectedStationWorld.y.toFixed(3) }} m</span></div>
          <NButton size="small" type="error" ghost @click="deleteSelected">Delete</NButton>
        </div>

        <div v-if="selectedEdge" class="mt-4 flex flex-col gap-2 text-sm">
          <div class="text-xs uppercase tracking-wider text-slate-500">Edge</div>
          <div class="flex justify-between"><span class="text-slate-500">ID</span><span class="font-mono text-xs text-brand-800">{{ selectedEdge.id }}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">From</span><span class="font-mono text-xs">{{ selectedEdge.from }}</span></div>
          <div class="flex justify-between"><span class="text-slate-500">To</span><span class="font-mono text-xs">{{ selectedEdge.to }}</span></div>
          <label class="text-xs text-slate-500">
            Cost
            <input
              type="number" step="0.1"
              :value="selectedEdge.cost"
              @input="updateEdgeCost($event.target.value)"
              class="mt-1 w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs"
            />
          </label>
          <label class="text-xs text-slate-500">
            Max speed (m/s)
            <input
              type="number" step="0.1" min="0"
              :value="selectedEdge.maxSpeed"
              @input="updateEdgeSpeed($event.target.value)"
              class="mt-1 w-full rounded border border-slate-200 px-2 py-1 font-mono text-xs"
            />
          </label>
          <NButton size="small" type="error" ghost @click="deleteSelected">Delete</NButton>
        </div>
      </NCard>
    </div>

    <NModal
      v-model:show="showPreview"
      preset="card"
      title="Export preview"
      style="width: 90vw; max-width: 900px"
      :bordered="false"
      :segmented="{ content: 'soft' }"
    >
      <NTabs v-model:value="previewTab" type="line">
        <NTabPane name="geojson" tab="Nav2 GeoJSON (Route Server)">
          <div class="mb-2 flex justify-end gap-2">
            <NButton size="tiny" @click="copyToClipboard(previewGeoJson, 'GeoJSON')">Copy</NButton>
            <NButton size="tiny" type="primary" @click="doExportGeoJson">Download</NButton>
          </div>
          <pre class="max-h-[60vh] overflow-auto rounded bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-emerald-200">{{ previewGeoJson }}</pre>
        </NTabPane>
        <NTabPane name="lif" tab="VDA5050 LIF 1.0.0">
          <div class="mb-2 flex justify-end gap-2">
            <NButton size="tiny" @click="copyToClipboard(previewLif, 'LIF')">Copy</NButton>
            <NButton size="tiny" type="primary" @click="doExportLif">Download</NButton>
          </div>
          <pre class="max-h-[60vh] overflow-auto rounded bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-sky-200">{{ previewLif }}</pre>
        </NTabPane>
      </NTabs>
    </NModal>
  </div>
</template>
