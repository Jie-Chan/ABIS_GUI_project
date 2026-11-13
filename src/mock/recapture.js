/** 独立验收数据，不追加到默认 15 条日志；用于验证同一用户整人重采。 */
import { buildLogRecords } from '@/mock/logs'
import { projectRequest } from '@/utils/log'
import { FINGER_POSITIONS } from '@/constants/applicant'
export function buildRecaptureLogs({ fingerFailure = false, base = Date.parse('2026-11-10T08:00:00+08:00') } = {}) {
  const templates = buildLogRecords()
  const make = (index, api, feature) => {
    const source = templates[api === 'delete' ? 6 : api === 'identification' ? 2 : feature === 'face' ? 0 : 1]
    const record = structuredClone(source), delta = base + index * 60000 - Date.parse(source.receivedAt)
    const at = value => value ? new Date(Date.parse(value) + delta).toISOString() : value
    record.requestId = `RECAP-${String(index + 1).padStart(3, '0')}`; record.id = templates.length + index + 1; record.feature = feature; record.collectionRound = index < 3 ? 1 : 2; record.relatedRequestIds = []
    function move(stage) {
      stage.instanceId = `${record.requestId}-${stage.instanceId}`; stage.startedAt = at(stage.startedAt); stage.endedAt = at(stage.endedAt)
      stage.events.forEach(e => { e.id = `${record.requestId}-${e.id}`; e.requestId = record.requestId; e.at = at(e.at)
        if (e.payload) Object.assign(e.payload, { userId: 'U900', api, feature })
        if (e.requestBody) Object.assign(e.requestBody, { userId: 'U900', api, feature })
        if (e.responseBody) Object.assign(e.responseBody, { requestId: record.requestId, userId: 'U900', feature, message: api === 'delete' ? '删除成功' : api === 'identification' ? '查重成功' : '注册成功', ...(api === 'delete' ? { deletedUserId: 'U900' } : {}), ...(api === 'identification' ? { candidates: [] } : {}) })
      }); (stage.children || []).forEach(move)
    }
    record.stages.forEach(move); record.publishedAt = at(record.publishedAt)
    if (api === 'enrollment') {
      record.enrollmentRecords = (feature === 'face' ? [null] : FINGER_POSITIONS.slice(0, index === 7 ? 9 : 10).map(p => p.key)).map((fingerPosition, i) => ({
        recordId: `${record.requestId}-${feature}-${i + 1}`, fingerPosition, qualityScore: feature === 'face' ? 91 : i === 8 ? null : 93 - i * 2,
        imageUrl: feature === 'face' ? `/mock/biometrics/face-${index === 0 ? 'U001' : 'U004'}-1.svg` : `/mock/biometrics/finger-U001-${i + 1}.svg`,
      }))
    }
    if (index === 7 && !fingerFailure) record.enrollmentRecords.push({ ...record.enrollmentRecords[1], recordId: `${record.requestId}-finger-duplicate`, qualityScore: 97, imageUrl: '/mock/biometrics/finger-U005-left-index-b.svg' })
    if (api === 'enrollment') record.stages[1].events.find(e => e.kind === 'CALL_STARTED').requestBody.images = record.enrollmentRecords.map(r => ({ imageId: r.recordId, fingerPosition: r.fingerPosition }))
    if (index === 7 && fingerFailure) {
      record.result = 'failure'; const handling = record.stages[1].children[0]; handling.status = 'FAILED'
      Object.assign(handling.events.find(e => e.kind === 'PROCESSING_ENDED'), { status: 'FAILED', errorCode: 'ENROLLMENT_FAILED' })
      Object.assign(handling.events.find(e => e.kind === 'RESPONDED').responseBody, { code: 'ENROLLMENT_FAILED', message: '指纹注册失败' })
    }
    return projectRequest(record)
  }
  const logs = [['enrollment','face'],['enrollment','finger'],['identification','face'],['delete','face'],['delete','finger'],['enrollment','face'],['identification','face'],['enrollment','finger'],['identification','finger']].map(([api, feature], i) => make(i, api, feature))
  logs[0].relatedRequestIds = [logs[2].requestId]; logs[5].relatedRequestIds = [logs[6].requestId]
  return logs
}

