import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

const LS_KEY = 'fm.tour.v1.completed'

/**
 * Онбординг-тур по Fleet Manager через driver.js.
 * Тур навигирует между экранами через vue-router, поэтому нужен router-instance.
 *
 * Использование:
 *   const tour = useOnboardingTour(router)
 *   tour.startTour()   // ручной старт (Help menu)
 *   tour.startIfFirstVisit()  // при первой загрузке приложения
 */
export function useOnboardingTour(router) {
  // Ждём пока элемент появится в DOM (до timeout мс).
  function waitForSelector(selector, timeout = 3000) {
    return new Promise((resolve) => {
      const start = Date.now()
      const check = () => {
        const el = document.querySelector(selector)
        if (el) return resolve(el)
        if (Date.now() - start > timeout) return resolve(null)
        setTimeout(check, 100)
      }
      check()
    })
  }

  async function navigateAndWait(route, selector) {
    if (router.currentRoute.value.path !== route) {
      await router.push(route)
    }
    await waitForSelector(selector, 4000)
    // Дать frame'у отрисоваться
    await new Promise((r) => setTimeout(r, 200))
  }

  const steps = [
    // === Общий обзор ===
    {
      element: '[data-tour="sidebar-nav"]',
      popover: {
        title: '👋 Hi!',
        description: 'This is Fleet Manager — a dashboard to manage a fleet of AGV/AMR robots based on the VDA5050 standard. On the left are 8 sections — we\'ll go through each.',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: '[data-tour="nav-dashboard"]',
      popover: {
        title: 'Dashboard',
        description: 'Fleet KPIs + event feed + fleet snapshot. You land here after login — the big picture in two seconds.',
        side: 'right',
      },
    },
    // === Live Map ===
    {
      element: '[data-tour="nav-live"]',
      popover: {
        title: 'Live Map',
        description: 'Real robot positions on the warehouse map. Currently mocked — will go real-time via MQTT/WebSocket.',
        side: 'right',
      },
      onHighlightStarted: async () => {
        await navigateAndWait('/live', '.n-card')
      },
    },
    // === Maps ===
    {
      element: '[data-tour="nav-maps"]',
      popover: {
        title: 'Maps',
        description: 'Upload ROS 2 Nav2 maps here (PGM + YAML metadata) or try the built-in samples. Let\'s open the Map Editor.',
        side: 'right',
      },
      onHighlightStarted: async () => {
        await navigateAndWait('/maps', '.n-card')
      },
    },
    // === Editor: открываем warehouse и показываем всё ===
    {
      element: '.editor-root',
      popover: {
        title: 'Map Editor',
        description: 'Draw robot routes here: points (nodes), links (edges), charge/parking stations. Export to VDA5050 LIF and Nav2 GeoJSON.',
        side: 'top',
        align: 'center',
      },
      onHighlightStarted: async () => {
        // Если не в редакторе — открываем Warehouse sample
        if (!/\/maps\//.test(router.currentRoute.value.path)) {
          await router.push('/maps')
          await waitForSelector('button', 3000)
          const warehouseBtn = Array.from(document.querySelectorAll('button'))
            .find((b) => /Warehouse 25/.test(b.textContent))
          if (warehouseBtn) warehouseBtn.click()
          await waitForSelector('.editor-root', 5000)
          await new Promise((r) => setTimeout(r, 800))
        }
      },
    },
    // === Toolbar tools ===
    {
      element: '.tool-btn',  // первая тулбар-кнопка (Select)
      popover: {
        title: 'Toolbar',
        description: 'Left to right: Select (V), Node (N), Batch Points (B), Batch Lines (L), Edge (E), Station (S), Set Origin (O), Calibrate (K). Hotkeys in brackets.',
        side: 'bottom',
      },
    },
    {
      element: 'button[title^="Set Origin"]',
      popover: {
        title: '🎯 Set Origin (O)',
        description: 'One click on the map → this point becomes world (0, 0). The meter rulers redraw.',
        side: 'bottom',
      },
    },
    {
      element: 'button[title^="Calibrate"]',
      popover: {
        title: '📏 Calibrate (K)',
        description: 'Two clicks → enter the real distance in meters → resolution is recomputed. Saves you when SLAM produced a wrong scale.',
        side: 'bottom',
      },
    },
    {
      element: 'button[title^="Toggle SLAM"]',
      popover: {
        title: 'SLAM Background',
        description: 'Hide/show the PGM background. Sometimes it gets in the way — turn it off and see only your own points.',
        side: 'bottom',
      },
    },
    {
      element: 'button[title^="Snap to grid"]',
      popover: {
        title: 'Snap-to-grid + Sequential IDs',
        description: 'Snap: new points stick to the grid. The neighbouring #01 button toggles ID mode: n001 / n002 instead of random n8519_7388.',
        side: 'bottom',
      },
    },
    // === Zoom + осей ===
    {
      element: '.zoom-btn',
      popover: {
        title: '🔍 Zoom + rulers',
        description: 'Top-right — +/−/1:1/fit. Top and left — meter rulers with adaptive step (0.1m…500m).',
        side: 'left',
      },
    },
    // === Preview JSON ===
    {
      element: '[data-tour="preview-json"]',
      popover: {
        title: 'Preview JSON',
        description: 'View the current map in two formats: Nav2 GeoJSON and VDA5050 LIF. Plus a Validate tab — orphan edges, duplicates, isolated points.',
        side: 'bottom',
      },
    },
    // === ? — cheatsheet ===
    {
      popover: {
        title: '⌨️ Cheatsheet',
        description: 'Press ? any time — the full hotkey list opens. And this tour can be restarted via Help → Take a tour.',
        align: 'center',
      },
    },
    // === Финал ===
    {
      popover: {
        title: '🚀 That\'s it, you\'re up to speed.',
        description: 'Next — load your own map (Maps → + New map), draw routes, export LIF. Backend will hook in as the API endpoints land. Good luck!',
        align: 'center',
      },
    },
  ]

  let driverInstance = null
  function makeDriver() {
    return driver({
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Done',
      allowClose: true,
      overlayOpacity: 0.55,
      steps,
      onDestroyed: () => {
        localStorage.setItem(LS_KEY, '1')
      },
    })
  }

  function startTour() {
    if (!driverInstance) driverInstance = makeDriver()
    else driverInstance = makeDriver()  // всегда свежий чтобы шаги пересобрались
    driverInstance.drive()
  }
  function startIfFirstVisit() {
    if (localStorage.getItem(LS_KEY)) return
    // Небольшая задержка чтобы сайд-бар успел отрендериться
    setTimeout(startTour, 1200)
  }
  function reset() {
    localStorage.removeItem(LS_KEY)
  }

  return { startTour, startIfFirstVisit, reset }
}
