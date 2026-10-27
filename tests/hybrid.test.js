import test from 'node:test'
import assert from 'node:assert/strict'
import { createHybrid } from '../src/api/adapters/hybrid.js'
import { createRemote, unwrap, health, page, accountPage, responseMessage } from '../src/api/adapters/remote.js'
import { PERMISSION, hasPermission, canResetAccountPassword } from '../src/constants/roles.js'

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

test('账户列表和操作全部走真实接口，不混入演示行或临时创建记录', async () => {
  const calls = []
  const mock = new Proxy({}, { get: (_, key) => key === 'exportLogs' ? async () => 'mock-file' : () => assert.fail('账户不能调用 mock') })
  const remote = {
    listAccounts: async () => ({ items: [{ id: 10, username: 'real' }], total: 1 }),
    createAccount: async () => ({ id: 10 }),
    updateAccount: async (...args) => calls.push(['real-update', ...args]),
    deleteAccount: async () => { throw new Error('禁止删除') },
    resetPassword: async (...args) => calls.push(['real-reset', ...args]),
  }
  const hybrid = createHybrid(remote, mock)
  await hybrid.createAccount({ username: 'real', displayName: '真实', role: 'operator' })
  await hybrid.updateAccount(10, { enabled: false })
  await hybrid.resetPassword(10)
  assert.deepEqual(calls.map(x => x.slice(0, 2)), [['real-update', 10], ['real-reset', 10]])
  await assert.rejects(hybrid.deleteAccount(10), /禁止删除/)
  const list = await hybrid.listAccounts()
  assert.equal(list.items.length, 1)
  assert.equal(list.items[0].id, 10)
  assert.equal(list.items[0].dataSource, undefined)
  assert.equal(await hybrid.exportLogs(), 'mock-file')
})

test('真实账户列表校验 ID 和布尔状态，不保留密码或构造临时 ID', () => {
  const item = { id: '7', username: 'tester', displayName: '测试', role: 'operator', enabled: true, createdAt: '—', lastLoginAt: null, password: 'test-secret' }
  const row = accountPage({ list: [item], total: 1 }).items[0]
  assert.equal(row.id, '7')
  assert.equal(row.password, undefined)
  assert.equal(row.createdAt, null)
  assert.throws(() => accountPage({ items: [{ ...item, id: undefined }], total: 1 }), /有效 ID/)
  assert.throws(() => accountPage({ items: [{ ...item, enabled: 'false' }], total: 1 }), /启用状态/)
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
  assert.equal(calls[3].data, undefined, '当前重置接口按实际定义不发送新密码')
})

test('真实账户列表仅发送现有接口支持的分页和关键字，不回落 mock', async () => {
  let sent
  const remote = createRemote(async config => { sent = config; return { code: 0, data: { items: [], total: 0 } } })
  await remote.listAccounts({ page: 2, pageSize: 20, keyword: 'test', role: 'admin', enabled: false })
  assert.equal(sent.url, '/system/user/console-page')
  assert.deepEqual(sent.params, { page: 2, pageSize: 20, keyword: 'test' })
  const hybrid = createHybrid({ listAccounts: async () => { throw new Error('读取失败') } }, { listAccounts: () => assert.fail('不应回退 mock') })
  await assert.rejects(hybrid.listAccounts(), /读取失败/)
})

test('缺少真实 ID 不发写请求，编辑只发送允许字段', async () => {
  const calls = []
  const remote = createRemote(async config => { calls.push(config); return { code: 0, data: true } })
  for (const id of [null, undefined, '', ' ', {}, NaN]) {
    assert.throws(() => remote.updateAccount(id, { enabled: false }), /账户 ID/)
    assert.throws(() => remote.deleteAccount(id), /账户 ID/)
    assert.throws(() => remote.resetPassword(id), /账户 ID/)
  }
  assert.equal(calls.length, 0)
  await remote.updateAccount('server/id', { enabled: false, username: 'ignored', password: 'ignored', id: 'ignored' })
  assert.equal(calls[0].url, '/system/user/server%2Fid')
  assert.deepEqual(calls[0].data, { enabled: false })
})

test('当前会话通过真实身份接口恢复，不从输入用户名或缓存推断角色', async () => {
  let sent
  const remote = createRemote(async config => { sent = config; return { code: 0, data: { account: { id: '7', username: 'tester', displayName: '测试', role: 'operator' } } } })
  const session = await createHybrid(remote, {}).getSession()
  assert.equal(sent.url, '/system/auth/get-permission-info')
  assert.equal(session.account.role, 'operator')
  const bad = createRemote(async () => ({ code: 0, data: {} }))
  await assert.rejects(bad.getSession(), /缺少 ID/)
})

test('运维员仅能查看账户及重置运维员密码，未知角色不获得写权限', () => {
  assert.equal(hasPermission('operator', PERMISSION.ACCOUNT_VIEW), true)
  assert.equal(hasPermission('operator', PERMISSION.ACCOUNT_MANAGE), false)
  assert.equal(canResetAccountPassword('operator', 'operator'), true)
  assert.equal(canResetAccountPassword('operator', 'admin'), false)
  assert.equal(canResetAccountPassword('admin', 'admin'), true)
  assert.equal(canResetAccountPassword('admin', 'operator'), true)
  assert.equal(canResetAccountPassword('', 'operator'), false)
  assert.equal(canResetAccountPassword('admin', 'unknown'), false)
})

test('后端 detail 错误可显示，校验错误不回显输入密码', () => {
  assert.equal(responseMessage({ detail: '权限不足' }), '权限不足')
  assert.equal(responseMessage({ detail: [{ msg: '字段不合法', input: 'secret-password' }] }), '字段不合法')
  assert.throws(() => unwrap({ code: 403, detail: '权限不足' }), /权限不足/)
})
