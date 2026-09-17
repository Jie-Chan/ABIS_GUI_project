/**
 * mock 适配器 —— 契约未冻结期间的默认实现
 *
 * 数据来源：src/mock/ 下按需求字段表生成的样本。
 * 切换方式：.env 中 VITE_USE_MOCK=true
 */
import { mockAccounts, mockCredentials } from '@/mock/accounts'
import { mockThresholds } from '@/mock/thresholds'
import { buildMonitorSnapshot } from '@/mock/monitor'
import { buildLogRecords } from '@/mock/logs'
import { buildAuditRecords } from '@/mock/audit'
import { formatDateTime } from '@/utils/datetime'
import { THRESHOLD_KEYS } from '@/constants/threshold'
import { LOG_FEATURE_LABEL, LOG_RESULT_LABEL } from '@/constants/log'

// —— 可变状态：模块加载时克隆一份，使增删改在会话内可见 ——
let accounts = mockAccounts.map((a) => ({ ...a }))
let thresholds = { ...mockThresholds }
let nextAccountId = accounts.length + 1

const logs = buildLogRecords()
const audits = buildAuditRecords()

const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms))

/** 通用分页 */
function paginate(list, { page = 1, pageSize = 20 } = {}) {
  const start = (page - 1) * pageSize
  return { total: list.length, items: list.slice(start, start + pageSize) }
}

export default {
  // ——— 认证（需求 1.1）———

  async login(username, password) {
    await delay()
    // 被禁用的账户不可登录（需求 1.1）
    const account = accounts.find((a) => a.username === username)
    if (!account || !account.enabled) {
      throw new Error('账户不存在或已被禁用')
    }
    const credential = mockCredentials.find(
      (c) => c.username === username && c.password === password
    )
    if (!credential) {
      throw new Error('用户名或密码错误')
    }
    return {
      token: `mock-token-${account.id}`,
      account: { ...account },
    }
  },

  async logout() {
    await delay(80)
  },

  async getSession() {
    await delay(80)
    return null
  },

  // ——— 账户管理（需求 1.1）———

  async listAccounts(params = {}) {
    await delay()
    const { keyword = '' } = params
    const filtered = keyword
      ? accounts.filter((a) => a.username.includes(keyword) || a.displayName.includes(keyword))
      : accounts
    return paginate(filtered, params)
  },

  async createAccount(payload) {
    await delay()
    const account = {
      id: nextAccountId++,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      enabled: true,
      createdAt: formatDateTime(new Date()),
      lastLoginAt: '—',
    }
    accounts = [...accounts, account]
    return { ...account }
  },

  async updateAccount(id, payload) {
    await delay()
    // 与 resetPassword 一致：id 不存在必须报错。
    // 若静默返回 {}，页面会显示「保存成功」，而写得其实是一次不存在的更新，
    // 且返回的空对象会把该行渲染成空白 —— 只有真实后端会拒绝时才发现。
    if (!accounts.some((a) => a.id === id)) throw new Error('账户不存在')
    accounts = accounts.map((a) => (a.id === id ? { ...a, ...payload } : a))
    return { ...accounts.find((a) => a.id === id) }
  },

  async deleteAccount(id) {
    await delay()
    accounts = accounts.filter((a) => a.id !== id)
  },

  async resetPassword(id) {
    await delay()
    if (!accounts.some((a) => a.id === id)) throw new Error('账户不存在')
  },

  // ——— 阈值（需求 1.2）———

  async getThresholds() {
    await delay()
    return { ...thresholds }
  },

  async updateThresholds(payload) {
    await delay()
    // 阈值是**两个键**的封闭空间（face / finger），不是开放的任意字段袋。
    // 无条件 merge 会让 updateThresholds({fingerprint: 90}) 静默写出第三个键，
    // 而真实 ABIS 会以 4000005「传入的阈值不合法」拒绝 —— mock 必须同样报错，
    // 否则调用方的键名笔误在联调前永远暴露不出来。
    const allowed = THRESHOLD_KEYS.map((k) => k.key)
    const unknown = Object.keys(payload).filter((k) => !allowed.includes(k))
    if (unknown.length) {
      throw new Error(`阈值键不合法：${unknown.join('、')}（合法键：${allowed.join('、')}）`)
    }
    thresholds = { ...thresholds, ...payload }
    return { ...thresholds }
  },

  // ——— 监控（需求 1.3）———

  async getHealth() {
    await delay()
    return buildMonitorSnapshot()
  },

  // ——— 日志与审计查询（需求 1.4 / 2.2）———

  async listLogs(params = {}) {
    await delay()
    return paginate(filterLogs(logs, params), params)
  },

  async listAudits(params = {}) {
    await delay()
    return paginate(filterAudits(audits, params), params)
  },

  // ——— 导出（需求 1.4）———

  async exportLogs(params = {}) {
    await delay()
    const rows = filterLogs(logs, params)
    return toCsvBlob(rows, [
      ['calledAt', '调用时间'], ['caller', '调用方标识'], ['apiLabel', '接口'],
      // feature / result 在记录里存的是枚举 key（'face' / 'success'），
      // 直接落表会在中文表头下写出英文枚举值。用常量里的 key→label 快查表转中文，
      // 与 exportAudits 直接用 roleLabel 的做法保持一致。
      ['feature', '生物模态', LOG_FEATURE_LABEL], ['result', '结果状态', LOG_RESULT_LABEL],
      ['costMs', '处理耗时(ms)'],
    ])
  },

  async exportAudits(params = {}) {
    await delay()
    const rows = filterAudits(audits, params)
    return toCsvBlob(rows, [
      ['operatedAt', '时间'], ['operator', '操作人'], ['roleLabel', '角色'],
      ['action', '操作类型'], ['target', '操作对象'], ['beforeValue', '变更前值'],
      ['afterValue', '变更后值'], ['result', '结果'], ['sourceIp', '来源 IP'],
      ['sessionId', '会话 ID'],
    ])
  },
}

