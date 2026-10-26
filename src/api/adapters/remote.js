// HTTP 契约转换；服务失败不回落 mock。
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}响应结构不完整，请核对后端报文`)
  return value
}
export function unwrap(body) {
  object(body, '接口')
  if ('code' in body) {
    if (Number(body.code) !== 0 || body.data === false) throw new Error(body.msg || `接口操作失败（${body.code}）`)
    return body.data
  }
  return body
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
  const userPath = id => `/system/user/${encodeURIComponent(id)}`
  return {
    async login(username, password) {
      const data = object(await call('post', '/system/auth/login', { username, password }), '登录')
      const token = data.accessToken ?? data.token
      if (typeof token !== 'string' || !token) throw new Error('登录响应缺少 accessToken/token')
      const identity = data.account ?? data.user ?? data
      const role = ['admin', 'operator'].includes(identity.role) ? identity.role : ''
      return { token, account: { id: identity.id ?? identity.userId, username: identity.username || username, displayName: identity.displayName || identity.username || username, role, identityPending: !role } }
    },
    logout: () => call('post', '/system/auth/logout'),
    getHealth: async () => health(await call('get', '/abis/monitor/snapshot')),
    getThresholds: async () => thresholds(await call('get', '/abis/thresholds')),
    async updateThresholds(payload) {
      const saved = await call('put', '/abis/thresholds', payload)
      try { return thresholds(saved === true || saved == null ? await call('get', '/abis/thresholds') : saved) }
      catch (e) { throw new Error(`写入已成功，但无法确认保存后的配置：${e.message}。请先重新读取，勿重复提交。`) }
    },
    createAccount: payload => call('post', '/system/user', { username: payload.username, displayName: payload.displayName, role: payload.role }),
    updateAccount: (id, payload) => call('put', userPath(id), payload),
    deleteAccount: id => call('delete', userPath(id)),
    resetPassword: id => call('post', `${userPath(id)}/reset-password`),
    listLogs: async params => logPage(await call('get', '/abis/call-log/page', undefined, clean(params))),
    listAudits: async params => logPage(await call('get', '/system/audit-log/page', undefined, clean(params)), true),
  }
}
