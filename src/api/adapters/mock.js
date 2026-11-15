/**
 * mock 适配器 —— 契约未冻结期间的默认实现
 *
 * 数据来源：src/mock/ 下按需求字段表生成的样本。
 * 切换方式：.env 中 VITE_USE_MOCK=true
 */
import { mockAccounts, mockCredentials } from '@/mock/accounts'
import { mockThresholds } from '@/mock/thresholds'
import { buildMonitorSnapshot } from '@/mock/monitor'
import { buildHostResources } from '@/mock/hosts'
import { buildRecaptureLogs, buildDocumentRecaptureLogs } from '@/mock/recapture'
import { buildEnrollmentSubjects } from '@/mock/applicants'
import { buildBusinessSnapshot } from '@/mock/business'
import { buildAuditRecords } from '@/mock/audit'
import { formatDateTime } from '@/utils/datetime'
import { requestDuration, projectRequest, formatLogTime } from '@/utils/log'
import { PUBLICATION_LABEL, STAGE_LABEL } from '@/constants/log'
import { normalizeAuditAction } from '@/constants/audit'
import { THRESHOLD_KEYS, THRESHOLD_MAX } from '@/constants/threshold'
import { LOG_FEATURE_LABEL, LOG_RESULT_LABEL } from '@/constants/log'
import { optionalAccountFields } from '@/utils/account'
import { latestEnrollmentRecord } from '@/utils/applicant'
import { ROLE, PERMISSION, hasPermission, canResetAccountPassword, canDeleteAccount, canChangeAccountRole, canToggleAccountEnabled } from '@/constants/roles'

// —— 可变状态：模块加载时克隆一份，使增删改在会话内可见 ——
let accounts = mockAccounts.map((a) => ({ ...a }))
let thresholds = { ...mockThresholds }
let nextAccountId = accounts.length + 1
// 本人改密仅在当前 Mock 模块会话内有效，演示种子数据保持原样。
const credentials = mockCredentials.map((credential) => ({ ...credential }))
let sessionAccountId = null

const defaultBusiness = buildBusinessSnapshot()
let { logs, applicants, subjects } = defaultBusiness
let recaptureScenario = 'default'
const audits = buildAuditRecords()

const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms))

function currentAccount() {
  const account = accounts.find(item => item.id === sessionAccountId && item.enabled)
  if (!account) throw new Error('登录状态已失效，请重新登录')
  return account
}

function managedAccount(id) {
  const actor = currentAccount()
  if (!hasPermission(actor.role, PERMISSION.ACCOUNT_MANAGE)) throw new Error('没有账户管理权限')
  const target = accounts.find(item => item.id === id)
  if (!target) throw new Error('账户不存在')
  return { actor, target }
}

