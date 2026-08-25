<script setup>
import { computed, ref, onMounted, onBeforeUnmount, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMapsStore } from '../stores/maps'
import { pixelToWorld } from '../lib/nav2meta'
import { exportNav2GeoJson, downloadJson } from '../lib/exportGeoJson'
import { exportLif } from '../lib/exportLif'
import { graphConfigs } from '../lib/graphConfig'
import {
  NButton,
  NInput,
  NInputNumber,
  NSwitch,
  NDropdown,
  NModal,
  NTabs,
  NTabPane,
  NTag,
  useMessage,
} from 'naive-ui'

const route = useRoute()
const router = useRouter()
const store = useMapsStore()
const msg = useMessage()

const map = computed(() => store.get(route.params.id))

const nodes = reactive({})
const edges = reactive({})
const layouts = reactive({ nodes: {} })
const selectedNodes = ref([])
const selectedEdges = ref([])
const graph = ref(null)

// Инструменты (соответствуют toolbar-иконкам сверху)
const tool = ref('select') // 'select' | 'node' | 'edge' | 'station'
const fastCreate = ref(true)
const doubleWay = ref(false)

// Search в левой панели
const search = ref('')

// Visibility toggles
const showGrid = ref(true)
const showLabels = ref(true)
const showNodes = ref(true)
const showEdges = ref(true)
const gridInterval = ref(1)

// Edge draft (для tool='edge' — держим первую выбранную ноду)
let pendingEdgeStart = null

// Preview JSON модалка
const showPreview = ref(false)
const previewTab = ref('geojson')
const previewGeoJson = computed(() => {
  if (!map.value) return ''
  try { return JSON.stringify(exportNav2GeoJson(map.value), null, 2) }
  catch (e) { return `// error: ${e.message}` }
})
const previewLif = computed(() => {
  if (!map.value) return ''
  try { return JSON.stringify(exportLif(map.value), null, 2) }
  catch (e) { return `// error: ${e.message}` }
})

// История для undo/redo
const history = ref([])
const historyIdx = ref(-1)
function snapshotFromMap(m) {
  return {
    waypoints: m.waypoints.map((w) => ({ ...w })),
    edges: m.edges.map((e) => ({ ...e })),
    stations: (m.stations || []).map((s) => ({ ...s })),
  }
}
function pushHistory() {
  if (!map.value) return
  history.value = history.value.slice(0, historyIdx.value + 1)
  history.value.push(snapshotFromMap(map.value))
  historyIdx.value = history.value.length - 1
  if (history.value.length > 50) {
    history.value.shift()
    historyIdx.value--
  }
}
function undo() {
  if (historyIdx.value <= 0) return
  historyIdx.value--
  applySnapshot(history.value[historyIdx.value])
}
function redo() {
  if (historyIdx.value >= history.value.length - 1) return
  historyIdx.value++
  applySnapshot(history.value[historyIdx.value])
}
function applySnapshot(snap) {
  if (!map.value) return
  store.update(map.value.id, {
    waypoints: [...snap.waypoints],
    edges: [...snap.edges],
    stations: [...snap.stations],
  })
  syncFromStore()
}

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

