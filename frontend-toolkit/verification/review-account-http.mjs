import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
assert.match(await (await fetch(`${base}/src/api/index.js`)).text(), /"VITE_USE_MOCK": "true"/)
const out = process.env.ABIS_QA_OUTPUT_DIR || './qa-output/account-http'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch()
const checks = [], environments = [], errors = [], backendRequests = []
const pass = label => { checks.push(label); console.log('PASS', label) }
let page
try {
  for (const disableUUID of [false, true]) {
    const mode = disableUUID ? 'UUID unavailable' : 'native browser'
    const context = await browser.newContext({ viewport: { width: 1422, height: 804 }, locale: 'zh-CN', reducedMotion: 'reduce' })
    if (disableUUID) await context.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }))
    page = await context.newPage(); page.setDefaultTimeout(10000)
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('request', request => {
      const url = new URL(request.url())
      if (['fetch', 'xhr'].includes(request.resourceType()) && (url.origin !== base || /^\/(admin-api|abis-admin)(\/|$)/.test(url.pathname))) backendRequests.push(request.url())
    })
    const button = name => page.getByRole('button', { name, exact: true })
    const loaded = () => page.waitForFunction(() => !document.querySelector('.el-loading-mask,.el-button.is-loading'))
    const field = (dialog, name) => dialog.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: new RegExp(`^${name}$`) }) }).locator('input,textarea')
    const confirm = () => page.locator('.el-message-box').getByRole('button', { name: '确定', exact: true }).click()
    async function checkLogin(username, password, oldPassword) {
      const result = await page.evaluate(async ({ username, password, oldPassword }) => {
        const api = (await import('/src/api/index.js')).default
        let previousRejected = oldPassword === undefined
        try {
          if (oldPassword !== undefined) {
            try { await api.login(username, oldPassword) }
            catch { previousRejected = true }
          }
          const result = await api.login(username, password)
          return { username: result.account.username, previousRejected }
        } finally { await api.login('admin', 'admin123') }
      }, { username, password, oldPassword })
      assert.deepEqual(result, { username, previousRejected: true })
    }
    async function reset(username) {
      await button(`更多：${username}`).click(); await page.getByRole('menuitem', { name: '重置密码', exact: true }).click(); await confirm()
      const result = page.getByRole('dialog', { name: '密码重置结果', exact: true }); await result.waitFor()
      const password = await result.getByLabel('账户密码', { exact: true }).inputValue()
      assert.match(password, /^Demo-\d+-[0-9a-f]{8}$/)
      await result.getByRole('button', { name: '关闭', exact: true }).click(); await result.waitFor({ state: 'hidden' }); await loaded()
      return password
    }
    await page.goto(`${base}/login`)
    const environment = await page.evaluate(() => ({ origin: location.origin, secureContext: isSecureContext, randomUUID: typeof crypto.randomUUID, getRandomValues: typeof crypto.getRandomValues }))
    environments.push({ mode, ...environment }); assert.equal(environment.getRandomValues, 'function')
    if (disableUUID || !environment.secureContext) assert.equal(environment.randomUUID, 'undefined')
    await page.locator('.login-content input').nth(0).fill('admin'); await page.locator('.login-content input').nth(1).fill('admin123')
    await button('登录').click(); await page.waitForURL('**/monitor'); await loaded()
    await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/accounts')); await page.waitForURL('**/accounts'); await loaded()
    const created = []
    for (const withContact of [false, true]) {
      const username = withContact ? 'qa.http.contact' : 'qa.http.empty'
      await button('新建账户').click()
      const form = page.getByRole('dialog', { name: '新建账户', exact: true })
      await field(form, '用户名').fill(username); await field(form, '姓名').fill(withContact ? '完整联系方式' : '选填全部留空')
      if (withContact) { await field(form, '电话').fill('13800138000'); await field(form, '邮箱').fill('contact@example.test') }
      await form.getByRole('button', { name: '确定', exact: true }).click(); await confirm()
      const result = page.getByRole('dialog', { name: '账户创建结果', exact: true }); await result.waitFor()
      const password = await result.getByLabel('账户密码', { exact: true }).inputValue()
      assert.match(password, /^Demo-\d+-[0-9a-f]{8}$/)
      assert.equal(await form.isVisible(), false)
      await result.getByRole('button', { name: '关闭', exact: true }).click(); await result.waitFor({ state: 'hidden' }); await loaded()
      const accounts = await page.evaluate(async username => (await (await import('/src/api/index.js')).default.listAccounts({ keyword: username })).items, username)
      assert.equal(accounts.length, 1); assert.equal(accounts[0].enabled, true)
      assert.deepEqual([accounts[0].phone, accounts[0].email, accounts[0].remark], withContact ? ['13800138000', 'contact@example.test', '-'] : ['-', '-', '-'])
      await checkLogin(username, password)
      created.push({ username, password, id: accounts[0].id })
      pass(`${mode}: ${withContact ? 'valid phone/email' : 'all optional fields empty'} creates exactly one enabled account and shows a usable initial password`)
    }
    const temporaryPassword = await reset(created[1].username)
    await checkLogin(created[1].username, temporaryPassword, created[1].password)
    pass(`${mode}: password reset shows a usable replacement and rejects the original password`)
    // ops.li 已存在且启用，但种子凭据中没有它；覆盖已建账户缺密码的恢复路径。
    await checkLogin('ops.li', await reset('ops.li'))
    pass(`${mode}: an existing enabled account without login credentials can recover through password reset`)
    const failure = await page.evaluate(async () => {
      const api = (await import('/src/api/index.js')).default
      const before = await api.listAccounts({ pageSize: 100 })
      const original = crypto.getRandomValues
      const payload = { username: 'qa.http.retry', displayName: '失败后原名重试', role: 'operator' }
      let error
      Object.defineProperty(crypto, 'getRandomValues', { configurable: true, writable: true, value: () => { throw new Error('模拟密码生成失败') } })
      try { await api.createAccount(payload) } catch (failure) { error = failure.message }
      finally { crypto.getRandomValues = original }
      const afterFailure = await api.listAccounts({ keyword: payload.username })
      const retried = await api.createAccount(payload)
      let duplicate
      try { await api.createAccount(payload) } catch (failure) { duplicate = failure.message }
      const afterRetry = await api.listAccounts({ keyword: payload.username })
      const login = await api.login(payload.username, retried.initialPassword)
      await api.login('admin', 'admin123')
      return { error, countAfterFailure: afterFailure.total, expectedId: Math.max(...before.items.map(row => row.id)) + 1, id: retried.id, countAfterRetry: afterRetry.total, duplicate, canLogin: login.account.username === payload.username }
    })
    assert.equal(failure.error, '模拟密码生成失败'); assert.equal(failure.countAfterFailure, 0)
    assert.equal(failure.id, failure.expectedId); assert.equal(failure.countAfterRetry, 1); assert.equal(failure.duplicate, '用户名已存在'); assert.equal(failure.canLogin, true)
    pass(`${mode}: password-generation failures leave no account or consumed ID, same-name retries succeed and real duplicates remain rejected`)
    const resetFailure = await page.evaluate(async ({ id, username, password }) => {
      const api = (await import('/src/api/index.js')).default, original = crypto.getRandomValues
      let error
      Object.defineProperty(crypto, 'getRandomValues', { configurable: true, writable: true, value: () => { throw new Error('模拟重置密码生成失败') } })
      try { await api.resetPassword(id) } catch (failure) { error = failure.message }
      finally { crypto.getRandomValues = original }
      const account = (await api.login(username, password)).account
      await api.login('admin', 'admin123')
      return { error, username: account.username }
    }, { ...created[1], password: temporaryPassword })
    assert.deepEqual(resetFailure, { error: '模拟重置密码生成失败', username: created[1].username })
    pass(`${mode}: a failed password reset preserves the currently working password`)
    await page.screenshot({ path: `${out}/${disableUUID ? 'without-uuid' : 'native'}-accounts.png` })
    await context.close()
  }
  assert.deepEqual(errors, []); assert.deepEqual(backendRequests, []); pass('zero browser errors and zero real-backend calls')
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ checks, environments, errors, backendRequests }, null, 2))
  console.log(`COMPLETE ${checks.length} checks`)
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${out}/failure.png` })
  console.error(error); process.exitCode = 1
} finally { await browser.close() }
