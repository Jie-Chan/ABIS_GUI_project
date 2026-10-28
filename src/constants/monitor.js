/** 监控展示使用的状态和刷新周期；对象与实例来自接口快照。 */
/** 仅用于名称与图标映射；页面对象数量、顺序和状态仍来自真实快照。 */
export const MONITOR_TARGET = {
  GATEWAY: 'gateway',
  SYSTEM: 'system',
  FACE: 'face',
  FINGERPRINT: 'fingerprint',
  POSTGRESQL: 'postgresql',
  MINIO: 'minio',
}

export const MONITOR_STATUS = {
  NORMAL: 'normal',
  ABNORMAL: 'abnormal',
  UNREACHABLE: 'unreachable',
  NOT_DEPLOYED: 'not_deployed',
}

/** 保留后端原始枚举；页面统一为正常/异常，未部署和不可达也计入异常。 */
export const MONITOR_STATUS_META = {
  [MONITOR_STATUS.NORMAL]:       { label: '正常',   tagType: 'success', isAbnormal: false },
  [MONITOR_STATUS.ABNORMAL]:     { label: '异常',   tagType: 'danger',  isAbnormal: true  },
  [MONITOR_STATUS.UNREACHABLE]:  { label: '异常', tagType: 'danger', isAbnormal: true },
  [MONITOR_STATUS.NOT_DEPLOYED]: { label: '异常', tagType: 'danger', isAbnormal: true },
}

export const MONITOR_REFRESH_INTERVAL_MS = 60 * 1000
