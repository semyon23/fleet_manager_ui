import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const BASE = import.meta.env.BASE_URL

const MOCK_ROBOTS = [
  { id: 'amr-01', model: 'Transporter T-1', type: 'Transport pod',   sprite: `${BASE}robots/amr-01.png`, status: 'moving',   battery: 78, x: 12.4, y: 8.2,  theta: 1.57,  mission: 'M-104', uptime: '3d 12h' },
  { id: 'amr-02', model: 'Forklift F-2',   type: 'Autonomous forklift', sprite: `${BASE}robots/amr-02.png`, status: 'charging', battery: 34, x: 2.1,  y: 1.5,  theta: 0,     mission: null,     uptime: '2d 4h'  },
  { id: 'amr-03', model: 'Manipulator M-3', type: 'Arm robot',        sprite: `${BASE}robots/amr-03.png`, status: 'idle',    battery: 92, x: 6.8,  y: 4.3,  theta: 3.14,  mission: null,     uptime: '5d 22h' },
  { id: 'amr-04', model: 'Rover R-4',      type: 'Patrol rover',      sprite: `${BASE}robots/amr-04.png`, status: 'moving',   battery: 55, x: 18.9, y: 12.7, theta: -1.57, mission: 'M-107', uptime: '1d 8h'  },
  { id: 'amr-05', model: 'Sweeper S-5',    type: 'Floor sweeper',     sprite: `${BASE}robots/amr-05.png`, status: 'error',    battery: 61, x: 9.2,  y: 6.1,  theta: 0.5,   mission: null,     uptime: '0h'     },
  { id: 'amr-06', model: 'Cargo C-6',      type: 'Cargo carrier',     sprite: `${BASE}robots/amr-06.png`, status: 'moving',   battery: 47, x: 14.5, y: 3.8,  theta: 2.1,   mission: 'M-108', uptime: '4d 1h'  },
  { id: 'amr-07', model: 'Inspector I-7',  type: 'Camera inspector',  sprite: `${BASE}robots/amr-07.png`, status: 'idle',    battery: 88, x: 4.6,  y: 10.9, theta: 0.9,   mission: null,     uptime: '6d 5h'  },
  { id: 'amr-08', model: 'Guardian G-8',   type: 'Security unit',     sprite: `${BASE}robots/amr-08.png`, status: 'moving',   battery: 72, x: 20.3, y: 7.4,  theta: -0.5,  mission: 'M-109', uptime: '2d 19h' },
  { id: 'amr-09', model: 'Platform P-9',   type: 'Transport platform', sprite: `${BASE}robots/amr-09.png`, status: 'offline',  battery: 0,  x: 0,    y: 0,    theta: 0,     mission: null,     uptime: '—'      },
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
