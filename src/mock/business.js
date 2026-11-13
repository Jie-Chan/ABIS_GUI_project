import { buildLogRecords } from '@/mock/logs'
import { buildHistoricalRegistrations } from '@/mock/history'
import { buildDocumentRecaptureLogs } from '@/mock/recapture'
import { buildEnrollmentSubjects } from '@/mock/applicants'

/** 同一批请求和预置入库记录，只在模块会话开始时生成一次。 */
export function buildBusinessSnapshot() {
  const samples = buildLogRecords()
  const recaptured = buildDocumentRecaptureLogs().filter(log => ['U301', 'U302'].includes(log.userId)).map(log => ({ ...log, historical: true }))
  const logs = [...samples, ...buildHistoricalRegistrations(samples), ...recaptured]
  const subjects = buildEnrollmentSubjects(logs)
  return { logs, subjects, applicants: subjects.filter(person => person.faceCount > 0) }
}
