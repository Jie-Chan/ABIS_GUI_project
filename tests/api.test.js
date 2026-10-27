import test from 'node:test'
import assert from 'node:assert/strict'
import { createRemote, unwrap, health, page, accountPage, responseMessage, exportFile } from '../src/api/adapters/remote.js'
import { PERMISSION, hasPermission, canResetAccountPassword, canDeleteAccount } from '../src/constants/roles.js'

test('业务失败、空结构不被当成真实数据', () => {
  assert.throws(() => unwrap({ code: 1, msg: '拒绝' }), /拒绝/)
  assert.throws(() => unwrap({ code: 0, data: false }), /失败/)
  assert.throws(() => health(true), /结构/)
  assert.throws(() => health({ items: [] }), /非空/)
  assert.throws(() => page(true), /结构/)
  assert.deepEqual(page({ list: [], total: 0 }), { items: [], total: 0 })
})

test('登录不臆造角色，认证失败直接报错', async () => {
  const remote = createRemote(async () => ({ code: 0, data: { accessToken: 'test-token' } }))
  const result = await remote.login('tester', 'test')
  assert.equal(result.account.role, '')
  assert.equal(result.account.identityPending, true)
  const failed = createRemote(async () => { throw new Error('认证失败') })
  await assert.rejects(failed.login('tester', 'test'), /认证失败/)
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

test('真实账户列表校验 ID 和布尔状态，不保留密码或构造临时 ID', () => {
  const item = { id: '7', username: 'tester', displayName: '测试', role: 'operator', enabled: true, createdAt: '—', lastLoginAt: null, password: 'test-secret' }
  const row = accountPage({ list: [item], total: 1 }).items[0]
  assert.equal(row.id, '7')
  assert.equal(row.password, undefined)
  assert.equal(row.createdAt, null)
  assert.throws(() => accountPage({ items: [{ ...item, id: undefined }], total: 1 }), /有效 ID/)
  assert.throws(() => accountPage({ items: [{ ...item, enabled: 'false' }], total: 1 }), /启用状态/)
})

test('账户时间兼容两组字段，优先 V2 别名，保留空值且不泄漏密码或回写时间', async () => {
  const base = { id: 'time-test', username: 'tester', displayName: '测试', role: 'operator', enabled: true }
  const items = [
    { ...base, createdAt: '2026-08-01 09:12:00', updatedAt: '2026-10-26 01:02:03' },
    { ...base, createAt: '2026-10-01 01:02:03', createdAt: '旧值', updateAt: '2026-10-27 04:05:06', updatedAt: '旧值', password: 'secret' },
    { ...base, createAt: null, createdAt: '2026-08-01 09:12:00', updateAt: '—', updatedAt: '2026-10-26 01:02:03' },
    { ...base, createAt: '', createdAt: null, updatedAt: '—' },
  ]
  const snapshot = structuredClone(items)
  const rows = accountPage({ items, total: items.length }).items
  assert.deepEqual(rows.map(({ createdAt, updatedAt }) => [createdAt, updatedAt]), [
    ['2026-08-01 09:12:00', '2026-10-26 01:02:03'],
    ['2026-10-01 01:02:03', '2026-10-27 04:05:06'],
    ['2026-08-01 09:12:00', '2026-10-26 01:02:03'],
    [null, null],
  ])
  assert.deepEqual(items, snapshot)
  assert.equal(rows[1].password, undefined)
  let sent
  const remote = createRemote(async request => { sent = request; return { code: 0, data: true } })
  await remote.updateAccount(rows[1].id, rows[1])
  assert.deepEqual(sent.data, { displayName: '测试', role: 'operator', enabled: true, phone: '-', email: '-', remark: '-' })
})

test('账户路径使用实际 ID；创建不发送 UI 内部字段', async () => {
  const calls = []
  const remote = createRemote(async config => { calls.push(config); return { code: 0, data: true } })
  await remote.createAccount({ id: null, username: 'new', displayName: 'New', role: 'operator', dataSource: 'ignored' })
  await remote.updateAccount(42, { enabled: false })
  await remote.deleteAccount(42)
  await remote.resetPassword(42)
  assert.deepEqual(calls[0].data, { username: 'new', displayName: 'New', role: 'operator', phone: '-', email: '-', remark: '-' })
  assert.deepEqual(calls.slice(1).map(c => c.url), ['/system/user/42', '/system/user/42', '/system/user/42/reset-password'])
  assert.equal(calls[3].data, undefined, '当前重置接口按实际定义不发送新密码')
})

test('真实账户列表仅发送现有接口支持的分页和关键字，失败明确报错', async () => {
  let sent
  const remote = createRemote(async config => { sent = config; return { code: 0, data: { items: [], total: 0 } } })
  await remote.listAccounts({ page: 2, pageSize: 20, keyword: 'test', role: 'admin', enabled: false })
  assert.equal(sent.url, '/system/user/console-page')
  assert.deepEqual(sent.params, { page: 2, pageSize: 20, keyword: 'test' })
  const failed = createRemote(async () => { throw new Error('读取失败') })
  await assert.rejects(failed.listAccounts(), /读取失败/)
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
  const session = await remote.getSession()
  assert.equal(sent.url, '/system/auth/get-permission-info')
  assert.equal(session.account.role, 'operator')
  const bad = createRemote(async () => ({ code: 0, data: {} }))
  await assert.rejects(bad.getSession(), /缺少 ID/)
})

test('新权限矩阵：运维员可配置阈值但不能访问账户，管理员仅删除和重置其他运维员', () => {
  assert.equal(hasPermission('operator', PERMISSION.THRESHOLD_EDIT), true)
  for (const permission of [PERMISSION.ACCOUNT_VIEW, PERMISSION.ACCOUNT_MANAGE, PERMISSION.ACCOUNT_RESET_PASSWORD, PERMISSION.ACCOUNT_DELETE]) {
    assert.equal(hasPermission('operator', permission), false)
    assert.equal(hasPermission('admin', permission), true)
  }
  for (const allowed of [canResetAccountPassword, canDeleteAccount]) {
    for (const role of ['admin', 'operator', '']) {
      for (const targetRole of ['admin', 'operator', '', 'unknown']) {
        assert.equal(allowed(role, targetRole, 'actor', 'target'), role === 'admin' && targetRole === 'operator')
      }
    }
    assert.equal(allowed('admin', 'operator', '7', 7), false)
    for (const id of [null, undefined, '', ' ', {}, NaN]) {
      assert.equal(allowed('admin', 'operator', id, 'target'), false)
      assert.equal(allowed('admin', 'operator', 'actor', id), false)
    }
  }
})

test('后端 detail 错误可显示，校验错误不回显输入密码', () => {
  assert.equal(responseMessage({ detail: '权限不足' }), '权限不足')
  assert.equal(responseMessage({ detail: [{ msg: '字段不合法', input: 'secret-password' }] }), '字段不合法')
  assert.throws(() => unwrap({ code: 403, detail: '权限不足' }), /权限不足/)
})

test('日志和审计导出使用真实文件接口，传递筛选条件并排除分页参数', async () => {
  const requests = []
  const file = new Blob(['\uFEFFid,result\nexport-test,success\n'], { type: 'text/csv;charset=utf-8' })
  const remote = createRemote(async config => { requests.push(config); return file })
  assert.equal(await remote.exportLogs({ page: 3, pageSize: 20, api: 'add', minCost: 0, maxCost: null, feature: '', startTime: '2026-10-27 00:00:00' }), file)
  assert.deepEqual(requests[0], {
    method: 'get', url: '/abis/call-log/export', responseType: 'blob',
    params: { startTime: '2026-10-27 00:00:00', api: 'add', minCost: 0 },
  })
  assert.equal(await remote.exportAudits({ page: 2, pageSize: 10, operator: 'ops', action: '账户编辑', result: '成功', unknown: 'ignored' }), file)
  assert.deepEqual(requests[1], {
    method: 'get', url: '/system/audit-log/export', responseType: 'blob',
    params: { operator: 'ops', action: '账户编辑', result: '成功' },
  })
  assert.equal(await remote.exportLogs(), file)
  assert.deepEqual(requests[2].params, {})
})

test('导出不把业务错误、HTML、空文件或 JSON 当成 CSV 下载', async () => {
  await assert.rejects(exportFile(new Blob([JSON.stringify({ code: 403, data: null, msg: '无导出权限' })], { type: 'application/json' })), /无导出权限/)
  await assert.rejects(exportFile(new Blob([JSON.stringify({ code: 401, msg: '登录过期' })], { type: 'text/plain' })), /登录过期/)
  await assert.rejects(exportFile(new Blob([JSON.stringify({ code: 0, data: [] })], { type: 'application/json' })), /返回了 JSON/)
  await assert.rejects(exportFile(new Blob(['invalid json'], { type: 'application/json' })), /无效 JSON/)
  await assert.rejects(exportFile(new Blob(['<!doctype html><html>Login</html>'], { type: 'text/html' })), /返回了网页/)
  await assert.rejects(exportFile(new Blob([])), /有效文件/)
  await assert.rejects(exportFile({ code: 0, data: [] }), /有效文件/)
  const csv = new Blob(['[列名],数值\nvalue,1\n'], { type: 'text/csv' })
  assert.equal(await exportFile(csv), csv)
})

test('账户可选资料在读取和写入中保留，空值为短横线且状态更新不覆盖资料', async () => {
  const fields = { phone: '13800000000', email: 'ops@example.com', remark: '夜班运维' }
  const base = { id: 'ops', username: 'ops', displayName: '运维', role: 'operator', enabled: true }
  const rows = accountPage({ items: [{ ...base, ...fields, password: 'never-keep' }, base], total: 2 }).items
  for (const key of Object.keys(fields)) {
    assert.equal(rows[0][key], fields[key])
    assert.equal(rows[1][key], '-')
  }
  assert.equal(rows[0].password, undefined)
  const calls = []
  const remote = createRemote(async request => { calls.push(request); return { code: 0, data: true } })
  await remote.createAccount({ ...base, ...fields, password: 'not-sent' })
  assert.deepEqual(calls[0].data, { username: 'ops', displayName: '运维', role: 'operator', ...fields })
  await remote.updateAccount('ops', { phone: '  ', email: null, remark: undefined })
  assert.deepEqual(calls[1].data, { phone: '-', email: '-', remark: '-' })
  await remote.updateAccount('ops', { enabled: false })
  assert.deepEqual(calls[2].data, { enabled: false })
  const session = createRemote(async () => ({ code: 0, data: { account: { ...base, ...fields, password: 'never-keep' } } }))
  assert.deepEqual((await session.getSession()).account, { id: 'ops', username: 'ops', displayName: '运维', role: 'operator', identityPending: false, ...fields })
})

test('本人改密只提交原密码和新密码，不接受目标 ID 或确认密码', async () => {
  let sent
  const remote = createRemote(async request => { sent = request; return { code: 0, data: { reauthenticationRequired: true } } })
  assert.deepEqual(await remote.changePassword({ oldPassword: 'old fixture', newPassword: 'new fixture', id: 'other-user', confirmPassword: 'not-sent' }), { reauthenticationRequired: true })
  assert.deepEqual(sent, { method: 'post', url: '/system/auth/change-password', data: { oldPassword: 'old fixture', newPassword: 'new fixture' }, params: undefined })
  const denied = createRemote(async () => ({ code: 400, msg: '原密码错误', data: null }))
  await assert.rejects(denied.changePassword({ oldPassword: 'x', newPassword: 'y' }), /原密码错误/)
  const missing = createRemote(async () => { const error = new Error('missing'); error.status = 404; throw error })
  await assert.rejects(missing.changePassword({ oldPassword: 'x', newPassword: 'y' }), /暂未提供修改密码功能/)
})
