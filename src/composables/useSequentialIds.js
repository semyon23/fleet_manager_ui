import { ref } from 'vue'

/**
 * Управляет режимом генерации ID нод и станций.
 * - sequentialIds=true → n001, n002, s001... (следующий свободный)
 * - sequentialIds=false → n1234_5678 (random)
 *
 * Смотрит уже существующие ноды/станции чтобы не столкнуться.
 *
 * @param {Ref<{ waypoints: any[], stations?: any[] }>} mapRef — реактивный источник карты
 */
export function useSequentialIds(mapRef) {
  const sequentialIds = ref(true)

  function nextSequentialId(prefix) {
    const map = mapRef.value
    if (!map) return prefix + '001'
    const existing = new Set([
      ...map.waypoints.map((w) => w.id),
      ...(map.stations || []).map((s) => s.id),
    ])
    const re = new RegExp('^' + prefix + '(\\d+)$')
    let max = 0
    for (const id of existing) {
      const m = id.match(re)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return prefix + String(max + 1).padStart(3, '0')
  }
  function randomId(prefix) {
    return prefix + Math.floor(Math.random() * 9999) + '_' + Math.floor(Math.random() * 9999)
  }
  function newNodeId() {
    return sequentialIds.value ? nextSequentialId('n') : randomId('n')
  }
  function newStationId() {
    return sequentialIds.value ? nextSequentialId('s') : randomId('s')
  }
  return { sequentialIds, newNodeId, newStationId }
}
