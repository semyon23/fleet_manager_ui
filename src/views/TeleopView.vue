<script setup>
import { useRobotsStore } from '../stores/robots'
import { NCard, NSelect } from 'naive-ui'
import { ref } from 'vue'

const store = useRobotsStore()
const selected = ref(store.robots[0].id)
const speed = ref(0.3)

const options = store.robots.map((r) => ({ label: `${r.id} (${r.status})`, value: r.id }))

function cmd(action) {
  console.log('[teleop]', selected.value, action, 'speed', speed.value)
}
</script>

<template>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
    <NCard title="Manual control" size="small" class="lg:col-span-2 !bg-white">
      <div class="mb-4 flex items-center gap-3">
        <span class="text-sm text-slate-500">Robot:</span>
        <NSelect v-model:value="selected" :options="options" size="small" style="width: 260px" />
      </div>

      <div class="mx-auto grid w-64 grid-cols-3 gap-2 py-4">
        <div />
        <button class="rounded bg-brand-100 py-4 font-mono text-xl text-brand-800 hover:bg-brand-200" @click="cmd('forward')">▲</button>
        <div />
        <button class="rounded bg-brand-100 py-4 font-mono text-xl text-brand-800 hover:bg-brand-200" @click="cmd('left')">◀</button>
        <button class="rounded bg-red-100 py-4 font-mono text-xl text-red-800 hover:bg-red-200" @click="cmd('stop')">■</button>
        <button class="rounded bg-brand-100 py-4 font-mono text-xl text-brand-800 hover:bg-brand-200" @click="cmd('right')">▶</button>
        <div />
        <button class="rounded bg-brand-100 py-4 font-mono text-xl text-brand-800 hover:bg-brand-200" @click="cmd('back')">▼</button>
        <div />
      </div>

      <div class="mt-4 flex flex-col gap-2">
        <label class="text-sm text-slate-500">Speed: <span class="font-mono text-brand-800">{{ speed.toFixed(2) }} m/s</span></label>
        <input v-model.number="speed" type="range" min="0.05" max="1.5" step="0.05" class="w-full accent-brand-800" />
      </div>
    </NCard>

    <NCard title="Live feed" size="small" class="!bg-white">
      <div class="grid h-64 place-items-center rounded border border-slate-200 bg-slate-900 text-slate-500 font-mono text-sm">
        [ video stream placeholder ]
      </div>
      <div class="mt-3 flex flex-col gap-1 font-mono text-xs text-slate-500">
        <div>Latency: <span class="text-brand-800">— ms</span></div>
        <div>Codec: <span class="text-brand-800">H.264</span></div>
        <div>WS: <span class="text-status-idle">not connected</span></div>
      </div>
    </NCard>
  </div>
</template>
