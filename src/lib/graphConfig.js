/**
 * Конфиг рендера графа — под vda5050-lif-editor стилистику.
 *
 * КРИТИЧНО: v-network-graph state-конфиги (normal/hover/selected) НЕ наследуют
 * `type` и `radius` друг от друга. Если в `selected` не указать type='circle',
 * то при потере hover'а (курсор ушёл) v-network-graph fallback'ится на дефолт
 * `type: 'rect'` — а без width/height/radius атрибуты получают NaN → SVG-ошибки
 * и нода пропадает. Поэтому явно дублируем type/radius во всех состояниях.
 */
const shape = {
  type: 'circle',
  radius: 8,
}

export const initialConfigs = {
  view: {
    minZoomLevel: 0.1,
    maxZoomLevel: 200,
    scalingObjects: false,
    grid: {
      visible: true,
      interval: 1,
      thickIncrements: 5,
      line: {
        color: '#e5e7eb',
        width: 1,
        dasharray: 1,
      },
      thick: {
        color: '#9ca3af',
        width: 1,
        dasharray: 0,
      },
    },
  },
  node: {
    draggable: true,
    selectable: 3,
    normal: {
      ...shape,
      color: (n) => n.color || '#94a3b8',
    },
    hover: {
      ...shape,
      color: (n) => n.color || '#6b7280',
    },
    selected: {
      ...shape,
      color: '#f97316',
    },
    label: {
      visible: true,
      fontSize: 10,
      color: '#374151',
      direction: 'north',
      margin: 8,
      background: {
        visible: false,
      },
    },
  },
  edge: {
    selectable: 3,
    gap: 8,
    normal: {
      width: 2,
      color: '#9ca3af',
      dasharray: '10 8',
      animate: true,
      animationSpeed: 30,
    },
    hover: {
      color: '#6b7280',
      width: 3,
    },
    selected: {
      color: '#f97316',
      width: 3,
    },
    label: {
      fontSize: 10,
      visible: false,
    },
    marker: {
      target: {
        type: 'arrow',
        width: 5,
        height: 5,
        margin: -1,
        offset: 0,
        units: 'strokeWidth',
        color: null,
      },
    },
  },
}

export const graphConfigs = initialConfigs
