import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const LS_KEY = 'fm.maps.v1'
const PERSIST_DEBOUNCE_MS = 250

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    // Миграции: гарантируем новые поля на старых записях
    return list.map((m) => ({
      stations: [],
      zones: [],
      ...m,
    }))
  } catch {
    return []
  }
}

// Дебаунс + flush на unload/hidden — при drag ноды store.update()
// вызывается ~60 раз/сек, синхронный localStorage.setItem() лагает главный тред.
let persistTimer = null
let pendingList = null
function persist(list) {
  pendingList = list
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    if (pendingList) localStorage.setItem(LS_KEY, JSON.stringify(pendingList))
    persistTimer = null
    pendingList = null
  }, PERSIST_DEBOUNCE_MS)
}
function persistNow() {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null }
  if (pendingList) {
    localStorage.setItem(LS_KEY, JSON.stringify(pendingList))
    pendingList = null
  }
}
if (typeof window !== 'undefined') {
  // Не потерять последние правки при закрытии вкладки
  window.addEventListener('beforeunload', persistNow)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistNow()
  })
}

function newId() {
  return 'map-' + Math.random().toString(36).slice(2, 8)
}

export const useMapsStore = defineStore('maps', () => {
  const maps = ref(loadFromStorage())

  const count = computed(() => maps.value.length)

  function get(id) {
    return maps.value.find((m) => m.id === id) || null
  }

  /**
   * Создаёт новую карту.
   * @param {{ name:string, meta:object, pgmDataUrl:string, width:number, height:number }} payload
   */
  function create(payload) {
    const map = {
      id: newId(),
      name: payload.name,
      meta: payload.meta,
      pgmDataUrl: payload.pgmDataUrl,
      width: payload.width,
      height: payload.height,
      waypoints: [],
      edges: [],
      zones: [],
      stations: [],
      assignedRobots: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    maps.value.push(map)
    persist(maps.value)
    return map
  }

  function update(id, patch) {
    const idx = maps.value.findIndex((m) => m.id === id)
    if (idx < 0) return null
    maps.value[idx] = { ...maps.value[idx], ...patch, updatedAt: new Date().toISOString() }
    persist(maps.value)
    return maps.value[idx]
  }

  function remove(id) {
    maps.value = maps.value.filter((m) => m.id !== id)
    persist(maps.value)
  }

  function assignRobots(id, robotIds) {
    return update(id, { assignedRobots: robotIds })
  }

  return { maps, count, get, create, update, remove, assignRobots }
})
