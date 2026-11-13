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

export function buildEnrollmentSubjects(logs) {
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
  const firstFace = new Map([...seeded].filter(([, records]) => records.some(r => r.feature === 'face')).map(([id, records]) => [id, records.find(r => r.feature === 'face').enrolledAt]))
  const updated = new Map([...seeded].map(([id, records]) => [id, records.map(r => r.updatedAt).sort().at(-1)]))
  const changes = new Map()
  const byId = new Map(logs.map(log => [log.requestId, log]))
  const effective = logs.filter(log => log.result === 'success' && ['enrollment', 'delete'].includes(log.api)).map(log => ({ log,
    at: handlingStages(log).flatMap(s => s.events || []).filter(e => e.kind === 'PROCESSING_ENDED' && e.status === 'SUCCESS').map(e => e.at).filter(Boolean).sort().at(-1),
  })).filter(item => item.at).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  for (const { log, at } of effective) {
    const previous = seeded.get(log.userId) || []
    const kept = previous.filter(record => record.feature !== log.feature)
    const records = log.api === 'enrollment'
      ? (log.enrollmentRecords || recordsFor(log.userId, log.feature, at, log.requestId)).map(record => ({ ...record, userId: log.userId, feature: log.feature, enrolledAt: at, updatedAt: at, requestId: log.requestId })) : []
    seeded.set(log.userId, [...kept, ...records])
    if (log.api === 'enrollment' && log.feature === 'face' && !firstFace.has(log.userId)) firstFace.set(log.userId, at)
    updated.set(log.userId, at)
    const linked = log.api === 'enrollment' ? (log.relatedRequestIds || []).filter(id => byId.get(id)?.userId === log.userId && byId.get(id)?.api === 'identification') : []
    const history = changes.get(log.userId) || []
    history.push({ changeId: log.requestId, userId: log.userId, operation: log.api === 'enrollment' ? '注册' : '删除', feature: log.feature, effectiveAt: at,
      fingerCount: log.feature === 'finger' && log.api === 'enrollment' ? new Set(records.filter(record => FINGER_POSITIONS.some(position => position.key === record.fingerPosition)).map(record => record.fingerPosition)).size : null,
      requestId: log.requestId, requestIds: [...new Set([log.requestId, ...linked])],
    })
    changes.set(log.userId, history)
  }
  return [...seeded].sort(([a], [b]) => a.localeCompare(b)).map(([userId, records]) => ({
    userId, faceCount: records.filter(record => record.feature === 'face').length,
    fingerCount: records.filter(record => record.feature === 'finger').length,
    enrolledAt: firstFace.has(userId) ? formatLogTime(firstFace.get(userId)) : null,
    updatedAt: formatLogTime(updated.get(userId)), records,
    changes: [...(changes.get(userId) || [])].reverse(),
  }))
}

/** 只有当前有效人脸记录的对象进入申请人列表；指纹允许缺采。 */
export function buildApplicants(logs) {
  return buildEnrollmentSubjects(logs).filter(person => person.faceCount > 0)
}
