/** 时间相同的批量图像按记录顺序取最后一条，不回退到其他指位。 */
export function latestEnrollmentRecord(records = []) {
  return records.reduce((latest, record) => !latest || Date.parse(record.updatedAt) >= Date.parse(latest.updatedAt) ? record : latest, null)
}
