/**
 * 调用日志的枚举定义
 * 来源：《ABIS-GUI管理平台需求分析》1.4 日志与审计查询
 */

/** 五个业务接口 —— 需求 1.4 表格。健康检查不纳入调用日志。 */
export const LOG_APIS = [
  { key: 'comparison',     label: 'Biometric Comparison（比对）',        method: 'POST',   path: '/abis/{feature}/comparison' },
  { key: 'verification',   label: 'Biometric Verification（核验）',      method: 'POST',   path: '/abis/{feature}/verification' },
  { key: 'identification', label: 'Biometric Identification（1:N 识别）', method: 'POST',   path: '/abis/{feature}/identification' },
  { key: 'add',            label: 'Biometric Add（注册 / 更新）',        method: 'PUT',    path: '/abis/{feature}' },
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
]

/** key → label 快查表，供表格渲染用 */
export const LOG_FEATURE_LABEL = Object.fromEntries(LOG_FEATURES.map((f) => [f.key, f.label]))
export const LOG_RESULT_LABEL = Object.fromEntries(LOG_RESULTS.map((r) => [r.key, r.label]))
export const LOG_RESULT_TAG_TYPE = { success: 'success', failure: 'danger' }
