// HTTP 契约转换；服务失败不回落 mock。
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}响应结构不完整，请核对后端报文`)
  return value
}
export function responseMessage(body) {
  if (typeof body?.msg === 'string' && body.msg) return body.msg
  if (typeof body?.detail === 'string') return body.detail
  if (Array.isArray(body?.detail)) return body.detail.map(item => item?.msg).filter(value => typeof value === 'string').join('；')
  return ''
}
export function unwrap(body) {
  object(body, '接口')
  if ('code' in body) {
    if (Number(body.code) !== 0 || body.data === false) throw new Error(responseMessage(body) || `接口操作失败（${body.code}）`)
    return body.data
  }
  return body
}

function validId(value) {
  return (typeof value === 'string' && value.trim().length > 0) || (typeof value === 'number' && Number.isSafeInteger(value))
}

function identity(data, username = '') {
  object(data, '账户')
  const source = object(data.account ?? data.user ?? data, '账户')
  const role = ['admin', 'operator'].includes(source.role) ? source.role : ''
  return { id: source.id ?? source.userId, username: source.username || username, displayName: source.displayName || source.nickname || source.username || username, role, identityPending: !role }
}

export function accountPage(data) {
  const result = page(data)
  return { ...result, items: result.items.map(item => {
    object(item, '账户')
    if (!validId(item.id) || typeof item.username !== 'string' || !item.username || typeof item.displayName !== 'string' || typeof item.enabled !== 'boolean' || typeof item.role !== 'string') throw new Error('账户列表缺少有效 ID、用户名、姓名、角色或启用状态，请核对后端报文')
    const time = value => value == null || value === '' || value === '—' ? null : value
    return { id: item.id, username: item.username, displayName: item.displayName, role: item.role, enabled: item.enabled, createdAt: time(item.createdAt), lastLoginAt: time(item.lastLoginAt) }
  }) }
}
export function thresholds(data) {
  object(data, '阈值')
  const result = { face: Number(data.face), finger: Number(data.finger) }
  if (data.face == null || data.finger == null || Object.values(result).some(v => !Number.isInteger(v) || v < 1 || v > 100)) throw new Error('阈值响应缺少有效的 face/finger 数值')
  return result
}
export function page(data) {
  object(data, '列表')
  const items = data.items ?? data.list ?? data.records
  const total = Number(data.total)
  if (!Array.isArray(items) || data.total == null || !Number.isInteger(total) || total < 0) throw new Error('列表响应缺少数组 items/list/records 或有效 total')
  return { items, total }
}
export function health(data) {
  object(data, '监控')
  if (!Array.isArray(data.items) || !data.items.length) throw new Error('监控响应缺少非空 items，无法判断服务状态')
  const states = ['normal', 'abnormal', 'unreachable', 'not_deployed']
  for (const item of data.items) {
    if (!item.key || !states.includes(item.status) || !Array.isArray(item.instances)) throw new Error('监控对象缺少 key、有效 status 或 instances')
  }
  return data
}

function logPage(data, audit = false) {
  const result = page(data)
  const fields = audit ? ['operatedAt', 'operator', 'action', 'target', 'result', 'sourceIp', 'sessionId'] : ['calledAt', 'caller', 'api', 'feature', 'result', 'costMs']
  const apiLabels = { comparison: '比对', verification: '核验', identification: '1:N 识别', add: '注册 / 更新', delete: '删除' }
  return { ...result, items: result.items.map(item => {
    object(item, '记录')
    const missing = fields.filter(key => !(key in item))
    if (missing.length) throw new Error(`记录响应缺少字段：${missing.join('、')}，需要补齐接口映射`)
    if (audit) return { ...item, roleLabel: item.roleLabel ?? ({ admin: '管理员', operator: '运维员' }[item.role] || item.role || '—'), result: { success: '成功', failure: '失败' }[item.result] || item.result }
    return { ...item, apiLabel: item.apiLabel ?? apiLabels[item.api] ?? item.api }
  }) }
}
export function createRemote(request) {
  const call = async (method, url, data, params) => unwrap(await request({ method, url, data, params }))
  const clean = params => Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== '' && v != null))
  const userPath = id => {
    if (!validId(id)) throw new Error('缺少有效的真实账户 ID，无法执行操作')
    return `/system/user/${encodeURIComponent(id)}`
  }
  return {
    async login(username, password) {
      const data = object(await call('post', '/system/auth/login', { username, password }), '登录')
      const token = data.accessToken ?? data.token
      if (typeof token !== 'string' || !token) throw new Error('登录响应缺少 accessToken/token')
      return { token, account: identity(data, username) }
    },
    logout: () => call('post', '/system/auth/logout'),
    async getSession() {
      const data = object(await call('get', '/system/auth/get-permission-info'), '当前用户')
      const account = identity(data)
      if (!validId(account.id) || !account.username) throw new Error('当前用户响应缺少 ID 或用户名')
      return { account }
    },
    listAccounts: async ({ page = 1, pageSize = 10, keyword = '' } = {}) => accountPage(await call('get', '/system/user/console-page', undefined, clean({ page, pageSize, keyword }))),
    getHealth: async () => health(await call('get', '/abis/monitor/snapshot')),
    getThresholds: async () => thresholds(await call('get', '/abis/thresholds')),
    async updateThresholds(payload) {
      const saved = await call('put', '/abis/thresholds', payload)
      try { return thresholds(saved === true || saved == null ? await call('get', '/abis/thresholds') : saved) }
      catch (e) { throw new Error(`写入已成功，但无法确认保存后的配置：${e.message}。请先重新读取，勿重复提交。`) }
    },
    createAccount: payload => call('post', '/system/user', { username: payload.username, displayName: payload.displayName, role: payload.role }),
    updateAccount(id, payload) {
      const data = Object.fromEntries(['displayName', 'role', 'enabled'].filter(key => key in payload).map(key => [key, payload[key]]))
      if (!Object.keys(data).length) throw new Error('没有可更新的账户字段')
      return call('put', userPath(id), data)
    },
    deleteAccount: id => call('delete', userPath(id)),
    resetPassword: id => call('post', `${userPath(id)}/reset-password`),
    listLogs: async params => logPage(await call('get', '/abis/call-log/page', undefined, clean(params))),
    listAudits: async params => logPage(await call('get', '/system/audit-log/page', undefined, clean(params)), true),
  }
}
