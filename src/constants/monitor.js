export const MONITOR_STATUS = { NORMAL: 'normal', ABNORMAL: 'abnormal', UNKNOWN: 'unknown' }
export const MONITOR_STATUS_META = {
  normal: { label: '正常', tagType: 'success' },
  abnormal: { label: '异常', tagType: 'danger' },
  unknown: { label: '未知', tagType: 'info' },
}
export function monitorState(status) { return status === 'normal' || status === 'abnormal' ? status : 'unknown' }
export const MONITOR_REFRESH_INTERVAL_MS = 60 * 1000
