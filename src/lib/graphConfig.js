import { defineConfigs } from 'v-network-graph'

/**
 * Конфиг рендера графа — под vda5050-lif-editor стилистику
 * (серые ноды, анимированные пунктирные edges, светлая сетка).
 */
export const graphConfigs = defineConfigs({
  view: {
    minZoomLevel: 0.1,
    maxZoomLevel: 200,
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
    scalingObjects: false,
  },
  node: {
    draggable: true,
    selectable: 3,
    normal: {
      type: 'circle',
      radius: 8,
      color: '#94a3b8',
      strokeWidth: 2,
      strokeColor: '#ffffff',
    },
    hover: {
      color: '#6b7280',
      strokeWidth: 3,
    },
    selected: {
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
})
