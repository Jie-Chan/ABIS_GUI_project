/**
 * 匹配阈值配置的常量
 * 来源：《ABIS-GUI管理平台需求分析》1.2 匹配阈值配置
 */

/** 阈值取值范围 —— 需求 1.2：1–100 的整数（上限 100 为产品设定值） */
export const THRESHOLD_MIN = 1
export const THRESHOLD_MAX = 100
export const DEFAULT_THRESHOLDS = Object.freeze({ face: 60, finger: 60 })

/**
 * 两类阈值 —— 需求 1.2 配置范围，仅此两项。
 * 不含 Top-N；不含 1:1 核验判定阈值（后者归 SIGATT 业务系统）。
 *
 * protocolLowerBound 为协议生效下限（指纹 40 / 人脸 60），
 * 随接口协议版本变化，不得在界面中长期写死。
 */
export const THRESHOLD_KEYS = [
  { key: 'face',   label: '人脸 1:N 去重相似度阈值', protocolLowerBound: 60 },
  { key: 'finger', label: '指纹 1:N 去重相似度阈值', protocolLowerBound: 40 },
]

/** 2026-11-13 Mock 开发文档：低于协议生效下限时禁止保存，边界值有效。 */
export const ACTIVE_SEMANTICS = 'reject'
export function buildLowerBoundMessage(label, input, bound) {
  return `${label}当前为 ${input}，不得低于协议生效下限 ${bound}。`
}
export function allowsBelowLowerBound(value, bound) { return value >= bound }
export function lowerBoundAlertType() { return 'error' }
