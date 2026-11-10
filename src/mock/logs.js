/**
 * ABIS API 调用日志 mock 数据
 * 来源：《ABIS-GUI管理平台需求分析》1.4 日志与审计查询
 *
 * 日志包含申请人 userId、业务请求 requestId 及调用元数据。
 * ID 查询采用字符串精确匹配，可与原有筛选组合。
 *
 * ⚠ 不得包含请求报文中的生物图像数据（需求 1.4 danger 框）。
 *   本 mock 只造元数据，不造任何图像载荷。
 */
import { LOG_APIS, LOG_FEATURES } from '@/constants/log'
import { formatDateTime } from '@/utils/datetime'

const CALLERS = ['SIGATT-DLSystem', 'SIGATT-Portal', 'MOSIP-Adapter']

/** 生成一批调用记录（数量固定，便于演示分页） */
export function buildLogRecords(total = 360) {
  const records = []
  const base = new Date('2026-09-14T09:00:00')

  for (let i = 0; i < total; i += 1) {
    const api = LOG_APIS[i % LOG_APIS.length]
    const feature = LOG_FEATURES[i % LOG_FEATURES.length]
    // 约 1/12 为失败，用于验证「结果状态」过滤
    const failed = i % 12 === 0
    const calledAt = new Date(base.getTime() - i * 90 * 1000)

    records.push({
      id: i + 1,
      calledAt: formatDateTime(calledAt),
      // 每个申请人有多次调用；每个业务请求保留两次调用，演示重试定位。
      // 后续少量记录模拟没有关联 ID 的历史日志。
      userId: i % 30 === 29 ? null : `000${String(Math.floor(i / 48) + 1).padStart(5, '0')}`,
      requestId: i % 30 === 29 ? null : `REQ-${String(Math.floor(i / 2) + 1).padStart(8, '0')}`,
      caller: CALLERS[i % CALLERS.length],
      api: api.key,
      apiLabel: api.label,
      feature: feature.key,
      result: failed ? 'failure' : 'success',
      costMs: 40 + ((i * 37) % 460),
    })
  }

  return records
}
