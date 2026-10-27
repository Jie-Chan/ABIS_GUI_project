import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const base = new URL(process.env.ABIS_TEST_URL || 'http://127.0.0.1:5190').origin
const out = process.env.ABIS_QA_OUTPUT_DIR || './qa-output'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch()
const checks = [], unexpectedRequests = [], browserErrors = []
const pass = name => { checks.push(name); console.log('PASS', name) }
const confirm = page => page.locator('.el-message-box').getByRole('button', { name: '确定', exact: true }).click()
const cancel = page => page.locator('.el-message-box').getByRole('button', { name: '取消', exact: true }).click()
const logout = async page => {
  await page.getByRole('button', { name: '账户菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
}
const openProfile = async page => {
  await page.getByRole('button', { name: '账户菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '个人信息', exact: true }).click()
  await page.getByRole('dialog', { name: '个人信息', exact: true }).waitFor()
  await loaded(page)
}
const row = (page, name) => page.locator('.el-table__body .el-table__row').filter({ hasText: name })
const loaded = async page => {
  for (const mask of await page.locator('.el-loading-mask').all()) await mask.waitFor({ state: 'hidden' })
}
const snapshot = async (page, name) => {
  await page.waitForFunction(() => !document.querySelector('.el-message'))
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
}
const pageNames = { '/monitor': '服务状态监控', '/logs': '日志查询', '/audits': '审计查询', '/threshold': '匹配阈值配置', '/accounts': '账户管理' }
const go = async (page, path) => {
  const menu = page.getByRole('menuitem', { name: pageNames[path], exact: true })
  if (['/threshold', '/accounts'].includes(path) && !await menu.isVisible()) await page.getByRole('button', { name: '设置', exact: true }).click()
  await menu.click()
  await page.waitForURL(`**${path}`)
  await loaded(page)
}
const trackErrors = page => {
  page.on('pageerror', e => browserErrors.push(e.message))
  page.on('console', message => {
    // HTTP error responses are expected in failure fixtures; Vue/runtime errors are not.
    if (message.type() === 'error' && !/^Failed to load resource: the server responded with a status of (400|401|403|404|405|500|501)/.test(message.text())) browserErrors.push(message.text())
  })
}

async function fixture(role = 'admin', authenticated = true) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce', serviceWorkers: 'block' })
  await context.addInitScript(authenticated => {
    if (authenticated && !sessionStorage.getItem('abis_qa_seeded')) {
      sessionStorage.setItem('abis_qa_seeded', 'true')
      sessionStorage.setItem('abis_remote_token', 'fixture-token')
    }
  }, authenticated)
  const current = { id: role === 'admin' ? 'admin-fixture' : 'ops-current', username: 'fixture-current', displayName: '当前测试用户', role, enabled: true, phone: '13800000000', email: 'current@example.com', remark: '当前账户备注' }
  let rows = [
    { id: 'admin-fixture', username: 'fixture-admin', displayName: '管理员样本', role: 'admin', enabled: true, createdAt: '2026-08-01 01:02:03', updatedAt: '2026-10-26 01:02:03', lastLoginAt: null },
    { id: 'admin-other', username: 'other-admin', displayName: '其他管理员', role: 'admin', enabled: true, createdAt: null, lastLoginAt: null },
    { id: 'ops-target', username: 'fixture-ops', displayName: '运维员样本', role: 'operator', enabled: true, createAt: '2026-10-01 01:02:03', updateAt: '2026-10-27 04:05:06', lastLoginAt: null },
  ]
  const calls = []
  const state = { resetMode: 'missing', failList: false, failMonitor: false, emptyList: false, failLogout: false, expire: false, exportMode: 'file', passwordMode: 'missing', failProfile: false, noProfileFields: false }
  let thresholds = { face: 80, finger: 70 }
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  trackErrors(page)
  // Every API request is fulfilled locally, including reads and authentication.
  // Any external request or unrecognized API path is blocked before the Vite proxy.
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method()
    if (!['http:', 'https:'].includes(url.protocol)) return route.continue()
    if (url.origin !== base) { unexpectedRequests.push(req.url()); return route.abort() }
    if (!url.pathname.startsWith('/admin-api/')) {
      if (url.pathname.startsWith('/abis-admin/')) { unexpectedRequests.push(req.url()); return route.abort() }
      return route.continue()
    }
    const path = url.pathname.slice('/admin-api'.length)
    calls.push({ method, path, body: req.postDataJSON(), params: Object.fromEntries(url.searchParams), authorization: req.headers().authorization })
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { code: 0, data, msg: '' } : data) })
    if (state.expire) return reply({ detail: '测试会话已失效' }, 401)
    if (path === '/system/auth/login') {
      if (req.postDataJSON().username === 'fixture-invalid') return reply({ detail: '用户名或密码错误' }, 401)
      return reply({ accessToken: 'fixture-token', account: current })
    }
    if (path.endsWith('/export')) {
      if (state.exportMode === 'json-error') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 403, msg: '没有导出权限', data: null }) })
      if (state.exportMode === 'http-error') return reply({ detail: '导出服务暂不可用' }, 500)
      if (state.exportMode === 'expired') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 401, msg: '会话已过期', data: null }) })
      return route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body: '\uFEFFID,记录\nfixture-export,真实列表拦截样本\n' })
    }
    if (path === '/system/auth/get-permission-info') {
      if (state.failProfile) return reply({ detail: '个人信息读取失败' }, 500)
      const account = { ...current }
      if (state.noProfileFields) for (const key of ['phone', 'email', 'remark']) delete account[key]
      return reply({ account })
    }
    if (path === '/system/auth/change-password') {
      assert.deepEqual(Object.keys(req.postDataJSON()).sort(), ['newPassword', 'oldPassword'])
      if (state.passwordMode === 'missing') return reply({ detail: 'Not Found' }, 404)
      if (state.passwordMode === 'wrong') return reply({ detail: '原密码错误' }, 400)
      if (state.passwordMode === 'failure') return reply({ code: 400, msg: '修改失败', data: null }, 400)
      return reply({ reauthenticationRequired: true })
    }
    if (path === '/system/auth/logout') return state.failLogout ? reply({ detail: '测试注销失败' }, 500) : reply(true)
    if (path === '/system/user/console-page') {
      if (state.failList) return reply({ detail: '账户读取测试失败' }, 500)
      const keyword = url.searchParams.get('keyword') || ''
      const filtered = state.emptyList ? [] : rows.filter(r => r.username.includes(keyword) || r.displayName.includes(keyword))
      const p = Number(url.searchParams.get('page') || 1), size = Number(url.searchParams.get('pageSize') || 10)
      return reply({ items: filtered.slice((p - 1) * size, p * size), total: filtered.length })
    }
    if (method === 'POST' && path === '/system/user') {
      const data = req.postDataJSON()
      assert.deepEqual(Object.keys(data).sort(), ['displayName', 'email', 'phone', 'remark', 'role', 'username'])
      rows.unshift({ id: 'created-fixture', ...data, enabled: true, createdAt: null, lastLoginAt: null })
      return reply(true)
    }
    const id = path.match(/^\/system\/user\/([^/]+)(\/reset-password)?$/)
    if (id) {
      if (id[2]) {
        assert.equal(req.postData(), null)
        if (state.resetMode === 'denied') return reply({ detail: '后端拒绝本次重置' }, 403)
        return reply(state.resetMode === 'credential' ? { password: 'FixtureOnly!23' } : true)
      }
      if (method === 'PUT') { rows = rows.map(r => r.id === id[1] ? { ...r, ...req.postDataJSON() } : r); return reply(true) }
      if (method === 'DELETE') { rows = rows.filter(r => r.id !== id[1]); return reply(true) }
    }
    if (path === '/abis/monitor/snapshot') {
      if (state.failMonitor) return reply({ detail: '监控读取测试失败' }, 500)
      return reply({ fetchedAt: '2026-10-27 10:00:00', items: [
        { key: 'face', name: '缺失指标样本', layer: '算法层', status: 'normal', instances: [], metrics: {} },
        { key: 'fingerprint', name: '零值指标样本', layer: '算法层', status: 'abnormal', instances: [{ id: 'fingerprint-1', status: 'abnormal' }], metrics: { cdcHealthy: false, cdcReady: false, galleryTotalSize: 0, licenseStatus: null } },
        { key: 'minio', name: 'MinIO', layer: '数据层', status: 'not_deployed', instances: [] },
      ] })
    }
    if (path === '/abis/thresholds') {
      if (method === 'PUT') { thresholds = req.postDataJSON(); return reply(true) }
      return reply(thresholds)
    }
    if (path === '/abis/call-log/page') return reply({ items: [{ id: 'fixture-log', calledAt: '2026-10-27 10:00:00', caller: '真实列表拦截样本', api: 'comparison', feature: 'face', result: 'success', costMs: 0 }], total: 1 })
    if (path === '/system/audit-log/page') return reply({ items: [{ id: 'fixture-audit', operatedAt: '2026-10-27 10:00:00', operator: '真实列表拦截样本', role: 'operator', action: '账户编辑', target: 'fixture-ops', beforeValue: 'a', afterValue: 'b', result: '成功', sourceIp: '127.0.0.1', sessionId: 'fixture-session' }], total: 1 })
    unexpectedRequests.push(`${method} ${req.url()}`)
    return reply({ detail: '未声明的测试请求，已阻止转发' }, 500)
  })
  await page.goto(`${base}/${!authenticated ? 'login' : role === 'admin' ? 'accounts' : 'monitor'}`)
  if (authenticated && role === 'admin') await row(page, 'fixture-ops').waitFor()
  else if (authenticated) { await page.getByRole('heading', { name: '服务状态监控', exact: true }).waitFor(); await loaded(page) }
  else await page.getByRole('heading', { name: '欢迎登录' }).waitFor()
  return { page, context, calls, state, current }
}