// === sync store <-> v-network-graph ===
function syncFromStore() {
  if (!map.value) return
  const wpIds = new Set(map.value.waypoints.map((w) => w.id))
  const stationIds = new Set((map.value.stations || []).map((s) => s.id))
  const edgeIds = new Set(map.value.edges.map((e) => e.id))
  const allIds = new Set([...wpIds, ...stationIds])

  for (const id of Object.keys(edges)) if (!edgeIds.has(id)) delete edges[id]

  for (const wp of map.value.waypoints) {
    nodes[wp.id] = {
      name: wp.name || wp.id,
      __kind: 'waypoint',
      color: '#94a3b8',
    }
    layouts.nodes[wp.id] = { x: wp.u, y: wp.v }
  }
  for (const s of map.value.stations || []) {
    nodes[s.id] = {
      name: s.name || s.id,
      __kind: 'station',
      __stationKind: s.kind,
      color: stationColorFor(s.kind),
    }
    layouts.nodes[s.id] = { x: s.u, y: s.v }
  }
  for (const id of Object.keys(nodes)) if (!allIds.has(id) && !nodes[id]?.__hidden) delete nodes[id]
  for (const id of Object.keys(layouts.nodes)) if (!allIds.has(id) && !nodes[id]?.__hidden) delete layouts.nodes[id]

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

// === Interactions ===
function onViewClick(evt) {
  if (!map.value) return
  const pos = evt.point || (graph.value?.eventOffsetToSvg?.(evt.event) ?? null)
  if (!pos) return
  const u = pos.x, v = pos.y

  if (tool.value === 'node') {
    createNodeAt(u, v)
  } else if (tool.value === 'station') {
    createStationAt(u, v)
  } else if (tool.value === 'select') {
    selectedNodes.value = []
    selectedEdges.value = []
  }
}

function createNodeAt(u, v) {
  const id = 'n' + Math.floor(Math.random() * 9999) + '_' + Math.floor(Math.random() * 9999)
  const wp = { id, u, v, name: id, description: '', mapId: '' }
  let newEdges = map.value.edges
  if (fastCreate.value && selectedNodes.value.length === 1) {
    const fromId = selectedNodes.value[0]
    if (map.value.waypoints.some((x) => x.id === fromId) || (map.value.stations || []).some((s) => s.id === fromId)) {
      newEdges = [...newEdges, makeEdge(fromId, id)]
      if (doubleWay.value) newEdges = [...newEdges, makeEdge(id, fromId)]
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

function createStationAt(u, v) {
  const id = 's' + Math.floor(Math.random() * 9999) + '_' + Math.floor(Math.random() * 9999)
  const station = {
    id, u, v, name: id, description: '',
    kind: nextStationKind.value,
    interactionNodeIds: [],
  }
  store.update(map.value.id, { stations: [...(map.value.stations || []), station] })
  syncFromStore()
  selectedNodes.value = [id]
  pushHistory()
}

function makeEdge(fromId, toId) {
  return {
    id: fromId + '_' + toId,
    from: fromId,
    to: toId,
    cost: 0,
    maxSpeed: 1.0,
  }
}

function onNodeClick({ node }) {
  if (tool.value === 'edge') {
    if (!pendingEdgeStart) {
      pendingEdgeStart = node
      msg.info('Edge from ' + node + ' — click target')
    } else if (pendingEdgeStart !== node) {
      const eNew = makeEdge(pendingEdgeStart, node)
      const list = [...map.value.edges, eNew]
      if (doubleWay.value) list.push(makeEdge(node, pendingEdgeStart))
      store.update(map.value.id, { edges: list })
      pendingEdgeStart = null
      syncFromStore()
      pushHistory()
    }
    return
  }
  if (tool.value === 'node' && fastCreate.value && selectedNodes.value.length === 1 && selectedNodes.value[0] !== node) {
    const eNew = makeEdge(selectedNodes.value[0], node)
    const list = [...map.value.edges, eNew]
    if (doubleWay.value) list.push(makeEdge(node, selectedNodes.value[0]))
    store.update(map.value.id, { edges: list })
    syncFromStore()
    pushHistory()
  }
}

function onNodeDragEnd() {
  if (!map.value) return
  const wUpd = map.value.waypoints.map((wp) => {
    const lp = layouts.nodes[wp.id]
    return lp ? { ...wp, u: lp.x, v: lp.y } : wp
  })
  const sUpd = (map.value.stations || []).map((s) => {
    const lp = layouts.nodes[s.id]
    return lp ? { ...s, u: lp.x, v: lp.y } : s
  })
  store.update(map.value.id, { waypoints: wUpd, stations: sUpd })
  pushHistory()
}

function deleteSelected() {
  if (!map.value) return
  const nIds = new Set(selectedNodes.value)
  const eIds = new Set(selectedEdges.value)
  if (!nIds.size && !eIds.size) return
  const wps = map.value.waypoints.filter((w) => !nIds.has(w.id))
  const sts = (map.value.stations || []).filter((s) => !nIds.has(s.id))
  const es = map.value.edges.filter((e) => !eIds.has(e.id) && !nIds.has(e.from) && !nIds.has(e.to))
  store.update(map.value.id, { waypoints: wps, edges: es, stations: sts })
  selectedNodes.value = []
  selectedEdges.value = []
  syncFromStore()
  pushHistory()
}

function clearAll() {
  if (!confirm('Delete everything on this map?')) return
  store.update(map.value.id, { waypoints: [], edges: [], stations: [] })
  pendingEdgeStart = null
  selectedNodes.value = []
  selectedEdges.value = []
  syncFromStore()
  pushHistory()
}

// === Grid step перерасчёт в layout-единицы ===
const gridIntervalInLayout = computed(() => {
  const res = map.value?.meta?.resolution || 0.05
  return Math.max(0.5, gridInterval.value / res)
})

const dynamicConfig = computed(() => ({
  ...graphConfigs,
  view: {
    ...graphConfigs.view,
    grid: {
      ...graphConfigs.view.grid,
      visible: showGrid.value,
      interval: gridIntervalInLayout.value,
    },
  },
  node: {
    ...graphConfigs.node,
    normal: {
      ...graphConfigs.node.normal,
      type: (n) => (n.__kind === 'station' ? 'rect' : 'circle'),
      color: (n) => (n.__hidden ? 'transparent' : n.color || '#94a3b8'),
      radius: (n) => (n.__hidden ? 0 : n.__kind === 'station' ? 8 : 8),
      width: (n) => (n.__hidden ? 0 : 16),
      height: (n) => (n.__hidden ? 0 : 16),
      borderRadius: (n) => (n.__kind === 'station' ? 2 : undefined),
      strokeWidth: (n) => (n.__hidden ? 0 : 2),
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

const backgroundImage = computed(() =>
  map.value ? {
    href: map.value.pgmDataUrl,
    x: 0, y: 0,
    width: map.value.width,
    height: map.value.height,
  } : null
)

// === fit-to-map ===
function fitToMap() {
  if (!graph.value || !map.value) return
  const inst = graph.value
  const w = map.value.width, h = map.value.height
  try {
    const dummyIds = ['__fit_tl', '__fit_tr', '__fit_bl', '__fit_br']
    const positions = [{x:0,y:0}, {x:w,y:0}, {x:0,y:h}, {x:w,y:h}]
    for (let i = 0; i < 4; i++) {
      nodes[dummyIds[i]] = { name: '', __hidden: true }
      layouts.nodes[dummyIds[i]] = positions[i]
    }
    if (typeof inst.fitToContents === 'function') inst.fitToContents()
    setTimeout(() => {
      for (const id of dummyIds) {
        delete nodes[id]
        delete layouts.nodes[id]
      }
    }, 200)
  } catch {}
}

// === Экспорт ===
function doExportGeoJson() {
  const g = exportNav2GeoJson(map.value)
  downloadJson(`${map.value.name.replace(/\s+/g, '_')}.geojson`, g)
  msg.success(`Exported ${g.features.length} features`)
}
function doExportLif() {
  const l = exportLif(map.value)
  downloadJson(`${map.value.name.replace(/\s+/g, '_')}.lif.json`, l)
  msg.success(`Exported LIF ${l.metaInformation.lifVersion}`)
}
function saveToBackend() {
  msg.success(`Saved (mock). Backend: POST /api/maps/${map.value.id}`)
}
async function copyToClipboard(text, label) {
  try { await navigator.clipboard.writeText(text); msg.success(`${label} copied`) }
  catch { msg.error('Clipboard denied') }
}

// === Menu bar options ===
const fileMenu = [
  { label: 'Save', key: 'save' },
  { label: 'Preview JSON', key: 'preview' },
  { type: 'divider' },
  { label: 'Export Nav2 GeoJSON', key: 'export-geo' },
  { label: 'Export VDA5050 LIF', key: 'export-lif' },
  { type: 'divider' },
  { label: '← Back to Maps', key: 'back' },
]
function onFileMenu(key) {
  if (key === 'save') saveToBackend()
  else if (key === 'preview') showPreview.value = true
  else if (key === 'export-geo') doExportGeoJson()
  else if (key === 'export-lif') doExportLif()
  else if (key === 'back') router.push({ name: 'maps' })
}

const editMenu = [
  { label: 'Undo (Ctrl+Z)', key: 'undo' },
  { label: 'Redo (Ctrl+Y)', key: 'redo' },
  { type: 'divider' },
  { label: 'Delete Selected (Del)', key: 'delete' },
  { label: 'Clear all', key: 'clear' },
]
function onEditMenu(key) {
  if (key === 'undo') undo()
  else if (key === 'redo') redo()
  else if (key === 'delete') deleteSelected()
  else if (key === 'clear') clearAll()
}

const viewMenu = computed(() => [
  { label: (showNodes.value ? '✓ ' : '  ') + 'Nodes', key: 'toggle-nodes' },
  { label: (showEdges.value ? '✓ ' : '  ') + 'Edges', key: 'toggle-edges' },
  { label: (showLabels.value ? '✓ ' : '  ') + 'Labels', key: 'toggle-labels' },
  { label: (showGrid.value ? '✓ ' : '  ') + 'Grid', key: 'toggle-grid' },
  { type: 'divider' },
  { label: 'Fit to map', key: 'fit' },
])
function onViewMenu(key) {
  if (key === 'toggle-nodes') showNodes.value = !showNodes.value
  else if (key === 'toggle-edges') showEdges.value = !showEdges.value
  else if (key === 'toggle-labels') showLabels.value = !showLabels.value
  else if (key === 'toggle-grid') showGrid.value = !showGrid.value
  else if (key === 'fit') fitToMap()
}

const helpMenu = [
  { label: 'Docs', key: 'docs' },
  { label: 'About', key: 'about' },
]
function onHelpMenu(k) {
  if (k === 'docs') msg.info('See docs/ folder in repo')
  else if (k === 'about') msg.info('Fleet Manager · Map Editor · VDA5050 LIF + Nav2 GeoJSON')
}

// === Left sidebar lists ===
const filteredWaypoints = computed(() => {
  if (!map.value) return []
  const q = search.value.toLowerCase()
  return map.value.waypoints.filter((w) =>
    !q || w.id.toLowerCase().includes(q) || (w.name || '').toLowerCase().includes(q)
  )
})
const filteredStations = computed(() => {
  if (!map.value) return []
  const q = search.value.toLowerCase()
  return (map.value.stations || []).filter((s) =>
    !q || s.id.toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q)
  )
})
const filteredEdges = computed(() => {
  if (!map.value) return []
  const q = search.value.toLowerCase()
  return map.value.edges.filter((e) => !q || e.id.toLowerCase().includes(q))
})

function selectNode(id) {
  selectedNodes.value = [id]
  selectedEdges.value = []
  tool.value = 'select'
}
function selectEdge(id) {
  selectedEdges.value = [id]
  selectedNodes.value = []
  tool.value = 'select'
}

// === Right sidebar Edit form ===
const selectedWaypoint = computed(() => {
  if (selectedNodes.value.length !== 1) return null
  return map.value?.waypoints.find((w) => w.id === selectedNodes.value[0]) || null
})
const selectedStation = computed(() => {
  if (selectedNodes.value.length !== 1) return null
  return map.value?.stations?.find((s) => s.id === selectedNodes.value[0]) || null
})
const selectedEdge = computed(() => {
  if (selectedEdges.value.length !== 1) return null
  return map.value?.edges.find((e) => e.id === selectedEdges.value[0]) || null
})

const selectedWorld = computed(() => {
  const n = selectedWaypoint.value || selectedStation.value
  if (!n) return null
  return pixelToWorld(map.value.meta, n.u, n.v, map.value.height)
})
const connectedNodes = computed(() => {
  const n = selectedWaypoint.value || selectedStation.value
  if (!n) return []
  const set = new Set()
  for (const e of map.value.edges) {
    if (e.from === n.id) set.add(e.to)
    if (e.to === n.id) set.add(e.from)
  }
  return [...set]
})

function updateWaypointField(field, val) {
  if (!selectedWaypoint.value) return
  const list = map.value.waypoints.map((w) =>
    w.id === selectedWaypoint.value.id ? { ...w, [field]: val } : w
  )
  store.update(map.value.id, { waypoints: list })
}
function updateStationField(field, val) {
  if (!selectedStation.value) return
  const list = map.value.stations.map((s) =>
    s.id === selectedStation.value.id ? { ...s, [field]: val } : s
  )
  store.update(map.value.id, { stations: list })
  syncFromStore()
}
function updateEdgeField(field, val) {
  if (!selectedEdge.value) return
  const list = map.value.edges.map((e) =>
    e.id === selectedEdge.value.id ? { ...e, [field]: val } : e
  )
  store.update(map.value.id, { edges: list })
}
function renameWaypoint(newId) {
  if (!selectedWaypoint.value || !newId || newId === selectedWaypoint.value.id) return
  const safe = newId.trim()
  if (!safe) return
  if (map.value.waypoints.some((w) => w.id === safe) || map.value.stations?.some((s) => s.id === safe)) {
    return msg.error('ID must be unique')
  }
  const oldId = selectedWaypoint.value.id
  const wps = map.value.waypoints.map((w) => (w.id === oldId ? { ...w, id: safe } : w))
  const es = map.value.edges.map((e) => ({
    ...e,
    from: e.from === oldId ? safe : e.from,
    to: e.to === oldId ? safe : e.to,
  }))
  store.update(map.value.id, { waypoints: wps, edges: es })
  selectedNodes.value = [safe]
  syncFromStore()
}
function removeConnectionTo(otherId) {
  const n = selectedWaypoint.value || selectedStation.value
  if (!n) return
  const es = map.value.edges.filter(
    (e) => !((e.from === n.id && e.to === otherId) || (e.to === n.id && e.from === otherId))
  )
  store.update(map.value.id, { edges: es })
  syncFromStore()
}

// === Клавиатура ===
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
    e.preventDefault(); deleteSelected()
  } else if (e.key === 'Escape') {
    pendingEdgeStart = null
    selectedNodes.value = []
    selectedEdges.value = []
  } else if (e.key === 'v') tool.value = 'select'
  else if (e.key === 'n') tool.value = 'node'
  else if (e.key === 'e') tool.value = 'edge'
  else if (e.key === 's') tool.value = 'station'
}

onMounted(async () => {
  if (!map.value) { router.replace({ name: 'maps' }); return }
  syncFromStore()
  pushHistory()
  window.addEventListener('keydown', onKey)
  await new Promise((r) => setTimeout(r, 300))
  fitToMap()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})

// Курсор в мировых координатах — пока пусто, включим когда добьёмся точной конвертации через graph API
const cursorWorld = ref(null)

// Selector карт для переключения
const allMapsOptions = computed(() =>
  store.maps.map((m) => ({ label: m.name, value: m.id }))
)
function switchMap(id) {
  if (id && id !== map.value?.id) router.replace({ name: 'map-editor', params: { id } })
}

const TOOLS = [
  { key: 'select', label: 'Select (V)', icon: 'cursor' },
  { key: 'node', label: 'Node (N)', icon: 'circle' },
  { key: 'edge', label: 'Edge (E)', icon: 'arrow' },
  { key: 'station', label: 'Station (S)', icon: 'square' },
]
</script>

<template>
  <div v-if="!map" class="grid place-items-center py-20 text-slate-500">Loading map…</div>

  <div v-else class="editor-root flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-slate-50">
    <!-- Menu bar -->
    <div class="flex h-9 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-3 text-sm">
      <NDropdown trigger="click" :options="fileMenu" @select="onFileMenu">
        <button class="rounded px-3 py-1 hover:bg-slate-100">File</button>
      </NDropdown>
      <NDropdown trigger="click" :options="editMenu" @select="onEditMenu">
        <button class="rounded px-3 py-1 hover:bg-slate-100">Edit</button>
      </NDropdown>
      <NDropdown trigger="click" :options="viewMenu" @select="onViewMenu">
        <button class="rounded px-3 py-1 hover:bg-slate-100">View</button>
      </NDropdown>
      <NDropdown trigger="click" :options="helpMenu" @select="onHelpMenu">
        <button class="rounded px-3 py-1 hover:bg-slate-100">Help</button>
      </NDropdown>

      <div class="mx-3 h-4 w-px bg-slate-200" />

      <select
        class="rounded border border-slate-200 px-2 py-0.5 text-xs"
        :value="map.id"
        @change="switchMap($event.target.value)"
      >
        <option v-for="m in allMapsOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
      </select>
      <span class="font-mono text-[10px] text-slate-500">
        {{ map.width }}×{{ map.height }} · {{ map.meta.resolution }} m/px
      </span>

      <div class="flex-1" />

      <div class="font-mono text-[11px] text-slate-500">
        <span v-if="cursorWorld">
          cursor · {{ cursorWorld.x.toFixed(2) }} m, {{ cursorWorld.y.toFixed(2) }} m
        </span>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex h-11 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-3">
      <button
        v-for="t in TOOLS"
        :key="t.key"
        :class="[
          'tool-btn',
          tool === t.key ? 'active' : '',
        ]"
        :title="t.label"
        @click="tool = t.key; pendingEdgeStart = null"
      >
        <svg v-if="t.icon === 'cursor'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.5 18 2.4-8.1L21 10.5 3 3z"/></svg>
        <svg v-if="t.icon === 'circle'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>
        <svg v-if="t.icon === 'arrow'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        <svg v-if="t.icon === 'square'" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
      </button>

      <div class="mx-2 h-6 w-px bg-slate-200" />

      <button class="tool-btn" @click="undo" :disabled="historyIdx <= 0" title="Undo (Ctrl+Z)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14l-4-4 4-4"/><path d="M5 10h9a5 5 0 010 10h-4"/></svg>
      </button>
      <button class="tool-btn" @click="redo" :disabled="historyIdx >= history.length - 1" title="Redo (Ctrl+Y)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14l4-4-4-4"/><path d="M19 10h-9a5 5 0 000 10h4"/></svg>
      </button>
      <button class="tool-btn text-red-600" @click="deleteSelected" title="Delete (Del)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M6 6v14a2 2 0 002 2h8a2 2 0 002-2V6"/></svg>
      </button>

      <div class="mx-2 h-6 w-px bg-slate-200" />

      <button class="tool-btn" :class="{ active: showGrid }" @click="showGrid = !showGrid" title="Toggle grid">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>
      </button>
      <button class="tool-btn" :class="{ active: showLabels }" @click="showLabels = !showLabels" title="Toggle labels">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
      </button>
      <button class="tool-btn" @click="fitToMap" title="Fit to map">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/></svg>
      </button>

      <div class="mx-2 h-6 w-px bg-slate-200" />

      <label class="flex items-center gap-2 text-xs text-slate-600">
        Fast <NSwitch v-model:value="fastCreate" size="small" />
      </label>
      <label class="flex items-center gap-2 text-xs text-slate-600">
        Double Way <NSwitch v-model:value="doubleWay" size="small" />
      </label>

      <div class="mx-2 h-6 w-px bg-slate-200" />

      <div class="flex items-center gap-2 text-xs text-slate-600">
        Grid step
        <input type="range" min="0.1" max="10" step="0.1" v-model.number="gridInterval" class="w-24 accent-brand-800" />
        <span class="w-12 font-mono text-[10px] text-slate-500">{{ gridInterval }} m</span>
      </div>

      <div class="flex-1" />

      <button class="rounded border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50" @click="showPreview = true">Preview JSON</button>
      <button class="rounded bg-brand-800 px-3 py-1 text-xs text-white hover:bg-brand-900" @click="saveToBackend">Save</button>
    </div>

    <!-- Main split: left list | center graph | right form -->
    <div class="flex flex-1 overflow-hidden">
      <!-- LEFT SIDEBAR -->
      <aside class="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div class="border-b border-slate-100 p-3">
          <input
            v-model="search"
            type="search"
            placeholder="Search elements…"
            class="w-full rounded border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-800"
          />
        </div>
        <div class="flex-1 overflow-y-auto p-3 text-sm">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Nodes ({{ filteredWaypoints.length }})
          </div>
          <div class="mb-4 flex flex-col gap-0.5">
            <button
              v-for="w in filteredWaypoints"
              :key="w.id"
              :class="[
                'flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition',
                selectedNodes[0] === w.id ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50',
              ]"
              @click="selectNode(w.id)"
            >
              <span class="grid h-3 w-3 place-items-center rounded-full border border-slate-400"></span>
              <div class="flex flex-1 flex-col overflow-hidden">
                <span class="truncate font-medium">{{ w.name || w.id }}</span>
                <span class="truncate font-mono text-[10px] text-slate-500">{{ w.id }}</span>
              </div>
            </button>
          </div>

          <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Stations ({{ filteredStations.length }})
          </div>
          <div class="mb-4 flex flex-col gap-0.5">
            <button
              v-for="s in filteredStations"
              :key="s.id"
              :class="[
                'flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition',
                selectedNodes[0] === s.id ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50',
              ]"
              @click="selectNode(s.id)"
            >
              <span class="h-3 w-3 rounded-sm" :style="`background: ${stationColorFor(s.kind)}`"></span>
              <div class="flex flex-1 flex-col overflow-hidden">
                <span class="truncate font-medium">{{ s.name || s.id }}</span>
                <span class="truncate font-mono text-[10px] text-slate-500">{{ s.kind }} · {{ s.id }}</span>
              </div>
            </button>
          </div>

          <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Edges ({{ filteredEdges.length }})
          </div>
          <div class="flex flex-col gap-0.5">
            <button
              v-for="e in filteredEdges"
              :key="e.id"
              :class="[
                'flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition',
                selectedEdges[0] === e.id ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-50',
              ]"
              @click="selectEdge(e.id)"
            >
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" class="text-slate-500"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              <span class="truncate font-mono text-[10px]">{{ e.from }} → {{ e.to }}</span>
            </button>
          </div>
        </div>
        <div class="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-500">
          {{ (map.waypoints.length + (map.stations || []).length + map.edges.length) }} items
        </div>
      </aside>

      <!-- CENTER GRAPH -->
      <main class="relative flex-1 overflow-hidden bg-white">
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
          class="absolute inset-0"
        >
          <template #map v-if="backgroundImage">
            <image
              :href="backgroundImage.href"
              :x="backgroundImage.x"
              :y="backgroundImage.y"
              :width="backgroundImage.width"
              :height="backgroundImage.height"
              opacity="0.55"
              pointer-events="none"
            />
          </template>
        </v-network-graph>

        <!-- Cursor hint внизу -->
        <div v-if="cursorWorld" class="pointer-events-none absolute bottom-2 left-3 rounded bg-slate-900 px-2 py-1 font-mono text-[10px] text-emerald-200">
          {{ cursorWorld.x.toFixed(3) }} m, {{ cursorWorld.y.toFixed(3) }} m
        </div>

        <!-- Tool hint -->
        <div class="pointer-events-none absolute bottom-2 right-3 rounded bg-white px-2 py-1 text-[10px] text-slate-500 shadow">
          Tool: <span class="font-semibold">{{ TOOLS.find(t => t.key === tool)?.label }}</span>
          <span v-if="pendingEdgeStart" class="ml-2 text-brand-800">— from {{ pendingEdgeStart }}</span>
        </div>
      </main>

      <!-- RIGHT SIDEBAR — Edit form -->
      <aside class="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
        <div class="border-b border-slate-100 p-4">
          <div v-if="selectedWaypoint">
            <h3 class="mb-3 text-base font-semibold">Edit Node</h3>
            <div class="flex flex-col gap-3">
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Node Id
                <NInput :value="selectedWaypoint.id" @update:value="renameWaypoint" size="small" />
              </label>
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Node Name
                <NInput :value="selectedWaypoint.name || ''" @update:value="(v) => updateWaypointField('name', v)" size="small" />
              </label>
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Node Description
                <NInput
                  type="textarea"
                  :value="selectedWaypoint.description || ''"
                  @update:value="(v) => updateWaypointField('description', v)"
                  size="small"
                  :autosize="{ minRows: 2, maxRows: 4 }"
                />
              </label>
              <div class="grid grid-cols-2 gap-2">
                <label class="flex flex-col gap-1 text-xs text-slate-500">
                  Node X (m)
                  <div class="font-mono text-sm text-slate-700">{{ selectedWorld.x.toFixed(3) }}</div>
                </label>
                <label class="flex flex-col gap-1 text-xs text-slate-500">
                  Node Y (m)
                  <div class="font-mono text-sm text-slate-700">{{ selectedWorld.y.toFixed(3) }}</div>
                </label>
              </div>
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Map Id
                <NInput
                  :value="selectedWaypoint.mapId || ''"
                  @update:value="(v) => updateWaypointField('mapId', v)"
                  size="small"
                  placeholder="e.g. warehouse-f1"
                />
              </label>
              <div>
                <div class="mb-1 text-xs text-slate-500">Connected Nodes</div>
                <div class="flex flex-wrap gap-1 rounded border border-slate-200 p-2 min-h-[36px]">
                  <NTag
                    v-for="id in connectedNodes"
                    :key="id"
                    size="small"
                    closable
                    @close="removeConnectionTo(id)"
                  >
                    {{ id }}
                  </NTag>
                  <span v-if="!connectedNodes.length" class="text-[10px] text-slate-400">Nodes…</span>
                </div>
              </div>
              <div>
                <div class="mb-1 text-xs text-slate-500">Vehicle Type Node Properties</div>
                <button
                  class="flex w-full items-center justify-center gap-2 rounded border border-dashed border-slate-300 py-2 text-xs text-slate-500 hover:border-brand-800 hover:text-brand-800"
                  @click="msg.info('VDA5050 vehicle properties editor — coming next iteration')"
                >
                  + Add
                </button>
              </div>
              <div class="mt-2 flex gap-2">
                <button class="flex-1 rounded bg-brand-800 py-2 text-sm text-white hover:bg-brand-900" @click="saveToBackend">Save</button>
                <button class="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50" @click="deleteSelected">Delete</button>
              </div>
            </div>
          </div>

          <div v-else-if="selectedStation">
            <h3 class="mb-3 text-base font-semibold">Edit Station</h3>
            <div class="flex flex-col gap-3">
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Station Id
                <div class="font-mono text-sm">{{ selectedStation.id }}</div>
              </label>
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Name
                <NInput :value="selectedStation.name || selectedStation.id" @update:value="(v) => updateStationField('name', v)" size="small" />
              </label>
              <div>
                <div class="mb-1 text-xs text-slate-500">Kind</div>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="k in STATION_KINDS"
                    :key="k.value"
                    :class="[
                      'rounded border px-2 py-1 text-xs transition',
                      selectedStation.kind === k.value ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 hover:bg-slate-50',
                    ]"
                    :style="selectedStation.kind === k.value ? '' : `color: ${k.color}; border-color: ${k.color}`"
                    @click="updateStationField('kind', k.value)"
                  >{{ k.label }}</button>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="flex flex-col gap-1 text-xs text-slate-500">
                  X (m)
                  <div class="font-mono text-sm text-slate-700">{{ selectedWorld.x.toFixed(3) }}</div>
                </div>
                <div class="flex flex-col gap-1 text-xs text-slate-500">
                  Y (m)
                  <div class="font-mono text-sm text-slate-700">{{ selectedWorld.y.toFixed(3) }}</div>
                </div>
              </div>
              <div class="mt-2 flex gap-2">
                <button class="flex-1 rounded bg-brand-800 py-2 text-sm text-white hover:bg-brand-900" @click="saveToBackend">Save</button>
                <button class="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50" @click="deleteSelected">Delete</button>
              </div>
            </div>
          </div>

          <div v-else-if="selectedEdge">
            <h3 class="mb-3 text-base font-semibold">Edit Edge</h3>
            <div class="flex flex-col gap-3">
              <div class="text-xs text-slate-500">
                {{ selectedEdge.from }} → {{ selectedEdge.to }}
              </div>
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Cost
                <NInputNumber :value="selectedEdge.cost" @update:value="(v) => updateEdgeField('cost', v)" size="small" :step="0.1" />
              </label>
              <label class="flex flex-col gap-1 text-xs text-slate-500">
                Max speed (m/s)
                <NInputNumber :value="selectedEdge.maxSpeed" @update:value="(v) => updateEdgeField('maxSpeed', v)" size="small" :min="0" :step="0.1" />
              </label>
              <div class="mt-2 flex gap-2">
                <button class="flex-1 rounded bg-brand-800 py-2 text-sm text-white hover:bg-brand-900" @click="saveToBackend">Save</button>
                <button class="rounded border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50" @click="deleteSelected">Delete</button>
              </div>
            </div>
          </div>

          <div v-else class="text-center text-xs text-slate-400 py-8">
            <div class="mb-2 text-3xl">◯</div>
            Select a node, station or edge to edit
          </div>
        </div>
      </aside>
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

<style scoped>
.editor-root {
  height: calc(100vh - 56px);
}
.tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  color: #475569;
  transition: background 0.15s;
}
.tool-btn:hover:not(:disabled) {
  background: #f1f5f9;
}
.tool-btn.active {
  background: #1e40af;
  color: #ffffff;
}
.tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
