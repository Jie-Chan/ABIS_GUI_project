/** 一个逻辑请求一条记录。重投、调用尝试与发布重试保存在同一 Stage 的 events 中。 */
import { LOG_APIS, ASYNC_STAGES, SYNC_STAGES } from '@/constants/log'
import { formatDateTime } from '@/utils/datetime'
import { durationMs } from '@/utils/log'

const SCENARIOS = [
  '正常异步注册', '同步入口校验拒绝', 'ABIS 明确返回业务失败',
  '调用超时，执行结果不明', '落库后 ACK 异常，随后收到重投',
  '业务成功，响应发布失败待重试', '业务成功，响应重试后发布成功',
  '响应消息被退回', '日志采集延迟', '正常同步删除', '正在处理', '等待处理',
  '调用失败后重试成功',
]

function buildRequest(index, base) {
  const scenario = index < SCENARIOS.length ? index : -1
  const start = base - index * 90000
  const at = offset => new Date(start + offset).toISOString()
  const mode = [1, 9].includes(scenario) || (scenario === -1 && index % 2 === 0) ? 'sync' : 'async'
  const api = scenario === 3 ? 'identification' : [2, 9].includes(scenario) ? 'delete' : scenario >= 0 ? 'enrollment' : LOG_APIS[index % LOG_APIS.length].key
  const metadata = LOG_APIS.find(item => item.key === api)
  // 00000001 保留 47 个逻辑请求，方便申请人联动及跨页导出验证。
  const userId = scenario === 3 ? null : index <= 47 ? '00000001' : String(Math.floor(index / 48) + 1).padStart(8, '0')
  const record = {
    id: index + 1, requestId: `REQ-${String(index + 1).padStart(8, '0')}`, userId,
    scenario: SCENARIOS[scenario] || (mode === 'sync' ? '正常同步请求' : '正常异步请求'),
    mode, receivedAt: at(0), calledAt: formatDateTime(new Date(start)),
    caller: mode === 'sync' ? 'SIGATT-Portal' : 'MOSIP-Adapter',
    api, apiLabel: metadata.label, feature: index % 2 ? 'finger' : 'face',
    result: 'success', publication: mode === 'sync' ? 'sync' : 'published',
    currentStage: mode === 'sync' ? 'ABIS_RESPONDED' : 'ADAPTER_RESPONDED',
    responseSentAt: at(760), publishedAt: mode === 'async' ? at(1000) : null,
    collectionDelayed: false,
    response: { requestId: `REQ-${String(index + 1).padStart(8, '0')}`, code: 'SUCCESS', message: '业务处理成功', data: { userId, operation: api } },
  }
  const event = (action, offset, status = 'SUCCESS', errorCode = null, description = '') => ({
    action, at: at(offset), status, errorCode,
    description: description || (status === 'STARTED' ? '本次动作已开始，后续结果见对应事件。' : status === 'SUCCESS' ? '本次动作已确认完成。' : '本次动作失败，原因见错误码。'),
  })
  const stage = (key, from, to, events) => ({ key, status: 'SUCCESS', applicable: true, startedAt: at(from), endedAt: at(to), events })
  const all = {
    ADAPTER_RECEIVED: stage('ADAPTER_RECEIVED', 0, 50, [
      event('接收请求 MQ 消息', 0, 'STARTED'), event('任务可靠保存', 50, 'SUCCESS', null, '任务已持久保存，接收阶段完成。'), event('请求 ACK', 60),
    ]),
    ADAPTER_CALLING: stage('ADAPTER_CALLING', 100, 800, [event('调用 ABIS（第 1 次）', 100, 'STARTED'), event('收到并解析 ABIS 响应', 800)]),
    ABIS_RECEIVED: stage('ABIS_RECEIVED', mode === 'sync' ? 0 : 150, 200, [event('ABIS 接收请求', mode === 'sync' ? 0 : 150, 'STARTED'), event('入口校验通过', 200)]),
    ABIS_PROCESSING: stage('ABIS_PROCESSING', 220, 700, [event('开始业务处理', 220, 'STARTED'), event('业务处理完成', 700)]),
    ABIS_RESPONDED: stage('ABIS_RESPONDED', 710, 760, [event('开始发送响应', 710, 'STARTED'), event('服务端完成响应发送', 760)]),
    ADAPTER_RESPONDED: stage('ADAPTER_RESPONDED', 850, 1000, [event('发布最终响应（第 1 次）', 850, 'STARTED'), event('路由通过并取得可靠发布确认', 1000, 'SUCCESS', null, '响应未被退回，发布完成。')]),
  }
  const skip = key => { Object.assign(all[key], { applicable: false, status: 'WAITING', startedAt: null, endedAt: null, events: [] }) }
  const wait = key => { Object.assign(all[key], { status: 'WAITING', startedAt: null, endedAt: null, events: [] }) }
  if (scenario === 1) {
    Object.assign(record, { result: 'failure', currentStage: 'ABIS_RECEIVED', responseSentAt: at(260), response: { code: 'INVALID_ARGUMENT', message: '缺少注册所需的模态参数' } })
    Object.assign(all.ABIS_RECEIVED, { status: 'FAILED', events: [event('入口参数校验', 200, 'FAILED', 'INVALID_ARGUMENT', '请求已拒绝，业务处理不会执行。')] })
    skip('ABIS_PROCESSING')
    Object.assign(all.ABIS_RESPONDED, { startedAt: at(210), endedAt: at(260), events: [event('发送校验失败响应', 260)] })
  }
  if (scenario === 2) {
    Object.assign(record, { result: 'failure', currentStage: 'ABIS_PROCESSING', response: { code: 'USER_NOT_FOUND', message: '目标人员不存在，删除失败' } })
    Object.assign(all.ABIS_PROCESSING, { status: 'FAILED', events: [event('开始删除', 220, 'STARTED'), event('业务返回明确失败', 700, 'FAILED', 'USER_NOT_FOUND', '业务结果已确认失败，调用与响应传输正常。')] })
    all.ADAPTER_CALLING.events[1].description = '已收到可解析的业务失败响应，调用阶段正常完成。'
  }
  if (scenario === 3) {
    Object.assign(record, { result: 'unknown', publication: 'none', currentStage: 'ADAPTER_CALLING', responseSentAt: null, publishedAt: null, response: null })
    Object.assign(all.ADAPTER_CALLING, { status: 'UNKNOWN', endedAt: null, events: [event('调用 ABIS（第 1 次）', 100, 'STARTED'), event('等待 ABIS 响应超时', 30100, 'FAILED', 'ABIS_TIMEOUT', '执行结果无法确认，需要人工核查；不推断成功或失败。')] })
    for (const key of SYNC_STAGES) Object.assign(all[key], { status: 'UNKNOWN', startedAt: null, endedAt: null, events: [] })
    wait('ADAPTER_RESPONDED')
  }
  if (scenario === 4) {
    all.ADAPTER_RECEIVED.events = [event('接收请求 MQ 消息（第 1 次）', 0, 'STARTED'), event('任务可靠保存', 50), event('请求 ACK（第 1 次）', 60, 'FAILED', 'ACK_CHANNEL_CLOSED', '任务已保存，ACK 失败不撤销接收成功判定。'), event('收到重复投递（第 2 次）', 1500, 'SUCCESS', null, '按 requestId 命中已保存任务，未重复执行业务。'), event('请求 ACK（第 2 次）', 1510)]
  }
  if ([5, 6, 7].includes(scenario)) {
    const publication = all.ADAPTER_RESPONDED
    publication.events = [event('发布最终响应（第 1 次）', 850, 'STARTED')]
    if (scenario === 7) publication.events.push(event('收到 MQ 发布确认', 950), event('响应消息被退回', 980, 'FAILED', 'UNROUTABLE', '消息未通过约定路由，发布确认不能单独判定为发布成功。'))
    else publication.events.push(event('发布最终响应（第 1 次）失败', 1000, 'FAILED', 'PUBLISH_NACK', '等待发布重试，已确认的业务成功结果保持不变。'))
    if (scenario === 6) {
      publication.events.push(event('发布最终响应（第 2 次）', 2000, 'STARTED'), event('路由通过并取得可靠发布确认', 2200, 'SUCCESS', null, '响应未被退回，重试发布完成。'))
      publication.endedAt = at(2200)
      record.publishedAt = at(2200)
    } else {
      Object.assign(publication, { status: 'FAILED', endedAt: null })
      Object.assign(record, { publication: 'pending', publishedAt: null })
    }
  }
  if (scenario === 8) {
    // 仅缺日志，不更改已有成功判定；已知总耗时，但处理阶段缺少结束证据。
    record.collectionDelayed = true
    all.ABIS_PROCESSING.endedAt = null
    all.ABIS_PROCESSING.events = [event('开始业务处理', 220, 'STARTED')]
  }
  if (scenario === 12) {
    // 第一次连接明确未建立；第二次成功调用，仍属于原逻辑请求。
    Object.assign(all.ADAPTER_CALLING, { endedAt: at(1800), events: [
      event('调用 ABIS（第 1 次）', 100, 'STARTED'),
      event('连接 ABIS 失败', 300, 'FAILED', 'CONNECTION_REFUSED', '连接未建立，等待重试。'),
      event('调用 ABIS（第 2 次）', 1100, 'STARTED'),
      event('收到并解析 ABIS 响应', 1800),
    ] })
    for (const key of [...SYNC_STAGES, 'ADAPTER_RESPONDED']) {
      const item = all[key]
      item.startedAt = new Date(Date.parse(item.startedAt) + 1000).toISOString()
      item.endedAt = new Date(Date.parse(item.endedAt) + 1000).toISOString()
      item.events.forEach(event => { event.at = new Date(Date.parse(event.at) + 1000).toISOString() })
    }
    record.responseSentAt = at(1760)
    record.publishedAt = at(2000)
  }
  if ([10, 11].includes(scenario)) {
    Object.assign(record, { result: scenario === 10 ? 'running' : 'waiting', publication: 'none', currentStage: scenario === 10 ? 'ABIS_PROCESSING' : 'ADAPTER_CALLING', responseSentAt: null, publishedAt: null, response: null })
    if (scenario === 10) {
      Object.assign(all.ADAPTER_CALLING, { status: 'RUNNING', endedAt: null, events: [event('调用 ABIS（第 1 次）', 100, 'STARTED')] })
      Object.assign(all.ABIS_PROCESSING, { status: 'RUNNING', endedAt: null, events: [event('开始业务处理', 220, 'STARTED')] })
      wait('ABIS_RESPONDED')
    } else for (const key of ['ADAPTER_CALLING', ...SYNC_STAGES]) wait(key)
    wait('ADAPTER_RESPONDED')
  }
  record.stages = (mode === 'sync' ? SYNC_STAGES : ASYNC_STAGES).map(key => all[key])
  record.costMs = durationMs(record.receivedAt, mode === 'sync' ? record.responseSentAt : record.publishedAt)
  return record
}

export function buildLogRecords(total = 360) {
  const base = Date.now() - 3600000
  return Array.from({ length: total }, (_, index) => buildRequest(index, base))
}
