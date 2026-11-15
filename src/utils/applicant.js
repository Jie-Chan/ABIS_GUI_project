/** 以成功入库时间排序；同一时间按写入顺序取最后一条。 */
export function latestEnrollmentRecord(records = []) {
  const time = record => {
    const enrolled = Date.parse(record.enrolledAt)
    return Number.isFinite(enrolled) ? enrolled : Date.parse(record.updatedAt) || 0
  }
  return records.reduce((latest, record) => !latest || time(record) >= time(latest) ? record : latest, null)
}
