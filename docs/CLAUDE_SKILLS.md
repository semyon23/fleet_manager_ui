# Скиллы Claude Code для Fleet Manager

Один файл: какие скиллы нужны, зачем, откуда их взять и как проверить, что они работают. Актуально на 2026-09-25.

Скилл — это просто папка с `SKILL.md` (плюс скрипты) в `~/.claude/skills/<имя>/` (у Семёна `/home/semen/.claude/skills/`). Claude сам подхватывает такие папки при старте сессии.

---

## Как поставить (самый быстрый путь)

**Вариант A — скопировать готовые папки.** Если есть архив папок скиллов (список в таблице ниже), распаковать в `~/.claude/skills/`:

```bash
mkdir -p ~/.claude/skills
tar -xzf skills.tar.gz -C ~/.claude/skills   # или unzip skills.zip -d ~/.claude/skills
```

**Вариант B — поставить из источников.** Источники в таблице, где они известны. Для остальных можно спросить у Claude: «найди скилл для Vue accessibility» (скилл `find-skills`).

После установки перезапусти Claude Code и проверь: в новой сессии набери `/` и посмотри, что нужные скиллы есть в списке.

---

## 1. Обязательные

| Скилл | Зачем в этом проекте | Источник |
|---|---|---|
| **playwright-skill** | Главный инструмент проверки. После каждой заметной правки UI: открыть страницу в браузере, кликнуть, снять скриншоты в светлой и тёмной теме, поймать ошибки консоли. Типы и юнит-тесты визуальные баги не ловят. | автор lackeyjb, v5.0.0 |
| **vue** | Единая шпаргалка по Vue 3: Composition API, Pinia, Router, `defineProps/defineEmits`, watchers, Transition. Проект целиком на Vue 3 без TypeScript. | источник не записан (вариант A или `find-skills`) |

### playwright-skill: подготовка (один раз)

```bash
cd ~/.claude/skills/playwright-skill
npm run setup          # ставит playwright и Chromium, нужен Node 20+
```

Запуск скрипта проверки:

```bash
node ~/.claude/skills/playwright-skill/run.js path/to/script.js
```

## 2. Очень полезные

| Скилл | Когда использовать | Источник |
|---|---|---|
| **front-review** | Ревью `.vue`/`.js` файла: баги, читаемость, производительность (`/front-review`, `/front-review strict`). | Effeilo/claude-code-frontend-skills |
| **front-a11y** | Аудит доступности WCAG 2.1 AA для `.vue` (`/front-a11y`, `/front-a11y fix`). | Effeilo/claude-code-frontend-skills |
| **vue-a11y** | Доступность на уровне Vue-компонентов (модалки, табы, фокус при переходах роутера). Полезно для naive-ui. | не записан (вариант A или `find-skills`) |
| **vue-performance** | Сборка `naive-ui` весит ~650 кБ (предупреждение Vite про chunk >500 кБ), Live Map перерисовывается часто. Профилирование и разбиение бандла. | не записан (вариант A или `find-skills`) |
| **vue-clean-components** | Когда растащить большие вьюхи (`MapEditorView.vue` больше 1700 строк, `RobotsView.vue`) на компоненты и composables. | не записан (вариант A или `find-skills`) |
| **vue-forms** | Формы регистрации робота и мастер создания миссии; валидация. | не записан (вариант A или `find-skills`) |
| **vue-data** | Серверные данные: polling, кэш, гонки запросов. Сейчас у нас свой `api/client.js` + Pinia, но пригодится при добавлении alerts/missions/MQTT. | не записан (вариант A или `find-skills`) |
| **build-tooling** | Vite и Vitest: конфиг, чанки, тесты (`npm test` = Vitest, 62 теста). | не записан (вариант A или `find-skills`) |
| **lighthouse** | Замер производительности/доступности/SEO живой страницы: `lighthouse <url>`. Нужен Node 22+ и Chrome. | обёртка над GoogleChrome/lighthouse |

## 3. Опциональные

