import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
const out = process.env.ABIS_QA_OUTPUT_DIR || fileURLToPath(new URL('./qa-output/time-sorts-20261116/', import.meta.url))
await fs.mkdir(out, { recursive: true }); await fs.rm(`${out}/failure.png`, { force: true })
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
page.setDefaultTimeout(10000)
const checks = [], geometry = [], errors = [], backendRequests = []
let failure = null
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('request', request => { const url = new URL(request.url()); if (['fetch','xhr'].includes(request.resourceType()) && (url.origin !== base || /^\/(abis-admin|admin-api)(\/|$)/.test(url.pathname))) backendRequests.push(request.url()) })
const pass = text => { checks.push(text); console.log('PASS', text) }
const button = name => page.getByRole('button', { name, exact: true })
const loaded = () => page.waitForFunction(() => !document.querySelector('.el-loading-mask,.el-button.is-loading'))
const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const settle = async () => { await loaded(); await paint() }
const table = () => page.locator('.workspace-main > div > .el-card > .el-card__body > .el-table')
const header = label => table().locator('th').filter({ has: page.locator('.cell').filter({ hasText: new RegExp(`^${label}$`) }) })
const arrow = (label, order) => header(label).locator(`.sort-caret.${order}`)
const rowValues = index => table().locator('.el-table__row').evaluateAll((nodes, index) => nodes.map(row => row.querySelectorAll('td')[index].innerText.trim()), index)
const logIds = () => rowValues(0)
const auditTimes = () => rowValues(0)
const total = async () => Number((await page.locator('.el-pagination__total').innerText()).match(/\d+/)[0])
const activePage = () => page.locator('.el-pager .is-active').innerText()
async function go(path) { await page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path); await page.waitForURL(url => url.pathname === path); await settle() }
async function reset() { await button('重置').click(); await settle() }
async function pageNumber(number) { await page.locator('.el-pager .number').filter({ hasText: new RegExp(`^${number}$`) }).click(); await settle() }
async function pageSize(label) { await page.locator('.el-pagination__sizes .el-select').click(); await page.getByRole('option', { name: label, exact: true }).click(); await settle() }
async function selectField(label, option) { const field = page.locator('.audits-filters .el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: new RegExp(`^${label}$`) }) }); await field.locator('.el-select').click(); await page.getByRole('option', { name: option, exact: true }).click(); await paint() }
async function direction(label, order) { await arrow(label, order).click(); await settle(); assert.equal(await header(label).getAttribute('aria-sort'), order) }
async function nativeGeometry(label, name) {
  const cell = header(label); assert.equal(await cell.locator('.caret-wrapper').count(), 1); assert.equal(await cell.locator('.sort-caret.ascending,.sort-caret.descending').count(), 2)
  assert.equal((await cell.innerText()).trim(), label)
  assert.equal(await table().locator('.time-sort-header,.time-sort-arrow,.sort-direction').count(), 0)
  const result = await cell.locator('.caret-wrapper').evaluate(node => {
    const cs = getComputedStyle(node), box = node.getBoundingClientRect()
    return { width: box.width, height: box.height, display: cs.display, background: cs.backgroundColor, border: cs.borderWidth, arrows: [...node.querySelectorAll('.sort-caret')].map(arrow => { const style = getComputedStyle(arrow); return { width: style.width, height: style.height, top: style.top, bottom: style.bottom, left: style.left, borderTop: style.borderTopWidth, borderBottom: style.borderBottomWidth, borderLeft: style.borderLeftWidth, borderRight: style.borderRightWidth } }) }
  })
  geometry.push({ page: name, label, ...result }); return result
}
async function csvRows() {
  const pending = page.waitForEvent('download'); await button('导出 CSV').click(); const text = await fs.readFile(await (await pending).path(), 'utf8')
  const result = []; let row = [], field = '', quoted = false
  for (let index = 0; index < text.length; index++) { const char = text[index]; if (char === '"') { if (quoted && text[index + 1] === '"') { field += '"'; index++ } else quoted = !quoted } else if (char === ',' && !quoted) { row.push(field); field = '' } else if (char === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); result.push(row); row = []; field = '' } else field += char }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); result.push(row) }
  return result
}
const auditRows = (rows, key = 'operatedAt') => rows.map(row => row[key])

