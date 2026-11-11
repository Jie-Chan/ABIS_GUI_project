/** 日志时间采用带时区的 ISO 时间；缺失、无效或倒序均不猜测耗时。 */
export function durationMs(start, end) {
  if (!start || !end) return null
  const value = Date.parse(end) - Date.parse(start)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function formatDuration(value) {
  if (value == null || !Number.isFinite(value) || value < 0) return '无数据'
  if (value < 1000) return `${value} ms`
  if (value < 60000) return `${(value / 1000).toFixed(2)} 秒`
  const seconds = Math.floor(value / 1000)
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

export function requestDuration(record, now = Date.now()) {
  const final = record.mode === 'sync' ? record.responseSentAt : record.publishedAt
  const complete = record.mode === 'sync' ? ['success', 'failure'].includes(record.result) : record.publication === 'published'
  const value = durationMs(record.receivedAt, complete ? final : new Date(now).toISOString())
  return { value, label: complete ? '总耗时' : '已用时', text: formatDuration(value) }
}

export function formatLogTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—'
  const date = new Date(value)
  const pad = (n, size = 2) => String(n).padStart(size, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}