// ——— 内部工具 ———

/**
 * 日志过滤维度（需求 1.4 五个：时间范围、接口、生物模态、结果状态、耗时区间）
 *
 * ⚠ startTime / endTime 与 r.calledAt 之间是**字符串比较**，三者同为
 *   'YYYY-MM-DD HH:mm:ss' 才成立。传 Date 对象或 'YYYY-MM-DD' 不报错，
 *   只会静默过滤掉全部记录 —— 调用方须先用 formatDateTime 归一化。
 */
function filterLogs(list, { startTime, endTime, api, feature, result, minCost, maxCost } = {}) {
  return list.filter((r) => {
    if (startTime && r.calledAt < startTime) return false
    if (endTime && r.calledAt > endTime) return false
    if (api && r.api !== api) return false
    if (feature && r.feature !== feature) return false
    if (result && r.result !== result) return false
    if (minCost != null && r.costMs < minCost) return false
    if (maxCost != null && r.costMs > maxCost) return false
    return true
  })
}

/**
 * 审计过滤维度
 *
 * ⚠ 同 filterLogs：时间维度按 'YYYY-MM-DD HH:mm:ss' 字符串比较，格式不符会静默过滤为空。
 */
function filterAudits(list, { startTime, endTime, operator, action, result } = {}) {
  return list.filter((r) => {
    if (startTime && r.operatedAt < startTime) return false
    if (endTime && r.operatedAt > endTime) return false
    if (operator && r.operator !== operator) return false
    if (action && r.action !== action) return false
    if (result && r.result !== result) return false
    return true
  })
}

/**
 * 生成 CSV Blob（带 BOM，避免 Excel 打开中文乱码）
 *
 * columns 每项为 [字段名, 表头文案, key→label 快查表?]。
 * 第三项可选：给出时把枚举 key 转成中文（'face' → '人脸'），未命中或未给出则原样输出。
 */
function toCsvBlob(rows, columns) {
  const header = columns.map(([, label]) => label).join(',')
  const body = rows
    .map((row) => columns
      .map(([key, , labelMap]) => {
        const raw = row[key] ?? ''
        const text = (labelMap && labelMap[raw]) || raw
        return `"${String(text).replace(/"/g, '""')}"`
      })
      .join(','))
    .join('\n')
  return new Blob([`﻿${header}\n${body}`], { type: 'text/csv;charset=utf-8' })
}
