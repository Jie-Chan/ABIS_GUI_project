/** 预置入库来自默认业务快照中的成功注册请求。 */
import { MULTI_CANDIDATE_CASES } from '@/mock/identification'
import { FINGER_POSITIONS } from '@/constants/applicant'
import { buildLogRecords } from '@/mock/logs'
import { handlingStages, projectRequest } from '@/utils/log'

export function recordsFor(userId, feature, confirmedAt, requestId) {
  const positions = feature === 'face' ? [null] : FINGER_POSITIONS.map(item => item.key)
  return positions.map((fingerPosition, index) => ({
    userId, recordId: `${feature === 'face' ? 'FACE' : 'FINGER'}-${userId}-${index + 1}`,
    feature, fingerPosition, qualityScore: feature === 'face' ? 91 : index === 8 ? null : index === 9 ? 0 : 96 - index * 2, enrolledAt: confirmedAt, updatedAt: confirmedAt, requestId,
    imageUrl: `/mock/biometrics/${feature}-${userId}-${index + 1}.svg`,
  }))
}

export function buildHistoricalRegistrations(logs) {
  if (!logs.length) return []
  const baseline = new Date(Date.parse(logs[0].receivedAt) - 86400000).toISOString()
  const seeded = new Map([
    ['U004', [...recordsFor('U004', 'face', baseline, null), ...recordsFor('U004', 'finger', baseline, null).slice(0, 6).map((record, index) => ({ ...record, imageUrl: `/mock/biometrics/finger-U001-${index + 1}.svg` }))]],
    ['U005', [
      { ...recordsFor('U005', 'finger', baseline, null)[1], recordId: 'FINGER-U005-LI-1', imageUrl: '/mock/biometrics/finger-U005-left-index-a.svg' },
      { ...recordsFor('U005', 'finger', baseline, null)[1], recordId: 'FINGER-U005-LI-2', qualityScore: 74, imageUrl: '/mock/biometrics/finger-U005-left-index-b.svg' },
      { ...recordsFor('U005', 'finger', baseline, null)[5], recordId: 'FINGER-U005-RT-1', imageUrl: null },
    ]],
    ['U006', recordsFor('U006', 'face', baseline, null)],
    ['U007', [recordsFor('U007', 'finger', baseline, null)[0]]],
    ['U008', recordsFor('U008', 'face', baseline, null)],
  ])
  for (const sample of MULTI_CANDIDATE_CASES) {
    for (const userId of [sample.userId, ...sample.candidates.map(item => item.userId)]) {
      const record = recordsFor(userId, sample.feature, baseline, null).find(item => sample.feature === 'face' || item.fingerPosition === sample.fingerPosition)
      seeded.set(userId, [record])
    }
  }
  const templates = buildLogRecords()
  return [...seeded].flatMap(([userId, records], index) => {
    return ['face', 'finger'].filter(feature => records.some(record => record.feature === feature)).map(feature => {
      const template = templates[feature === 'face' ? 0 : 1]
      const record = structuredClone(template)
      const requestId = `HIST-${userId}-${feature === 'face' ? 'FACE' : 'FINGER'}`
      const confirmedAt = Date.parse(baseline) + index * 1000 + (feature === 'finger' ? 500 : 0)
      const endedAt = handlingStages(template)[0].events.find(event => event.kind === 'PROCESSING_ENDED').at
      const delta = confirmedAt - Date.parse(endedAt)
      const shift = at => at ? new Date(Date.parse(at) + delta).toISOString() : at
      Object.assign(record, { id: 1000 + index * 2 + (feature === 'face' ? 0 : 1), requestId, historical: true, collectionRound: 1, sourceIp: null, relatedRequestIds: [], scenario: `${userId} 历史${feature === 'face' ? '人脸' : '指纹'}注册成功`, publishedAt: shift(record.publishedAt) })
      const move = stage => {
        stage.instanceId = `${requestId}-${stage.key}`
        stage.startedAt = shift(stage.startedAt); stage.endedAt = shift(stage.endedAt)
        stage.events.forEach(event => {
          event.id = `${requestId}-${event.id}`; event.requestId = requestId; event.at = shift(event.at)
          if (event.payload) Object.assign(event.payload, { userId, feature, api: 'enrollment' })
          if (event.requestBody) Object.assign(event.requestBody, { userId, feature, api: 'enrollment' })
          if (event.responseBody) Object.assign(event.responseBody, { requestId, userId, feature })
        })
        ;(stage.children || []).forEach(move)
      }
      record.stages.forEach(move)
      record.enrollmentRecords = records.filter(image => image.feature === feature).map(image => ({ ...image, requestId, enrolledAt: new Date(confirmedAt).toISOString(), updatedAt: new Date(confirmedAt).toISOString() }))
      record.stages[1].events.find(event => event.kind === 'CALL_STARTED').requestBody.images = record.enrollmentRecords.map(image => ({ imageId: image.recordId, fingerPosition: image.fingerPosition }))
      return projectRequest(record)
    })
  })
}
