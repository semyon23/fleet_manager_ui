<script setup>
import { useRobotsStore } from '../stores/robots'
import { useMapsStore } from '../stores/maps'
import { NCard, NTag, NSelect, NSwitch } from 'naive-ui'
import { ref, computed, watchEffect } from 'vue'
import { spriteFor, previewSpriteFor, tintStyle } from '../lib/robotSprite'
import { stationKindMeta } from '../lib/theme'

const robots = useRobotsStore()
const maps = useMapsStore()

const selectedMapId = ref(maps.maps[0]?.id || null)
watchEffect(() => {
  if (!selectedMapId.value && maps.maps.length) selectedMapId.value = maps.maps[0].id
})

const activeMap = computed(() => (selectedMapId.value ? maps.get(selectedMapId.value) : null))
const mapOptions = computed(() =>
  maps.maps.length ? maps.maps.map((m) => ({ label: m.name, value: m.id })) : [],
)

const statusColor = {
  moving: '#22c55e',
  charging: '#eab308',
  idle: '#64748b',
  error: '#ef4444',
  offline: '#94a3b8',
  teleop: '#8b5cf6',
  deploying: '#f97316',
}

const selected = ref(null)
const hovered = ref(null)

const SCALE = 25
const OFFSET_X = 60
const OFFSET_Y = 60
const ROBOT_SIZE = 56

const filteredRobots = computed(() => {
  if (!activeMap.value) return robots.robots
  if (!activeMap.value.assignedRobots.length) return robots.robots
  return robots.robots.filter((r) => activeMap.value.assignedRobots.includes(r.id))
})

// Показывать сохранённые маршруты (waypoints + edges) поверх карты
const showRoutes = ref(true)

// Zoom: применяется к inner <g> внутри SVG. 1 = fit-to-content viewBox.
const ZOOM_MIN = 0.25
const ZOOM_MAX = 5
const ZOOM_STEP = 1.25
const zoom = ref(1)
function zoomIn() { zoom.value = Math.min(ZOOM_MAX, zoom.value * ZOOM_STEP) }
function zoomOut() { zoom.value = Math.max(ZOOM_MIN, zoom.value / ZOOM_STEP) }
function zoomReset() { zoom.value = 1 }  // fit-to-content
const zoomTransform = computed(() => {
  const w = activeMap.value ? activeMap.value.width + PADDING * 2 : 700
  const h = activeMap.value ? activeMap.value.height + PADDING * 2 : 600
  // Zoom относительно центра карты: translate → scale → translate back
  return `translate(${w / 2} ${h / 2}) scale(${zoom.value}) translate(${-w / 2} ${-h / 2})`
})

// Fit-to-content: viewBox подстраивается под размер активной карты. Так и маленькие,
// и большие карты нормально центрируются, а preserveAspectRatio="xMidYMid meet" даёт
// пропорциональное вписывание в контейнер любой высоты.
const PADDING = 60  // отступ вокруг карты в пиксельной координатной системе PGM
const viewBox = computed(() => {
  if (activeMap.value) {
    const w = activeMap.value.width + PADDING * 2
    const h = activeMap.value.height + PADDING * 2
    return `0 0 ${w} ${h}`
  }
  return '0 0 700 600'  // placeholder viewBox для случая "нет карты"
})

// Stations в пиксельных координатах карты (+PADDING). SVG viewBox уже покрывает нужный диапазон.
const stations = computed(() => {
  if (!activeMap.value?.stations?.length) return []
  return activeMap.value.stations.map((st) => {
    const meta = stationKindMeta(st.kind)
    return {
      id: st.id,
      name: st.name || st.id,
      kind: st.kind,
      x: PADDING + st.u,
      y: PADDING + st.v,
      color: meta.color,
      icon: meta.icon,
    }
  })
})

const waypoints = computed(() => {
  if (!showRoutes.value || !activeMap.value?.waypoints?.length) return []
  return activeMap.value.waypoints.map((wp) => ({
    id: wp.id,
    name: wp.name || wp.id,
    x: PADDING + wp.u,
    y: PADDING + wp.v,
  }))
})

