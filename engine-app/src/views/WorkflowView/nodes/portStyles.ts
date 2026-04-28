// 端口颜色规范 —— 所有节点统一使用
export const PORT_COLORS = {
  image:  '#f97316',  // 橙色 — 图片类
  text:   '#3b82f6',  // 蓝色 — 文本类
  images: '#fb923c',  // 浅橙 — 图片数组
  texts:  '#60a5fa',  // 浅蓝 — 文本数组
} as const

export type PortType = keyof typeof PORT_COLORS

export function handleStyle(type: PortType, position: 'left' | 'right') {
  return {
    background: PORT_COLORS[type],
    border: `2px solid #0a0a0a`,
    width: 11,
    height: 11,
    [position === 'left' ? 'left' : 'right']: -6,
  }
}
