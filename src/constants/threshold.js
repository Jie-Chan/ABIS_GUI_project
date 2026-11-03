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

/**
 * ★★ 协议生效下限的处置语义 —— 待澄清项，澄清前不得二选一写死 ★★
 *
 * 冲突事实（需求 1.2 已核实）：
 *   · 协议 `$.threshold` 参数表：低于下限「按 40 / 60 默认处理」 → 语义【纠正】
 *   · 协议错误码 4000005：       「传入的阈值不合法」            → 语义【拒绝】
 *   另有一处边界不一致：参数表写指纹「大于 40」，错误码写「≥ 40」。
 *
 * 需求 1.2 的硬性要求：
 *   「澄清前界面不得按任一种语义写死提示文案」
 *   「不得出现界面显示值与实际生效值不一致且无任何提示的情况」
 *
 * 澄清后的动作：只改 ACTIVE_SEMANTICS 一个值，其余代码不动。
 */
export const ACTIVE_SEMANTICS = 'undecided' // 取值：'undecided' | 'coerce' | 'reject'

/** 三套提示文案 —— 全部保留，澄清后由 ACTIVE_SEMANTICS 决定用哪套 */
export const LOWER_BOUND_MESSAGE = {
  // 【未裁决】默认态：不替协议表态，但必须告知存在不确定（需求 1.2 两条约束同时满足）
  undecided: (label, input, bound) =>
    `${label}设置为 ${input}，低于协议生效下限 ${bound}。请调整至不低于 ${bound} 后再保存。`,
  // 【纠正】语义：允许提交，但必须明确告知实际生效值
  coerce: (label, input, bound) =>
    `${label}设置为 ${input}，低于协议生效下限 ${bound}；实际生效值为 ${bound}。`,
  // 【拒绝】语义：提交前阻止
  reject: (label, input, bound) =>
    `${label}不得低于协议生效下限 ${bound}，当前值 ${input} 不合法，请修改。`,
}

/** 取当前语义下的提示文案（取值拼错时回退到 undecided，不让调用点抛错） */
export function buildLowerBoundMessage(label, input, bound) {
  const build = LOWER_BOUND_MESSAGE[ACTIVE_SEMANTICS] || LOWER_BOUND_MESSAGE.undecided
  return build(label, input, bound)
}

/**
 * 当前语义是否允许提交低于下限的值。
 *
 * 只有 'coerce' 放行：该语义下 ABIS 会把低值纠正为下限值，提交是有意义的。
 * 'undecided' 与 'reject' 都拦截——语义未明时写入一个效果不可预期的值不是安全选择，
 * 且只有拦截才与 'undecided' 的提示文案「待澄清后再提交」一致。
 */
export function allowsBelowLowerBound(value, bound) {
  if (ACTIVE_SEMANTICS !== 'coerce' && value < bound) return false
  return true
}

/** 提示条的样式：未裁决与被拒都用 error，纠正用 warning */
export function lowerBoundAlertType() {
  return ACTIVE_SEMANTICS === 'coerce' ? 'warning' : 'error'
}
