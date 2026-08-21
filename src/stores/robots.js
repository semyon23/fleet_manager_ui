import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const MOCK_ROBOTS = [
  { id: 'amr-01', model: 'AMR-500', status: 'moving', battery: 78, x: 12.4, y: 8.2, theta: 1.57, mission: 'M-104', uptime: '3d 12h' },
  { id: 'amr-02', model: 'AMR-500', status: 'charging', battery: 34, x: 2.1, y: 1.5, theta: 0, mission: null, uptime: '2d 4h' },
  { id: 'amr-03', model: 'AMR-350', status: 'idle', battery: 92, x: 6.8, y: 4.3, theta: 3.14, mission: null, uptime: '5d 22h' },
  { id: 'amr-04', model: 'AMR-500', status: 'moving', battery: 55, x: 18.9, y: 12.7, theta: -1.57, mission: 'M-107', uptime: '1d 8h' },
  { id: 'amr-05', model: 'AMR-350', status: 'error', battery: 61, x: 9.2, y: 6.1, theta: 0.5, mission: null, uptime: '0h' },
  { id: 'amr-06', model: 'AMR-500', status: 'offline', battery: 0, x: 0, y: 0, theta: 0, mission: null, uptime: '—' },
]

export const useRobotsStore = defineStore('robots', () => {
  const robots = ref(MOCK_ROBOTS)

  const counts = computed(() => ({
    moving: robots.value.filter((r) => r.status === 'moving').length,
    charging: robots.value.filter((r) => r.status === 'charging').length,
    idle: robots.value.filter((r) => r.status === 'idle').length,
    error: robots.value.filter((r) => r.status === 'error').length,
    offline: robots.value.filter((r) => r.status === 'offline').length,
    total: robots.value.length,
  }))

  const totalBattery = computed(() =>
    Math.round(robots.value.reduce((s, r) => s + r.battery, 0) / robots.value.length)
  )

  return { robots, counts, totalBattery }
})
