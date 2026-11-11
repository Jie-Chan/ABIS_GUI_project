/**
 * 调用日志的枚举定义
 * 来源：《ABIS-GUI管理平台需求分析》1.4 日志与审计查询
 */

/** 五个业务接口 —— 需求 1.4 表格。健康检查不纳入调用日志。 */
export const LOG_APIS = [
  { key: 'comparison',     label: 'Biometric Comparison（比对）',        method: 'POST',   path: '/abis/{feature}/comparison' },
  { key: 'verification',   label: 'Biometric Verification（核验）',      method: 'POST',   path: '/abis/{feature}/verification' },
  { key: 'identification', label: 'Biometric Identification（1:N 识别）', method: 'POST',   path: '/abis/{feature}/identification' },
  { key: 'enrollment',     label: 'Biometric Enrollment（注册）',        method: 'PUT',    path: '/abis/{feature}' },
  { key: 'delete',         label: 'Biometric Delete（删除）',            method: 'DELETE', path: '/abis/{feature}/{userId}/{delType}/{uuid}' },
]

/** 生物模态 */
export const LOG_FEATURES = [
  { key: 'face',   label: '人脸' },
  { key: 'finger', label: '指纹' },
]

/** 结果状态 */
export const LOG_RESULTS = [
  { key: 'success', label: '成功' },
  { key: 'failure', label: '失败' },
  { key: 'running', label: '处理中' },
  { key: 'waiting', label: '等待处理' },
  { key: 'unknown', label: '待人工核查' },
]

/** key → label 快查表，供表格渲染用 */
export const LOG_FEATURE_LABEL = Object.fromEntries(LOG_FEATURES.map((f) => [f.key, f.label]))
export const LOG_RESULT_LABEL = Object.fromEntries(LOG_RESULTS.map((r) => [r.key, r.label]))
export const LOG_RESULT_TAG_TYPE = { success: 'success', failure: 'danger', running: 'primary', waiting: 'info', unknown: 'warning' }

export const SYNC_STAGES = ['ABIS_RECEIVED', 'ABIS_PROCESSING', 'ABIS_RESPONDED']
export const ASYNC_STAGES = ['ADAPTER_RECEIVED', 'ADAPTER_CALLING', ...SYNC_STAGES, 'ADAPTER_RESPONDED']
export const STAGE_LABEL = {
  ADAPTER_RECEIVED: '适配服务接收', ADAPTER_CALLING: '适配服务调用 ABIS',
  ABIS_RECEIVED: 'ABIS 接收', ABIS_PROCESSING: 'ABIS 业务处理',
  ABIS_RESPONDED: 'ABIS 发送响应', ADAPTER_RESPONDED: '适配服务发布响应',
}
export const STAGE_STATUS_LABEL = { WAITING: '等待中', RUNNING: '进行中', SUCCESS: '成功', FAILED: '失败', UNKNOWN: '结果未知' }
export const STAGE_STATUS_TYPE = { WAITING: 'info', RUNNING: 'primary', SUCCESS: 'success', FAILED: 'danger', UNKNOWN: 'warning' }
export const EVENT_STATUS_LABEL = { STARTED: '已开始', SUCCESS: '成功', FAILED: '失败' }
export const PUBLICATION_LABEL = { published: '已发布', pending: '待发布', none: '暂无最终响应', sync: '—' }
export const PUBLICATION_TYPE = { published: 'success', pending: 'warning', none: 'info', sync: 'info' }