// 演示密码仅保留在模块内存，刷新后恢复种子数据。
function setTemporaryPassword(account) {
  // getRandomValues 兼容通过普通 HTTP 服务器地址访问的浏览器。
  const random = globalThis.crypto.getRandomValues(new Uint8Array(4))
  const suffix = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('')
  const password = `Demo-${account.id}-${suffix}`
  const credential = credentials.find(item => item.accountId === account.id)
  if (credential) credential.password = password
  else credentials.push({ accountId: account.id, username: account.username, password })
  return password
}

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
    const credential = credentials.find(
      (c) => c.username === username && c.password === password
    )
    if (!credential) {
      throw new Error('用户名或密码错误')
    }
    sessionAccountId = account.id
    return {
      token: `mock-token-${account.id}`,
      account: { ...account },
    }
  },

  async logout() {
    await delay(80)
    sessionAccountId = null
  },

  async getSession() {
    await delay(80)
    return { account: { ...currentAccount() } }
  },

  async changePassword({ oldPassword, newPassword } = {}) {
    await delay()
    const account = accounts.find((item) => item.id === sessionAccountId && item.enabled)
    if (!account) throw new Error('登录状态已失效，请重新登录')
    if (typeof oldPassword !== 'string' || !oldPassword || typeof newPassword !== 'string' || !newPassword) {
      throw new Error('请填写原密码和新密码')
    }
    if (newPassword.length < 7) throw new Error('新密码长度必须大于 6 位')
    if (oldPassword === newPassword) throw new Error('新密码不能与原密码相同')
    const credential = credentials.find((item) => item.accountId === account.id)
    if (!credential || credential.password !== oldPassword) throw new Error('原密码不正确')
    credential.password = newPassword
    sessionAccountId = null
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
    if (!hasPermission(currentAccount().role, PERMISSION.ACCOUNT_MANAGE)) throw new Error('没有账户管理权限')
    if (!payload.username?.trim() || !payload.displayName?.trim() || ![ROLE.ADMIN, ROLE.OPERATOR].includes(payload.role)) throw new Error('请填写用户名、姓名并选择角色')
    if (accounts.some(item => item.username === payload.username)) throw new Error('用户名已存在')
    const account = {
      id: nextAccountId,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      ...optionalAccountFields(payload),
      enabled: true,
      createdAt: formatDateTime(new Date()),
      lastLoginAt: '—',
    }
    const initialPassword = setTemporaryPassword(account)
    accounts = [...accounts, account]
    nextAccountId += 1
    return { ...account, initialPassword }
  },

  async updateAccount(id, payload) {
    await delay()
    const { actor, target } = managedAccount(id)
    if ('role' in payload && (!canChangeAccountRole(actor.role, target.role, actor.id, id) || ![ROLE.ADMIN, ROLE.OPERATOR].includes(payload.role))) throw new Error('不能修改本人或管理员账户的角色')
    if ('enabled' in payload && (typeof payload.enabled !== 'boolean' || !canToggleAccountEnabled(actor.role, target.role, actor.id, id, target.enabled))) throw new Error('不能禁用本人或管理员账户')
    // 与 resetPassword 一致：id 不存在必须报错。
    // 若静默返回 {}，页面会显示「保存成功」，而写得其实是一次不存在的更新，
    // 且返回的空对象会把该行渲染成空白 —— 只有真实后端会拒绝时才发现。
    if (!accounts.some((a) => a.id === id)) throw new Error('账户不存在')
    const changes = Object.fromEntries(['displayName', 'role', 'enabled', 'phone', 'email', 'remark'].filter(key => key in payload).map(key => [key, payload[key]]))
    accounts = accounts.map((a) => (a.id === id ? { ...a, ...changes, updatedAt: formatDateTime(new Date()) } : a))
    return { ...accounts.find((a) => a.id === id) }
  },

  async deleteAccount(id) {
    await delay()
    const { actor, target } = managedAccount(id)
    if (!canDeleteAccount(actor.role, target.role, actor.id, id)) throw new Error('不能删除本人或管理员账户')
    accounts = accounts.filter((a) => a.id !== id)
    const index = credentials.findIndex(item => item.accountId === id)
    if (index >= 0) credentials.splice(index, 1)
  },

  async resetPassword(id) {
    await delay()
    const { actor, target } = managedAccount(id)
    if (!canResetAccountPassword(actor.role, target.role, actor.id, id)) throw new Error('不能重置本人或管理员账户的密码')
    return { temporaryPassword: setTemporaryPassword(target) }
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
    for (const { key, protocolLowerBound } of THRESHOLD_KEYS) {
      const value = payload[key]
      if (!Number.isInteger(value) || value < protocolLowerBound || value > THRESHOLD_MAX) throw new Error(`${key} 阈值须为 ${protocolLowerBound}–${THRESHOLD_MAX} 的整数`)
    }
    thresholds = { ...thresholds, ...payload }
    return { ...thresholds }
  },

  // ——— 监控（需求 1.3）———

  async getHealth() {
    await delay()
    return buildMonitorSnapshot()
  },

  async getHostResources() {
    await delay()
    if (!hasPermission(currentAccount().role, PERMISSION.MONITOR_VIEW)) throw new Error('没有监控查看权限')
    return buildHostResources()
  },
  async getRecaptureScenario() { currentAccount(); return { scenario: recaptureScenario, userId: recaptureScenario.startsWith('document-') ? '' : 'U900' } },
  async setRecaptureScenario(scenario) {
    if (!hasPermission(currentAccount().role, PERMISSION.APPLICANT_VIEW)) throw new Error('没有申请人查看权限')
    if (!['default','original','deleted','face','complete','failed','document-original','document-deleted','document-face','document-complete'].includes(scenario)) throw new Error('未知的重采样例状态')
    recaptureScenario = scenario
    if (scenario === 'default') ({ logs, applicants, subjects } = defaultBusiness)
    else {
      const documentScenario = scenario.startsWith('document-')
      const extra = documentScenario ? buildDocumentRecaptureLogs(scenario.slice(9)) : buildRecaptureLogs({ fingerFailure: scenario === 'failed' }).slice(0, ({original:3,deleted:5,face:6,complete:9,failed:9})[scenario])
      const sampleIds = documentScenario ? ['U301', 'U302', 'U303'] : ['U900']
      logs = [...defaultBusiness.logs.filter(log => !sampleIds.includes(log.userId)), ...extra.map(log => ({ ...log, historical: true }))]
      subjects = [...defaultBusiness.subjects.filter(person => !sampleIds.includes(person.userId)), ...buildEnrollmentSubjects(extra).filter(person => sampleIds.includes(person.userId))]
      applicants = subjects.filter(person => person.faceCount > 0)
    }
    return { scenario, userId: scenario.startsWith('document-') ? '' : 'U900' }
  },

  // ——— 日志与审计查询（需求 1.4 / 2.2）———

  async listApplicants({ page = 1, pageSize = 20, userId = '', startTime = '', endTime = '', sortBy = '', sortOrder = '' } = {}) {
    await delay()
    if (!hasPermission(currentAccount().role, PERMISSION.APPLICANT_VIEW)) throw new Error('没有申请人查看权限')
    const id = userId.trim()
    const filtered = applicants.filter(person => {
      if (id && person.userId !== id) return false
      if (startTime && Date.parse(person.enrolledAt) < Date.parse(startTime)) return false
      if (endTime && Date.parse(person.enrolledAt) > Date.parse(endTime) + (endTime.length === 19 ? 999 : 0)) return false
      return true
    })
    if (['enrolledAt', 'updatedAt'].includes(sortBy) && ['ascending', 'descending'].includes(sortOrder)) {
      filtered.sort((a, b) => ((Date.parse(a[sortBy]) || 0) - (Date.parse(b[sortBy]) || 0)) * (sortOrder === 'ascending' ? 1 : -1) || a.userId.localeCompare(b.userId))
    }
    return paginate(filtered.map(({ records, changes, ...person }) => ({ ...person, records: records.map(record => ({ ...record })) })), { page, pageSize })
  },

  async getApplicant(userId) {
    await delay()
    if (!hasPermission(currentAccount().role, PERMISSION.APPLICANT_VIEW)) throw new Error('没有申请人查看权限')
    const person = applicants.find(item => item.userId === userId)
    if (!person) throw new Error('申请人不存在或已不在库中')
    return { ...person, records: person.records.map(record => ({ ...record })), changes: person.changes.map(change => ({ ...change, requestIds: [...change.requestIds] })) }
  },

  // 模拟 GUI 后端查询当前 PostgreSQL 入库记录，再返回 MinIO 图像链接。
  async getUserImage({ userId, feature, fingerPosition = null } = {}) {
    await delay()
    if (!hasPermission(currentAccount().role, PERMISSION.APPLICANT_VIEW)) throw new Error('没有图像查看权限')
    const person = subjects.find(item => item.userId === userId)
    const record = latestEnrollmentRecord(person?.records.filter(item => item.feature === feature
      && (feature !== 'finger' || !fingerPosition || item.fingerPosition === fingerPosition)))
    const deleted = !record && (person?.changes.some(change => change.operation === '删除' && change.feature === feature)
      || (!person && logs.some(log => log.userId === userId && log.feature === feature && log.api === 'delete' && log.result === 'success')))
    return {
      userId, feature, fingerPosition: record?.fingerPosition ?? fingerPosition,
      status: deleted ? 'deleted' : record?.imageUrl ? 'available' : 'missing',
      recordId: record?.recordId ?? null, imageUrl: record?.imageUrl ?? null,
    }
  },

  async listLogs(params = {}) {
    await delay()
    return paginate(filterLogs(logs, params), params)
  },

  async listAudits(params = {}) {
    await delay()
    const dates = audits.map(row => row.operatedAt.slice(0, 10)).sort()
    return { ...paginate(filterAudits(audits, params), params), demoDateRange: { start: dates[0], end: dates.at(-1) } }
  },

  // ——— 导出（需求 1.4）———

  async exportLogs(params = {}) {
    await delay()
    const now = Date.now()
    const rows = filterLogs(logs, params).map(row => {
      const duration = requestDuration(row, now)
      return { ...row, calledAt: formatLogTime(row.receivedAt), userId: row.userId || '—', sourceIp: row.sourceIp || '—', durationLabel: duration.label, durationText: duration.text }
    })
    return toCsvBlob(rows, [
      ['calledAt', '接收时间'], ['sourceIp', '请求来源 IP'], ['requestId', '请求 ID'], ['userId', '用户 ID'],
      ['caller', '调用方标识'], ['api', '接口类型'], ['mode', '链路', { sync: '同步', async: '异步' }],
      // feature / result 在记录里存的是枚举 key（'face' / 'success'），
      // 直接落表会在中文表头下写出英文枚举值。用常量里的 key→label 快查表转中文，
      // 与 exportAudits 直接用 roleLabel 的做法保持一致。
      ['feature', '生物模态', LOG_FEATURE_LABEL], ['currentStage', '处理环节', STAGE_LABEL],
      ['result', '执行状态', LOG_RESULT_LABEL], ['publication', '响应发布状态', PUBLICATION_LABEL],
      ['durationLabel', '耗时口径'], ['durationText', '请求耗时'],
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
 * 申请人/业务请求 ID 精确匹配，与时间、接口、模态、结果、耗时组合过滤。
 *
 * ⚠ startTime / endTime 与 r.calledAt 之间是**字符串比较**，三者同为
 *   'YYYY-MM-DD HH:mm:ss' 才成立。传 Date 对象或 'YYYY-MM-DD' 不报错，
 *   只会静默过滤掉全部记录 —— 调用方须先用 formatDateTime 归一化。
 */
function filterLogs(list, { startTime, endTime, userId = '', requestId = '', requestIds = [], api, feature, result, publication, minCost, maxCost } = {}) {
  const applicant = userId.trim()
  const request = requestId.trim()
  return list.map(projectRequest).filter((r) => {
    if (r.historical && !applicant && !request && !requestIds.length) return false
    if (applicant && r.userId !== applicant) return false
    if (request && r.requestId !== request) return false
    if (requestIds.length && !requestIds.includes(r.requestId)) return false
    if (startTime && r.calledAt < startTime) return false
    if (endTime && r.calledAt > endTime) return false
    if (api && r.api !== api) return false
    if (feature && r.feature !== feature) return false
    if (result && r.result !== result) return false
    if (publication && (r.mode === 'sync' || r.publication !== publication)) return false
    if (minCost != null && (r.costMs == null || r.costMs < minCost)) return false
    if (maxCost != null && (r.costMs == null || r.costMs > maxCost)) return false
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
    if (operator?.trim() && r.operator !== operator.trim()) return false
    if (action && normalizeAuditAction(r.action) !== normalizeAuditAction(action)) return false
    if (result && r.result !== result) return false
    return true
  }).map(row => ({ ...row, action: normalizeAuditAction(row.action) }))
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
