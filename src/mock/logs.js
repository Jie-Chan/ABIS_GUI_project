/** 最新 2026-11-11 文档：15 次接口调用，重投及重试仅保留为原请求的 Event。 */
import { MULTI_CANDIDATE_CASES } from '@/mock/identification'
import { handlingSpan, projectRequest } from '@/utils/log'

const REQUESTS = [
  { userId: 'U001', feature: 'face', api: 'enrollment', scenario: 'U001 人脸注册成功' },
  { userId: 'U001', feature: 'finger', api: 'enrollment', scenario: 'U001 指纹注册成功' },
  { userId: 'U001', feature: 'face', api: 'identification', scenario: 'U001 人脸查重成功，候选列表为空' },
  { userId: 'U001', feature: 'finger', api: 'identification', scenario: 'U001 指纹查重成功，候选列表为空' },
  { userId: 'U002', feature: 'face', api: 'enrollment', scenario: 'U002 人脸注册成功' },
  { userId: 'U002', feature: 'face', api: 'identification', scenario: 'U002 查重命中已有用户 U001' },
  { userId: 'U002', feature: 'face', api: 'delete', scenario: '删除本次新注册的 U002' },
  { userId: 'U003', feature: 'face', api: 'enrollment', scenario: 'U003 注册结果不明，流程停止' },
  { userId: 'U004', feature: 'face', api: 'identification', scenario: 'ACK 异常及重投，查重继续' },
  { userId: 'U005', feature: 'finger', api: 'identification', scenario: '连接超时，确认未发出，等待重试' },
  { userId: 'U006', feature: 'face', api: 'identification', scenario: 'ABIS 查重失败，失败响应已交付' },
  { userId: 'U007', feature: 'finger', api: 'identification', scenario: '查重成功，响应发布待重试' },
  { userId: 'U008', feature: 'face', api: 'delete', scenario: 'U008 正常同步删除', mode: 'sync' },
  ...MULTI_CANDIDATE_CASES,
]

