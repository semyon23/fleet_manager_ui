import { ref, computed, watch } from 'vue'

const LS_KEY = 'fm.theme'
const media = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

function systemPrefersDark() {
  return media ? media.matches : false
}

// mode: 'light' | 'dark' | 'system' — что явно выбрал пользователь.
// effective: 'light' | 'dark' — что реально применяется (system разворачивается).
function loadMode() {
  if (typeof localStorage === 'undefined') return 'system'
  const saved = localStorage.getItem(LS_KEY)
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  return 'system'
}

const mode = ref(loadMode())
const effective = ref(mode.value === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode.value)

function apply(m) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', m === 'dark')
  document.documentElement.setAttribute('data-theme', m)
}
apply(effective.value)

watch(mode, (m) => {
  effective.value = m === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : m
  apply(effective.value)
  try {
    if (m === 'system') localStorage.removeItem(LS_KEY)
    else localStorage.setItem(LS_KEY, m)
  } catch (_) {}
})

if (media && media.addEventListener) {
  media.addEventListener('change', (e) => {
    if (mode.value === 'system') {
      effective.value = e.matches ? 'dark' : 'light'
      apply(effective.value)
    }
  })
}

export function useTheme() {
  const theme = computed(() => effective.value)
  const isDark = computed(() => effective.value === 'dark')
  const currentMode = computed(() => mode.value)

  function setMode(m) {
    if (m === 'light' || m === 'dark' || m === 'system') mode.value = m
  }
  function toggle() {
    // Тумблер солнце/луна — всегда фиксирует явный выбор (light↔dark), выходит из system.
    mode.value = effective.value === 'dark' ? 'light' : 'dark'
  }
  return { theme, isDark, mode: currentMode, setMode, toggle }
}
