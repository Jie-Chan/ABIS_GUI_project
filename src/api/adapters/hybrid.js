// mock ID 与真实 ID 严格隔离；只操作本次真实创建且返回 ID 的账户。
export function createHybrid(remote, mock) {
  let created = []
  let sequence = 0
  const target = id => {
    const row = created.find(row => row.id === id)
    if (!row || row.remoteId == null) throw new Error('未获得真实账户 ID，暂不能操作该账户')
    return row
  }
  return {
    ...remote,
    async login(...args) { const result = await remote.login(...args); created = []; return result },
    getSession: async () => null,
    async listAccounts({ page = 1, pageSize = 10, keyword = '' } = {}) {
      const sample = await mock.listAccounts({ page: 1, pageSize: 10000 })
      const rows = [...created, ...sample.items.map(row => ({ ...row, dataSource: 'mock' }))]
        .filter(row => !keyword || row.username.includes(keyword) || row.displayName.includes(keyword))
      return { total: rows.length, items: rows.slice((page - 1) * pageSize, page * pageSize) }
    },
    async createAccount(payload) {
      const result = await remote.createAccount(payload)
      const remoteId = typeof result === 'number' || typeof result === 'string' ? result : result?.id
      const validId = (typeof remoteId === 'number' && Number.isSafeInteger(remoteId)) || (typeof remoteId === 'string' && remoteId.length > 0)
      const row = { username: payload.username, displayName: payload.displayName, role: payload.role, enabled: true, createdAt: '—', lastLoginAt: '—', ...(result && typeof result === 'object' ? result : {}), id: `remote:${++sequence}`, remoteId: validId ? remoteId : null, dataSource: 'real-local' }
      created.unshift(row)
      return row
    },
    async updateAccount(id, payload) {
      if (typeof id === 'string' && id.startsWith('remote:')) {
        const row = target(id); await remote.updateAccount(row.remoteId, payload); Object.assign(row, payload); return { ...row }
      }
      return mock.updateAccount(id, payload)
    },
    async deleteAccount(id) {
      if (typeof id === 'string' && id.startsWith('remote:')) {
        await remote.deleteAccount(target(id).remoteId); created = created.filter(row => row.id !== id); return
      }
      return mock.deleteAccount(id)
    },
    resetPassword: id => typeof id === 'string' && id.startsWith('remote:') ? remote.resetPassword(target(id).remoteId) : mock.resetPassword(id),
    exportLogs: params => mock.exportLogs(params),
    exportAudits: params => mock.exportAudits(params),
  }
}
