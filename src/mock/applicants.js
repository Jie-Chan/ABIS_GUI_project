// 独立的当前在库快照；不从调用日志或管理账户推算人员。
import { formatDateTime } from '@/utils/datetime'

export function buildApplicants(total = 68) {
  const base = new Date('2026-11-01T09:00:00')
  return Array.from({ length: total }, (_, i) => {
    const userId = String(i + 1).padStart(8, '0')
    const enrolledAt = formatDateTime(new Date(base.getTime() - i * 3600000))
    const updatedAt = formatDateTime(new Date(base.getTime() + 1800000 - i * 3600000))
    const faceCount = i % 3 === 2 ? 0 : 1 + i % 2
    const fingerCount = i % 3 === 1 ? 0 : 10
    const records = [
      ...Array.from({ length: faceCount }, (_, j) => ({ recordId: `FACE-${userId}-${j + 1}`, feature: 'face', enrolledAt, updatedAt })),
      ...Array.from({ length: fingerCount }, (_, j) => ({ recordId: `FINGER-${userId}-${j + 1}`, feature: 'finger', enrolledAt, updatedAt })),
    ]
    return { userId, faceCount, fingerCount, enrolledAt, updatedAt, records }
  })
}