function buildRequest(sample, index, base) {
  const { userId, api, feature, scenario, mode = 'async' } = sample
  const requestId = `REQ-${String(index + 1).padStart(8, '0')}`
  // 按业务发生顺序递增，前一次响应先于该用户下一次调用。
  const at = offset => new Date(base + index * 30000 + offset).toISOString()
  let sequence = 0
  const event = (kind, action, offset, status = 'SUCCESS', extra = {}) => ({
    id: `${requestId}-E${++sequence}`, requestId, kind, action, at: at(offset), status,
    errorCode: null, description: '', ...extra,
  })
  const stage = (key, from, to, events = []) => ({
    key, instanceId: `${requestId}-${key}`, status: 'SUCCESS', applicable: true,
    startedAt: from == null ? null : at(from), endedAt: to == null ? null : at(to), events,
  })
  const responseBody = { requestId, userId, feature, code: 'SUCCESS', message: api === 'identification' ? '查重成功' : api === 'delete' ? '删除成功' : '注册成功' }
  if (api === 'identification') responseBody.candidates = sample.candidates ? sample.candidates.map(item => ({ ...item })) : userId === 'U002' ? [{ userId: 'U001', rank: 1, score: 96 }] : []
  if (api === 'delete') responseBody.deletedUserId = userId
  if (userId === 'U002' && api === 'delete') responseBody.message = '已删除本次新注册的 U002，已有用户 U001 未被删除'
  const requestBody = { userId, feature, api, ...(sample.fingerPosition ? { fingerPosition: sample.fingerPosition } : {}), ...(api === 'enrollment' ? { images: [{ imageId: `IMAGE-${requestId}`, format: 'image/jpeg' }] } : {}) }
  const executionId = 'execution-attempt-1', attemptId = 'attempt-1'
  const handling = { ...stage('ABIS_HANDLING', mode === 'sync' ? 0 : 70, 250, [
    event('RECEIVED', '接收请求', mode === 'sync' ? 0 : 70, 'SUCCESS', { attemptId, requestBody: mode === 'sync' ? requestBody : undefined, payload: { userId, api, feature, ...(sample.fingerPosition ? { fingerPosition: sample.fingerPosition } : {}) } }),
    event('PROCESSING_STARTED', '业务处理开始', 90, 'STARTED', { attemptId, executionId }),
    event('PROCESSING_ENDED', '业务处理结束', 210, 'SUCCESS', { attemptId, executionId }),
    event('RESPONDED', '发送响应', 250, 'SUCCESS', { attemptId, responseBody, description: '服务端已完成本次接口响应发送。' }),
  ]), attemptId, instanceId: `${requestId}-handling-${attemptId}` }
  const received = stage('ADAPTER_RECEIVED', 0, 20, [
    event('RECEIVED', '接收请求', 0, 'SUCCESS', { payload: { userId, api, feature, ...(sample.fingerPosition ? { fingerPosition: sample.fingerPosition } : {}) } }),
    event('TASK_SAVED', '任务可靠落库', 20, 'SUCCESS', { description: '任务状态 PENDING' }),
    event('ACK', '发送请求 ACK', 25, 'SUCCESS'),
  ])
  const calling = { ...stage('ADAPTER_CALLING', 60, 270, [
    event('CLAIMED', '取得执行槽位并提交 CALLING', 50, 'SUCCESS'),
    event('CALL_STARTED', '发起第 1 次 ABIS 调用', 60, 'STARTED', { attemptId, requestBody }),
    event('CALL_RESPONSE', '收到可解析的 ABIS 响应', 270, 'SUCCESS', { attemptId }),
  ]), children: [handling] }
  const published = stage('ADAPTER_RESPONDED', 280, 320, [
    event('PUBLISH_STARTED', '发起第 1 次响应发布', 280, 'STARTED', { attemptId: 'publish-attempt-1' }),
    event('PUBLISH_CONFIRMED', 'MQ 已确认发布', 320, 'SUCCESS', { description: '响应未被退回，最终响应交付完成。' }),
  ])
  const record = {
    id: index + 1, requestId, mode, scenario, collectionRound: api === 'delete' ? 2 : 1,
    relatedRequestIds: ({ 0: ['REQ-00000003'], 1: ['REQ-00000004'], 4: ['REQ-00000006'] })[index] || [],
    sourceIp: index === 7 ? null : mode === 'sync' ? '198.51.100.23' : `203.0.113.${40 + index % 4}`,
    caller: mode === 'async' ? 'MOSIP-Adapter' : 'SIGATT-Portal', feature,
    result: 'success', publication: mode === 'sync' ? 'sync' : 'published', publishedAt: mode === 'sync' ? null : at(320),
    collectionDelayed: false, stages: mode === 'sync' ? [handling] : [received, calling, published],
  }
  const waitPublication = () => {
    record.publication = 'none'; record.publishedAt = null
    Object.assign(published, { status: 'WAITING', startedAt: null, endedAt: null, events: [] })
  }
  if (userId === 'U003') {
    record.result = 'unknown'; waitPublication()
    Object.assign(calling, { status: 'UNKNOWN', endedAt: null })
    calling.events = calling.events.slice(0, 2).concat(event('CALL_TIMEOUT', '等待 ABIS 响应超时', 30060, 'FAILED', {
      attemptId, errorCode: 'ABIS_TIMEOUT', description: '注册请求可能已发出，执行结果不明，不自动重试，不发起后续查重或删除。',
    }))
    Object.assign(handling, { status: 'UNKNOWN', startedAt: null, endedAt: null, events: [] })
  }
  if (userId === 'U004') {
    received.events = [received.events[0], received.events[1],
      event('ACK_FAILED', 'ACK 发送异常', 25, 'FAILED', { errorCode: 'ACK_CHANNEL_CLOSED', description: '任务已可靠保存，ACK 失败不撤销接收成功状态。' }),
      event('REDELIVERED', '重复投递', 35, 'SUCCESS', { description: '按 requestId 命中原任务，不创建新请求，不重复执行业务。' }),
      event('ACK', '发送请求 ACK', 40, 'SUCCESS'),
    ]
    record.result = 'running'; waitPublication()
    Object.assign(calling, { status: 'RUNNING', endedAt: null, events: calling.events.slice(0, 2) })
    Object.assign(handling, { status: 'RUNNING', endedAt: null, events: handling.events.slice(0, 2) })
  }
  if (userId === 'U005') {
    delete calling.events.find(e => e.kind === 'CALL_STARTED').requestBody
    record.result = 'waiting'; waitPublication()
    Object.assign(calling, { status: 'WAITING', endedAt: null, retryPending: true })
    calling.events = calling.events.slice(0, 2).concat([
      event('CALL_FAILED', '获取 HTTP 连接超时', 100, 'FAILED', { attemptId, errorCode: 'CONNECT_TIMEOUT', requestSent: false, description: '连接池获取连接超时，尚未写出 HTTP 请求；故障可重试且剩余 2 次额度。' }),
      event('RETRY_SCHEDULED', '任务退回 PENDING，等待重试', 110, 'SUCCESS', { description: '确认请求未发出，允许重新排队。' }),
    ])
    calling.children = [{ ...stage('ABIS_HANDLING', null, null), instanceId: `${requestId}-handling-unobserved`, attemptId, status: 'WAITING', applicable: false }]
  }
  if (userId === 'U006') {
    record.result = 'failure'; handling.status = 'FAILED'
    Object.assign(handling.events.find(item => item.kind === 'PROCESSING_ENDED'), { status: 'FAILED', errorCode: 'IDENTIFICATION_FAILED', description: 'ABIS 明确返回查重失败，执行结果已确认。' })
    handling.events.find(item => item.kind === 'RESPONDED').responseBody = { requestId, userId, code: 'IDENTIFICATION_FAILED', message: '查重失败' }
    calling.events.at(-1).description = '已正常取得可解析的业务失败响应，外层调用成功。'
  }
  if (userId === 'U007') {
    record.publication = 'pending'; record.publishedAt = null
    Object.assign(published, { status: 'FAILED', endedAt: null, retryPending: true })
    published.events = [published.events[0], event('PUBLISH_FAILED', '发布响应失败', 320, 'FAILED', {
      errorCode: 'PUBLISH_NACK', description: '等待重试发送已保存的查重成功响应；业务结果保持成功。',
    })]
  }
  Object.assign(handling, handlingSpan(handling))
  return projectRequest(record)
}

