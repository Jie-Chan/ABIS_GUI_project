import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
assert.match(await (await fetch(`${base}/src/api/index.js`)).text(), /"VITE_USE_MOCK": "true"/)
const out = process.env.ABIS_QA_OUTPUT_DIR || './qa-output/log-ids'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: 'zh-CN', reducedMotion: 'reduce' })
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
const user = page.getByPlaceholder('输入完整申请人 ID', { exact: true })
const request = page.getByPlaceholder('输入完整业务请求 ID', { exact: true })
const search = async () => { await button('查询').click(); await loaded() }
const reset = async () => { await button('重置').click(); await loaded() }
const ids = column => page.locator(`.el-table__body .el-table__row td:nth-child(${column}) .log-id`).allTextContents()
try {
  await page.goto(`${base}/login`)
  await page.locator('.login-content input').nth(0).fill('admin')
  await page.locator('.login-content input').nth(1).fill('admin123')
  await button('登录').click(); await page.waitForURL('**/monitor'); await loaded()
  await page.getByRole('menuitem', { name: '日志查询', exact: true }).click(); await page.waitForURL('**/logs'); await loaded()
  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    window.originalLogs = api.listLogs; window.logQueries = []
    api.listLogs = async query => { window.logQueries.push({ ...query }); return window.originalLogs(query) }
  })
  assert.ok((await page.locator('.el-table__header th').allTextContents()).includes('用户 ID'))
  assert.ok((await page.locator('.el-table__header th').allTextContents()).includes('请求 ID'))
  await user.fill(' 00000001 '); await user.press('Enter'); await loaded()
  assert.ok((await ids(1)).every(value => value === '00000001'))
  assert.equal((await page.evaluate(() => window.logQueries.at(-1))).userId, '00000001')
  assert.equal(await page.evaluate(() => window.logQueries.length), 1)
  assert.match(await page.locator('.record-count').innerText(), /47/)
  pass('applicant ID trims pasted whitespace, preserves leading zeros and Enter searches all matching records')
  await page.locator('.el-pager .number').filter({ hasText: /^2$/ }).click(); await loaded()
  const secondPage = await page.evaluate(() => window.logQueries.at(-1))
  assert.equal(secondPage.page, 2); assert.equal(secondPage.userId, '00000001')
  assert.ok((await ids(1)).every(value => value === '00000001'))
  const download = page.waitForEvent('download'); await button('导出 CSV').click()
  const downloaded = await download
  await downloaded.saveAs(`${out}/applicant.csv`)
  const csv = await fs.readFile(`${out}/applicant.csv`, 'utf8')
  const lines = csv.trim().split(/\r?\n/)
  assert.match(lines[0], /用户 ID,请求 ID/)
  assert.equal(lines.length, 48) // header + all 47 matches, including other pages
  assert.ok(lines.slice(1).every(line => line.includes('"00000001"')))
  pass('pagination retains IDs and CSV includes both IDs plus every matching record beyond the current page')
  await request.fill('REQ-00000001'); await search()
  assert.equal((await page.evaluate(() => window.logQueries.at(-1))).page, 1)
  assert.deepEqual(await ids(1), ['00000001'])
  assert.deepEqual(await ids(2), ['REQ-00000001'])
  await button('详情').first().click()
  const detail = page.getByRole('dialog', { name: '请求详情', exact: true })
  assert.match(await detail.innerText(), /00000001/); assert.match(await detail.innerText(), /REQ-00000001/)
  await detail.getByRole('button', { name: '关闭', exact: true }).click(); await detail.waitFor({ state: 'hidden' })
  await user.fill('00000002'); await search()
  await page.getByText('暂无匹配记录', { exact: true }).waitFor()
  await user.fill(''); await search()
  assert.equal(await page.locator('.el-table__row').count(), 1)
  pass('IDs combine with AND, each logical request has one row, queries reset pages and details show both IDs')
  await request.fill('REQ-0000000'); await search()
  await page.getByText('暂无匹配记录', { exact: true }).waitFor()
  await request.fill('REQ-00000002'); await user.fill('00000001'); await search()
  await page.locator('.log-result-filter .el-select').click()
  await page.getByRole('option', { name: '失败', exact: true }).click(); await search()
  assert.equal(await page.locator('.el-table__row').count(), 1)
  pass('partial IDs do not match; ID filters combine with existing result filters')
  await reset()
  assert.equal(await user.inputValue(), ''); assert.equal(await request.inputValue(), '')
  assert.match(await page.locator('.record-count').innerText(), /360/)
  pass('reset clears both IDs and restores the full result set')
  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    const sample = (await window.originalLogs({ page: 1, pageSize: 20 })).items[0]
    api.listLogs = async () => ({ total: 1, items: [{ ...sample, userId: null, requestId: null }] })
  })
  await search(); assert.deepEqual(await ids(1), ['—']); assert.deepEqual(await ids(2), ['—'])
  await button('详情').click()
  const legacy = page.getByRole('dialog', { name: '请求详情', exact: true })
  assert.equal((await legacy.locator('.log-id').allTextContents()).join(','), '—,—')
  await legacy.getByRole('button', { name: '关闭', exact: true }).click(); await legacy.waitFor({ state: 'hidden' })
  pass('legacy records with missing IDs display placeholders in list and detail')
  await page.evaluate(async () => { (await import('/src/api/index.js')).default.listLogs = window.originalLogs })
  await reset()
  for (const width of [1920, 1366, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1080 })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page overflow at ${width}`)
    for (const input of [user, request]) {
      const bounds = await input.boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `ID field overflow at ${width}`)
    }
    if (width === 1366) assert.ok((await page.locator('.el-table').boundingBox()).y <= 430)
    if ([1920, 1366, 390].includes(width)) await page.screenshot({ path: `${out}/logs-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const applicantCell = page.locator('.el-table__body .el-table__row td').first()
  await applicantCell.scrollIntoViewIfNeeded()
  assert.ok(await applicantCell.evaluate(cell => {
    const rect = cell.getBoundingClientRect()
    return cell.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
  }))
  pass('ID filters fit 320–1920px viewports; desktop lookup remains near the top; screenshots saved')
  assert.deepEqual(errors, []); assert.deepEqual(backendRequests, [])
  pass('zero browser errors and zero real-backend requests')
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ checks, errors, backendRequests }, null, 2))
  console.log(`COMPLETE ${checks.length} checks`)
} catch (e) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true })
  console.error(e); process.exitCode = 1
} finally { await browser.close() }
