import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
const out = process.env.ABIS_QA_OUTPUT_DIR || './qa-output/profile'
const source = await (await fetch(`${base}/src/api/index.js`)).text()
assert.match(source, /"VITE_USE_MOCK": "true"/)
assert.doesNotMatch(source, /createHybrid/)
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN', reducedMotion: 'reduce' })
page.setDefaultTimeout(10000)
const checks = [], errors = [], backendRequests = []
const pass = label => { checks.push(label); console.log('PASS', label) }
page.on('pageerror', e => errors.push(e.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('request', request => {
  const url = new URL(request.url())
  if (['fetch', 'xhr'].includes(request.resourceType()) && (url.origin !== base || /^\/(admin-api|abis-admin)(\/|$)/.test(url.pathname))) backendRequests.push(request.url())
})
const login = async (username, password) => {
  await page.locator('.login-content input').nth(0).fill(username)
  await page.locator('.login-content input').nth(1).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/monitor')
  await page.locator('.el-loading-mask').waitFor({ state: 'hidden' })
}
const trigger = page.getByRole('button', { name: /账户菜单：/ })
const dialog = page.getByRole('dialog', { name: '个人信息', exact: true })
const openProfile = async () => {
  await trigger.click()
  await page.getByRole('menuitem', { name: '个人信息', exact: true }).click()
  await dialog.waitFor()
}
const closeProfile = async () => {
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
}
const fillPassword = async (oldPassword, newPassword, confirmation = newPassword) => {
  await dialog.getByPlaceholder('请输入原密码', { exact: true }).fill(oldPassword)
  await dialog.getByPlaceholder('请输入新密码', { exact: true }).fill(newPassword)
  await dialog.getByPlaceholder('请再次输入新密码', { exact: true }).fill(confirmation)
}
const save = () => dialog.getByRole('button', { name: '保存新密码', exact: true })
const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))

