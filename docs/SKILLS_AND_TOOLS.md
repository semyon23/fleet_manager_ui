# Skills & Tools — что подключаем

Три категории:
1. **Claude Code skills** — навыки, которые ставим в наш workflow (мне для помощи с Vue)
2. **Готовые open-source проекты** — не переизобретаем, встраиваем/берём куски
3. **NPM библиотеки** — конкретные пакеты под задачу

---

## 1. Claude Code skills для Vue 3

У меня установлено много Android/React-скилов, но **под Vue 3 нет ни одного**. Стоит поставить:

### Основной

**Vue 3 Development / Vue.js Frontend Development**
- Composition API + Pinia + Vite + TS/JS
- Enforce component boundaries, WCAG 2.1 AA, security patterns
- Каталоги:
  - https://claudeskills.info/best/vue-skills/
  - https://mcpmarket.com/tools/skills/vue-3-development
  - https://mcpmarket.com/tools/skills/vue-js-frontend-development

### Сборный набор (рекомендую)

**KIMJINWOO4/vue-skills** — [github.com/KIMJINWOO4/vue-skills](https://github.com/KIMJINWOO4/vue-skills)
Consolidated набор: vue-data, vue-forms, vue-performance, vue-a11y — по одному скилу на типовую задачу. Ставим весь пакет.

### Best Practices

**Vue Best Practices** — [crossaitools.com/skills/vuejs-ai/skills/vue-best-practices](https://crossaitools.com/skills/vuejs-ai/skills/vue-best-practices)
Полезно для code review.

### Обзор рынка

**Best Claude Code Skills 2026** — [firecrawl.dev/blog/best-claude-code-skills](https://www.firecrawl.dev/blog/best-claude-code-skills)
Общий обзор что появилось в маркетплейсе в 2026.

**Что делаем:** ставим `vue-3-development` + `vue-skills` пак. Дальше по ходу проекта посмотрим, что реально помогает.

---

## 2. Open-source проекты, которые встраиваем

### 🎯 VDA5050 LIF Editor (bekirbostanci)

**Демо:** [vda5050-lif-editor.vercel.app](https://vda5050-lif-editor.vercel.app/)
**Код:** [github.com/bekirbostanci/vda5050_lif_editor](https://github.com/bekirbostanci/vda5050_lif_editor)

Открытый веб-редактор для генерации VDA5050 LIF и ROS2 Nav2 Route Server GeoJSON из одного графа. **Официально упомянут в документации Nav2**.

**Что это даёт нам:**
- Готовая логика редактора зон, waypoints, маршрутов
- Экспорт в LIF-JSON (то, что Семён просил)
- Если стек совпадает — можно портировать компоненты почти как есть; если разный — берём модель данных и алгоритмы

**План:** посмотрим стек проекта. Если Vue/React с UMD-сборкой — попробуем embed. Если React — портируем логику в наш Vue-компонент.

### 🎯 Coaty VDA5050 Library

**NPM:** [npmjs.com/package/vda-5050-lib](https://www.npmjs.com/package/vda-5050-lib)
**Docs:** [coatyio.github.io/vda-5050-lib.js](https://coatyio.github.io/vda-5050-lib.js/api/index.html)
**GitHub:** [github.com/coatyio/vda-5050-lib.js](https://github.com/coatyio/vda-5050-lib.js)

Универсальная TS-библиотека для VDA5050 (Node.js и браузер). MQTT-транспорт, обработка сообщений, типизация всех VDA5050-сущностей (Order, State, Connection, Visualization, Factsheet).

**Что это даёт:**
- Не пишем парсер VDA5050 сами
- Если Семёнов бэкенд поддерживает VDA5050 — фронт **уже готов подключиться** через эту либу
- Типы сообщений — берём отсюда, не выдумываем

### 🎯 RobotWebTools (roslibjs / ros2djs / ros3djs)

**Wiki:** [roboticsknowledgebase.com/wiki/tools/roslibjs](https://roboticsknowledgebase.com/wiki/tools/roslibjs/)
**Пример визуализации карты:** [github.com/RobotWebTools/ros2djs/blob/develop/examples/map.html](https://github.com/RobotWebTools/ros2djs/blob/develop/examples/map.html)

Стандарт для веб-визуализации ROS. `roslibjs` = WebSocket-клиент к rosbridge, `ros2djs` = 2D-визуализация карт и роботов на canvas, `ros3djs` = 3D.

**Что это даёт:**
- Готовый парсинг .pgm/YAML и рендер occupancy grid в браузере
- Готовое отображение позиций роботов, tf-трансформаций
- Осталось только украсить сверху нашим Vue-обёрткой

**Условие:** у Семёна на бэке должен быть `rosbridge_suite` (WebSocket-мост к ROS). Уточним при первой синхронизации.

### 🎯 ROS SLAM Map Editor (GyroPalm)

**Демо:** [gyropalm.github.io/ROS-SLAM-Map-Editor](https://gyropalm.github.io/ROS-SLAM-Map-Editor/)
**Код:** [github.com/GyroPalm/ROS-SLAM-Map-Editor](https://github.com/GyroPalm/ROS-SLAM-Map-Editor)

Веб-редактор для правки .pgm/YAML карт — стирание артефактов, дорисовка стен, обрезка. Не наша задача (мы не рисуем стены, мы кладём поверх зоны/waypoints), но полезно как референс для UI-паттернов.

### 🎯 NVIDIA Isaac ROS Mission Dispatch

**Блог:** [developer.nvidia.com/blog/open-source-fleet-management-tools-for-autonomous-mobile-robots](https://developer.nvidia.com/blog/open-source-fleet-management-tools-for-autonomous-mobile-robots/)

Открытый Mission Dispatch + Client от NVIDIA. Общаются по **VDA5050**. Показательный референс архитектуры fleet manager от индустрии. Стоит прочесть для понимания как индустрия строит подобное.

### Другие open-source fleet managers (для inspiration)

| Проект | Что взять |
|---|---|
| [ROOSTER Fleet Manager](https://github.com/ROOSTER-fleet-management/rooster_fleet_manager) | ROS-based task allocation & scheduling — как модель миссий |
| [AMR-ROS](https://github.com/shrikrishnarb/amr-ros) | Multi-AGV Gazebo симуляция — для локального тестирования UI |
| [OpenRemote Fleet Management](https://github.com/openremote/fleet-management) | Полноценный IoT-стек, location tracking — референс архитектуры |
| [Meili Robots](https://meilirobots.com/resources-list/fms-announcement) | Универсальный fleet manager — vendor-agnostic паттерн |
| [jacob-02/amr_fleet](https://github.com/jacob-02/amr_fleet) | Небольшой ROS-проект, полезно как минимальный референс |

---

## 3. NPM библиотеки (конкретно под наш проект)

### Ядро

| Пакет | Зачем |
|---|---|
| `vue@^3.5` | Framework |
| `vite@^7` | Bundler |
| `vue-router@^4` | Routing |
| `pinia@^2` | State |
| `tailwindcss@^4` | Styling |
| `@tailwindcss/postcss` | Tailwind v4 PostCSS plugin |

### UI-компоненты

Выбираем один:
- **naive-ui** — самая ходовая, полная либа, лицензия MIT
- **PrimeVue** — жирнее, с готовыми enterprise-виджетами
- **Element Plus** — китайская, старая школа, много готовых форм

**Рекомендую naive-ui** — легковеснее, современнее, отличная поддержка тёмной/светлой темы.

### Карта / Canvas

| Пакет | Зачем |
|---|---|
| `konva@^9` + `vue-konva@^3` | Canvas для карты и редактора зон |
| `roslib` | Клиент rosbridge (если Семён поднимет ROS bridge) |
| `vda-5050-lib` | Клиент VDA5050 (если бэк говорит на VDA5050) |
| `panzoom` | Zoom/pan обёртка (проще чем писать самому) |

### Realtime

| Пакет | Зачем |
|---|---|
| нативный `WebSocket` | Для начала хватит |
| `mqtt` | Если Семён выберет MQTT (VDA5050 обычно на MQTT) |
| `reconnecting-websocket` | Автопереподключение |

### Формы / валидация

| Пакет | Зачем |
|---|---|
| `vee-validate@^4` + `yup` или `zod` | Формы (Settings, регистрация пользователей) |

### Графики (если понадобятся мини-KPI на Dashboard)

| Пакет | Зачем |
|---|---|
| `chart.js@^4` + `vue-chartjs@^5` | Простые графики |

### Джойстик

| Пакет | Зачем |
|---|---|
| `nipplejs` | Готовый touch-джойстик (используется в robotics часто) |

---

## 4. Мой финальный набор для MVP

**Ставим:**
- Claude skills: `vue-3-development` + `KIMJINWOO4/vue-skills` пак
- Vue 3 + Vite + Pinia + Vue Router + Tailwind v4
- `naive-ui` для компонентов
- `konva` + `vue-konva` для карты
- Нативный WebSocket + `reconnecting-websocket` для realtime
- `vda-5050-lib` — тестируем как контракт данных, даже на моках (готовый источник типов)
- `nipplejs` для джойстика

**Держим в голове (пока не ставим):**
- `roslib` — если Семён будет использовать rosbridge
- `mqtt` — если бэкенд говорит по MQTT
- Портирование `vda5050_lif_editor` — вторая итерация

**Не ставим:**
- Аналитика/графики (не в скоупе)
- TypeScript (Семён явно попросил JS)

---

## 5. Что нужно решить сейчас

- [ ] Ставим ли Claude skills для Vue прямо сейчас? (я не могу поставить сам — либо через маркетплейс, либо руками кладём в `~/.claude/skills/`)
- [ ] Хочешь глянуть live-демо [vda5050-lif-editor.vercel.app](https://vda5050-lif-editor.vercel.app/), чтобы решить: **портируем** или **свой редактор** делаем?
- [ ] Спросить Семёна: планирует ли он VDA5050 на бэкенде? (Если да — весь стек резко упрощается, у нас есть готовые JS-либы)
