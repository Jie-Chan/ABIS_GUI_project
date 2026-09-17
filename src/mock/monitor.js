/**
 * 服务状态监控 mock 数据
 * 来源：《ABIS-GUI管理平台需求分析》1.3 服务状态监控
 */
import {
  MONITOR_TARGET,
  MONITOR_TARGETS,
  MONITOR_STATUS,
  LICENSE_STATUS,
} from '@/constants/monitor'
import { formatDateTime } from '@/utils/datetime'

/**
 * 目标级演示状态 —— 六项覆盖**全部四态**，使每个状态在界面上都可见、可验证。
 *
 * ⚠ 为什么不能只造「正常」+「未部署」：
 *   若数据里不存在任何异常项，顶部「全部正常」标签必然是绿的，
 *   无论 isAbnormal 过滤有没有正确排掉「未部署」——这个验证永远不会失败，
 *   因此它证明不了需求 1.3 的核心断言「未部署不触发异常标识」。
 *   只有让 abnormal 与 unreachable 各真实出现一次，异常计数才是一个
 *   可证伪的数字（正确为 2；若 isAbnormal 过滤失效、把 MinIO 的未部署
 *   也算进去，会显示 3）。
 */
const DEMO_STATUS = {
  [MONITOR_TARGET.FACE]: MONITOR_STATUS.ABNORMAL,
  [MONITOR_TARGET.POSTGRESQL]: MONITOR_STATUS.UNREACHABLE,
  [MONITOR_TARGET.MINIO]: MONITOR_STATUS.NOT_DEPLOYED,   // 按需部署 → 未部署，不是不可达
}

/**
 * 各监控对象的实例状态 —— 按 MONITOR_TARGETS 的 instanceCount 展开。
 *
 * MinIO 为按需部署，此处**刻意造一个「未部署」样本**：
 * 需求 1.3 要求界面能区分「未部署」与「不可达」，且未部署不得触发异常标识。
 */
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
    licenseStatus: LICENSE_STATUS.VALID,
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
