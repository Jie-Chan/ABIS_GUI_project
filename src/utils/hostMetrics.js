const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2, useGrouping: false })
const rateDecimal = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false,
})

export function rateUnit(value) {
  if (value >= 1024 ** 2) return { label: 'MiB/s', divisor: 1024 ** 2 }
  if (value >= 1024) return { label: 'KiB/s', divisor: 1024 }
  return { label: 'B/s', divisor: 1 }
}

export function formatMetric(value, unit = '') {
  if (!Number.isFinite(value)) return '—'
  const text = value > 0 && value < 0.01 ? '<0.01' : number.format(value)
  return unit && unit !== '%' ? `${text} ${unit}` : `${text}${unit}`
}

export function formatRate(value) {
  if (!Number.isFinite(value)) return '—'
  const { label, divisor } = rateUnit(value)
  return divisor === 1 ? formatMetric(value, label) : `${rateDecimal.format(value / divisor)} ${label}`
}
