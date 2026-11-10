import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
assert.match(await (await fetch(`${base}/src/api/index.js`)).text(), /"VITE_USE_MOCK": "true"/)
const out = process.env.ABIS_QA_OUTPUT_DIR || './qa-output/applicants'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' })
page.setDefaultTimeout(10000)
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
const go = async path => { await page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path); await page.waitForURL(`**${path}`); await loaded() }
const login = async (user, password) => {
  await page.locator('.login-content input').nth(0).fill(user)
  await page.locator('.login-content input').nth(1).fill(password)
  await button('登录').click(); await page.waitForURL('**/monitor'); await loaded()
}
const search = async () => { await button('查询').click(); await loaded() }
const reset = async () => { await button('重置').click(); await loaded() }
const applicantId = () => page.getByPlaceholder('输入完整申请人 ID', { exact: true })
const drawer = page.getByRole('dialog', { name: '申请人详情', exact: true })
try {
  await page.goto(`${base}/login`); await login('admin', 'admin123')
  const menu = page.locator('.primary-navigation > .el-menu > .el-menu-item')
  assert.deepEqual((await menu.allTextContents()).map(s => s.trim()), ['服务状态监控', '申请人列表', '日志查询', '审计查询'])
  await page.getByRole('menuitem', { name: '申请人列表', exact: true }).click(); await page.waitForURL('**/applicants'); await loaded()
  assert.equal(await page.locator('.breadcrumb').count(), 0)
  assert.equal(await page.locator('.settings-trigger.is-active').count(), 0)
  assert.equal(await page.locator('.el-table__row').count(), 20)
  assert.match(await page.locator('.record-count').innerText(), /68/)
  pass('applicant list is a top-level sibling of monitoring/logs, with unique people and pagination')

  await page.locator('.el-pager .number').filter({ hasText: /^2$/ }).click(); await loaded()
  assert.equal(await page.locator('.applicant-id').first().innerText(), '00000021')
  await applicantId().fill(' 00000001 '); await applicantId().press('Enter'); await loaded()
  assert.equal(await page.locator('.el-table__row').count(), 1)
  assert.equal(await page.locator('.applicant-id').first().innerText(), '00000001')
  assert.equal((await page.locator('.el-pager .is-active').innerText()).trim(), '1')
  await button('查看详情').click(); await drawer.waitFor(); await loaded()
  assert.match(await drawer.innerText(), /00000001/)
  assert.equal(await drawer.locator('.el-table__row').count(), 11)
  assert.ok(await drawer.getByText('FACE-00000001-1', { exact: true }).isVisible())
  await drawer.getByRole('button', { name: '查看该申请人日志', exact: true }).click(); await page.waitForURL('**/logs?userId=00000001'); await loaded()
  assert.equal(await applicantId().inputValue(), '00000001')
  assert.match(await page.locator('.record-count').innerText(), /47/)
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push({ name: 'logs', query: { userId: '00000002' } }))
  await loaded(); assert.equal(await applicantId().inputValue(), '00000002')
  assert.ok((await page.locator('.el-table__row td:first-child .log-id').allTextContents()).every(id => id === '00000002'))
  pass('exact IDs preserve zeros, new query resets pages, detail lists records and log links auto-query selected people')

  await go('/applicants'); await applicantId().fill('00000068'); await search()
  assert.equal(await page.locator('.el-table__row').count(), 1)
  await button('查看日志').click(); await page.waitForURL('**/logs?userId=00000068'); await loaded()
  await page.getByText('暂无匹配记录', { exact: true }).waitFor()
  await go('/applicants')
  await page.locator('.applicant-filters .el-select').click()
  await page.getByRole('option', { name: '人脸和指纹', exact: true }).click(); await search()
  assert.match(await page.locator('.record-count').innerText(), /23/)
  const modalityRows = await page.locator('.el-table__row').allTextContents()
  assert.ok(modalityRows.every(row => !row.includes('未入库')))
  await applicantId().fill('00000002'); await search(); await page.getByText('暂无匹配的申请人', { exact: true }).waitFor()
  await reset(); assert.equal(await applicantId().inputValue(), '')
  assert.match(await page.locator('.record-count').innerText(), /68/)
  const boundary = await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    const sample = (await api.listApplicants({ userId: '00000001' })).items[0]
    return api.listApplicants({ startTime: sample.enrolledAt, endTime: sample.enrolledAt })
  })
  assert.equal(boundary.total, 1)
  pass('current population is independent of logs; modality/ID filters intersect, reset works and enrollment boundaries are inclusive')

  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    window.originalApplicants = api.listApplicants
    window.originalApplicantDetail = api.getApplicant
    window.personSample = (await api.listApplicants({ page: 1, pageSize: 20 })).items[0]
    window.personRequests = []
    api.listApplicants = query => new Promise((resolve, reject) => window.personRequests.push({ query: { ...query }, resolve, reject }))
  })
  await button('查询').click(); await button('查询').click()
  await page.evaluate(() => window.personRequests[1].resolve({ total: 1, items: [window.personSample] })); await loaded()
  await page.evaluate(() => window.personRequests[0].resolve({ total: 0, items: [] }))
  assert.equal(await page.locator('.el-table__row').count(), 1)
  await button('查询').click()
  await page.evaluate(() => window.personRequests[2].reject(new Error('模拟人员查询失败')))
  await loaded(); await page.getByText('查询失败，请重试', { exact: true }).waitFor()
  assert.equal(await page.locator('.el-table__row').count(), 0)
  await page.evaluate(async () => { (await import('/src/api/index.js')).default.listApplicants = window.originalApplicants })
  await reset()
  pass('older list responses cannot overwrite newer results; failures clear prior rows and recover on retry')

  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    api.getApplicant = async () => { throw new Error('模拟详情读取失败') }
  })
  await button('查看详情').first().click(); await loaded()
  await drawer.getByText('模拟详情读取失败', { exact: true }).waitFor()
  assert.equal(await drawer.getByRole('button', { name: '查看该申请人日志', exact: true }).count(), 0)
  await page.evaluate(async () => { (await import('/src/api/index.js')).default.getApplicant = window.originalApplicantDetail })
  await drawer.getByRole('button', { name: '重新读取', exact: true }).click(); await loaded()
  assert.equal(await drawer.locator('.el-table__row').count(), 11)
  await drawer.getByRole('button', { name: '关闭', exact: true }).click(); await drawer.waitFor({ state: 'hidden' })
  await page.evaluate(async () => {
    window.personDetails = []
    const api = (await import('/src/api/index.js')).default
    api.getApplicant = id => new Promise(resolve => window.personDetails.push({ id, resolve }))
  })
  await button('查看详情').first().click(); await drawer.waitFor()
  await drawer.getByRole('button', { name: '关闭', exact: true }).click(); await drawer.waitFor({ state: 'hidden' })
  await button('查看详情').nth(1).click()
  await page.evaluate(async () => window.personDetails[1].resolve(await window.originalApplicantDetail(window.personDetails[1].id))); await loaded()
  await page.evaluate(async () => window.personDetails[0].resolve(await window.originalApplicantDetail(window.personDetails[0].id)))
  assert.ok(await drawer.getByText('00000002', { exact: true }).isVisible())
  assert.equal(await drawer.getByText('00000001', { exact: true }).count(), 0)
  await drawer.getByRole('button', { name: '关闭', exact: true }).click(); await drawer.waitFor({ state: 'hidden' })
  await page.evaluate(async () => { (await import('/src/api/index.js')).default.getApplicant = window.originalApplicantDetail })
  pass('detail errors support retry, and closing/switching people rejects stale detail results')

  for (const width of [1920, 1600, 1401, 1400, 1366, 1251, 1201, 1200, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page overflow at ${width}`)
    if ([1920, 1366, 390].includes(width)) {
      await page.screenshot({ path: `${out}/applicants-${width}.png`, fullPage: true })
      await button('查看详情').first().click(); await loaded()
      const rect = await drawer.boundingBox(); assert.ok(rect.x >= -1 && rect.x + rect.width <= width + 1)
      await page.screenshot({ path: `${out}/detail-${width}.png`, fullPage: true })
      await drawer.getByRole('button', { name: '关闭', exact: true }).click(); await drawer.waitFor({ state: 'hidden' })
    }
  }
  pass('list and drawer fit 320–1920px; desktop and mobile screenshots saved')

  await page.setViewportSize({ width: 1366, height: 900 })
  await button('账户菜单').click(); await page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '确定', exact: true }).click(); await page.waitForURL('**/login')
  await login('ops.zhang', 'ops123'); await go('/applicants')
  assert.equal(await page.locator('.el-table__row').count(), 20)
  assert.equal(await page.getByRole('button', { name: '新建账户', exact: true }).count(), 0)
  pass('operator can use the same top-level applicant page without account-management privileges')
  assert.deepEqual(errors, []); assert.deepEqual(backendRequests, [])
  pass('zero browser errors and zero real-backend requests')
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ checks, errors, backendRequests }, null, 2))
  console.log(`COMPLETE ${checks.length} checks`)
} catch (e) { await page.screenshot({ path: `${out}/failure.png`, fullPage: true }); console.error(e); process.exitCode = 1 }
finally { await browser.close() }