try {
  await page.goto(`${base}/login`); await page.getByLabel('用户名', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill('admin123'); await button('登录').click(); await page.waitForURL('**/monitor'); await settle()
  await go('/applicants')
  const applicantNative = await nativeGeometry('首次注册', 'applicants'), applicantUpdated = await nativeGeometry('更新时间', 'applicants'); assert.deepEqual(applicantUpdated, applicantNative)
  for (const [label, prop] of [['首次注册', 'enrolledAt'], ['更新时间', 'updatedAt']]) {
    for (const order of ['ascending', 'descending']) {
      await direction(label, order)
      const expected = await page.evaluate(async ({ prop, order }) => (await (await import('/src/api/index.js')).default.listApplicants({ pageSize: 100, sortBy: prop, sortOrder: order })).items.map(row => row.userId), { prop, order })
      assert.deepEqual(await rowValues(0), expected)
    }
  }
  await page.screenshot({ path: `${out}/applicant-native-sorts-1280.png` })
  pass('applicant registration/update controls retain native caret geometry and both time fields still sort their complete records')

  await go('/logs'); assert.equal(await total(), 45); assert.deepEqual(await nativeGeometry('接收时间', 'logs'), applicantNative); assert.equal(await header('接收时间').getAttribute('aria-sort'), 'descending')
  const logs = await page.evaluate(async () => { const api = (await import('/src/api/index.js')).default; return { descending: (await api.listLogs({ pageSize: 100 })).items.map(row => row.requestId), ascending: (await api.listLogs({ pageSize: 100, sortOrder: 'ascending' })).items.map(row => row.requestId) } })
  assert.deepEqual(await logIds(), logs.descending.slice(0, 20))
  await header('接收时间').locator('.cell').click({ position: { x: 20, y: 12 } }); await settle(); assert.deepEqual(await logIds(), logs.ascending.slice(0, 20))
  await header('接收时间').locator('.caret-wrapper').focus(); await page.keyboard.press('Enter'); await settle(); assert.deepEqual(await logIds(), logs.descending.slice(0, 20)); await page.keyboard.press('Space'); await settle(); assert.deepEqual(await logIds(), logs.ascending.slice(0, 20))
  await page.evaluate(async () => { const api = (await import('/src/api/index.js')).default; window.timeSortOriginalLogs = api.listLogs; window.timeSortLogCalls = []; api.listLogs = async params => { window.timeSortLogCalls.push({ ...params }); return window.timeSortOriginalLogs(params) } })
  for (const order of ['descending', 'ascending']) { await direction('接收时间', order); const calls = await page.evaluate(() => window.timeSortLogCalls.length), before = await logIds(); await direction('接收时间', order); assert.equal(await page.evaluate(() => window.timeSortLogCalls.length), calls); assert.deepEqual(await logIds(), before) }
  await pageSize('10 条/页'); await pageNumber(2); assert.deepEqual(await logIds(), logs.ascending.slice(10, 20)); await direction('接收时间', 'descending'); assert.equal(await activePage(), '1'); assert.deepEqual(await logIds(), logs.descending.slice(0, 10)); await reset(); assert.equal(await header('接收时间').getAttribute('aria-sort'), 'descending'); assert.equal(await activePage(), '1'); assert.equal(await total(), 45)
  await page.screenshot({ path: `${out}/log-native-sort-1280.png` })
  pass('log receipt uses the applicant native symbol, with newest-first default, label/Enter/Space, explicit/repeated arrows and sorting-before-paging/reset intact')

  await go('/audits'); assert.equal(await total(), 64); assert.deepEqual(await nativeGeometry('时间', 'audits'), applicantNative); assert.equal(await header('时间').getAttribute('aria-sort'), 'descending')
  const audits = await page.evaluate(async () => { const api = (await import('/src/api/index.js')).default; return { descending: (await api.listAudits({ pageSize: 100, sortBy: 'operatedAt', sortOrder: 'descending' })).items, ascending: (await api.listAudits({ pageSize: 100, sortBy: 'operatedAt', sortOrder: 'ascending' })).items } })
  assert.equal(audits.descending.length, 64); const ascendingTimes = auditRows(audits.ascending); assert.ok(ascendingTimes.every((value, index) => index === 0 || value >= ascendingTimes[index - 1])); assert.deepEqual(auditRows(audits.descending), [...ascendingTimes].reverse()); assert.deepEqual(await auditTimes(), auditRows(audits.descending.slice(0, 20)))
  await pageNumber(2); assert.deepEqual(await auditTimes(), auditRows(audits.descending.slice(20, 40))); await header('时间').locator('.cell').click({ position: { x: 16, y: 12 } }); await settle(); assert.equal(await activePage(), '1'); assert.deepEqual(await auditTimes(), auditRows(audits.ascending.slice(0, 20)))
  await header('时间').locator('.caret-wrapper').focus(); await page.keyboard.press('Enter'); await settle(); assert.deepEqual(await auditTimes(), auditRows(audits.descending.slice(0, 20))); await page.keyboard.press('Space'); await settle(); assert.deepEqual(await auditTimes(), auditRows(audits.ascending.slice(0, 20)))
  await page.evaluate(async () => { const api = (await import('/src/api/index.js')).default; window.timeSortOriginalAudits = api.listAudits; window.timeSortAuditCalls = []; api.listAudits = async params => { window.timeSortAuditCalls.push({ ...params }); if (window.timeSortRejectAudit) { window.timeSortRejectAudit = false; throw new Error('审计排序读取失败，请重试') } return window.timeSortOriginalAudits(params) } })
  await pageNumber(2); const calls = await page.evaluate(() => window.timeSortAuditCalls.length); await direction('时间', 'ascending'); assert.equal(await activePage(), '2'); assert.equal(await page.evaluate(() => window.timeSortAuditCalls.length), calls); assert.deepEqual(await auditTimes(), auditRows(audits.ascending.slice(20, 40)))
  await pageSize('50 条/页'); assert.equal(await activePage(), '1'); assert.deepEqual(await auditTimes(), auditRows(audits.ascending.slice(0, 50))); await pageNumber(2); assert.deepEqual(await auditTimes(), auditRows(audits.ascending.slice(50))); await direction('时间', 'descending'); assert.equal(await activePage(), '1'); assert.deepEqual(await auditTimes(), auditRows(audits.descending.slice(0, 50)))
  pass('audit time gains the same native symbol and keyboard controls; all 64 matches sort before pagination, repeated arrows retain direction/page, and page-size changes retain ordering')

  await reset(); await pageSize('20 条/页'); await page.getByPlaceholder('输入完整账号', { exact: true }).fill('admin'); await selectField('结果', '成功'); await button('查询').click(); await settle()
  const filtered = await page.evaluate(async () => { const api = (await import('/src/api/index.js')).default; return { descending: (await api.listAudits({ operator: 'admin', result: '成功', pageSize: 100, sortOrder: 'descending' })).items, ascending: (await api.listAudits({ operator: 'admin', result: '成功', pageSize: 100, sortOrder: 'ascending' })).items } }); assert.ok(filtered.ascending.length > 20); assert.equal(await total(), filtered.ascending.length); assert.deepEqual(await auditTimes(), auditRows(filtered.descending.slice(0, 20)))
  await page.getByPlaceholder('输入完整账号', { exact: true }).fill('ops.zhang'); await direction('时间', 'ascending'); assert.equal(await page.getByPlaceholder('输入完整账号', { exact: true }).inputValue(), 'ops.zhang'); assert.deepEqual(await auditTimes(), auditRows(filtered.ascending.slice(0, 20))); const applied = await page.evaluate(() => window.timeSortAuditCalls.at(-1)); assert.equal(applied.operator, 'admin'); assert.equal(applied.result, '成功')
  const csv = await csvRows(); assert.equal(csv.length, filtered.ascending.length + 1); assert.deepEqual(csv.slice(1).map(row => row[0]), auditRows(filtered.ascending)); assert.ok(csv.slice(1).every(row => row[1] === 'admin' && row[7] === '成功'))
  await pageNumber(2); assert.deepEqual(await auditTimes(), auditRows(filtered.ascending.slice(20))); const beforeFailure = await auditTimes(), beforeTotal = await total(); await page.evaluate(() => { window.timeSortRejectAudit = true }); await arrow('时间', 'descending').click(); await settle(); assert.deepEqual(await auditTimes(), beforeFailure); assert.equal(await total(), beforeTotal); assert.equal(await activePage(), '2'); assert.equal(await header('时间').getAttribute('aria-sort'), 'ascending'); await page.getByRole('alert').filter({ hasText: '审计排序读取失败，请重试' }).waitFor()
  const failedCsv = await csvRows(); assert.deepEqual(failedCsv.slice(1).map(row => row[0]), auditRows(filtered.ascending))
  pass('audit sorting and CSV use the last applied filters rather than drafts; a failed sort retains rows, totals, page, actual direction and export snapshot')

  await reset(); assert.equal(await page.getByPlaceholder('输入完整账号', { exact: true }).inputValue(), ''); assert.equal(await total(), 64); assert.equal(await activePage(), '1'); assert.equal(await header('时间').getAttribute('aria-sort'), 'descending'); assert.deepEqual(await auditTimes(), auditRows(audits.descending.slice(0, 20)))
  const firstTime = (await auditTimes())[0]; await table().locator('.el-table__row').first().getByRole('button', { name: '详情', exact: true }).click(); const detail = page.getByRole('dialog', { name: '审计记录详情', exact: true }); await detail.waitFor(); assert.match(await detail.innerText(), new RegExp(firstTime)); await detail.locator('.el-dialog__headerbtn').click(); await detail.waitFor({ state: 'hidden' }); await page.waitForFunction(() => !document.querySelector('.el-message')); await page.screenshot({ path: `${out}/audit-native-sort-1280.png` })
  pass('audit reset restores newest-first defaults and audit detail remains available after sorting/filtering/failure recovery')
  assert.deepEqual(errors, []); assert.deepEqual(backendRequests, []); pass('zero browser errors and zero real-backend requests')
} catch (error) { failure = { message: error.message, stack: error.stack, url: page.url() }; console.error(error); process.exitCode = 1; await page.screenshot({ path: `${out}/failure.png` }).catch(() => {}) }
finally { await fs.writeFile(`${out}/report.json`, JSON.stringify({ base, checks, geometry, errors, backendRequests, failure }, null, 2)); await browser.close() }
console.log(`COMPLETE ${checks.length} checks`)
