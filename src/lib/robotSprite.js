/**
 * Выбор нужной картинки робота по heading.
 * У робота может быть либо статичный `sprite: string`,
 * либо направленный набор `sprites: { n, ne, e, se, s, sw, w, nw, top }`.
 */

const DIRS = ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se']

/**
 * Ближайшее из 8 направлений для угла theta (радианы, math-convention: 0=E, π/2=N).
 */
export function pickDir(theta) {
  const step = Math.PI / 4
  let idx = Math.round(theta / step)
  idx = ((idx % 8) + 8) % 8
  return DIRS[idx]
}

/**
 * URL картинки для робота под данный heading.
 * Для стационарных ситуаций (charging/idle/error/offline) — используем top view если доступен.
 */
export function spriteFor(robot) {
  if (!robot) return null
  if (!robot.sprites) return robot.sprite || null
  const s = robot.sprites
  if (robot.status !== 'moving' && s.top) return s.top
  const dir = pickDir(robot.theta || 0)
  return s[dir] || s.top || null
}

/**
 * URL для превью-иконок (таблицы, дашборд). Всегда top если есть — плоско читается.
 */
export function previewSpriteFor(robot) {
  if (!robot) return null
  if (robot.sprites) return robot.sprites.top || robot.sprites.n || robot.sprite
  return robot.sprite || null
}

/**
 * CSS-filter для тонирования png-спрайта в цвет статуса (для <img> вне SVG).
 * Синие подсветки → цвет статуса.
 */
export function tintStyle(status) {
  switch (status) {
    case 'moving':
      return 'filter: hue-rotate(-120deg)'
    case 'charging':
      return 'filter: hue-rotate(-160deg)'
    case 'error':
      return 'filter: hue-rotate(140deg)'
    case 'idle':
      return 'filter: saturate(0.15)'
    case 'offline':
      return 'filter: grayscale(1) opacity(0.5)'
    case 'teleop':
      return 'filter: hue-rotate(220deg) saturate(1.2)'
    case 'deploying':
      return 'filter: hue-rotate(30deg) saturate(1.1)'
    default:
      return ''
  }
}
