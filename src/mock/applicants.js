/** 共享业务快照的有效入库记录。图像与记录绑定；查重不改变入库数据。 */
import { buildHistoricalRegistrations, recordsFor } from '@/mock/history'
import { FINGER_POSITIONS } from '@/constants/applicant'
import { handlingStages, formatLogTime } from '@/utils/log'

export function buildEnrollmentSubjects(logs) {
  const requests = logs.some(log => log.historical) ? logs : [...logs, ...buildHistoricalRegistrations(logs)]
  const seeded = new Map(), firstFace = new Map(), updated = new Map()
  const changes = new Map()
  const effective = requests.filter(log => log.result === 'success' && ['enrollment', 'delete'].includes(log.api)).map(log => ({ log,
    at: handlingStages(log).flatMap(s => s.events || []).filter(e => e.kind === 'PROCESSING_ENDED' && e.status === 'SUCCESS').map(e => e.at).filter(Boolean).sort().at(-1),
  })).filter(item => item.at).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  for (const { log, at } of effective) {
    const previous = seeded.get(log.userId) || []
    const kept = previous.filter(record => record.feature !== log.feature)
    const records = log.api === 'enrollment'
      ? (log.enrollmentRecords || recordsFor(log.userId, log.feature, at, log.requestId)).map(record => ({ ...record, userId: log.userId, feature: log.feature, enrolledAt: at, updatedAt: at, requestId: log.requestId })) : []
    seeded.set(log.userId, [...kept, ...records])
    if (log.api === 'enrollment' && log.feature === 'face' && !firstFace.has(log.userId)) firstFace.set(log.userId, at)
    if (log.collectionRound > 1) updated.set(log.userId, at)
    const history = changes.get(log.userId) || []
    history.push({ changeId: log.requestId, userId: log.userId, operation: log.api === 'enrollment' ? '注册' : '删除', feature: log.feature, effectiveAt: at,
      fingerCount: log.feature === 'finger' && log.api === 'enrollment' ? new Set(records.filter(record => FINGER_POSITIONS.some(position => position.key === record.fingerPosition)).map(record => record.fingerPosition)).size : null,
      requestId: log.requestId, requestIds: [log.requestId],
    })
    changes.set(log.userId, history)
  }
  return [...seeded].sort(([a], [b]) => a.localeCompare(b)).map(([userId, records]) => ({
    userId, faceCount: records.filter(record => record.feature === 'face').length,
    fingerCount: records.filter(record => record.feature === 'finger').length,
    enrolledAt: firstFace.has(userId) ? formatLogTime(firstFace.get(userId)) : null,
    updatedAt: updated.has(userId) ? formatLogTime(updated.get(userId)) : null, records,
    changes: [...(changes.get(userId) || [])].reverse(),
  }))
}

/** 只有当前有效人脸记录的对象进入申请人列表；指纹允许缺采。 */
export function buildApplicants(logs) {
  return buildEnrollmentSubjects(logs).filter(person => person.faceCount > 0)
}
