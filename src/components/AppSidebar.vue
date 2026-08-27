<script setup>
import { RouterLink } from 'vue-router'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: '□' },
  { to: '/live', label: 'Live Map', icon: '◈' },
  { to: '/maps', label: 'Maps', icon: '✎' },
  { to: '/robots', label: 'Robots', icon: '◉' },
  { to: '/missions', label: 'Missions', icon: '≡' },
  { to: '/alerts', label: 'Alerts', icon: '!' },
  { to: '/teleop', label: 'Teleop', icon: '⇔' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]
</script>

<template>
  <aside class="flex h-full w-60 flex-col border-r border-slate-200 bg-white">
    <div class="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
      <div class="grid h-8 w-8 place-items-center rounded bg-brand-800 font-mono text-sm font-bold text-white">
        FM
      </div>
      <div class="flex flex-col">
        <span class="text-sm font-semibold text-slate-900">Fleet Manager</span>
        <span class="text-[10px] font-mono text-slate-500">VDA5050 · v0.1</span>
      </div>
    </div>
    <nav class="flex flex-1 flex-col gap-0.5 p-2" data-tour="sidebar-nav">
      <RouterLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="group flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-600 transition hover:bg-brand-50 hover:text-brand-800"
        active-class="!bg-brand-800 !text-white"
        :data-tour="'nav-' + item.to.slice(1)"
      >
        <span class="w-4 text-center font-mono text-base">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
    <div class="border-t border-slate-200 px-4 py-3 text-[10px] font-mono text-slate-400">
      <div>Backend: <span class="text-slate-600">disconnected</span></div>
      <div>MQTT · VDA5050 1.6</div>
    </div>
  </aside>
</template>
