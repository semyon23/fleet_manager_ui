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
        title: '👋 Привет!',
        description: 'Это Fleet Manager — панель для управления парком AGV/AMR-роботов по стандарту VDA5050. Слева — 8 разделов, пройдёмся по каждому.',
        side: 'right',
        align: 'center',
      },
    },
    {
      element: '[data-tour="nav-dashboard"]',
      popover: {
        title: 'Dashboard',
        description: 'KPI парка + лента событий + fleet snapshot. Сюда попадаешь после логина — общая картина за 2 секунды.',
        side: 'right',
      },
    },
    // === Live Map ===
    {
      element: '[data-tour="nav-live"]',
      popover: {
        title: 'Live Map',
        description: 'Реальное положение роботов на карте склада. Пока моки — потом здесь будет real-time через MQTT/WebSocket.',
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
        description: 'Здесь ты загружаешь ROS 2 Nav2 карты (PGM + YAML метаданные) или пробуешь готовые samples. Идём в Map Editor.',
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
        description: 'Здесь ты рисуешь маршруты роботов: точки (nodes), связи (edges), станции зарядки/парковки. Экспорт в VDA5050 LIF и Nav2 GeoJSON.',
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
        title: 'Тулбар инструментов',
        description: 'Slева направо: Select (V), Node (N), Batch Points (B), Batch Lines (L), Edge (E), Station (S), Set Origin (O), Calibrate (K). Хоткеи в скобках.',
        side: 'bottom',
      },
    },
    {
      element: 'button[title^="Set Origin"]',
      popover: {
        title: '🎯 Set Origin (O)',
        description: 'Один клик на карте → эта точка становится world (0, 0). Метровые линейки перерисуются.',
        side: 'bottom',
      },
    },
    {
      element: 'button[title^="Calibrate"]',
      popover: {
        title: '📏 Calibrate (K)',
        description: 'Два клика → введи реальное расстояние в метрах → resolution пересчитается. Спасает если SLAM выдал кривой масштаб.',
        side: 'bottom',
      },
    },
    {
      element: 'button[title^="Toggle SLAM"]',
      popover: {
        title: 'SLAM Background',
        description: 'Прячет/показывает PGM-подложку. Иногда мешает — выключаешь, оставляешь только твои точки.',
        side: 'bottom',
      },
    },
    {
      element: 'button[title^="Snap to grid"]',
      popover: {
        title: 'Snap-to-grid + Sequential IDs',
        description: 'Snap: новые точки прилипают к сетке. Соседняя кнопка #01 — режим ID: n001/n002 вместо случайных n8519_7388.',
        side: 'bottom',
      },
    },
    // === Zoom + осей ===
    {
      element: '.zoom-btn',
      popover: {
        title: '🔍 Zoom + оси',
        description: 'Правый верх — +/−/1:1/fit. Сверху и слева — метровые линейки с адаптивным шагом (0.1м...500м).',
        side: 'left',
      },
    },
    // === Preview JSON ===
    {
      element: '[data-tour="preview-json"]',
      popover: {
        title: 'Preview JSON',
        description: 'Смотришь текущую карту в двух форматах: Nav2 GeoJSON и VDA5050 LIF. Плюс таб Validate — orphan edges, дубли, изолированные точки.',
        side: 'bottom',
      },
    },
    // === ? — cheatsheet ===
    {
      popover: {
        title: '⌨️ Cheatsheet',
        description: 'Нажми ? в любой момент — откроется список всех горячих клавиш. И этот тур можно перезапустить через Help → Take a tour.',
        align: 'center',
      },
    },
    // === Финал ===
    {
      popover: {
        title: '🚀 Всё, ты в курсе.',
        description: 'Дальше — грузи свою карту (Maps → + New map), рисуй маршруты, экспортируй LIF. Бэкенд подключим когда Семён даст API. Удачи!',
        align: 'center',
      },
    },
  ]

  let driverInstance = null
  function makeDriver() {
    return driver({
      showProgress: true,
      progressText: '{{current}} из {{total}}',
      nextBtnText: 'Далее →',
      prevBtnText: '← Назад',
      doneBtnText: 'Готово',
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
