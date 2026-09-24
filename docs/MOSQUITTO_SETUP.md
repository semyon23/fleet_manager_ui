# Настройка MQTT-брокера Mosquitto

Актуально на 2026-09-24. Mosquitto 2.x.

## Схема

```
робот ──MQTT──► брокер ──MQTT over WS (read-only)──► браузер: позиции (x, y, theta)
  │
  └─► dispatch ──gRPC──► control ──WS──► браузер: статус, батарея, ошибки,
                                          миссии, occupancy, события
```

- Роботы и `fleet_dispatch` работают по обычному MQTT (порт **1883**).
- Браузер (фронт) подключается по WebSocket (порт **9001**) **только на чтение**
  топиков `visualization` и `connection`.

| Пользователь     | Кто                  | Права                                                        |
|------------------|----------------------|--------------------------------------------------------------|
| `fleet-dispatch` | сервис fleet_dispatch | read: state, connection, factsheet, visualization; write: order, instantActions |
| `fleet-ui`       | браузер (фронт)      | read: visualization, connection. **Никакого write**           |
| `<serialNumber>` | робот                | только свои топики (через `%u` в ACL)                        |

---

## 1. Установка

```bash
sudo apt install mosquitto mosquitto-clients
mosquitto -h | head -1          # нужна версия 2.x
```

Или в Docker:

```bash
docker run -d --name mosquitto -p 1883:1883 -p 9001:9001 \
  -v /opt/mosquitto/config:/mosquitto/config \
  -v /opt/mosquitto/data:/mosquitto/data \
  eclipse-mosquitto:2
```

## 2. Конфиг `/etc/mosquitto/conf.d/fleet.conf`

```conf
# ── Общее ──
allow_anonymous false
password_file /etc/mosquitto/passwd
acl_file      /etc/mosquitto/acl

# Retained-сообщения (топик connection) переживают рестарт брокера
persistence true
persistence_location /var/lib/mosquitto/

log_dest stdout
log_type error
log_type warning
log_type notice
connection_messages true

# ── Роботы и dispatch: обычный MQTT ──
listener 1883 0.0.0.0
protocol mqtt

# ── Браузер: MQTT over WebSocket ──
listener 9001 0.0.0.0
protocol websockets
```

> В Mosquitto 2.x без явного `listener` брокер слушает **только localhost**.
> Это частая причина того, что к брокеру «не подключается» снаружи.

## 3. Пользователи

Логин робота = его `serialNumber`. Тогда в ACL одно правило через `%u`
подходит для всех роботов.

```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd fleet-dispatch   # -c только в первый раз
sudo mosquitto_passwd    /etc/mosquitto/passwd fleet-ui
sudo mosquitto_passwd    /etc/mosquitto/passwd amr-01           # = serialNumber робота
sudo mosquitto_passwd    /etc/mosquitto/passwd amr-02

sudo chown mosquitto:mosquitto /etc/mosquitto/passwd
sudo chmod 0600 /etc/mosquitto/passwd
```

## 4. ACL `/etc/mosquitto/acl`

```conf
# ── dispatch: читает всё от роботов, пишет order / instantActions ──
user fleet-dispatch
topic read  uagv/v2/+/+/state
topic read  uagv/v2/+/+/connection
topic read  uagv/v2/+/+/factsheet
topic read  uagv/v2/+/+/visualization
topic write uagv/v2/+/+/order
topic write uagv/v2/+/+/instantActions

# ── фронт: ТОЛЬКО чтение позиций и online/offline ──
user fleet-ui
topic read uagv/v2/+/+/visualization
topic read uagv/v2/+/+/connection

# ── роботы: каждый работает только со СВОИМИ топиками (%u = логин = serialNumber) ──
pattern write uagv/v2/+/%u/state
pattern write uagv/v2/+/%u/connection
pattern write uagv/v2/+/%u/factsheet
pattern write uagv/v2/+/%u/visualization
pattern read  uagv/v2/+/%u/order
pattern read  uagv/v2/+/%u/instantActions
```

