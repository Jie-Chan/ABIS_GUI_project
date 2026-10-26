import test from 'node:test'
import assert from 'node:assert/strict'
import { createHybrid } from '../src/api/adapters/hybrid.js'
import { createRemote, unwrap, health, page } from '../src/api/adapters/remote.js'

test('业务失败、空结构不被当成真实数据', () => {
  assert.throws(() => unwrap({ code: 1, msg: '拒绝' }), /拒绝/)
  assert.throws(() => unwrap({ code: 0, data: false }), /失败/)
  assert.throws(() => health(true), /结构/)
  assert.throws(() => health({ items: [] }), /非空/)
  assert.throws(() => page(true), /结构/)
  assert.deepEqual(page({ list: [], total: 0 }), { items: [], total: 0 })
})

test('真实登录不臆造角色；登录失败不回退 mock', async () => {
  const remote = createRemote(async () => ({ code: 0, data: { accessToken: 'test-token' } }))
  const result = await remote.login('tester', 'test')
  assert.equal(result.account.role, '')
  assert.equal(result.account.identityPending, true)
  const hybrid = createHybrid({ login: async () => { throw new Error('认证失败') } }, { login: () => assert.fail('不应调用 mock') })
  await assert.rejects(hybrid.login(), /认证失败/)
})

test('阈值布尔写入结果回读，回读失败标明写入已成功', async () => {
  const calls = []
  const remote = createRemote(async config => {
    calls.push(config)
    return { code: 0, data: config.method === 'put' ? true : { face: 80, finger: 90 } }
  })
  assert.deepEqual(await remote.updateThresholds({ face: 80, finger: 90 }), { face: 80, finger: 90 })
  assert.deepEqual(calls.map(c => c.method), ['put', 'get'])
  const broken = createRemote(async config => {
    if (config.method === 'get') throw new Error('超时')
    return { code: 0, data: true }
  })
  await assert.rejects(broken.updateThresholds({ face: 80, finger: 90 }), /写入已成功.*超时/)
})

test('查询传递全部非空筛选条件，并保留耗时零边界', async () => {
  let sent
  const remote = createRemote(async config => { sent = config; return { code: 0, data: { records: [], total: 0 } } })
  await remote.listLogs({ page: 1, feature: '', minCost: 0, maxCost: null, api: 'add', startTime: '2026-10-23 00:00:00' })
  assert.equal(sent.url, '/abis/call-log/page')
  assert.deepEqual(sent.params, { page: 1, minCost: 0, api: 'add', startTime: '2026-10-23 00:00:00' })
})

test('列表记录字段不完整时明确报错，不伪造数据', async () => {
  const remote = createRemote(async () => ({ code: 0, data: { items: [{ id: 1 }], total: 1 } }))
  await assert.rejects(remote.listLogs(), /记录响应缺少字段/)
  await assert.rejects(remote.listAudits(), /记录响应缺少字段/)
})

test('相同数值 ID 的演示账户与真实账户隔离，真实失败不更新本地记录', async () => {
  const calls = []
  const mock = {
    listAccounts: async () => ({ items: [{ id: 10, username: 'demo', displayName: '演示' }] }),
    updateAccount: async (...args) => calls.push(['mock-update', ...args]),
    deleteAccount: async (...args) => calls.push(['mock-delete', ...args]),
    resetPassword: async (...args) => calls.push(['mock-reset', ...args]),
    exportLogs: async () => 'mock-file',
  }
  const remote = {
    createAccount: async () => ({ id: 10 }),
    updateAccount: async (...args) => calls.push(['real-update', ...args]),
    deleteAccount: async () => { throw new Error('禁止删除') },
    resetPassword: async (...args) => calls.push(['real-reset', ...args]),
  }
  const hybrid = createHybrid(remote, mock)
  const real = await hybrid.createAccount({ username: 'real', displayName: '真实', role: 'operator' })
  await hybrid.updateAccount(10, { enabled: false })
  await hybrid.updateAccount(real.id, { enabled: false })
  await hybrid.resetPassword(10)
  await hybrid.resetPassword(real.id)
  assert.deepEqual(calls.map(x => x.slice(0, 2)), [['mock-update', 10], ['real-update', 10], ['mock-reset', 10], ['real-reset', 10]])
  await assert.rejects(hybrid.deleteAccount(real.id), /禁止删除/)
  const list = await hybrid.listAccounts()
  assert.equal(list.items.length, 2)
  assert.equal(list.items[0].dataSource, 'real-local')
  assert.equal(list.items[1].dataSource, 'mock')
  assert.equal(await hybrid.exportLogs(), 'mock-file')
})

test('后端创建成功但没有 ID 时不能对该记录调用任何写接口', async () => {
  const hybrid = createHybrid({ createAccount: async () => true }, {})
  const row = await hybrid.createAccount({ username: 'real', displayName: '真实', role: 'operator' })
  assert.equal(row.remoteId, null)
  await assert.rejects(hybrid.updateAccount(row.id, {}), /未获得真实账户 ID/)
  await assert.rejects(hybrid.deleteAccount(row.id), /未获得真实账户 ID/)
  assert.throws(() => hybrid.resetPassword(row.id), /未获得真实账户 ID/)
})

test('账户路径使用实际 ID；创建不发送 UI 内部字段', async () => {
  const calls = []
  const remote = createRemote(async config => { calls.push(config); return { code: 0, data: true } })
  await remote.createAccount({ id: null, username: 'new', displayName: 'New', role: 'operator', dataSource: 'mock' })
  await remote.updateAccount(42, { enabled: false })
  await remote.deleteAccount(42)
  await remote.resetPassword(42)
  assert.deepEqual(calls[0].data, { username: 'new', displayName: 'New', role: 'operator' })
  assert.deepEqual(calls.slice(1).map(c => c.url), ['/system/user/42', '/system/user/42', '/system/user/42/reset-password'])
})
