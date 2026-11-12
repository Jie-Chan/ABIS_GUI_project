import { buildLogRecords } from '@/mock/logs'
import { buildApplicants } from '@/mock/applicants'

/** 同一批请求和预置入库记录，只在模块会话开始时生成一次。 */
export function buildBusinessSnapshot() {
  const logs = buildLogRecords()
  return { logs, applicants: buildApplicants(logs) }
}
