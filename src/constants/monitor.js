/** 监控展示使用的状态、指标和刷新周期；对象与实例来自接口快照。 */
/** 仅用于名称与图标映射；页面对象数量、顺序和状态仍来自真实快照。 */
export const MONITOR_TARGET = {
  GATEWAY: 'gateway',
  SYSTEM: 'system',
  FACE: 'face',
  FINGERPRINT: 'fingerprint',
  POSTGRESQL: 'postgresql',
  MINIO: 'minio',
}
export const ALGO_TARGETS = [MONITOR_TARGET.FACE, MONITOR_TARGET.FINGERPRINT]
export const LICENSE_STATUS = { VALID: 'VALID', INVALID: 'INVALID' }

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


export const MONITOR_REFRESH_INTERVAL_MS = 60 * 1000
