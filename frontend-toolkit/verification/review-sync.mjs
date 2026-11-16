// Latest integration interactions, exercised only against the in-memory Mock adapter.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
assert.match(await (await fetch(`${base}/src/api/index.js`)).text(), /"VITE_USE_MOCK": "true"/)
const out = process.env.ABIS_QA_OUTPUT_DIR || './qa-output/sync'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN', reducedMotion: 'reduce' })
const checks = [], errors = [], backendRequests = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('request', r => {
  const url = new URL(r.url())
  if (['xhr', 'fetch'].includes(r.resourceType()) && (url.origin !== base || /^\/(abis-admin|admin-api)(\/|$)/.test(url.pathname))) backendRequests.push(r.url())
})
const pass = text => { checks.push(text); console.log('PASS', text) }
const loaded = () => page.waitForFunction(() => !document.querySelector('.el-loading-mask,.el-button.is-loading'))
const button = name => page.getByRole('button', { name, exact: true })
const confirm = async name => { await page.locator('.el-message-box').getByRole('button', { name, exact: true }).click(); await page.locator('.el-message-box').waitFor({ state: 'hidden' }) }
const go = async path => {
  await page.evaluate(async path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path)
  await page.waitForURL(`**${path}`); await loaded()
}
try {
  await page.goto(`${base}/login`)
  await page.locator('.login-content input').nth(0).fill('admin')
  await page.locator('.login-content input').nth(1).fill('admin123')
  await button('登录').click(); await page.waitForURL('**/monitor'); await loaded()
  const totals = await page.locator('.status-overview dd').allTextContents()
  await button('异常').focus(); await page.keyboard.press('Enter')
  assert.equal(await page.locator('.instance-row').count(), 1)
  assert.equal(await button('异常').getAttribute('aria-pressed'), 'true')
  assert.deepEqual(await page.locator('.status-overview dd').allTextContents(), totals)
  await button('全部').click()
  assert.equal(await page.locator('.instance-row').count(), 10)
  pass('summary buttons support keyboard filtering without changing totals')

  for (const [path, method] of [['/logs', 'listLogs'], ['/audits', 'listAudits']]) {
    await go(path)
    assert.equal(await page.locator('.records-page .el-card__header').count(), 0)
    assert.ok((await page.locator('.el-table').boundingBox()).y <= (path === '/logs' ? 430 : 350))
    await page.locator('.el-date-editor input').first().click()
    await button('最近一小时').click()
    await page.evaluate(async method => {
      const api = (await import('/src/api/index.js')).default
      window.originalQuery = api[method]; window.queryCalls = []
      api[method] = async q => { window.queryCalls.push({ ...q }); return window.originalQuery(q) }
    }, method)
    await button('查询').click(); await loaded()
    const query = await page.evaluate(() => window.queryCalls.at(-1))
    assert.equal(new Date(query.endTime) - new Date(query.startTime), 3600000)
    await button('重置').click(); await loaded()
    if (path === '/logs') {
      await page.locator('.el-pagination__sizes .el-select').click()
      await page.getByRole('option', { name: '5条/页', exact: true }).click(); await loaded()
    }
    await page.locator('.el-pager .number').filter({ hasText: /^2$/ }).click(); await loaded()
    assert.equal((await page.evaluate(() => window.queryCalls.at(-1))).page, 2)
    await button('查询').click(); await loaded()
    assert.equal((await page.evaluate(() => window.queryCalls.at(-1))).page, 1)
    pass(`${path}: compact results, one-hour shortcut and new queries reset pagination`)

    await page.evaluate(async method => {
      const api = (await import('/src/api/index.js')).default
      const original = await window.originalQuery({ page: 1, pageSize: 20 })
      window.querySample = original.items[0]
      window.pendingQueries = []
      api[method] = q => new Promise((resolve, reject) => window.pendingQueries.push({ q: { ...q }, resolve, reject }))
    }, method)
    await button('查询').click(); await button('查询').click()
    assert.equal(await page.evaluate(() => window.pendingQueries.length), 2)
    await page.evaluate(() => window.pendingQueries[1].resolve({ total: 1, items: [{ ...window.querySample, requestId: 'latest-result', scenario: 'latest-result', caller: 'latest-result', operator: 'latest-result' }] }))
    await loaded()
    await page.evaluate(() => window.pendingQueries[0].resolve({ total: 1, items: [{ ...window.querySample, requestId: 'stale-result', scenario: 'stale-result', caller: 'stale-result', operator: 'stale-result' }] }))
    await page.getByText('latest-result', { exact: true }).waitFor()
    assert.equal(await page.getByText('stale-result', { exact: true }).count(), 0)
    await button('查询').click(); await button('查询').click()
    await page.evaluate(() => window.pendingQueries[2].reject(new Error('obsolete-failure')))
    assert.ok(await page.locator('.el-loading-mask').isVisible())
    await page.evaluate(() => window.pendingQueries[3].resolve({ total: 1, items: [window.querySample] }))
    await loaded()
    assert.equal(await page.getByText('obsolete-failure', { exact: true }).count(), 0)
    await button('查询').click()
    await page.evaluate(() => window.pendingQueries[4].reject(new Error('模拟查询失败')))
    await page.locator('.query-panel .el-alert').filter({ hasText: '模拟查询失败' }).waitFor()
    assert.equal(await page.locator('.el-table__row').count(), 1)
    await page.evaluate(async method => { (await import('/src/api/index.js')).default[method] = window.originalQuery }, method)
    await button('查询').click(); await loaded()
    pass(`${path}: older success/failure cannot overwrite new results or loading; current failures retain the last applied result`)
  }

  await go('/accounts')
  assert.ok(await page.getByText('张运维', { exact: true }).isVisible())
  const self = page.locator('.el-table__row').first()
  assert.ok(await self.getByRole('button', { name: '禁用', exact: true }).isDisabled())
  await self.locator('.status-action').focus()
  await page.getByRole('tooltip').filter({ hasText: '不能禁用本人账户' }).waitFor()
  await button('更多：ops.zhang').focus(); await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: '重置密码', exact: true }).click(); await confirm('确定')
  const credential = page.getByRole('dialog', { name: '密码重置结果', exact: true })
  const temporaryPassword = await credential.getByRole('textbox', { name: '账户密码' }).inputValue()
  assert.ok(temporaryPassword.length >= 7)
  await credential.getByRole('button', { name: '关闭', exact: true }).click()
  const resetLogin = await page.evaluate(async password => {
    const api = (await import('/src/api/index.js')).default
    let oldRejected = false
    try { await api.login('ops.zhang', 'ops123') } catch { oldRejected = true }
    const next = await api.login('ops.zhang', password)
    await api.login('admin', 'admin123')
    return { oldRejected, username: next.account.username }
  }, temporaryPassword)
  assert.deepEqual(resetLogin, { oldRejected: true, username: 'ops.zhang' })
  const protectedResults = await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    const results = []
    for (const operation of [() => api.updateAccount(1, { enabled: false }), () => api.deleteAccount(1), () => api.resetPassword(1)]) {
      try { await operation(); results.push('unexpected success') } catch (e) { results.push(e.message) }
    }
    return results
  })
  assert.ok(protectedResults.every(message => /不能/.test(message)))
  pass('account names, keyboard More menu, reset credentials and administrator/self protections work in Mock')

  await button('账户菜单').click(); await page.getByRole('menuitem', { name: '个人信息', exact: true }).click(); await loaded()
  const profile = page.getByRole('dialog', { name: '个人信息', exact: true })
  assert.equal(await profile.getByRole('tab', { name: '基本资料' }).getAttribute('aria-selected'), 'true')
  assert.equal(await profile.getByRole('button', { name: '保存新密码' }).count(), 0)
  await profile.getByRole('tab', { name: '修改密码', exact: true }).click()
  await profile.getByPlaceholder('请输入原密码', { exact: true }).fill('admin123')
  await profile.getByPlaceholder('请输入新密码', { exact: true }).fill('short6')
  await profile.getByPlaceholder('请再次输入新密码', { exact: true }).fill('short6')
  await profile.getByRole('button', { name: '保存新密码', exact: true }).click()
  await profile.locator('#new-password-requirement.is-error').getByText('新密码至少 7 位', { exact: true }).waitFor()
  assert.equal(await profile.getByText('新密码至少 7 位', { exact: true }).count(), 1)
  await profile.getByPlaceholder('请输入新密码', { exact: true }).fill('valid77')
  await profile.getByPlaceholder('请输入新密码', { exact: true }).blur()
  await page.waitForFunction(() => !document.querySelector('#new-password-requirement.is-error'))
  await profile.getByRole('tab', { name: '基本资料', exact: true }).click()
  await profile.getByRole('tab', { name: '修改密码', exact: true }).click()
  assert.equal(await profile.getByPlaceholder('请输入原密码', { exact: true }).inputValue(), '')
  await profile.getByRole('button', { name: '关闭', exact: true }).click()
  pass('profile defaults to details; six-character password fails, seven passes with one hint; switching tabs clears sensitive fields')

  await go('/threshold')
  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    const save = api.updateThresholds
    window.thresholdWrites = []
    api.updateThresholds = async value => { window.thresholdWrites.push({ ...value }); return save(value) }
  })
  await button('填入默认值').click()
  assert.equal(await page.evaluate(() => window.thresholdWrites.length), 0)
  assert.deepEqual(await page.locator('.threshold-field input').evaluateAll(inputs => inputs.map(input => input.value)), ['60', '60'])
  const thresholdConfirmation = page.getByRole('dialog', { name: '保存阈值修改？', exact: true })
  await button('保存修改').click(); await thresholdConfirmation.waitFor()
  assert.equal(await thresholdConfirmation.locator('.confirmation-details p').count(), 2)
  assert.equal(await thresholdConfirmation.locator('.confirmation-question').count(), 0)
  await confirm('取消')
  assert.equal(await page.evaluate(() => window.thresholdWrites.length), 0)
  await page.evaluate(async () => { void document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/logs') })
  await confirm('继续编辑'); assert.match(page.url(), /threshold$/)
  await button('保存修改').click(); await thresholdConfirmation.waitFor(); await confirm('保存'); await loaded()
  assert.deepEqual(await page.evaluate(() => window.thresholdWrites), [{ face: 60, finger: 60 }])
  assert.ok(await button('保存修改').isDisabled())
  await button('填入默认值').click(); assert.ok(await button('保存修改').isDisabled())
  pass('defaults fill without requests; cancelling and leaving preserve edits; only explicit save writes and clears dirty state')
  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    window.originalRead = api.getThresholds
    api.updateThresholds = async () => { const error = new Error('模拟回读失败'); error.code = 'THRESHOLD_READBACK_FAILED'; throw error }
  })
  await page.locator('.threshold-field input').first().fill('70'); await page.locator('.threshold-field input').first().blur()
  await button('保存修改').click(); await thresholdConfirmation.waitFor()
  assert.deepEqual(await thresholdConfirmation.locator('.confirmation-details p').allTextContents(), ['人脸 1:N 去重相似度阈值：60 → 70'])
  await confirm('保存')
  await page.getByText('配置待确认', { exact: true }).waitFor()
  assert.ok(await button('保存修改').isDisabled()); assert.ok(await button('填入默认值').isDisabled())
  await go('/logs'); await go('/threshold')
  assert.ok(await page.locator('.threshold-field input').first().isEnabled())
  await go('/logs')
  await page.evaluate(async () => { (await import('/src/api/index.js')).default.getThresholds = async () => { throw new Error('模拟首次读取失败') } })
  await go('/threshold')
  await page.getByText(/读取失败，请刷新页面重试/).waitFor()
  assert.ok(await page.locator('.threshold-field input').first().isDisabled())
  assert.ok(await button('保存修改').isDisabled())
  await go('/logs')
  await page.evaluate(async () => { (await import('/src/api/index.js')).default.getThresholds = window.originalRead })
  pass('threshold read/readback failures lock editing; successful authoritative reading restores controls')

  for (const width of [1366, 1920, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 })
    for (const path of ['/monitor', '/accounts', '/logs', '/audits', '/threshold']) {
      await go(path)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path}: overflow at ${width}`)
      await page.screenshot({ path: `${out}/${path.slice(1)}-${width}.png`, fullPage: true })
    }
    pass(`all five pages fit ${width}px and screenshots saved`)
  }
  assert.deepEqual(errors, []); assert.deepEqual(backendRequests, [])
  pass('zero browser errors and zero real-backend requests')
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ checks, errors, backendRequests }, null, 2))
  console.log(`COMPLETE ${checks.length} checks`)
} catch (e) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true })
  console.error(e); process.exitCode = 1
} finally { await browser.close() }
