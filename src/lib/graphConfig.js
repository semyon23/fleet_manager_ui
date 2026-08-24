import { defineConfigs } from 'v-network-graph'

/**
 * Конфиг рендера графа — портирован из bekirbostanci/vda5050_lif_editor/src/utils/graphConfig.ts
 * Стилистика "точь-в-точь" c референсом.
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
        color: '#e2e8f0',
        width: 1,
        dasharray: 1,
      },
      thick: {
        color: '#94a3b8',
        width: 1,
        dasharray: 0,
      },
    },
    layoutHandler: undefined,
    scalingObjects: true,
  },
  node: {
    draggable: true,
    selectable: 3,
    normal: {
      type: 'circle',
      radius: 12,
      color: '#1e40af',
      strokeWidth: 2,
      strokeColor: '#ffffff',
    },
    hover: {
      color: '#3b82f6',
      strokeWidth: 3,
    },
    selected: {
      color: '#f97316',
    },
    label: {
      visible: true,
      fontSize: 11,
      color: '#1e40af',
      background: {
        visible: true,
        color: '#ffffffcc',
        padding: { horizontal: 4, vertical: 2 },
        borderRadius: 3,
      },
    },
  },
  edge: {
    selectable: 3,
    normal: {
      width: 2,
      color: '#1e40af',
      dasharray: '0',
      animate: false,
    },
    hover: {
      color: '#3b82f6',
      width: 3,
    },
    selected: {
      color: '#f97316',
      width: 3,
    },
    label: {
      fontSize: 11,
      visible: false,
      color: '#1e40af',
      background: {
        visible: true,
        color: '#ffffffcc',
        padding: { horizontal: 3, vertical: 2 },
        borderRadius: 3,
      },
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
