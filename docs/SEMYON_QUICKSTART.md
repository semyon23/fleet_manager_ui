# Fleet Manager — Quickstart для Семёна (Windows)

Задача: запустить фронт локально, чтобы он стучался в твой C++ бэк, а не в моки. Всё под Windows, в PowerShell.

Займёт минут 10 если Node.js и git уже стоят. Иначе плюс 5 минут на установку.

---

## Что должно быть на машине

Одна проверка. Открой **PowerShell** (Win+R → `powershell` → Enter) и вбей:

```powershell
node -v
npm -v
git --version
```

Ожидаемо: `v20.x` или выше, `10.x` или выше, `git version 2.x`.

Если `node` не найден:
- Скачай **LTS** с [nodejs.org](https://nodejs.org) → `.msi` инсталлятор → next-next-finish
- Перезапусти PowerShell, снова `node -v` — должно появиться

Если `git` не найден:
- [git-scm.com/download/win](https://git-scm.com/download/win) → `.exe` → next-next-finish (все дефолты)

VS Code опционально ([code.visualstudio.com](https://code.visualstudio.com)) — просто удобнее смотреть код и `.env.local` в нём редактировать.

---

## Шаг 1. Склонировать репо

Выбери куда положишь, например `C:\dev`. В PowerShell:

```powershell
mkdir C:\dev -Force
cd C:\dev
git clone https://github.com/DDmsngr/fleet-manager
cd fleet-manager
```

---

## Шаг 2. Установить зависимости

```powershell
npm install
```

Идёт 1-2 минуты, качает всё в папку `node_modules` (~200 МБ). Если ругается на permission — открой PowerShell **от Администратора** и повтори.

---

## Шаг 3. Указать адрес твоего бэка

Создай файл **`.env.local`** прямо в корне `C:\dev\fleet-manager\`.

В PowerShell быстрее всего:

```powershell
notepad .env.local
```

Скажет «файла нет, создать?» — Да. Вставь **две строчки** (замени порт `8080` на тот, где висит твой C++ бэк):

```
VITE_API_BASE_URL=http://localhost:8080/api
VITE_USE_MOCKS=false
```

Сохрани, закрой.

Что это делает:
- `VITE_API_BASE_URL` — куда фронт будет посылать HTTP-запросы (`GET /api/maps`, `POST /api/missions` и т.д.)
- `VITE_USE_MOCKS=false` — выключает моки. Без этой строчки фронт по дефолту работает с фейковыми данными из localStorage

---

## Шаг 4. Запустить

```powershell
npm run dev
```

Увидишь что-то вроде:

```
  VITE v6.0.7  ready in 800 ms

  ➜  Local:   http://localhost:5175/fleet-manager/
  ➜  Network: use --host to expose
```

Открой в браузере: **http://localhost:5175/fleet-manager/**

Если справа в топбаре зелёная точка `backend · real` — значит фронт настроен на твой бэк.
Если оранжевая `backend offline · mocks` — значит `.env.local` не подхватился (проверь имя файла ровно `.env.local`, без `.txt`).

---

## Шаг 5. Смотреть что летит между фронтом и бэком

В браузере нажми **F12** → вкладка **Network**.

Пооткрывай экраны (Dashboard, Robots, Missions) — в Network увидишь HTTP-запросы к твоему бэку. Красным подсвечены упавшие. Клик на запрос → там вкладки:
- **Headers** — что послали
- **Payload** — тело запроса (для POST)
- **Response** — что бэк ответил (или ошибка)
- **Preview** — JSON красиво

Если запросы **CORS-ошибка** — см. ниже.

---

## Возможные грабли

### 1. CORS: `Access to fetch ... has been blocked by CORS policy`

Фронт на `localhost:5175`, бэк на `localhost:8080` — для браузера это **разные origin**. Твой C++ сервер должен на **любой** ответ добавлять хедер:

```
Access-Control-Allow-Origin: http://localhost:5175
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

И на `OPTIONS` (preflight) отвечать 204 + те же хедеры. Если у тебя, например, cpp-httplib или Crow — там есть middleware, гугли `<library> cors`.

Проверить проще всего: в PowerShell
```powershell
curl.exe -i -X OPTIONS http://localhost:8080/api/maps -H "Origin: http://localhost:5175"
```
Должно быть `HTTP/1.1 204` + перечисленные `Access-Control-*` хедеры.

### 2. `EADDRINUSE: address already in use :::5175`

Уже запущен `npm run dev` в другом окне. Или пробрось порт:
```powershell
npm run dev -- --port 5180
```
Не забудь потом в CORS у бэка поменять `5175` на `5180`.

### 3. `.env.local` не подхватывается

- Файл должен быть **`.env.local`** ровно (не `.env.local.txt`, notepad любит добавлять `.txt` — включи в проводнике «показывать расширения файлов»)
- Лежит в корне рядом с `package.json`
- Vite читает env-переменные **только при старте**. Меняешь `.env.local` → нужно Ctrl+C в PowerShell и заново `npm run dev`

### 4. Не находит `git`, `node` после установки

Перезапусти PowerShell. PATH обновляется только в новых процессах.

---

## Полезные команды

```powershell
npm run dev              # dev-сервер (то что используешь сейчас)
npm run build            # собрать статику в папку dist/ (для деплоя)
npm run preview          # запустить собранную dist/ локально — как в проде
```

Ctrl+C в окне PowerShell — остановить сервер.

---

## Как «сдать» правку

Пока просто пиши мне в TG (лучше со скрином F12 → Network). У меня в проекте всё в git, тебе туда пушить не надо — только тестишь свой бэк.

---

## Что дальше

Когда у тебя появится **первый рабочий эндпоинт** (например `GET /api/robots` возвращает JSON) — скинь скрин из Network + сам JSON. Я подгоню если формат где-то расходится с `docs/API_CONTRACT.md`.

Список эндпоинтов и что они должны возвращать — там же, в **`docs/API_CONTRACT.md`**. В конце файла 7 открытых вопросов — как определишься, тоже скинь.
