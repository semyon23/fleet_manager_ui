<script setup>
import { NCard, NButton, NInputGroup, NInput } from 'naive-ui'
</script>

<template>
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
    <NCard title="Tools" size="small" class="!bg-white lg:col-span-1">
      <div class="flex flex-col gap-2 text-sm">
        <button class="rounded border border-slate-200 px-3 py-2 text-left hover:bg-brand-50">Walkable zone</button>
        <button class="rounded border border-slate-200 px-3 py-2 text-left hover:bg-brand-50">Forbidden zone</button>
        <button class="rounded border border-slate-200 px-3 py-2 text-left hover:bg-brand-50">Charge zone</button>
        <button class="rounded border border-slate-200 px-3 py-2 text-left hover:bg-brand-50">Waypoint</button>
        <button class="rounded border border-slate-200 px-3 py-2 text-left hover:bg-brand-50">Edge / route</button>
        <button class="rounded border border-slate-200 px-3 py-2 text-left hover:bg-brand-50">Loading point</button>
        <hr class="my-2 border-slate-100" />
        <button class="rounded bg-brand-800 px-3 py-2 text-left text-white hover:bg-brand-900">Export VDA5050 LIF</button>
        <button class="rounded border border-slate-200 px-3 py-2 text-left hover:bg-brand-50">Import .pgm / .yaml</button>
      </div>
      <div class="mt-4 rounded bg-slate-50 p-3 text-xs text-slate-600">
        <div class="font-semibold text-brand-800">VDA5050 LIF integration</div>
        <p class="mt-1">Map layouts export to the standard Layout Interchange Format v1.0.0. Compatible with VDA5050-based master controls.</p>
      </div>
    </NCard>

    <NCard title="Editor canvas" size="small" class="!bg-white lg:col-span-4">
      <div class="grid h-[600px] place-items-center rounded border-2 border-dashed border-slate-300 bg-slate-50 text-center text-sm text-slate-500">
        <div>
          <div class="mb-2 font-mono text-2xl">✎</div>
          <div>Konva editor mounts here.</div>
          <div class="text-xs">Backend: <code class="font-mono text-brand-800">GET /maps/{'{'}id{'}'}</code> → PNG + zones/waypoints JSON.</div>
          <div class="mt-4 flex justify-center gap-2">
            <NInputGroup>
              <NInput placeholder="Map name" size="small" />
              <NButton type="primary" size="small">New layer</NButton>
            </NInputGroup>
          </div>
        </div>
      </div>
    </NCard>
  </div>
</template>
