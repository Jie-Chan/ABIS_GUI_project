/**
 * 服务状态监控的对象、状态与指标定义
 * 来源：《ABIS-GUI管理平台需求分析》1.3 服务状态监控
 */

/** 监控对象标识 */
export const MONITOR_TARGET = {
  GATEWAY: 'gateway',
  SYSTEM: 'system',
  FACE: 'face',
  FINGERPRINT: 'fingerprint',
  POSTGRESQL: 'postgresql',
  MINIO: 'minio',
}

/**
 * 监控对象清单 —— 对应需求 1.3 监控对象表，共六项。
 *
 * ⚠ 已知不自洽（见设计文档 §10.2）：
 *   本表按需求 1.3 写「Face / Fingerprint 实例数 2（合并部署）」，
 *   而部署前提是 2 台算法 VM 各跑人脸 + 指纹 = 4 个实例。
 *   界面按本表渲染（六行），但数据层保留实例明细，裁决后可展开。
 */
export const MONITOR_TARGETS = [
  { key: MONITOR_TARGET.GATEWAY,     name: 'ABIS Gateway',        layer: '集成层',       instanceCount: 2, optional: false, algorithm: false },
  { key: MONITOR_TARGET.SYSTEM,      name: 'ABIS System',         layer: '业务与编排层',  instanceCount: 2, optional: false, algorithm: false },
  { key: MONITOR_TARGET.FACE,        name: 'Face 算法服务',        layer: '生物识别层',   instanceCount: 2, optional: false, algorithm: true  },
  { key: MONITOR_TARGET.FINGERPRINT, name: 'Fingerprint 算法服务', layer: '生物识别层',   instanceCount: 2, optional: false, algorithm: true  },
  { key: MONITOR_TARGET.POSTGRESQL,  name: 'PostgreSQL',          layer: '数据层',       instanceCount: 3, optional: false, algorithm: false },
  { key: MONITOR_TARGET.MINIO,       name: 'MinIO',               layer: '数据层',       instanceCount: 1, optional: true,  algorithm: false },
]

/**
 * 监控状态四态 —— 需求 1.3
 *
 * ⚠ NOT_DEPLOYED 必须与 UNREACHABLE 区分：
 *   需求 1.3 明确「未部署时呈现为未部署，与不可达区分，且不触发异常标识」。
 *   把未部署误报为不可达，会让每次刷新都产生虚假异常提示。
 */
export const MONITOR_STATUS = {
  NORMAL: 'normal',
  ABNORMAL: 'abnormal',
  UNREACHABLE: 'unreachable',
  NOT_DEPLOYED: 'not_deployed',
}

/** 四态的展示配置：标签、Element Plus tag 类型、是否计入异常 */
export const MONITOR_STATUS_META = {
  [MONITOR_STATUS.NORMAL]:       { label: '正常',   tagType: 'success', isAbnormal: false },
  [MONITOR_STATUS.ABNORMAL]:     { label: '异常',   tagType: 'danger',  isAbnormal: true  },
  [MONITOR_STATUS.UNREACHABLE]:  { label: '不可达', tagType: 'danger',  isAbnormal: true  },
  [MONITOR_STATUS.NOT_DEPLOYED]: { label: '未部署', tagType: 'info',    isAbnormal: false },
}

/** 算法服务运行指标 —— 需求 1.3，四项 */
export const ALGO_METRIC = {
  CDC_HEALTHY: 'cdc.healthy',
  CDC_READY: 'cdc.ready',
  GALLERY_TOTAL_SIZE: 'gallery.total_size',
  LICENSE_STATUS: 'license.status',
}

/** License 状态取值 —— 需求 1.3 */
export const LICENSE_STATUS = {
  VALID: 'VALID',
  INVALID: 'INVALID',
}

/** 监控刷新周期 —— 需求 1.3：初版固定 1 分钟 */
export const MONITOR_REFRESH_INTERVAL_MS = 60 * 1000

/** 需要展示算法运行指标的监控对象（仅人脸与指纹） */
export const ALGO_TARGETS = [MONITOR_TARGET.FACE, MONITOR_TARGET.FINGERPRINT]