const edges = computed(() => {
  if (!showRoutes.value || !activeMap.value?.edges?.length) return []
  const byId = new Map(activeMap.value.waypoints.map((w) => [w.id, w]))
  const out = []
  for (const e of activeMap.value.edges) {
    const a = byId.get(e.from)
    const b = byId.get(e.to)
    if (!a || !b) continue
    out.push({
      id: e.id,
      x1: PADDING + a.u, y1: PADDING + a.v,
      x2: PADDING + b.u, y2: PADDING + b.v,
    })
  }
  return out
})

const markers = computed(() =>
  filteredRobots.value.map((r) => ({
    ...r,
    px: OFFSET_X + r.x * SCALE,
    py: OFFSET_Y + r.y * SCALE,
    stroke: statusColor[r.status],
    thetaDeg: (-r.theta * 180) / Math.PI,
    activeSprite: spriteFor(r),
    isTopView: r.status !== 'moving',
    tintFilter: `url(#tint-${r.status})`,
  })),
)
</script>

<template>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
    <NCard size="small" class="lg:col-span-3 !bg-white dark:!bg-slate-900">
      <template #header>
        <div class="flex items-center gap-3">
          <span class="text-base font-semibold">Live Map</span>
          <NSelect
            v-if="mapOptions.length"
            v-model:value="selectedMapId"
            :options="mapOptions"
            size="small"
            style="width: 240px"
          />
          <router-link v-else to="/maps" class="text-xs text-brand-700 dark:text-brand-300 hover:underline">
            No maps uploaded yet → upload one
          </router-link>
        </div>
      </template>
      <template #header-extra>
        <label class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          Show routes
          <NSwitch v-model:value="showRoutes" size="small" />
        </label>
      </template>

      <div class="relative overflow-hidden rounded border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" style="height: calc(100vh - 11rem); min-height: 480px">
        <svg class="h-full w-full" :viewBox="viewBox" preserveAspectRatio="xMidYMid meet">
          <defs>
            <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#e2e8f0" stroke-width="1" />
            </pattern>
            <filter id="robot-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.25" />
            </filter>

            <!-- Тонирование спрайта по статусу через hue-rotate.
                 Базовый цвет свечений робота — синий (~220°).
                 Белые/чёрные корпусные части не меняются. -->
            <filter id="tint-moving">
              <feColorMatrix type="hueRotate" values="-120" />
            </filter>
            <filter id="tint-charging">
              <feColorMatrix type="hueRotate" values="-160" />
            </filter>
            <filter id="tint-error">
              <feColorMatrix type="hueRotate" values="140" />
            </filter>
            <filter id="tint-idle">
              <feColorMatrix type="saturate" values="0.15" />
            </filter>
            <filter id="tint-offline">
              <feColorMatrix type="matrix"
                values="0.33 0.33 0.33 0 0
                        0.33 0.33 0.33 0 0
                        0.33 0.33 0.33 0 0
                        0    0    0    0.5 0" />
            </filter>
          </defs>

          <!-- Grid покрывает всю viewBox — считается через .baseVal чтоб не гардкодить. -->
          <rect x="0" y="0" width="100%" height="100%" fill="url(#grid)" />

          <g :transform="zoomTransform">
          <template v-if="activeMap">
            <image
              :href="activeMap.pgmDataUrl"
              :x="60" :y="60"
              :width="activeMap.width"
              :height="activeMap.height"
              preserveAspectRatio="none"
              opacity="0.55"
            />
          </template>
          <template v-else>
            <rect x="60" y="60" width="580" height="480" fill="#f8fafc" stroke="#1e40af" stroke-width="2" />
            <rect x="80" y="80" width="120" height="80" fill="#dbeafe" stroke="#1e40af" stroke-dasharray="4 4" />
            <text x="90" y="110" font-size="11" fill="#1e40af" font-family="monospace">CHARGE ZONE</text>
            <rect x="450" y="400" width="150" height="100" fill="#fef3c7" stroke="#eab308" stroke-dasharray="4 4" />
            <text x="460" y="425" font-size="11" fill="#92400e" font-family="monospace">LOADING</text>
          </template>

          <!-- Route edges — линии между waypoints (тонкие, под остальным) -->
          <g v-if="showRoutes" stroke="#1e40af" stroke-opacity="0.55" stroke-width="1.5" fill="none">
            <line v-for="e in edges" :key="e.id"
                  :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2" stroke-linecap="round" />
          </g>

          <!-- Waypoints — маленькие точки с id-подписью -->
          <g v-if="showRoutes">
            <g v-for="wp in waypoints" :key="wp.id" :transform="`translate(${wp.x} ${wp.y})`">
              <circle r="4" fill="#1e40af" stroke="#ffffff" stroke-width="1.5" />
              <text y="-8" text-anchor="middle" font-size="8" font-family="JetBrains Mono, monospace"
                    fill="#1e3a8a" opacity="0.75">{{ wp.name }}</text>
            </g>
          </g>

          <!-- Stations из карты — rounded square + белая иконка типа -->
          <g v-for="st in stations" :key="st.id" :transform="`translate(${st.x} ${st.y})`">
            <rect x="-14" y="-14" width="28" height="28" rx="5"
                  :fill="st.color" stroke="#ffffff" stroke-width="1.5"
                  filter="drop-shadow(0 1px 2px rgba(0,0,0,0.25))" />
            <g fill="#ffffff" stroke="none" pointer-events="none">
              <path v-if="st.icon === 'bolt'" d="M-3 -8 L 4 -1 L 0 -1 L 3 8 L -4 1 L 0 1 Z" />
              <text v-else-if="st.icon === 'p'" x="0" y="4" text-anchor="middle"
                    font-size="14" font-weight="700" font-family="system-ui, sans-serif">P</text>
              <path v-else-if="st.icon === 'loading'" d="M0 -8 L 3.5 -2.5 L 1 -2.5 L 1 2.5 L 3.5 2.5 L 0 8 L -3.5 2.5 L -1 2.5 L -1 -2.5 L -3.5 -2.5 Z" />
              <polygon v-else-if="st.icon === 'star'" points="0,-8 2.3,-2.5 8,-2.5 3.4,1 5.2,6.5 0,3.2 -5.2,6.5 -3.4,1 -8,-2.5 -2.3,-2.5" />
            </g>
            <text y="24" text-anchor="middle" font-size="9" font-family="JetBrains Mono, monospace" fill="#475569">
              {{ st.name }}
            </text>
          </g>

          <g
            v-for="m in markers"
            :key="m.id"
            style="cursor: pointer"
            @click="selected = m"
            @mouseenter="hovered = m"
            @mouseleave="hovered = null"
          >
            <circle
              v-if="hovered && hovered.id === m.id"
              :cx="m.px"
              :cy="m.py"
              :r="ROBOT_SIZE / 2 + 8"
              fill="#f97316"
              fill-opacity="0.28"
            />

            <ellipse
              :cx="m.px"
              :cy="m.py + ROBOT_SIZE / 2 - 4"
              :rx="ROBOT_SIZE / 2 - 4"
              ry="4"
              fill="black"
              fill-opacity="0.18"
            />

            <image
              :href="m.activeSprite"
              :x="m.px - ROBOT_SIZE / 2"
              :y="m.py - ROBOT_SIZE / 2"
              :width="ROBOT_SIZE"
              :height="ROBOT_SIZE"
              :filter="m.tintFilter"
            />

            <!-- Указатель ориентации только для top-view (когда робот стоит, спрайт симметричный).
                 Треугольник вокруг корпуса показывает где "перед". -->
            <g v-if="m.isTopView && m.status !== 'offline'"
               :transform="`translate(${m.px} ${m.py}) rotate(${-m.thetaDeg})`">
              <polygon
                :points="`${ROBOT_SIZE / 2 + 6},0 ${ROBOT_SIZE / 2 + 14},-5 ${ROBOT_SIZE / 2 + 14},5`"
                :fill="m.stroke"
                stroke="white"
                stroke-width="1"
              />
            </g>

            <g :transform="`translate(${m.px + ROBOT_SIZE / 2 - 6} ${m.py - ROBOT_SIZE / 2 + 6})`">
              <circle r="6" fill="white" />
              <circle r="5" :fill="m.stroke" />
            </g>

            <text
              :x="m.px"
              :y="m.py + ROBOT_SIZE / 2 + 22"
              text-anchor="middle"
              font-size="10"
              font-family="JetBrains Mono, monospace"
              fill="#0f172a"
              font-weight="500"
            >
              {{ m.id }}
            </text>
          </g>

          <g v-if="hovered" pointer-events="none">
            <rect
              :x="Math.min(hovered.px + 40, 510)"
              :y="Math.max(hovered.py - 56, 8)"
              width="180"
              height="86"
              rx="4"
              fill="white"
              stroke="#1e40af"
              stroke-width="1"
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.15))"
            />
            <text
              :x="Math.min(hovered.px + 48, 518)"
              :y="Math.max(hovered.py - 38, 26)"
              font-size="11"
              font-family="JetBrains Mono, monospace"
              fill="#1e40af"
              font-weight="bold"
            >
              {{ hovered.id }} · {{ hovered.model }}
            </text>
            <text
              :x="Math.min(hovered.px + 48, 518)"
              :y="Math.max(hovered.py - 22, 42)"
              font-size="10"
              font-family="JetBrains Mono, monospace"
              :fill="hovered.stroke"
            >
              ● {{ hovered.status }}
            </text>
            <text
              :x="Math.min(hovered.px + 48, 518)"
              :y="Math.max(hovered.py - 8, 56)"
              font-size="10"
              font-family="JetBrains Mono, monospace"
              fill="#64748b"
            >
              battery {{ hovered.battery }}%
            </text>
            <text
              :x="Math.min(hovered.px + 48, 518)"
              :y="Math.max(hovered.py + 6, 70)"
              font-size="10"
              font-family="JetBrains Mono, monospace"
              fill="#64748b"
            >
              {{ hovered.mission ? 'mission ' + hovered.mission : 'no mission' }}
            </text>
          </g>
          </g><!-- /zoomTransform -->
        </svg>

        <!-- Zoom controls overlay -->
        <div class="absolute right-3 top-3 flex flex-col overflow-hidden rounded border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <button
            class="grid h-8 w-8 place-items-center border-b border-slate-100 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Zoom in"
            @click="zoomIn"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button
            class="grid h-8 w-8 place-items-center border-b border-slate-100 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Zoom out"
            @click="zoomOut"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>
          </button>
          <button
            class="grid h-8 w-8 place-items-center border-b border-slate-100 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Reset zoom (1:1)"
            @click="zoomReset"
          >
            <span class="text-[9px] font-semibold">1:1</span>
          </button>
          <button
            class="grid h-8 w-8 place-items-center text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Fit to map"
            @click="zoomReset"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/></svg>
          </button>
        </div>

        <div class="pointer-events-none absolute bottom-2 right-3 rounded bg-white/85 px-2 py-0.5 text-[10px] font-mono text-slate-500 shadow dark:bg-slate-900/85 dark:text-slate-400">
          zoom {{ Math.round(zoom * 100) }}%
        </div>
      </div>
    </NCard>

    <NCard :title="selected ? selected.id : 'Robot details'" size="small" class="!bg-white dark:!bg-slate-900">
      <div v-if="!selected" class="text-sm text-slate-500">Click a robot to see full details.</div>
      <div v-else class="flex flex-col gap-3 text-sm">
        <div class="grid place-items-center rounded bg-slate-100 py-3">
          <img
            :src="previewSpriteFor(selected)"
            :alt="selected.id"
            class="h-32 w-32 object-contain"
            :style="tintStyle(selected.status)"
          />
        </div>
        <div class="flex justify-between"><span class="text-slate-500">Model</span><span class="font-mono">{{ selected.model }}</span></div>
        <div class="flex justify-between">
          <span class="text-slate-500">Status</span>
          <NTag :color="{ color: selected.stroke, textColor: 'white' }" size="small">{{ selected.status }}</NTag>
        </div>
        <div class="flex justify-between"><span class="text-slate-500">Battery</span><span class="font-mono">{{ selected.battery }}%</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Position</span><span class="font-mono text-xs">{{ selected.x.toFixed(2) }}, {{ selected.y.toFixed(2) }} m</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Heading</span><span class="font-mono text-xs">{{ ((selected.theta * 180) / Math.PI).toFixed(1) }}°</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Mission</span><span class="font-mono text-xs">{{ selected.mission || '—' }}</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Uptime</span><span class="font-mono text-xs">{{ selected.uptime }}</span></div>
        <div class="mt-3 flex gap-2">
          <button class="flex-1 rounded bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200">Pause</button>
          <button class="flex-1 rounded bg-red-100 px-3 py-2 text-xs text-red-800 hover:bg-red-200">Stop</button>
          <button class="flex-1 rounded bg-brand-100 px-3 py-2 text-xs text-brand-800 hover:bg-brand-200">Home</button>
        </div>
      </div>
    </NCard>
  </div>
</template>