try {
  await page.goto(`${base}/login`)
  await page.getByRole('heading', { name: '欢迎登录' }).waitFor()
  assert.equal(await page.locator('.login-backdrop .biometric-network').count(), 1)
  for (const width of [1600, 1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    const bounds = await page.locator('.login-content').boundingBox()
    assert.ok(Math.abs(bounds.x + bounds.width / 2 - width / 2) < 1)
    await noOverflow()
  }
  pass('new login artwork preserves centered form and no overflow from 320px to 1600px')
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.screenshot({ path: `${out}/01-login.png`, fullPage: true })

  assert.match(await page.evaluate(async () => {
    try { await (await import('/src/api/index.js')).default.changePassword({ oldPassword: 'admin123', newPassword: 'unused' }) }
    catch (e) { return e.message }
  }), /登录状态已失效/)
  pass('password change requires a current authenticated Mock session')
  await login('admin', 'admin123')
  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    const original = api.changePassword
    window.passwordCalls = []
    api.changePassword = async payload => {
      window.passwordCalls.push(Object.keys(payload).sort())
      return original(payload)
    }
  })
  assert.equal(await page.locator('.user').getByRole('button', { name: '退出登录', exact: true }).count(), 0)
  await trigger.focus()
  await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: '个人信息', exact: true }).waitFor()
  assert.deepEqual((await page.locator('.account-menu .el-dropdown-menu__item').allTextContents()).map(text => text.trim()), ['个人信息', '退出登录'])
  pass('keyboard-accessible account menu has exactly two entries and no separate logout button')
  await page.screenshot({ path: `${out}/02-account-menu.png`, fullPage: true })
  await page.getByRole('menuitem', { name: '个人信息', exact: true }).click()
  await dialog.waitFor()
  assert.deepEqual(await dialog.locator('.profile-details dd').allTextContents(), ['1', 'admin', '管理员'])
  assert.equal(await dialog.locator('input[type="password"]').count(), 3)
  pass('personal information is read-only and all three password fields are masked')
  await page.screenshot({ path: `${out}/03-profile.png`, fullPage: true })

  await save().click()
  await dialog.locator('.el-form-item__error').first().waitFor()
  assert.equal(await dialog.locator('.el-form-item__error').count(), 3)
  assert.equal(await page.evaluate(() => window.passwordCalls.length), 0)
  pass('empty password form is rejected without an API call')
  await fillPassword('admin123', 'abis-preview-next', 'different')
  await save().click()
  await dialog.getByText('两次输入的新密码不一致', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.passwordCalls.length), 0)
  pass('mismatched confirmation is rejected without an API call')
  await fillPassword('wrong-password', 'abis-preview-next')
  await save().click()
  await dialog.getByText('原密码不正确', { exact: true }).waitFor()
  assert.ok(await dialog.isVisible())
  assert.equal(await page.evaluate(() => window.passwordCalls.length), 1)
  pass('wrong current password stays in the dialog and reports an actionable error')

  await closeProfile()
  await openProfile()
  assert.deepEqual(await dialog.locator('input').evaluateAll(inputs => inputs.map(input => input.value)), ['', '', ''])
  assert.equal(await dialog.locator('.el-alert').count(), 0)
  pass('closing and reopening clears password values, validation and server errors')

  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await noOverflow()
    const bounds = await dialog.boundingBox()
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1)
    const button = save()
    await button.scrollIntoViewIfNeeded()
    assert.ok(await button.isVisible())
    if (width === 390) await page.screenshot({ path: `${out}/04-profile-mobile.png`, fullPage: true })
  }
  pass('profile dialog fits 320px/390px/768px viewports with reachable actions')
  await closeProfile()
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '取消', exact: true }).click()
  await page.locator('.el-message-box').waitFor({ state: 'hidden' })
  assert.match(page.url(), /monitor$/)
  pass('mobile account trigger stays accessible and cancelled logout preserves the session')

  await page.setViewportSize({ width: 1600, height: 1000 })
  await openProfile()
  await fillPassword('admin123', 'abis-preview-next')
  const before = await page.evaluate(() => window.passwordCalls.length)
  await save().evaluate(button => { button.click(); button.click() })
  await page.waitForURL('**/login')
  assert.equal(await page.evaluate(() => window.passwordCalls.length), before + 1)
  assert.deepEqual(await page.evaluate(() => window.passwordCalls.at(-1)), ['newPassword', 'oldPassword'])
  assert.ok(await page.evaluate(() => !JSON.stringify({ ...localStorage, ...sessionStorage }).includes('abis-preview-next')))
  pass('successful password change submits once, sends only old/new password, clears local auth and returns to login')
  await page.locator('.login-content input').nth(0).fill('admin')
  await page.locator('.login-content input').nth(1).fill('admin123')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByText('用户名或密码错误', { exact: true }).waitFor()
  assert.match(page.url(), /login/)
  await login('admin', 'abis-preview-next')
  pass('old password stops working and the new password authenticates the same account')

  await trigger.click()
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '确定', exact: true }).click()
  await page.waitForURL('**/login')
  await login('ops.zhang', 'ops123')
  assert.equal(await page.getByRole('button', { name: '设置', exact: true }).count(), 0)
  await openProfile()
  assert.deepEqual(await dialog.locator('.profile-details dd').allTextContents(), ['2', 'ops.zhang', '运维员'])
  await fillPassword('ops123', 'ops-preview-next')
  await save().click()
  await page.waitForURL('**/login')
  await login('ops.zhang', 'ops-preview-next')
  assert.equal(await page.getByRole('button', { name: '设置', exact: true }).count(), 0)
  pass('operator can change own password without gaining Settings or account-management access')

  await page.reload()
  await page.waitForURL(url => url.pathname === '/login')
  await login('admin', 'admin123')
  pass('reloading resets only Mock credentials to documented demo accounts')
  assert.deepEqual(errors, [])
  assert.deepEqual(backendRequests, [])
  pass('zero browser errors and zero real-backend requests')
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ checks, errors, backendRequests }, null, 2))
  console.log(`COMPLETE ${checks.length} checks`)
} catch (e) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true })
  await fs.writeFile(`${out}/failure.txt`, `${e.stack}\n${JSON.stringify(errors)}`)
  console.error(e)
  process.exitCode = 1
} finally { await browser.close() }
