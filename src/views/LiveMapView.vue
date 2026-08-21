<script setup>
import { useRobotsStore } from '../stores/robots'
import { NCard, NTag } from 'naive-ui'
import { ref, computed } from 'vue'

const store = useRobotsStore()
const selected = ref(null)

const statusColor = {
  moving: '#22c55e',
  charging: '#eab308',
  idle: '#94a3b8',
  error: '#ef4444',
  offline: '#64748b',
}

const SCALE = 25
const OFFSET_X = 60
const OFFSET_Y = 60

const markers = computed(() =>
  store.robots.map((r) => ({
    ...r,
    px: OFFSET_X + r.x * SCALE,
    py: OFFSET_Y + r.y * SCALE,
    color: statusColor[r.status],
    dirX: Math.cos(r.theta) * 14,
    dirY: -Math.sin(r.theta) * 14,
  }))
)
</script>

<template>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
    <NCard title="Warehouse — Floor 1" size="small" class="lg:col-span-3 !bg-white">
      <div class="relative overflow-hidden rounded border border-slate-200 bg-slate-100" style="height: 600px">
        <svg class="h-full w-full" viewBox="0 0 700 600">
          <defs>
            <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
              <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#e2e8f0" stroke-width="1" />
            </pattern>
          </defs>
          <rect width="700" height="600" fill="url(#grid)" />
          <rect x="60" y="60" width="580" height="480" fill="#f8fafc" stroke="#1e40af" stroke-width="2" />
          <rect x="80" y="80" width="120" height="80" fill="#dbeafe" stroke="#1e40af" stroke-dasharray="4 4" />
          <text x="90" y="110" font-size="11" fill="#1e40af" font-family="monospace">CHARGE ZONE</text>
          <rect x="450" y="400" width="150" height="100" fill="#fef3c7" stroke="#eab308" stroke-dasharray="4 4" />
          <text x="460" y="425" font-size="11" fill="#92400e" font-family="monospace">LOADING</text>

          <g v-for="m in markers" :key="m.id" @click="selected = m" style="cursor: pointer">
            <circle :cx="m.px" :cy="m.py" r="14" :fill="m.color" fill-opacity="0.25" />
            <circle :cx="m.px" :cy="m.py" r="8" :fill="m.color" stroke="white" stroke-width="2" />
            <line :x1="m.px" :y1="m.py" :x2="m.px + m.dirX" :y2="m.py + m.dirY" :stroke="m.color" stroke-width="2" />
            <text :x="m.px + 12" :y="m.py - 12" font-size="10" font-family="monospace" fill="#1e40af">
              {{ m.id }}
            </text>
          </g>
        </svg>
      </div>
    </NCard>

    <NCard :title="selected ? selected.id : 'Robot details'" size="small" class="!bg-white">
      <div v-if="!selected" class="text-sm text-slate-500">Click a robot on the map to see details.</div>
      <div v-else class="flex flex-col gap-3 text-sm">
        <div class="flex justify-between"><span class="text-slate-500">Model</span><span class="font-mono">{{ selected.model }}</span></div>
        <div class="flex justify-between">
          <span class="text-slate-500">Status</span>
          <NTag :color="{ color: selected.color, textColor: 'white' }" size="small">{{ selected.status }}</NTag>
        </div>
        <div class="flex justify-between"><span class="text-slate-500">Battery</span><span class="font-mono">{{ selected.battery }}%</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Position</span><span class="font-mono text-xs">{{ selected.x.toFixed(2) }}, {{ selected.y.toFixed(2) }} m</span></div>
        <div class="flex justify-between"><span class="text-slate-500">Heading</span><span class="font-mono text-xs">{{ (selected.theta * 180 / Math.PI).toFixed(1) }}°</span></div>
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