async function closeResult(page, title) {
  const dialog = page.getByRole('dialog', { name: title, exact: true })
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
}

try {
  const f = await fixture(), p = f.page
  assert.equal(await p.locator('.source-badge,.source-note,.demo-section').count(), 0)
  const cells = row(p, 'fixture-admin').locator('td')
  assert.equal((await cells.nth(4).innerText()).trim(), '2026-08-01 01:02:03')
  assert.equal((await cells.nth(5).innerText()).trim(), '2026-10-26 01:02:03')
  assert.equal((await row(p, 'fixture-ops').locator('td').nth(5).innerText()).trim(), '2026-10-27 04:05:06')
  pass('delivery UI has no mode banners; both account timestamp schemas survive the API mapping')
  for (const name of ['fixture-admin', 'other-admin']) {
    for (const action of ['删除', '重置密码']) assert.equal(await row(p, name).getByRole('button', { name: action, exact: true }).count(), 0)
  }
  for (const action of ['删除', '重置密码']) assert.equal(await row(p, 'fixture-ops').getByRole('button', { name: action, exact: true }).count(), 1)
  pass('administrator rows never expose delete/reset; both actions remain available on other operator rows')
  await p.reload(); await row(p, 'fixture-ops').waitFor()
  assert.equal(f.calls.filter(c => c.path === '/system/auth/get-permission-info').length, 2)
  assert.ok(f.calls.every(c => c.authorization === 'Bearer fixture-token'))
  pass('refresh restores and revalidates the session with Bearer authentication')
  assert.equal(await p.locator('.user').getByRole('button', { name: '退出登录', exact: true }).count(), 0)
  const accountMenu = p.getByRole('button', { name: '账户菜单', exact: true })
  await accountMenu.focus(); await p.keyboard.press('Enter')
  await p.getByRole('menuitem', { name: '个人信息', exact: true }).waitFor()
  assert.equal(await p.getByRole('menuitem', { name: '退出登录', exact: true }).isVisible(), true)
  await snapshot(p, 'account-menu-desktop')
  await p.getByRole('menuitem', { name: '个人信息', exact: true }).click(); await loaded(p)
  const profile = p.getByRole('dialog', { name: '个人信息', exact: true })
  await profile.waitFor()
  for (const text of ['fixture-current', '当前测试用户', '13800000000', 'current@example.com', '当前账户备注']) assert.ok((await profile.innerText()).includes(text))
  assert.equal(await profile.getByRole('button', { name: '保存新密码', exact: true }).isVisible(), true)
  assert.equal(await profile.locator('input[type=password]').count(), 3)
  await snapshot(p, 'personal-info-desktop')
  pass('account dropdown is keyboard accessible; personal info and password controls match the approved layout')
  const passwordRequests = () => f.calls.filter(c => c.path === '/system/auth/change-password')
  await profile.getByRole('button', { name: '保存新密码', exact: true }).click()
  await profile.getByText('请输入原密码', { exact: true }).waitFor()
  assert.equal(passwordRequests().length, 0)
  await profile.getByPlaceholder('请输入原密码', { exact: true }).fill('OldFixture!23')
  await profile.getByPlaceholder('请输入新密码', { exact: true }).fill('OldFixture!23')
  await profile.getByPlaceholder('请再次输入新密码', { exact: true }).fill('different')
  await profile.getByRole('button', { name: '保存新密码', exact: true }).click()
  await profile.getByText('新密码不能与原密码相同', { exact: true }).waitFor()
  await profile.getByText('两次输入的新密码不一致', { exact: true }).waitFor()
  assert.equal(passwordRequests().length, 0)
  await profile.getByPlaceholder('请输入新密码', { exact: true }).fill('NewFixture!23')
  await profile.getByPlaceholder('请再次输入新密码', { exact: true }).fill('NewFixture!23')
  await profile.getByRole('button', { name: '保存新密码', exact: true }).click(); await cancel(p)
  assert.equal(passwordRequests().length, 0)
  pass('password required/confirmation checks and cancelled confirmation issue no API request')
  await profile.getByRole('button', { name: '保存新密码', exact: true }).click(); await confirm(p)
  await profile.getByText('服务暂未提供修改密码功能，请联系系统管理员', { exact: true }).waitFor()
  assert.equal(await profile.getByRole('button', { name: '保存新密码', exact: true }).isVisible(), true)
  assert.equal(await p.evaluate(() => sessionStorage.getItem('abis_remote_token')), 'fixture-token')
  f.state.passwordMode = 'wrong'
  await profile.getByRole('button', { name: '保存新密码', exact: true }).click(); await confirm(p)
  await profile.getByText('原密码错误', { exact: true }).waitFor()
  assert.equal(await p.evaluate(() => sessionStorage.getItem('abis_remote_token')), 'fixture-token')
  assert.deepEqual(passwordRequests().at(-1).body, { oldPassword: 'OldFixture!23', newPassword: 'NewFixture!23' })
  pass('missing change-password endpoint and wrong old password show errors without hiding controls or reporting success')
  await profile.getByRole('button', { name: '关闭', exact: true }).click(); await profile.waitFor({ state: 'hidden' })
  await openProfile(p)
  assert.deepEqual(await profile.locator('input').evaluateAll(xs => xs.map(x => x.value)), ['', '', ''])
  assert.equal(await p.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes('NewFixture!23')), false)
  await profile.getByRole('button', { name: '关闭', exact: true }).click(); await profile.waitFor({ state: 'hidden' })
  f.state.noProfileFields = true
  await openProfile(p)
  assert.equal(await profile.locator('.el-descriptions__content').allTextContents().then(xs => xs.filter(x => x.trim() === '-').length), 3)
  await profile.getByRole('button', { name: '关闭', exact: true }).click(); await profile.waitFor({ state: 'hidden' })
  f.state.failProfile = true
  await openProfile(p)
  await profile.getByText('个人信息读取失败', { exact: true }).waitFor()
  assert.equal(await profile.getByRole('button', { name: '保存新密码', exact: true }).isVisible(), true)
  await profile.getByRole('button', { name: '关闭', exact: true }).click(); await profile.waitFor({ state: 'hidden' })
  f.state.noProfileFields = false; f.state.failProfile = false
  pass('closing profile clears password values; missing contact fields show dashes and read failures remain visible')
  await p.getByPlaceholder('搜索用户名或姓名').fill('运维员样本')
  await p.getByRole('button', { name: '查询', exact: true }).click(); await loaded(p)
  assert.equal(await p.locator('.el-table__row').count(), 1)
  await p.getByPlaceholder('搜索用户名或姓名').fill('')
  await p.getByRole('button', { name: '查询', exact: true }).click(); await loaded(p)
  pass('account keyword retains name search despite removal of the name column')
  for (const action of ['禁用', '删除', '重置密码']) {
    const before = f.calls.length
    await row(p, 'fixture-ops').getByRole('button', { name: action, exact: true }).click(); await cancel(p)
    assert.equal(f.calls.length, before)
  }
  pass('cancelled account confirmations issue no request')
  await p.getByRole('button', { name: '新建账户', exact: true }).click()
  const create = p.getByRole('dialog', { name: '新建账户', exact: true })
  assert.equal(await create.locator('.el-form-item.is-required').count(), 3)
  assert.deepEqual(await create.locator('input').evaluateAll(xs => xs.slice(2).filter(x => x.type !== 'hidden').map(x => x.value)).then(xs => xs.filter(x => x === '-')), ['-', '-'])
  await create.getByRole('button', { name: '确定', exact: true }).click()
  await p.getByText('请填写用户名、姓名并选择角色', { exact: true }).waitFor()
  await create.locator('input').nth(0).fill('created-fixture-user')
  await create.locator('input').nth(1).fill('新建样本')
  await create.getByRole('button', { name: '确定', exact: true }).click()
  await p.locator('.el-message-box').waitFor()
  assert.equal(f.calls.filter(c => c.method === 'POST' && c.path === '/system/user').length, 0)
  await cancel(p)
  assert.equal(await create.isVisible(), true)
  await create.getByRole('button', { name: '确定', exact: true }).click(); await confirm(p)
  const createRequest = f.calls.find(c => c.method === 'POST' && c.path === '/system/user')
  assert.deepEqual(createRequest.body, { username: 'created-fixture-user', displayName: '新建样本', role: 'operator', phone: '-', email: '-', remark: '-' })
  const created = p.getByRole('dialog', { name: '账户创建结果', exact: true }); await created.waitFor()
  assert.match(await created.textContent(), /未返回密码/)
  await closeResult(p, '账户创建结果'); await row(p, 'created-fixture-user').waitFor()
  pass('create validation, real-write confirmation and missing-password result retained')
  await row(p, 'created-fixture-user').getByRole('button', { name: '编辑', exact: true }).click()
  const edit = p.getByRole('dialog', { name: '编辑账户', exact: true })
  assert.equal(await edit.locator('input').nth(0).isDisabled(), true)
  await edit.locator('input').nth(1).fill('编辑后的样本')
  await edit.locator('.el-form-item').filter({ has: p.locator('label').filter({ hasText: '电话' }) }).locator('input').fill('13900000000')
  await edit.locator('.el-form-item').filter({ has: p.locator('label').filter({ hasText: '邮箱' }) }).locator('input').fill('bad-email')
  await edit.getByRole('button', { name: '确定', exact: true }).click()
  await edit.getByText('请输入有效的邮箱地址', { exact: true }).waitFor()
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 0)
  await edit.locator('.el-form-item').filter({ has: p.locator('label').filter({ hasText: '邮箱' }) }).locator('input').fill('ops@example.com')
  await edit.locator('textarea').fill('夜班运维备注')
  await edit.getByRole('button', { name: '确定', exact: true }).click(); await confirm(p)
  await edit.waitFor({ state: 'hidden' }); await loaded(p)
  assert.deepEqual(f.calls.find(c => c.method === 'PUT').body, { displayName: '编辑后的样本', role: 'operator', phone: '13900000000', email: 'ops@example.com', remark: '夜班运维备注' })
  await row(p, 'created-fixture-user').getByRole('button', { name: '编辑', exact: true }).click()
  await edit.waitFor()
  assert.equal(await edit.locator('input[type=tel]').inputValue(), '13900000000')
  assert.equal(await edit.locator('textarea').inputValue(), '夜班运维备注')
  await edit.getByRole('button', { name: '取消', exact: true }).click()
  await edit.waitFor({ state: 'hidden' })
  pass('editing retains required fields, email validation and optional metadata after reread')
  for (const action of ['禁用', '启用']) {
    await row(p, 'created-fixture-user').getByRole('button', { name: action, exact: true }).click(); await confirm(p)
    await row(p, 'created-fixture-user').getByRole('button', { name: action === '禁用' ? '启用' : '禁用', exact: true }).waitFor()
  }
  assert.deepEqual(f.calls.filter(c => c.method === 'PUT').slice(1).map(c => c.body), [{ enabled: false }, { enabled: true }])
  pass('disable and enable retain explicit boolean payloads and refresh the list')
  f.state.resetMode = 'credential'
  await row(p, 'created-fixture-user').getByRole('button', { name: '重置密码', exact: true }).click(); await confirm(p)
  const credential = p.getByRole('dialog', { name: '密码重置结果', exact: true }); await credential.waitFor()
  const password = credential.getByRole('textbox')
  assert.equal(await password.getAttribute('type'), 'password')
  assert.equal(await password.inputValue(), 'FixtureOnly!23')
  await closeResult(p, '密码重置结果')
  assert.equal(await p.locator('input').evaluateAll(xs => xs.some(x => x.value === 'FixtureOnly!23')), false)
  assert.equal(await p.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }).includes('FixtureOnly!23')), false)
  pass('returned password is masked, cleared on close and absent from browser storage')
  await row(p, 'created-fixture-user').getByRole('button', { name: '删除', exact: true }).click()
  await p.locator('.el-message-box').getByRole('button', { name: '删除', exact: true }).click()
  await row(p, 'created-fixture-user').waitFor({ state: 'detached' })
  pass('delete uses actual ID and refreshes the list')
  f.state.emptyList = true
  await p.getByRole('button', { name: '查询', exact: true }).click(); await loaded(p)
  await p.locator('.el-table__empty-text').waitFor()
  f.state.emptyList = false; f.state.failList = true
  await p.getByRole('button', { name: '查询', exact: true }).click()
  await p.getByText('账户读取测试失败', { exact: true }).waitFor()
  assert.equal(await p.locator('.el-table__row').count(), 0)
  pass('empty results and failed account reads remain distinct; stale actions are cleared')
  f.state.failList = false
  await go(p, '/monitor')
  assert.deepEqual(await p.locator('.status-overview dd').allTextContents(), ['3', '1', '1', '1'])
  assert.equal(await row(p, '缺失指标样本').locator('.algorithm-metrics').innerText().then(t => (t.match(/未知/g) || []).length), 4)
  assert.equal(await row(p, '缺失指标样本').locator('.metric-error').count(), 0)
  assert.match(await row(p, '零值指标样本').innerText(), /底库规模：0/)
  assert.match(await row(p, '零值指标样本').innerText(), /CDC 链路健康：异常/)
  await row(p, '缺失指标样本').locator('.el-table__expand-icon').click()
  await p.getByText('暂无实例明细。', { exact: true }).waitFor()
  pass('missing monitor metrics show unknown; false and zero are preserved; no instances are not mislabelled undeployed')
  f.state.failMonitor = true
  await p.getByRole('button', { name: '立即刷新', exact: true }).click()
  await p.getByText('监控读取测试失败', { exact: true }).waitFor()
  await p.getByText('读取失败，以下保留上次成功获取的数据。', { exact: true }).waitFor()
  assert.equal(await p.locator('.el-table__row').count(), 3)
  pass('failed monitoring refresh preserves and identifies the previous snapshot')
  await go(p, '/threshold')
  const face = p.locator('.threshold-field input').first()
  await face.fill('59'); await face.blur()
  await p.getByRole('button', { name: '保存', exact: true }).click()
  await p.getByText(/低于协议生效下限 60/).first().waitFor()
  assert.equal(await p.locator('.el-message-box:visible').count(), 0)
  assert.equal(f.calls.filter(c => c.method === 'PUT' && c.path === '/abis/thresholds').length, 0)
  pass('threshold lower-bound validation still blocks invalid submissions')
  await face.fill('85'); await face.blur()
  await p.getByRole('button', { name: '保存', exact: true }).click(); await cancel(p)
  assert.equal(f.calls.filter(c => c.method === 'PUT' && c.path === '/abis/thresholds').length, 0)
  await p.getByRole('button', { name: '保存', exact: true }).click(); await confirm(p)
  await p.getByText('阈值已保存', { exact: true }).waitFor()
  assert.deepEqual(f.calls.find(c => c.method === 'PUT' && c.path === '/abis/thresholds').body, { face: 85, finger: 70 })
  pass('threshold real-write confirmation, boolean-result reread and main success message preserved')
  for (const [path, prefix] of [['/logs', 'abis_api_logs'], ['/audits', 'abis_audit']]) {
    await go(p, path)
    await row(p, '真实列表拦截样本').waitFor()
    await p.getByRole('button', { name: '详情', exact: true }).click()
    await p.getByRole('dialog').waitFor()
    await p.getByRole('dialog').locator('.el-dialog__headerbtn').click()
    const pending = p.waitForEvent('download')
    await p.getByRole('button', { name: '导出 CSV', exact: true }).click()
    const download = await pending
    assert.ok(download.suggestedFilename().startsWith(prefix))
    const csv = await fs.readFile(await download.path(), 'utf8')
    assert.ok(csv.includes('真实列表拦截样本'))
    const exported = f.calls.filter(c => c.path.endsWith('/export')).at(-1)
    assert.equal(exported.params.page, undefined)
    assert.equal(exported.params.pageSize, undefined)
    pass(`${path}: CSV downloads the server file and excludes list pagination parameters`)
    f.state.exportMode = 'json-error'
    let downloads = 0
    const onDownload = () => { downloads++ }
    p.on('download', onDownload)
    await p.getByRole('button', { name: '导出 CSV', exact: true }).click()
    await p.getByText('没有导出权限', { exact: true }).waitFor()
    assert.equal(downloads, 0)
    f.state.exportMode = 'http-error'
    await p.getByRole('button', { name: '导出 CSV', exact: true }).click()
    await p.getByText('导出服务暂不可用', { exact: true }).waitFor()
    assert.equal(downloads, 0)
    p.off('download', onDownload)
    f.state.exportMode = 'file'
    pass(`${path}: JSON and HTTP export errors remain visible and never download as CSV`)
  }
  await snapshot(p, 'audits-desktop')
  f.state.failLogout = true
  await logout(p); await confirm(p)
  await p.waitForURL('**/login')
  await p.getByText('本地已退出，服务端注销未确认：测试注销失败', { exact: true }).waitFor()
  assert.equal(await p.evaluate(() => sessionStorage.getItem('abis_remote_token')), null)
  assert.equal(await p.locator('.demo-section').count(), 0)
  pass('failed server logout still clears the local session and shows main warning')
  await f.context.close()

  const o = await fixture('operator'), op = o.page
  await op.getByRole('button', { name: '设置', exact: true }).click()
  assert.equal(await op.getByRole('menuitem', { name: '账户管理', exact: true }).count(), 0)
  await op.getByRole('menuitem', { name: '匹配阈值配置', exact: true }).click()
  await op.waitForURL('**/threshold'); await loaded(op)
  assert.equal(await op.getByRole('button', { name: '保存', exact: true }).isVisible(), true)
  await op.locator('.threshold-field input').first().fill('88')
  await op.getByRole('button', { name: '保存', exact: true }).click(); await confirm(op)
  await op.getByText('阈值已保存', { exact: true }).waitFor()
  assert.equal(o.calls.filter(c => c.method === 'PUT' && c.path === '/abis/thresholds').length, 1)
  await op.goto(`${base}/accounts`); await op.waitForURL('**/monitor'); await loaded(op)
  assert.equal(o.calls.filter(c => c.path === '/system/user/console-page').length, 0)
  pass('operator Settings contains thresholds only; save allowed and account route blocked before any list request')
  await openProfile(op)
  assert.equal(await op.getByRole('dialog', { name: '个人信息' }).getByRole('button', { name: '保存新密码' }).isVisible(), true)
  await op.getByRole('dialog', { name: '个人信息' }).getByRole('button', { name: '关闭', exact: true }).click()
  o.state.expire = true
  await op.getByRole('button', { name: '立即刷新', exact: true }).click()
  await op.waitForURL('**/login')
  assert.equal(await op.evaluate(() => sessionStorage.getItem('abis_remote_token')), null)
  pass('operator retains personal info/password controls and expired authentication clears the session')
  await o.context.close()

  for (const role of ['admin', 'operator']) {
    const changed = await fixture(role), cp = changed.page
    changed.state.passwordMode = 'success'
    await openProfile(cp)
    const dialog = cp.getByRole('dialog', { name: '个人信息', exact: true })
    await dialog.getByPlaceholder('请输入原密码', { exact: true }).fill('PasswordBefore!23')
    await dialog.getByPlaceholder('请输入新密码', { exact: true }).fill('PasswordAfter!23')
    await dialog.getByPlaceholder('请再次输入新密码', { exact: true }).fill('PasswordAfter!23')
    await dialog.getByRole('button', { name: '保存新密码', exact: true }).click(); await confirm(cp)
    await cp.waitForURL('**/login')
    await cp.getByText('密码已修改，请重新登录', { exact: true }).waitFor()
    assert.equal(await cp.evaluate(() => sessionStorage.getItem('abis_remote_token')), null)
    assert.equal(await cp.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes('PasswordAfter!23')), false)
    assert.equal(await cp.locator('input').evaluateAll(xs => xs.some(x => x.value.includes('PasswordAfter!23'))), false)
    pass(`${role}: successful own-password change clears session and passwords then requires login`)
    await changed.context.close()
  }

  const unknown = await fixture(''), up = unknown.page
  await up.getByText('当前账户角色未识别，仅允许查看数据。', { exact: true }).waitFor()
  assert.match(await up.locator('.user-name').getAttribute('title'), /角色未识别/)
  assert.equal(await up.getByRole('button', { name: '设置', exact: true }).count(), 0)
  await up.goto(`${base}/accounts`); await up.waitForURL('**/monitor'); await loaded(up)
  assert.equal(unknown.calls.filter(c => c.path === '/system/user/console-page').length, 0)
  pass('unknown role remains read-only and cannot access accounts or thresholds')
  await unknown.context.close()

  const expiredExport = await fixture(), ep = expiredExport.page
  await go(ep, '/logs')
  expiredExport.state.exportMode = 'expired'
  await ep.getByRole('button', { name: '导出 CSV', exact: true }).click()
  await ep.waitForURL('**/login')
  assert.equal(await ep.evaluate(() => sessionStorage.getItem('abis_remote_token')), null)
  pass('export JSON session-expiry responses clear authentication and return to login')
  await expiredExport.context.close()

  const login = await fixture('admin', false), lp = login.page
  await lp.getByRole('button', { name: '登录', exact: true }).click()
  await lp.getByText('请输入用户名与密码', { exact: true }).waitFor()
  await lp.getByPlaceholder('请输入用户名').fill('fixture-invalid')
  await lp.getByPlaceholder('请输入密码').fill('fixture-invalid')
  await lp.getByRole('button', { name: '登录', exact: true }).click()
  await lp.getByText('用户名或密码错误', { exact: true }).waitFor()
  assert.match(lp.url(), /login/)
  assert.equal(await lp.locator('.demo-section,.source-badge').count(), 0)
  pass('login validates required fields and displays backend errors without demo content')
  const bounds = await lp.locator('.login-content').boundingBox()
  assert.ok(Math.abs(bounds.x + bounds.width / 2 - 720) < 1)
  await lp.getByPlaceholder('请输入用户名').fill('')
  await lp.getByPlaceholder('请输入密码').fill('')
  await snapshot(lp, 'login-desktop')
  await lp.getByPlaceholder('请输入用户名').fill('fixture-current')
  await lp.getByPlaceholder('请输入密码').fill('FixtureLogin!23')
  await lp.getByRole('button', { name: '登录', exact: true }).click()
  await lp.waitForURL('**/monitor'); await loaded(lp)
  assert.equal(await lp.evaluate(() => sessionStorage.getItem('abis_remote_token')), 'fixture-token')
  await row(lp, '零值指标样本').locator('.el-table__expand-icon').click()
  await lp.getByText('fingerprint-1', { exact: false }).waitFor()
  await lp.getByRole('button', { name: '立即刷新', exact: true }).click(); await loaded(lp)
  await lp.getByText('fingerprint-1', { exact: false }).waitFor()
  assert.deepEqual(await lp.locator('.status-overview dd').allTextContents(), ['3', '1', '1', '1'])
  pass('real login stores the tab session; monitoring refresh preserves expanded instances and summary')
  await snapshot(lp, 'monitor-desktop')
  const settings = lp.getByRole('button', { name: '设置', exact: true })
  await settings.focus(); await lp.keyboard.press('Enter')
  await lp.getByRole('menuitem', { name: '账户管理', exact: true }).waitFor()
  await go(lp, '/accounts')
  assert.equal(await lp.locator('.settings-trigger.is-active').count(), 1)
  assert.deepEqual((await lp.locator('.el-table__header th .cell').allTextContents()).map(t => t.trim()), ['账户 ID', '用户名', '角色', '启用状态', '创建时间', '更新时间', '最近登录时间', '操作'])
  await snapshot(lp, 'accounts-desktop')
  pass('Settings supports keyboard navigation and account columns retain the V2 contract')
  for (const width of [1280, 1024, 768, 390, 320]) {
    await lp.setViewportSize({ width, height: 900 })
    for (const path of ['/monitor', '/threshold', '/accounts', '/logs', '/audits']) {
      await go(lp, path)
      const widths = await lp.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
      assert.ok(widths.scroll <= widths.client + 1, `${path} at ${width}px: ${JSON.stringify(widths)}`)
      assert.equal(await lp.locator('.source-badge,.source-note,.demo-section').count(), 0)
      if (width === 390 && path === '/accounts') {
        assert.ok(await lp.evaluate(() => {
          const cell = document.querySelector('.el-table__body .el-table__row td:nth-child(2)'), r = cell.getBoundingClientRect()
          return cell.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
        }))
        await snapshot(lp, 'accounts-mobile')
        await lp.getByRole('button', { name: '新建账户', exact: true }).click()
        const mobileCreate = lp.getByRole('dialog', { name: '新建账户', exact: true })
        assert.equal(await mobileCreate.locator('.el-form-item').count(), 6)
        assert.equal(await mobileCreate.locator('.el-form-item').filter({ hasText: '邮箱' }).locator('input').inputValue(), '-')
        await snapshot(lp, 'create-account-mobile')
        await mobileCreate.getByRole('button', { name: '取消', exact: true }).click(); await mobileCreate.waitFor({ state: 'hidden' })
        await openProfile(lp)
        await snapshot(lp, 'personal-info-mobile')
        const mobileProfile = lp.getByRole('dialog', { name: '个人信息', exact: true })
        assert.equal(await mobileProfile.getByRole('button', { name: '保存新密码', exact: true }).isVisible(), true)
        const saveBounds = await mobileProfile.getByRole('button', { name: '保存新密码', exact: true }).boundingBox()
        assert.ok(saveBounds.y >= 0 && saveBounds.y + saveBounds.height <= 900, 'mobile profile footer stays within viewport')
        assert.ok(await lp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
        await mobileProfile.getByRole('button', { name: '关闭', exact: true }).click(); await mobileProfile.waitFor({ state: 'hidden' })
      }
      pass(`${path} at ${width}px: no overflow or development-mode content`)
    }
  }
  await logout(lp); await cancel(lp)
  assert.match(lp.url(), /audits/)
  await logout(lp); await confirm(lp)
  await lp.waitForURL('**/login')
  for (const width of [390, 320]) {
    await lp.setViewportSize({ width, height: 844 })
    const b = await lp.locator('.login-content').boundingBox()
    assert.ok(Math.abs(b.x + b.width / 2 - width / 2) < 1)
    assert.ok(await lp.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
  }
  await snapshot(lp, 'login-mobile')
  pass('logout cancellation and success retained; login remains centered at 390/320px')
  await login.context.close()

  assert.deepEqual(unexpectedRequests, [])
  assert.deepEqual(browserErrors, [])
  pass('zero unexpected API/external requests, zero runtime errors and zero real-account writes')
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ checks, browserErrors, unexpectedRequests, realAccountWrites: 0 }, null, 2))
  console.log(`COMPLETE ${checks.length} delivery checks`)
} catch (error) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) await page.screenshot({ path: `${out}/failure-${browser.contexts().indexOf(context)}.png`, fullPage: true }).catch(() => {})
  }
  await fs.writeFile(`${out}/failure.txt`, `${error.stack}\n${JSON.stringify({ browserErrors, unexpectedRequests })}`)
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}
