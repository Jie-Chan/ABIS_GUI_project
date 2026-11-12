/** 共享业务快照的有效入库记录。图像与记录绑定；查重不改变入库数据。 */
import { MULTI_CANDIDATE_CASES } from '@/mock/identification'
import { FINGER_POSITIONS } from '@/constants/applicant'
import { handlingStages, formatLogTime } from '@/utils/log'

function recordsFor(userId, feature, confirmedAt, requestId) {
  const positions = feature === 'face' ? [null] : FINGER_POSITIONS.map(item => item.key)
  return positions.map((fingerPosition, index) => ({
    userId, recordId: `${feature === 'face' ? 'FACE' : 'FINGER'}-${userId}-${index + 1}`,
    feature, fingerPosition, enrolledAt: confirmedAt, updatedAt: confirmedAt, requestId,
    imageUrl: `/mock/biometrics/${feature}-${userId}-${index + 1}.svg`,
  }))
}

export function buildApplicants(logs) {
  const baseline = new Date(Date.parse(logs[0].receivedAt) - 86400000).toISOString()
  const seeded = new Map([
    ['U004', recordsFor('U004', 'face', baseline, null)],
    ['U005', [
      { ...recordsFor('U005', 'finger', baseline, null)[1], recordId: 'FINGER-U005-LI-1', imageUrl: '/mock/biometrics/finger-U005-left-index-a.svg' },
      { ...recordsFor('U005', 'finger', baseline, null)[1], recordId: 'FINGER-U005-LI-2', imageUrl: '/mock/biometrics/finger-U005-left-index-b.svg' },
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
  for (const log of logs) {
    if (log.result !== 'success') continue
    if (log.api === 'enrollment') {
      const handling = handlingStages(log)[0]
      const confirmedAt = handling?.events.find(event => event.kind === 'PROCESSING_ENDED' && event.status === 'SUCCESS')?.at
      if (!confirmedAt) continue
      const previous = seeded.get(log.userId) || []
      seeded.set(log.userId, [...previous.filter(record => record.feature !== log.feature), ...recordsFor(log.userId, log.feature, confirmedAt, log.requestId)])
    } else if (log.api === 'delete') seeded.delete(log.userId)
  }
  // 双模态正常样例必须两种注册都确认成功后才展示。
  const u001 = seeded.get('U001') || []
  if (!u001.some(record => record.feature === 'face') || !u001.some(record => record.feature === 'finger')) seeded.delete('U001')
  return [...seeded].sort(([a], [b]) => a.localeCompare(b)).map(([userId, records]) => {
    const enrolledAt = records.map(record => record.enrolledAt).sort()[0]
    const updatedAt = records.map(record => record.updatedAt).sort().at(-1)
    return {
      userId, faceCount: records.filter(record => record.feature === 'face').length,
      fingerCount: records.filter(record => record.feature === 'finger').length,
      enrolledAt: formatLogTime(enrolledAt), updatedAt: formatLogTime(updatedAt), records,
    }
  })
}
