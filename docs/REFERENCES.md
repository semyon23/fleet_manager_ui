# Референсы Fleet Manager UI

Подборка существующих продуктов для fleet management промышленных роботов. По каждому — прямые ссылки на страницы со скриншотами и что оттуда стоит взять/учесть.

---

## 1. OTTO Motors Fleet Manager (Rockwell Automation)

**Что это:** промышленный стандарт для AMR в складах/цехах. Куплен Rockwell Automation, интеграции со SCADA.

**Визуальная эстетика:**
- Плотные дашборды, ориентированные на большой экран (TV на стене цеха)
- Много таблиц + миникарта + KPI-плитки
- Тёмная тема + функциональные цветовые статусы
- Facility integration interface (редактор карт) — упрощён в последней версии, «на 50% меньше времени на настройку»

**Что взять:**
- Idea «dashboard for big-screen TVs» — отдельный view для мониторинга
- Плотность информации без ощущения свалки
- Разделение на Fleet Manager (диспетчер) + OTTO App (для оператора)

**Ссылки:**
- Обзор продукта: https://ottomotors.com/fleet-manager/
- Документация (тут скриншоты интерфейса): https://help.ottomotors.com/sw218
- О Fleet Manager: https://help.ottomotors.com/sw216/about-otto/about-fleet-manager
- Пресс-релиз с описанием новой версии: https://ottomotors.com/company/newsroom/press-releases/otto-motors-software-release-gives-unparalleled-visibility-into-fleet-performance-of-autonomous-mobile-robots/
- Карточка на DirectIndustry (там несколько картинок): https://www.directindustry.com/prod/otto-motors/product-191685-2752429.html

---

## 2. MiR Fleet (Mobile Industrial Robots)

**Что это:** датский пионер AMR, MiR Fleet — их родное ПО для управления парком. Стандарт де-факто в европейских складах.

**Визуальная эстетика:**
- Веб-интерфейс, адаптивный (десктоп/планшет/телефон)
- Настраиваемые дашборды с виджетами (drag&drop, как в Grafana)
- Реалтайм-карта с позициями и статусами роботов
- Планировщик миссий через визуальный редактор

**Что взять:**
- Виджет-based dashboards — пользователь сам собирает что видеть
- Traffic management визуализация (пересечения маршрутов)
- Reference guide в PDF — прямо с примерами скринов
- Адаптивность (у нас в брифе стоит вопрос про планшет/телефон)

**Ссылки:**
- Продукт: https://mobile-industrial-robots.com/products/software/mir-fleet
- Reference Guide PDF со скринами: https://iptech1.com/wp-content/uploads/2019/01/mirfleet_reference_guide_sw250_rev10.pdf
- Getting Started manual: https://manualzz.com/doc/61384441/mir-fleet-getting-started
- Enterprise-версия: https://log-robot.com/en/amr-products/mobile-industrial-robots/mir-fleet-software
- Полный reference: https://manuals.plus/m/32896d192863360a5e0d1250ff64d418434b1dae54227ece9e67717270c4b551

---

## 3. Formant

**Что это:** современный SaaS для fleet management, vendor-agnostic (работает с роботами любых производителей). Модный SF-стартап, дизайн заметно свежее чем у промышленных гигантов.

**Визуальная эстетика:**
- Modern SaaS look — как Linear/Vercel, только для роботов
- Custom-dashboards из UI-компонентов (toolkit)
- Live-видео с роботов + телеметрия рядом
- Много графиков, аналитики, timeline-плееры для replay сессий
- Teleoperation UI (управление роботом с браузера)

**Что взять:**
- Vendor-agnostic подход — если Семён хочет расширяться на разные модели
- Component toolkit для кастомных дашбордов
- Комбо «video + telemetry side by side»
- Trigger events / automation правила
- Общий современный вайб — лучший из четырёх для вдохновения по стилю

**Ссылки:**
- Главная: https://formant.io/
- Fleet Management solution: https://formant.io/solutions/fleet-management/
- Docs с описанием UI: https://docs.formant.io/docs/getting-started-fleet-management
- Fleet Observability (скрины): https://docs.formant.io/docs/fleet-observability
- Demo-видео: https://formant.io/product-demo-video-fleet-management/
- Data management: https://formant.io/solutions/data-management/

---

## 4. Rocos (был у Boston Dynamics, теперь Bear Robotics)

**Что это:** новозеландская платформа Robot Operations. Прославилась партнёрством с Boston Dynamics для Spot — управляли роботом-собакой через веб-UI из другого полушария. В 2022 использовался на Олимпиаде в Пекине.

**Визуальная эстетика:**
- Минимализм, много воздуха
- Focus на mission design + teleoperation
- Cloud-first, всё в браузере
- Работал с любыми роботами (Spot, AMR, дроны)

**Что взять:**
- Mission editor как ключевая фича — визуальный редактор миссий
- Remote teleoperation концепция (если Семёну понадобится ручное управление)
- Общий cloud-первый подход к архитектуре

**Ссылки:**
- Партнёрство с Boston Dynamics (со скринами Spot UI): https://www.businesswire.com/news/home/20200519005539/en/Rocos-Partners-With-Boston-Dynamics-to-Upskill-Autonomous-Spot-Robots-With-Remote-Operation---All-the-Way-From-New-Zealand
- AUVSI обзор: https://www.auvsi.org/news/rocos-boston-dynamics-partner-to-enhance-existing-capabilities-of-spot-robot/
- The Robot Report о платформе: https://www.therobotreport.com/rocos-operations-platform-to-manage-robots-at-2022-beijing-winter-olympics/
- Как добавили remote management к Spot: https://www.therobotreport.com/rocos-adds-cloud-remote-management-boston-dynamics-spot-robot/

---

## Бонус: свежие концепты с Dribbble

Не продакшн, но полезно для стиля/цвета/composition:

- Robotics Fleet Management Dashboard: https://dribbble.com/shots/26871808-Robotics-Fleet-Management-Dashboard
- Общий обзор рынка Robot Fleet Management (2026): https://cobotfinder.com/guides/robot-fleet-management

---

## Мои выводы по стилю (для нашего проекта)

| Аспект | Рекомендация | Откуда взял |
|---|---|---|
| Тема | Тёмная, industrial | OTTO, MiR |
| Плотность | Высокая, но с воздухом | OTTO (плотно) + Formant (воздух) |
| Дашборды | Виджет-based, настраиваемые | MiR, Formant |
| Карта | Центральный элемент, реалтайм маркеры | Все четыре |
| Редактор карт | Визуальный, drag&drop зон и waypoints | MiR, OTTO |
| Модный вайб | Как Formant/Linear | Formant |
| TV-view | Отдельный «wall dashboard» для цеха | OTTO |
| Mission editor | Node-based редактор миссий | Rocos |

**Итог:** берём стилистику Formant (современный SaaS), функциональную плотность OTTO/MiR, mission editor от Rocos. Тёмная тема, желто-зелёно-красные статусы, много таблиц + большая карта.

---

*Скинь Семёну этот файл — пусть посмотрит и скажет, какой из четырёх ему ближе визуально. От этого зависит направление концепт-макета.*
