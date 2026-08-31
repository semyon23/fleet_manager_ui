import { ref, computed, watch } from 'vue'

const LS_KEY = 'fm.theme'
const media = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

function systemPrefersDark() {
  return media ? media.matches : false
}

function loadInitial() {
  if (typeof localStorage === 'undefined') return 'light'
  const saved = localStorage.getItem(LS_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return systemPrefersDark() ? 'dark' : 'light'
}

const current = ref(loadInitial())

function applyClass(mode) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.documentElement.setAttribute('data-theme', mode)
}
applyClass(current.value)

watch(current, (mode) => {
  applyClass(mode)
  try { localStorage.setItem(LS_KEY, mode) } catch (_) {}
})

// Если пользователь ещё не переключал руками — следуем за system-preference.
if (media && media.addEventListener) {
  media.addEventListener('change', (e) => {
    if (!localStorage.getItem(LS_KEY)) current.value = e.matches ? 'dark' : 'light'
  })
}

export function useTheme() {
  const theme = computed(() => current.value)
  const isDark = computed(() => current.value === 'dark')

  function setTheme(mode) {
    if (mode !== 'light' && mode !== 'dark') return
    current.value = mode
  }
  function toggle() {
    current.value = current.value === 'dark' ? 'light' : 'dark'
  }
  return { theme, isDark, setTheme, toggle }
}
