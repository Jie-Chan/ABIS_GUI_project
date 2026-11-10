// 在点击快捷项时计算时间，避免页面长时间打开后使用过期的范围。
export const TIME_RANGE_SHORTCUTS = [
  { text: '最近一小时', value: () => { const end = new Date(); return [new Date(end.getTime() - 3600000), end] } },
  { text: '今天', value: () => { const end = new Date(); const start = new Date(end); start.setHours(0, 0, 0, 0); return [start, end] } },
  { text: '最近七天', value: () => { const end = new Date(); return [new Date(end.getTime() - 7 * 86400000), end] } },
]