| Скилл | Комментарий |
|---|---|
| **frontend-design**, **design** | Когда нужно улучшить внешний вид экрана. Помнить правила проекта: UI только на английском, палитра «белый → тёмно-синий», тёмная тема обязательна. |
| **graphify** | Строит граф знаний по коду (tree-sitter, локально, ключи не нужны). Ставится отдельно через `pipx`, полезно только для навигации по большому коду. Автор safishamsi. |
| **webapp-testing** | Базовый Playwright от Anthropic. Дублирует `playwright-skill`, можно не ставить. |
| **find-skills** | Помогает найти и установить другие скиллы по описанию задачи. |
| **antfu** | Стиль и инструменты Anthony Fu (ESLint, монорепо). Осторожно: может конфликтовать с текущими соглашениями проекта, ставить только если решили перейти на его стиль. |
| **front-refactor**, **front-comments** | Рефакторинг без смены поведения и структурные комментарии. По умолчанию в проекте комментарии минимальные, так что `front-comments` чаще мешает. |

## 4. Встроенные команды Claude Code (ничего ставить не надо)

- `/code-review` — ревью текущего диффа или PR.
- `/simplify` — упрощение изменённого кода.
- `/run` — запуск приложения и проверка изменения в реальном приложении.

## 5. Что НЕ нужно для этого проекта

Всё про Android/Kotlin/Compose (`android-*`, `compose-*`, `apk-analyzer`, `gradle-build-performance` и др.), Flutter (`flutter-*`), `nuxt`, `vitepress`, `fiction-proofreader-ru`, `human`, `cad-khana`, `cnc-motion-rig`, `build123d-claude-plugin`, `admin-panel`, `photo-search`, `image-search`. Они для других проектов, ставить их не надо.

---

## 6. Минимальный набор «без размышлений»

Скопировать 7 папок: `playwright-skill`, `vue`, `front-review`, `front-a11y`, `vue-performance`, `vue-clean-components`, `build-tooling`. Этого хватит на 95% задач.

---

## 7. Шаблон проверки через playwright-skill

Сначала собрать и запустить preview (в отдельном терминале):

```bash
npm run build
npm run preview        # http://localhost:4173/fleet-manager/  (именно localhost)
```

Затем скрипт-заготовка. Ключи `localStorage`, которые нужны, чтобы страница открылась «чистой»:

| Ключ | Значение |
|---|---|
| `fm.theme` | `light` / `dark` (нет ключа = как в системе) |
| `fm.api.useMocks` | `1` — моки, `0` — реальный бэк |

```javascript
const { chromium } = require('playwright');
const BASE = 'http://localhost:4173/fleet-manager';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(`${BASE}/`);
  await page.evaluate(() => {
    localStorage.setItem('fm.theme', 'light');
    localStorage.setItem('fm.api.useMocks', '1');
  });

  // Зарегистрировать робота через UI (в mock-режиме)
  await page.goto(`${BASE}/robots?t=${Date.now()}`);
  await page.getByRole('button', { name: /Register first robot/ }).click();
  await page.getByPlaceholder('amr-10').fill('ktc-23');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: 'robots.png' });
  console.log('errors:', errors.length ? errors.join('\n') : 'NONE');
  await browser.close();
})();
```

Что проверять по умолчанию: 0 ошибок в консоли, обе темы (`light` и `dark`), пустое состояние (нет роботов) и состояние с данными, страница целиком не скроллится (скролл только внутри таблицы или карточки).

Ловушки Playwright в этом проекте:
- у табов naive-ui нет `role=tab` → `page.locator('.n-tabs-tab').filter({ hasText: 'General' })`;
- кнопка «Register» неоднозначна → `getByRole('button', { name: 'Register', exact: true })`;
- preview всегда на порту 4173, адрес `localhost`, не `127.0.0.1`.

---

## Чего в этом файле нет

- Устаревший планировочный документ `docs/SKILLS_AND_TOOLS.md` (про то, какие скиллы «стоит поставить») не трогали. Актуальный список здесь.
