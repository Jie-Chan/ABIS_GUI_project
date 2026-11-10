/**
 * 服务状态监控 mock 数据
 * 来源：《ABIS-GUI管理平台需求分析》1.3 服务状态监控
 */
import {
  MONITOR_TARGET,
  MONITOR_STATUS,
} from '@/constants/monitor'
import { formatDateTime } from '@/utils/datetime'

export const MONITOR_TARGETS = [
  { key: MONITOR_TARGET.GATEWAY,     name: 'ABIS Gateway',        layer: '集成层',       instanceCount: 2, optional: false, algorithm: false },
  { key: MONITOR_TARGET.SYSTEM,      name: 'ABIS System',         layer: '业务与编排层',  instanceCount: 2, optional: false, algorithm: false },
  { key: MONITOR_TARGET.FACE,        name: 'Face 算法服务',        layer: '生物识别层',   instanceCount: 2, optional: false, algorithm: true  },
  { key: MONITOR_TARGET.FINGERPRINT, name: 'Fingerprint 算法服务', layer: '生物识别层',   instanceCount: 2, optional: false, algorithm: true  },
  { key: MONITOR_TARGET.POSTGRESQL,  name: 'PostgreSQL',          layer: '数据层',       instanceCount: 3, optional: false, algorithm: false },
  { key: MONITOR_TARGET.MINIO,       name: 'MinIO',               layer: '数据层',       instanceCount: 1, optional: true,  algorithm: false },
]

// 原始快照覆盖四种状态，页面统一将非正常状态展示为异常。
const DEMO_STATUS = {
  [MONITOR_TARGET.FACE]: MONITOR_STATUS.ABNORMAL,
  [MONITOR_TARGET.POSTGRESQL]: MONITOR_STATUS.UNREACHABLE,
  [MONITOR_TARGET.MINIO]: MONITOR_STATUS.NOT_DEPLOYED,   // 按需部署 → 未部署，不是不可达
}

// 未部署服务没有实例，仍计入界面异常统计。
function buildInstances(target) {
  // MinIO：未部署 → 无实例
  if (target.optional) {
    return []
  }

  const status = DEMO_STATUS[target.key] || MONITOR_STATUS.NORMAL

  return Array.from({ length: target.instanceCount }, (_, i) => ({
    id: `${target.key}-${i + 1}`,
    // 目标级异常/不可达时，首个实例同为该状态，避免行状态与展开明细自相矛盾
    status: status !== MONITOR_STATUS.NORMAL && i === 0 ? status : MONITOR_STATUS.NORMAL,
  }))
}

/** 算法服务的运行指标 —— 需求 1.3，四项 */
function buildMetrics(target) {
  if (!target.algorithm) return undefined
  return {
    cdcHealthy: true,
    cdcReady: true,
    galleryTotalSize: 2000000,
    licenseStatus: 'VALID',
  }
}

/** 生成一次监控快照 */
export function buildMonitorSnapshot() {
  const items = MONITOR_TARGETS.map((target) => ({
    key: target.key,
    name: target.name,
    layer: target.layer,
    optional: target.optional,
    instances: buildInstances(target),
    // 状态取自 DEMO_STATUS（六项覆盖四态）；未列出的默认为「正常」
    status: DEMO_STATUS[target.key] || MONITOR_STATUS.NORMAL,
    metrics: buildMetrics(target),
  }))

  return {
    items,
    fetchedAt: formatDateTime(new Date()),
  }
}