export function buildLogRecords() {
  const base = Date.now() - 600000
  return REQUESTS.map((sample, index) => buildRequest(sample, index, base))
}

/** 只通过完整 ID 查询的补充验收记录，不改变默认 15 条及入库数据。 */
export function buildSupplementalLogRecords() {
  const base = Date.now() - 600000
  const missingUser = buildRequest({ userId: null, feature: 'face', api: 'identification', scenario: '缺少用户 ID 的请求' }, 15, base)
  // 复用此历史样例验收调用方式未记录，仍可按请求 ID 查询并查看详情。
  delete missingUser.mode
  const retried = buildRequest({ userId: 'U017', feature: 'face', api: 'identification', scenario: '首次连接超时未发送，第二次调用成功' }, 16, base)
  const calling = retried.stages.find(stage => stage.key === 'ADAPTER_CALLING')
  const handling = calling.children[0]
  const started = calling.events.find(event => event.kind === 'CALL_STARTED')
  const offsetAt = offset => new Date(Date.parse(started.at) + offset).toISOString()
  const firstStarted = { ...started, requestBody: undefined }
  const secondStarted = { ...started, id: `${retried.requestId}-retry-start`, action: '发起第 2 次 ABIS 调用', at: offsetAt(1000), attemptId: 'attempt-2' }
  const failure = { id: `${retried.requestId}-connect-timeout`, requestId: retried.requestId, kind: 'CALL_FAILED', action: '获取 HTTP 连接超时', at: offsetAt(40), attemptId: 'attempt-1', status: 'FAILED', errorCode: 'CONNECT_TIMEOUT', requestSent: false, description: '首次获取连接超时，确认 HTTP 请求尚未发送，无请求或响应正文。' }
  const retry = { id: `${retried.requestId}-retry-scheduled`, requestId: retried.requestId, kind: 'RETRY_SCHEDULED', action: '重新排队等待调用', at: offsetAt(50), status: 'SUCCESS', attemptId: 'attempt-1', description: '确认未发送，按重试策略发起第二次调用。' }
  calling.events = [calling.events[0], firstStarted, failure, retry, secondStarted, { ...calling.events.at(-1), at: offsetAt(1210), attemptId: 'attempt-2' }]
  const unobserved = { key: 'ABIS_HANDLING', instanceId: `${retried.requestId}-handling-attempt-1`, attemptId: 'attempt-1', applicable: false, status: 'WAITING', startedAt: null, endedAt: null, events: [] }
  handling.attemptId = 'attempt-2'
  handling.instanceId = `${retried.requestId}-handling-attempt-2`
  handling.events = handling.events.map(event => ({ ...event, attemptId: 'attempt-2', at: new Date(Date.parse(event.at) + 1000).toISOString() }))
  Object.assign(handling, handlingSpan(handling))
  calling.children = [unobserved, handling]
  calling.endedAt = offsetAt(1210)
  const published = retried.stages.find(stage => stage.key === 'ADAPTER_RESPONDED')
  for (const field of ['startedAt', 'endedAt']) published[field] = new Date(Date.parse(published[field]) + 1000).toISOString()
  published.events = published.events.map(event => ({ ...event, at: new Date(Date.parse(event.at) + 1000).toISOString() }))
  retried.publishedAt = published.endedAt
  return [missingUser, projectRequest(retried)].map((record, index) => ({ ...record, id: 2001 + index, historical: true }))
}
