import { load, dump } from 'js-yaml'

/**
 * Парсит ROS 2 Nav2 map metadata (YAML) и приводит к нормализованному виду.
 *
 * Спецификация: https://docs.nav2.org/configuration/packages/configuring-map-server.html
 *
 * @param {string} text — содержимое .yaml
 * @returns {{
 *   image: string,
 *   resolution: number,
 *   origin: [number, number, number],
 *   occupiedThresh: number,
 *   freeThresh: number,
 *   negate: 0|1,
 *   mode: 'trinary'|'scale'|'raw',
 *   raw: object,
 * }}
 */
export function parseNav2Meta(text) {
  const raw = load(text)
  if (!raw || typeof raw !== 'object') {
    throw new Error('YAML root must be a mapping')
  }

  const origin = Array.isArray(raw.origin) ? raw.origin : [0, 0, 0]
  return {
    image: String(raw.image || ''),
    resolution: Number(raw.resolution ?? 0.05),
    origin: [Number(origin[0] ?? 0), Number(origin[1] ?? 0), Number(origin[2] ?? 0)],
    occupiedThresh: Number(raw.occupied_thresh ?? 0.65),
    freeThresh: Number(raw.free_thresh ?? 0.196),
    negate: raw.negate ? 1 : 0,
    mode: (raw.mode || 'trinary'),
    raw,
  }
}

/**
 * Конвертирует пиксельные координаты (u, v) в метры карты (x, y).
 * u, v — column и row от левого-верхнего угла изображения.
 */
export function pixelToWorld(meta, u, v, imageHeight) {
  const x = meta.origin[0] + u * meta.resolution
  const y = meta.origin[1] + (imageHeight - v) * meta.resolution
  return { x, y }
}

/**
 * Обратная конвертация: метры → пиксели.
 */
export function worldToPixel(meta, x, y, imageHeight) {
  const u = (x - meta.origin[0]) / meta.resolution
  const v = imageHeight - (y - meta.origin[1]) / meta.resolution
  return { u, v }
}

/**
 * Сериализует нормализованные метаданные обратно в YAML (для экспорта / сохранения на бэк).
 */
export function serializeNav2Meta(meta) {
  const obj = {
    image: meta.image,
    resolution: meta.resolution,
    origin: meta.origin,
    occupied_thresh: meta.occupiedThresh,
    free_thresh: meta.freeThresh,
    negate: meta.negate,
    mode: meta.mode,
  }
  return dump(obj)
}
