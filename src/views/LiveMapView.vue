<script setup>
import { useRobotsStore } from '../stores/robots'
import { useMapsStore } from '../stores/maps'
import { NCard, NTag, NSelect } from 'naive-ui'
import { ref, computed, watchEffect } from 'vue'

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
}
const statusFill = {
  moving: '#dcfce7',
  charging: '#fef9c3',
  idle: '#e2e8f0',
  error: '#fee2e2',
  offline: '#f1f5f9',
}

const selected = ref(null)
const hovered = ref(null)

const SCALE = 25
const OFFSET_X = 60
const OFFSET_Y = 60

const filteredRobots = computed(() => {
  if (!activeMap.value) return robots.robots
  if (!activeMap.value.assignedRobots.length) return robots.robots
  return robots.robots.filter((r) => activeMap.value.assignedRobots.includes(r.id))
})

const markers = computed(() =>
  filteredRobots.value.map((r) => ({
    ...r,
    px: OFFSET_X + r.x * SCALE,
    py: OFFSET_Y + r.y * SCALE,
    stroke: statusColor[r.status],
    fill: statusFill[r.status],
    thetaDeg: (-r.theta * 180) / Math.PI,
  })),
)
</script>

<template>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
    <NCard size="small" class="lg:col-span-3 !bg-white">
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
          <span v-else class="text-xs text-slate-500">No maps uploaded yet</span>
        </div>
      </template>

      <div class="relative overflow-hidden rounded border border-slate-200 bg-slate-100" style="height: 640px">
        <svg class="h-full w-full" viewBox="0 0 700 600">
          <defs>
            <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#e2e8f0" stroke-width="1" />
            </pattern>
          </defs>
          <rect width="700" height="600" fill="url(#grid)" />

          <template v-if="activeMap">
            <image
              :href="activeMap.pgmDataUrl"
              x="60" y="60"
              width="580"
              :height="580 * (activeMap.height / activeMap.width)"
              preserveAspectRatio="xMidYMid meet"
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
              r="26"
              fill="#f97316"
              fill-opacity="0.28"
            />

            <g :transform="`rotate(${m.thetaDeg} ${m.px} ${m.py})`">
              <rect
                :x="m.px - 10"
                :y="m.py - 10"
                width="20"
                height="20"
                rx="3"
                :fill="m.fill"
                :stroke="m.stroke"
                stroke-width="2"
              />
              <rect
                :x="m.px - 3"
                :y="m.py - 15"
                width="6"
                height="6"
                rx="1"
                :fill="m.stroke"
              />
            </g>

            <text
              :x="m.px + 16"
              :y="m.py + 4"
              font-size="10"
              font-family="JetBrains Mono, monospace"
              fill="#0f172a"
            >
              {{ m.id }}
            </text>
          </g>

          <g v-if="hovered" pointer-events="none">
            <rect
              :x="Math.min(hovered.px + 40, 520)"
              :y="Math.max(hovered.py - 44, 8)"
              width="170"
              height="72"
              rx="4"
              fill="white"
              stroke="#1e40af"
              stroke-width="1"
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))"
            />
            <text
              :x="Math.min(hovered.px + 48, 528)"
              :y="Math.max(hovered.py - 26, 26)"
              font-size="11"
              font-family="JetBrains Mono, monospace"
              fill="#1e40af"
              font-weight="bold"
            >
              {{ hovered.id }}
            </text>
            <text
              :x="Math.min(hovered.px + 48, 528)"
              :y="Math.max(hovered.py - 12, 40)"
              font-size="10"
              font-family="JetBrains Mono, monospace"
              :fill="hovered.stroke"
            >
              ● {{ hovered.status }}
            </text>
            <text
              :x="Math.min(hovered.px + 48, 528)"
              :y="Math.max(hovered.py + 2, 54)"
              font-size="10"
              font-family="JetBrains Mono, monospace"
              fill="#64748b"
            >
              battery {{ hovered.battery }}%
            </text>
            <text
              :x="Math.min(hovered.px + 48, 528)"
              :y="Math.max(hovered.py + 16, 68)"
              font-size="10"
              font-family="JetBrains Mono, monospace"
              fill="#64748b"
            >
              {{ hovered.mission ? 'mission ' + hovered.mission : 'no mission' }}
            </text>
          </g>
        </svg>
      </div>
    </NCard>

    <NCard :title="selected ? selected.id : 'Robot details'" size="small" class="!bg-white">
      <div v-if="!selected" class="text-sm text-slate-500">Click a robot to see full details.</div>
      <div v-else class="flex flex-col gap-3 text-sm">
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
