import { buildLifLayout, lifMetaInformation } from './exportLif'

/**
 * Мульти-layout экспорт: собирает ВСЕ переданные карты в один LIF-файл
 * с массивом layouts[]. Каждый layout получает уникальный layoutId и
 * увеличивающийся layoutLevelId (0, 1, 2 …) — эмулирует этажность.
 *
 * Формат layout — тот же, что в exportLif (buildLifLayout).
 */
export function exportLifMulti(maps) {
  return {
    metaInformation: lifMetaInformation(),
    layouts: maps.map((map, floorIdx) => buildLifLayout(map, floorIdx)),
  }
}