У `fleet-ui` нет ни одного `write`: даже если пароль утечёт из браузера,
отправить роботу команду с ним нельзя.

```bash
sudo chown mosquitto:mosquitto /etc/mosquitto/acl
sudo chmod 0600 /etc/mosquitto/acl
sudo systemctl restart mosquitto
sudo journalctl -u mosquitto -f        # смотреть ошибки
```

## 5. Проверка

```bash
# Терминал 1: слушаем как фронт
mosquitto_sub -h 192.168.0.105 -u fleet-ui -P <пароль> -t 'uagv/v2/+/+/visualization' -v

# Терминал 2: публикуем как робот amr-01
mosquitto_pub -h 192.168.0.105 -u amr-01 -P <пароль> \
  -t 'uagv/v2/acme/amr-01/visualization' \
  -m '{"headerId":1,"agvPosition":{"x":1.5,"y":2.0,"theta":0.3,"mapId":"floor1","positionInitialized":true}}'
```

Проверка ACL: фронт **не должен** уметь писать в `order`.

```bash
# Терминал 1: слушаем order как dispatch
mosquitto_sub -h 192.168.0.105 -u fleet-dispatch -P <пароль> -t 'uagv/v2/+/+/order' -v

# Терминал 2: пытаемся опубликовать как фронт. В терминале 1 НИЧЕГО не должно появиться
mosquitto_pub -h 192.168.0.105 -u fleet-ui -P <пароль> -t 'uagv/v2/acme/amr-01/order' -m '{}'
```

> Mosquitto **не возвращает ошибку** клиенту при запрещённой публикации:
> сообщение молча отбрасывается. Поэтому проверять ACL нужно подписчиком.

## 6. Что учесть

- **Топик `connection`.** Робот публикует его с `retain` и QoS 1, а в LWT
  указывает `connectionState: "CONNECTIONBROKEN"`. Тогда фронт и dispatch
  сразу при подписке получают текущий online-статус всех роботов, а обрыв
  связи брокер разошлёт сам.
- **HTTPS и `wss://`.** Если фронт открыт по HTTPS (например, с GitHub Pages),
  браузер заблокирует `ws://` как mixed content. Тогда на listener 9001 нужен TLS:
  ```conf
  listener 9001 0.0.0.0
  protocol websockets
  certfile /etc/mosquitto/certs/server.crt
  keyfile  /etc/mosquitto/certs/server.key
  ```
  Если фронт открывается по `http://` в локальной сети, хватит `ws://`.
- **Пароль `fleet-ui` виден в браузере.** С ACL только на чтение это допустимо
  для локальной сети. Чтобы привязать доступ к логину в UI, для Mosquitto есть
  плагин `mosquitto-go-auth` с JWT-авторизацией (токен будет выдавать control).
- **Совпадающие `serialNumber`.** Если у разных производителей серийники могут
  совпасть, логин робота делаем вида `manufacturer_serial` и переводим ACL на
  `%c` (client id) или явные правила для каждого робота.
- **Частота `visualization`.** В VDA5050 этот топик опционален. Проверить, что
  роботы его публикуют и с какой частотой. Если частота высокая (50 Гц),
  фронт прореживает поток сам: берёт последнее значение и рисует раз в кадр.

## 7. Что нужно фронту

| Параметр          | Пример                       | Где на фронте       |
|-------------------|------------------------------|---------------------|
| Адрес WS-listener | `ws://192.168.0.105:9001`    | `public/config.js` → `mqttUrl` |
| Логин / пароль    | `fleet-ui` / `…`             | `public/config.js` → `mqttUser`, `mqttPassword` |
| `manufacturer` и `serialNumber` роботов | форма регистрации (`POST /fms/robots`), после F5 — `GET /fms/robots` | для сопоставления топика с `robot_id` |

Подписка на робота оформляется после того, как бэк ответил success на
`POST /fms/robots`: `serialNumber` = `name`, `manufacturer` из формы (пустой →
`+`). После удаления робота фронт отписывается.

Фронт склеивает два источника по `robot_id`: координаты из MQTT, остальное из
WS control. Если MQTT недоступен, позиция берётся из WS control.