/** 文档中的三人样例；阶段切换同时重放三人的完整请求历史。 */
export function buildDocumentRecaptureLogs(phase = 'complete') {
  const schedules = [
    { userId: 'U301', old: '09:00:00', oldFinger: '09:01:00', start: '14', fingers: 10, face: 'U004' },
    { userId: 'U302', old: '08:30:00', oldFinger: '08:31:00', start: '15', fingers: 8, face: 'U006' },
    { userId: 'U303', old: '10:00:00', oldFinger: '10:01:00', start: '16', fingers: 10, face: 'U010' },
  ]
  const newFingerImages = ['finger-U101-2.svg', 'finger-U102-2.svg', 'finger-U103-2.svg', 'finger-U005-left-index-a.svg', 'finger-U005-left-index-b.svg', 'finger-U009-2.svg']
  let nextId = 100
  return schedules.flatMap(sample => {
    const templates = buildRecaptureLogs({ fingerFailure: sample.userId === 'U303' })
    const steps = [
      [0, sample.old], [1, sample.oldFinger], [3, `${sample.start}:00:00`], [4, `${sample.start}:01:00`],
      [5, `${sample.start}:05:00`], ...(sample.userId === 'U301' ? [[6, '14:06:00']] : []), [7, `${sample.start}:08:00`],
    ]
    const records = steps.map(([templateIndex, time], index) => {
      const record = structuredClone(templates[templateIndex])
      const requestId = `RECAP-${sample.userId}-${String(index + 1).padStart(3, '0')}`
      const handling = record.stages[1].children[0]
      const ended = handling.events.find(event => event.kind === 'PROCESSING_ENDED').at
      const delta = Date.parse(`2026-11-12T${time}+08:00`) - Date.parse(ended)
      const shift = at => at ? new Date(Date.parse(at) + delta).toISOString() : at
      record.id = ++nextId
      record.requestId = requestId
      record.relatedRequestIds = []
      record.publishedAt = shift(record.publishedAt)
      record.scenario = `${sample.userId} ${index < 2 ? '旧轮次入库' : '本轮重采'} ${record.api}`
      const move = stage => {
        stage.instanceId = `${requestId}-${stage.key}`
        stage.startedAt = shift(stage.startedAt); stage.endedAt = shift(stage.endedAt)
        stage.events.forEach(event => {
          event.id = `${requestId}-${event.id}`; event.requestId = requestId; event.at = shift(event.at)
          if (event.observedAt) event.observedAt = shift(event.observedAt)
          if (event.payload) event.payload.userId = sample.userId
          if (event.requestBody) event.requestBody.userId = sample.userId
          if (event.responseBody) {
            event.responseBody.userId = sample.userId; event.responseBody.requestId = requestId
            if (record.api === 'delete') event.responseBody.deletedUserId = sample.userId
          }
        })
        ;(stage.children || []).forEach(move)
      }
      record.stages.forEach(move)
      if (record.api === 'enrollment') {
        const isOld = index < 2
        const positions = record.feature === 'face' ? [null] : FINGER_POSITIONS.slice(0, isOld ? sample.fingers : sample.userId === 'U301' ? 8 : 10).map(position => position.key)
        record.enrollmentRecords = positions.map((fingerPosition, imageIndex) => ({
          recordId: `${requestId}-${record.feature}-${imageIndex + 1}`, fingerPosition, qualityScore: record.feature === 'face' ? 91 : imageIndex === 8 ? null : imageIndex === 9 ? 0 : 94 - imageIndex * 3,
          imageUrl: `/mock/biometrics/${record.feature === 'face' ? `face-${isOld ? 'U001' : sample.face}-1.svg` : isOld ? `finger-U001-${imageIndex + 1}.svg` : newFingerImages[imageIndex % newFingerImages.length]}`,
        }))
        if (!isOld && record.feature === 'finger' && sample.userId === 'U301') {
          record.enrollmentRecords.push({ ...record.enrollmentRecords[1], recordId: `${requestId}-finger-duplicate`, qualityScore: 97, imageUrl: '/mock/biometrics/finger-U005-left-index-b.svg' })
        }
        record.stages[1].events.find(event => event.kind === 'CALL_STARTED').requestBody.images = record.enrollmentRecords.map(image => ({ imageId: image.recordId, fingerPosition: image.fingerPosition }))
      }
      return projectRequest(record)
    })
    if (sample.userId === 'U301') records[4].relatedRequestIds = [records[5].requestId]
    return records.slice(0, ({ original: 2, deleted: 4, face: 5, complete: records.length })[phase])
  })
}
