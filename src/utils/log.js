import { LOG_APIS } from '@/constants/log'

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

export function sortEvents(events = []) {
  return [...events].sort((a, b) => {
    const first = Date.parse(a.at), second = Date.parse(b.at)
    return Number.isFinite(first) && Number.isFinite(second) ? first - second : 0
  })
}

export function handlingStages(record) {
  return (record.stages || []).flatMap(stage => stage.key === 'ABIS_HANDLING'
    ? [stage] : (stage.children || []).filter(child => child.key === 'ABIS_HANDLING'))
}

/** 入口字段只来自相应入口的接收 Event；不从候选人或迟到的 ABIS 入口回填。 */
export function requestEntry(record) {
  const events = record.mode === 'sync'
    ? handlingStages(record).flatMap(stage => stage.events || [])
    : record.stages?.find(stage => stage.key === 'ADAPTER_RECEIVED')?.events || []
  const entry = sortEvents(events).find(event => event.kind === 'RECEIVED')
  return { userId: entry?.payload?.userId ?? null, api: entry?.payload?.api || '', receivedAt: entry?.at || null }
}

export function currentRequestStage(record) {
  if (record.mode === 'sync') return 'ABIS_HANDLING'
  const stages = record.stages || []
  const received = stages.find(stage => stage.key === 'ADAPTER_RECEIVED')
  const calling = stages.find(stage => stage.key === 'ADAPTER_CALLING')
  if (record.publication === 'pending') return 'ADAPTER_RESPONDED'
  if (calling && (calling.retryPending || ['RUNNING', 'UNKNOWN'].includes(calling.status))) return 'ADAPTER_CALLING'
  if (record.result === 'failure' && handlingStages(record).some(stage => stage.status === 'FAILED' && stage.applicable !== false)) return 'ABIS_HANDLING'
  if (received?.status === 'FAILED') return 'ADAPTER_RECEIVED'
  if (record.publication === 'published') return 'ADAPTER_RESPONDED'
  const latest = [...stages].reverse().find(stage => stage.applicable !== false && (stage.startedAt || stage.status !== 'WAITING'))?.key
  return latest === 'ADAPTER_RECEIVED' && received?.status === 'SUCCESS' ? 'ADAPTER_CALLING' : latest || 'ADAPTER_RECEIVED'
}

/** 列表、详情、筛选和导出共用的请求摘要。 */
export function projectRequest(record) {
  const entry = requestEntry(record)
  const sent = handlingStages(record).flatMap(stage => stage.events || []).filter(event => event.kind === 'RESPONDED' && event.status === 'SUCCESS')
  const responseSentAt = sortEvents(sent).at(-1)?.at || null
  const result = { ...record, ...entry, responseSentAt, apiLabel: LOG_APIS.find(api => api.key === entry.api)?.label || entry.api || '—' }
  result.currentStage = currentRequestStage(result)
  result.calledAt = formatLogTime(entry.receivedAt).split('.')[0]
  result.costMs = requestDuration(result).label === '总耗时' ? requestDuration(result).value : null
  return result
}

export function processingSpans(stage) {
  const events = sortEvents(stage.events)
  const executions = [...new Set(events.filter(event => event.kind.startsWith('PROCESSING_')).map(event => event.executionId))]
  return executions.map(executionId => ({
    executionId,
    start: events.find(event => event.kind === 'PROCESSING_STARTED' && event.executionId === executionId),
    end: events.find(event => event.kind === 'PROCESSING_ENDED' && event.executionId === executionId),
  }))
}

export function handlingSpan(stage) {
  const events = sortEvents(stage.events)
  return {
    startedAt: events.find(event => event.kind === 'RECEIVED')?.at || null,
    endedAt: events.filter(event => event.kind === 'RESPONDED' && event.status === 'SUCCESS').at(-1)?.at || null,
  }
}

/** 定位当前请求、当前尝试和所选发送记录，绝不回退到另一条响应。 */
export function responseForEvent(record, selected) {
  if (selected?.requestId !== record.requestId) return null
  return handlingStages(record).flatMap(stage => stage.events || []).find(event =>
    event.kind === 'RESPONDED' && event.requestId === record.requestId && event.id === selected.id && event.attemptId === selected.attemptId
  )?.responseBody ?? null
}

export function formatLogTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—'
  const date = new Date(value)
  const pad = (n, size = 2) => String(n).padStart(size, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}
