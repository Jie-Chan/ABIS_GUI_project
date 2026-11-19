import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { stubHostOverview } from './host-overview-fixture.mjs'

const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
const out = process.env.ABIS_QA_OUTPUT_DIR || fileURLToPath(new URL('./qa-output/ux-review-20261116/', import.meta.url))
await fs.mkdir(out, { recursive: true })
await fs.rm(`${out}/failure.png`, { force: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] })
const page = await context.newPage()
const overviewEndpoint = await stubHostOverview(page, base)
page.setDefaultTimeout(10000)
const checks = [], measurements = [], errors = [], backendRequests = [], sessions = []
let failure = null
function observe(p) {
  p.on('pageerror', e => errors.push(e.message))
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  p.on('request', request => { const url = new URL(request.url()); if (['fetch','xhr'].includes(request.resourceType()) && request.url() !== overviewEndpoint && (url.origin !== base || /^\/(abis-admin|admin-api)(\/|$)/.test(url.pathname))) backendRequests.push(request.url()) })
}
observe(page)
const pass = label => { checks.push(label); console.log('PASS', label) }
const button = name => page.getByRole('button', { name, exact: true })
const loaded = () => page.waitForFunction(() => {
  const views = { monitor: '.monitor-page', logs: '.logs-page', audits: '.audit-page', applicants: '.applicants-page', threshold: '.threshold-page', accounts: '.account-page', 'host-resources': '.host-resources' }
  const name = location.pathname.split('/').at(-1), selector = views[name], view = selector && document.querySelector(selector)
  if (selector && !view) return false
  // The UI intentionally has no background loading mask. Read the active View's
  // busy state as well, without a Promise predicate or a fixed-time delay.
  for (let component = view?.__vueParentComponent; component; component = component.parent) {
    if (!component.type.__file?.includes('/views/')) continue
    const state = component.setupState
    if (name === 'monitor' ? state.store?.loading : state.loading) return false
    break
  }
  return !document.querySelector('.el-loading-mask,.el-button.is-loading')
})
const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const shot = name => page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
const table = () => page.locator('.request-table')
const sortToggle = () => table().locator('th.is-sortable .caret-wrapper')
const sortArrow = order => table().locator(`th.is-sortable .sort-caret.${order}`)
const ids = () => table().locator('.el-table__row td:first-child .log-id').allTextContents()
const total = async () => Number((await page.locator('.el-pagination__total').innerText()).match(/\d+/)[0])
const log = page.getByRole('dialog', { name: '请求详情', exact: true })
const person = page.getByRole('dialog', { name: '申请人详情', exact: true })
const preview = page.getByRole('dialog', { name: '入库图像详情', exact: true })
const requestInput = () => page.locator('.log-request-filter input')
const applicantInput = () => page.locator('.log-user-filter input')
async function select(scope, label) { await scope.locator('.el-select').click(); await page.getByRole('option', { name: label, exact: true }).click(); await paint() }
async function go(path) {
  await page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path)
  await page.waitForURL(url => url.pathname === path.split('?')[0]); await loaded(); await paint()
}
async function reset() { await button('重置').click(); await loaded(); await paint() }
async function close(drawer) { await drawer.locator('.el-drawer__close-btn').click(); await drawer.waitFor({ state: 'hidden' }) }
async function queryRequest(id) { await reset(); await requestInput().fill(id); await button('查询').click(); await loaded(); await paint() }
async function openLog(id) { await table().locator('.el-table__row').filter({ hasText: id }).getByRole('button', { name: '详情', exact: true }).click(); await log.waitFor(); await page.waitForFunction(() => Math.abs(document.querySelector('.request-log-drawer').getBoundingClientRect().right - innerWidth) < 1); await paint() }
async function openPerson(id) { await page.locator('.applicants-page .el-table__row').filter({ hasText: id }).getByRole('button', { name: '查看详情', exact: true }).click(); await person.waitFor(); await loaded(); await page.waitForFunction(() => Math.abs(document.querySelector('.applicant-drawer').getBoundingClientRect().right - innerWidth) < 1); await paint() }
async function pageSize(label) { await page.locator('.el-pagination__sizes .el-select').click(); await page.getByRole('option', { name: label, exact: true }).click(); await loaded(); await paint() }
const assertSorted = (rows, order) => { const times = rows.map(r => Date.parse(r.receivedAt)); assert.ok(times.every((time, i) => i === 0 || (order === 'ascending' ? time >= times[i - 1] : time <= times[i - 1]))) }

try {
  await page.goto(`${base}/login`); await page.getByLabel('用户名', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill('admin123'); await button('登录').click(); await page.waitForURL('**/monitor'); await loaded(); await go('/logs')
  assert.equal(await total(), 45)
  assert.equal(await table().locator('th.descending').count(), 1)
  const all = await page.evaluate(async () => { const api = (await import('/src/api/index.js')).default; return { descending: (await api.listLogs({ pageSize: 100 })).items, ascending: (await api.listLogs({ pageSize: 100, sortOrder: 'ascending' })).items, second: (await api.listLogs({ page: 2, pageSize: 10, sortOrder: 'ascending' })).items } })
  assertSorted(all.descending, 'descending'); assertSorted(all.ascending, 'ascending'); assert.deepEqual(all.second.map(r => r.requestId), all.ascending.slice(10, 20).map(r => r.requestId))
  assert.deepEqual(await ids(), all.descending.slice(0, 20).map(row => row.requestId))
  pass('the full snapshot sorts before pagination and defaults to newest first')

  await table().locator('th.is-sortable').click({ position: { x: 20, y: 20 } }); await loaded(); assert.equal(await table().locator('th.ascending').count(), 1); assert.deepEqual(await ids(), all.ascending.slice(0, 20).map(r => r.requestId))
  await pageSize('10 条/页'); await page.locator('.el-pager .number').filter({ hasText: /^2$/ }).click(); await loaded(); assert.deepEqual(await ids(), all.second.map(r => r.requestId))
  await table().locator('th.is-sortable').click({ position: { x: 20, y: 20 } }); await loaded(); assert.equal(await page.locator('.el-pager .is-active').innerText(), '1'); assert.deepEqual(await ids(), all.descending.slice(0, 10).map(r => r.requestId))
  await reset(); await pageSize('20 条/页'); assert.equal(await total(), 45); assert.equal(await table().locator('th.descending').count(), 1)
  pass('time-header direction changes server ordering, returns to page one, and reset restores default ordering/query')

  await page.evaluate(async () => { const api = (await import('/src/api/index.js')).default; window.uxOriginalListLogs = api.listLogs; window.uxSortCalls = []; api.listLogs = async params => { window.uxSortCalls.push({ ...params }); if (window.uxRejectSort) { window.uxRejectSort = false; throw new Error('排序读取失败，请重试') } return window.uxOriginalListLogs(params) } })
  await button('重置').focus(); await page.keyboard.press('Tab'); assert.equal(await sortToggle().evaluate(n => n === document.activeElement), true)
  await page.keyboard.press('Enter'); await loaded(); assert.equal(await table().locator('th[aria-sort="ascending"]').count(), 1); assert.deepEqual(await ids(), all.ascending.slice(0, 20).map(r => r.requestId))
  await page.keyboard.press('Space'); await loaded(); assert.equal(await table().locator('th[aria-sort="descending"]').count(), 1); assert.deepEqual(await ids(), all.descending.slice(0, 20).map(r => r.requestId))
  for (const order of ['ascending', 'descending']) {
    await sortArrow(order).click(); await loaded(); await paint(); assert.equal(await table().locator('th.is-sortable').getAttribute('aria-sort'), order); assert.equal(await table().locator(`th[aria-sort="${order}"]`).count(), 1)
    const calls = await page.evaluate(() => window.uxSortCalls.length); const before = await ids(); await sortArrow(order).click(); await paint(); assert.equal(await page.evaluate(() => window.uxSortCalls.length), calls); assert.deepEqual(await ids(), before); assert.equal(await table().locator('th.is-sortable').getAttribute('aria-sort'), order)
  }
  await pageSize('10 条/页'); await page.locator('.el-pager .number').filter({ hasText: /^2$/ }).click(); await loaded(); await sortArrow('descending').click(); await paint(); assert.equal(await page.locator('.el-pager .is-active').innerText(), '2'); await sortArrow('ascending').click(); await loaded(); assert.equal(await page.locator('.el-pager .is-active').innerText(), '1')
  await reset(); const beforeRejectedSort = await ids(); await page.evaluate(() => { window.uxRejectSort = true }); await sortArrow('ascending').click(); await loaded(); await paint(); assert.deepEqual(await ids(), beforeRejectedSort); assert.equal(await table().locator('th.is-sortable').getAttribute('aria-sort'), 'descending'); assert.equal(await table().locator('th[aria-sort="descending"]').count(), 1); await page.getByRole('alert').filter({ hasText: '排序读取失败，请重试' }).waitFor(); await reset()
  pass('Tab/Enter/Space toggle the labeled sort control; arrows select explicit directions idempotently, paging changes only with direction, and failed sorting retains actual header state')

  for (const [width, height] of [[1440, 900], [1280, 720]]) {
    await page.setViewportSize({ width, height }); await paint()
    const geometry = await page.locator('.logs-filters').evaluate(form => {
      const field = key => { const node = form.querySelector(key), label = node.querySelector('.el-form-item__label'), control = node.querySelector('.el-input__wrapper,.el-select__wrapper,.el-date-editor'); return { label: label.getBoundingClientRect().toJSON(), control: control.getBoundingClientRect().toJSON() } }
      return { fields: ['.log-request-filter','.log-user-filter','.log-time-filter','.log-api-filter','.log-feature-filter','.log-result-filter'].map(field), actions: form.querySelector('.log-actions').getBoundingClientRect().toJSON(), right: form.getBoundingClientRect().right }
    })
    for (let i = 0; i < 3; i++) { assert.ok(Math.abs(geometry.fields[i].label.x - geometry.fields[i + 3].label.x) <= 1); assert.ok(Math.abs(geometry.fields[i].control.x - geometry.fields[i + 3].control.x) <= 1) }
    assert.equal(new Set(geometry.fields.map(f => Math.round(f.control.y))).size, 2); assert.ok(Math.abs(geometry.actions.right - geometry.right) <= 1); assert.ok(Math.abs(geometry.actions.y - geometry.fields[3].control.y) <= 1)
    for (const label of ['全部', '人脸', '指纹']) {
      if (label !== '全部') await select(page.locator('.log-feature-filter'), label)
      const dimensions = await page.locator('.log-feature-filter .el-select__placeholder').evaluate(n => { const range = document.createRange(); range.selectNodeContents(n); return { text: n.textContent.trim(), width: n.clientWidth, textWidth: range.getBoundingClientRect().width } })
      assert.equal(dimensions.text, label); assert.ok(dimensions.width >= dimensions.textWidth - 1, JSON.stringify(dimensions)); assert.equal(await page.locator('.log-feature-filter .el-select__suffix').isVisible(), true)
    }
    assert.equal(await page.locator('.log-quick-filters').count(), 0); assert.equal(await button('失败').count(), 0); assert.equal(await button('待人工核查').count(), 0)
    await reset(); measurements.push({ kind: 'aligned two-row filters', width, ...geometry }); await shot(`logs-aligned-${width}`)
  }
  pass('1440/1280 share the first three label/control column lines, keep actions at row-two right, and display full modality values/arrow without shortcut buttons or reserved space')

  const beforeSelect = await ids(); await select(page.locator('.log-result-filter'), '失败'); assert.deepEqual(await ids(), beforeSelect); await button('查询').click(); await loaded(); assert.deepEqual(await ids(), ['REQ-00000011'])
  await select(page.locator('.log-publication-filter'), '已发布'); await button('查询').click(); await loaded(); assert.deepEqual(await ids(), ['REQ-00000011'])
  await applicantInput().fill('U001')
  const download = page.waitForEvent('download'); await button('导出 CSV').click(); const csv = await fs.readFile(await (await download).path(), 'utf8'); assert.match(csv, /申请人 ID/); assert.match(csv, /REQ-00000011/); assert.doesNotMatch(csv, /REQ-00000001/)
  await reset(); await select(page.locator('.log-publication-filter'), '暂无最终响应'); await applicantInput().fill('U003'); await select(page.locator('.log-result-filter'), '待人工核查'); await button('查询').click(); await loaded(); assert.deepEqual(await ids(), ['REQ-00000008']); assert.match(await page.locator('.log-result-filter .el-select').innerText(), /待人工核查/)
  pass('execution-state dropdown applies only on Query, combines publication/other fields, and CSV remains bound to the applied snapshot')

  await openLog('REQ-00000008')
  const summary = log.getByTestId('business-summary')
  assert.match(await summary.innerText(), /等待 ABIS 响应超时，执行结果未确认。/); assert.match(await summary.innerText(), /请结合请求 ID、申请人 ID 和接收时间核对 ABIS 侧处理记录。/)
  await log.getByRole('button', { name: '复制请求 ID', exact: true }).click(); assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'REQ-00000008'); await page.getByText('请求 ID 已复制', { exact: true }).waitFor()
  await summary.getByRole('button', { name: '查看事件', exact: true }).click(); await log.locator('.focused-event').filter({ hasText: 'ABIS_TIMEOUT' }).waitFor(); await page.waitForFunction(() => { const event = document.querySelector('.focused-event'), scroll = document.querySelector('.request-tabs .el-tabs__content'); if (!event || !scroll) return false; const a = event.getBoundingClientRect(), b = scroll.getBoundingClientRect(); return a.top >= b.top && a.bottom <= b.bottom }); await page.waitForFunction(() => !document.querySelector('.el-message')); await shot('manual-review-timeout'); await close(log)
  await queryRequest('REQ-00000018'); assert.equal(await total(), 1); await openLog('REQ-00000018'); assert.match(await summary.innerText(), /执行结果未确认。/); assert.doesNotMatch(await summary.innerText(), /响应超时|ABIS_TIMEOUT/); assert.match(await summary.innerText(), /核对 ABIS 侧处理记录/); await shot('manual-review-no-reason'); await close(log)
  pass('manual-review summary states recorded timeout or unknown reason, guides verification, copies complete request ID and focuses ABIS_TIMEOUT')

  // Copy fallback is required on a server reached over ordinary HTTP.
  assert.equal(await page.evaluate(async () => { const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard'); const original = document.execCommand; let text; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); document.execCommand = command => { text = document.querySelector('textarea').value; return command === 'copy' }; try { await (await import('/src/utils/clipboard.js')).copyText('REQ-00000008'); return text } finally { document.execCommand = original; if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard); else delete navigator.clipboard } }), 'REQ-00000008')
  pass('request-ID copying also has a functional ordinary-HTTP compatibility path')

  await reset(); await applicantInput().fill('U001'); await button('查询').click(); await loaded(); assert.equal(await total(), 4)
  await openLog('REQ-00000002'); assert.equal(await log.locator('.request-summary th').filter({ hasText: /^申请人 ID$/ }).count(), 1); await close(log)
  await go('/audits'); await go('/logs'); assert.equal(await applicantInput().inputValue(), 'U001'); assert.equal(await total(), 4)
  await reset(); await page.setViewportSize({ width: 1024, height: 640 }); await paint(); await pageSize('10 条/页'); await table().locator('th.is-sortable').click({ position: { x: 20, y: 20 } }); await loaded(); await page.locator('.el-pager .number').filter({ hasText: /^2$/ }).click(); await loaded(); await paint()
  const scroll = table().locator('.el-table__body-wrapper .el-scrollbar__wrap'); await scroll.evaluate(n => { n.scrollTop = Math.min(80, n.scrollHeight - n.clientHeight); n.scrollLeft = Math.min(100, n.scrollWidth - n.clientWidth) }); await paint()
  const before = { ids: await ids(), scroll: await scroll.evaluate(n => ({ x: n.scrollLeft, y: n.scrollTop })) }; assert.ok(before.scroll.x > 0 && before.scroll.y > 0)
  await applicantInput().fill('unsubmitted-draft'); await go('/audits'); await go('/logs'); assert.deepEqual(await ids(), before.ids); assert.equal(await applicantInput().inputValue(), ''); assert.equal(await page.locator('.el-pager .is-active').innerText(), '2'); assert.match(await page.locator('.el-pagination__sizes').innerText(), /10 条/); assert.equal(await table().locator('th.ascending').count(), 1)
  const after = await scroll.evaluate(n => ({ x: n.scrollLeft, y: n.scrollTop })); assert.ok(Math.abs(after.x - before.scroll.x) <= 1 && Math.abs(after.y - before.scroll.y) <= 1); measurements.push({ kind: 'restored log scroll', before, after })
  pass('log navigation restores applied filters, sorting, page size, page and both table scroll positions while discarding unsubmitted drafts')

  await reset(); await page.setViewportSize({ width: 1024, height: 768 }); await paint()
  const fields = await page.locator('.logs-filters .el-form-item').evaluateAll(nodes => nodes.filter(n => n.checkVisibility()).map(n => ({ label: n.querySelector('label')?.innerText || 'actions', y: n.getBoundingClientRect().y })))
  assert.equal(new Set(fields.map(f => Math.round(f.y))).size, 3); assert.ok(fields.some(f => f.label === '执行状态')); assert.ok(!fields.some(f => f.label === '接口类型'))
  const headers = await table().locator('th').allTextContents(); assert.deepEqual(headers.slice(0, 4).map(s => s.replace(/正序|倒序/g, '').trim()), ['请求 ID', '接收时间', '执行状态', '响应发布状态'])
  const rects = await table().locator('th').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON())); const action = rects.at(-1); assert.ok(rects.slice(0, 4).every(r => r.x >= rects[0].x && r.x + r.width <= action.x + 1))
  await button('更多筛选').click(); await select(page.locator('.log-api-filter'), '1：N查重'); await select(page.locator('.log-feature-filter'), '人脸'); await button('查询').click(); await loaded(); const filteredIds = await ids(); assert.ok(filteredIds.length > 0); await page.getByRole('button', { name: /收起筛选/ }).click(); assert.match(await page.getByRole('button', { name: /更多筛选/ }).innerText(), /（2）/); assert.deepEqual(await ids(), filteredIds)
  await paint(); await paint()
  const positions = await page.locator('.query-panel,.request-table .el-table__header-wrapper,.records-footer').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().y)); await table().locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate(n => { n.scrollTop = n.scrollHeight; n.scrollLeft = n.scrollWidth }); await paint(); const positionsAfter = await page.locator('.query-panel,.request-table .el-table__header-wrapper,.records-footer').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().y)); assert.deepEqual(positionsAfter, positions)
  measurements.push({ kind: '1024 three-row layout', fields, headers, rects }); await table().locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate(n => { n.scrollTop = 0; n.scrollLeft = 0 }); await shot('logs-1024-more-count')
  for (const [width, height] of [[1280, 720], [624, 850]]) { await page.setViewportSize({ width, height }); await paint(); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await shot(`logs-${width}`) }
  pass('1024 desktop keeps three main filter rows and all key columns/actions initially readable; extra filters/count persist and fixed regions survive table scrolling')

  await page.setViewportSize({ width: 1280, height: 720 }); await go('/applicants'); await openPerson('U001'); await person.getByRole('tab', { name: '入库变更记录', exact: true }).click(); const change = person.locator('.enrollment-changes .el-table__row').filter({ hasText: '指纹注册' }); await change.getByRole('button', { name: '查看日志', exact: true }).click(); await page.waitForURL('**/logs?**'); await loaded(); assert.equal(await requestInput().inputValue(), 'REQ-00000002'); assert.deepEqual(await ids(), ['REQ-00000002']); await button('返回申请人详情').click(); await page.waitForURL('**/applicants'); await person.waitFor(); await loaded(); assert.equal(await person.getByRole('tab', { name: '入库变更记录', exact: true }).getAttribute('aria-selected'), 'true'); await close(person)
  pass('explicit enrollment links override saved log state and returning restores the same applicant changes tab')

  await openPerson('U001'); assert.equal(await person.locator('.face-records .quality-score').innerText(), '91'); assert.equal(await person.locator('.quality-legend,.quality-caption').count(), 0); assert.equal(await person.locator('.current-images .quality-note').count(), 0); assert.ok((await person.locator('.quality-score').allTextContents()).every(text => /^(\d+|—)$/.test(text.trim()))); const qualityCenters = await person.locator('.quality-score').evaluateAll(nodes => nodes.map(node => { const bar = node.getBoundingClientRect(), value = node.querySelector('.quality-value').getBoundingClientRect(); return Math.abs(value.x + value.width / 2 - bar.x - bar.width / 2) })); assert.ok(qualityCenters.every(delta => delta <= 1))
  const missing = person.locator('[data-finger="right_ring"] .enrollment-image'); assert.equal(await missing.locator('.quality-value').innerText(), '—'); assert.match(await missing.getAttribute('aria-label'), /质量分未提供/)
  await missing.focus(); const tip = page.getByRole('tooltip').filter({ hasText: /^质量分未提供$/ }); await tip.waitFor(); await missing.hover(); await tip.waitFor(); await shot('quality-missing-tooltip')
  await missing.click(); await preview.waitFor(); assert.equal(await preview.locator('.image-metadata .el-descriptions__label').filter({ hasText: /^质量分$/ }).locator('xpath=following-sibling::*[1]').locator('.quality-value').innerText(), '—'); assert.equal(await preview.locator('.quality-note').innerText(), '未提供'); assert.equal(await preview.locator('.quality-score').count(), 0); await preview.getByRole('button', { name: '关闭图像', exact: true }).click(); await preview.waitFor({ state: 'hidden' })
  const zero = person.locator('[data-finger="right_little"] .enrollment-image'); assert.equal(await zero.locator('.quality-value').innerText(), '0'); assert.doesNotMatch(await zero.getAttribute('aria-label'), /未提供/); await zero.click(); await preview.waitFor(); assert.equal(await preview.locator('.quality-value').innerText(), '0'); await preview.getByRole('button', { name: '关闭图像', exact: true }).click(); await preview.waitFor({ state: 'hidden' }); await close(person)
  pass('face and finger bars show bare centered values, missing score keeps hover/focus/accessible explanations, and preview metadata stays paired with the image')

  await go('/audits'); await select(page.locator('.audits-filters .el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: /^操作类型$/ }) }), '登录'); await select(page.locator('.audits-filters .el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: /^结果$/ }) }), '失败'); await button('查询').click(); await loaded()
  const audit = page.getByRole('dialog', { name: '审计记录详情', exact: true })
  for (const [index, value] of [[0, '凭据校验失败'], [1, '未记录']]) { await page.locator('.audit-page > .el-card > .el-card__body > .el-table .el-table__row').nth(index).getByRole('button', { name: '详情', exact: true }).click(); await audit.waitFor(); assert.equal(await audit.locator('.el-descriptions__label').filter({ hasText: /^失败类别$/ }).locator('xpath=following-sibling::*[1]').innerText(), value); assert.equal(await audit.getByText('变更前值', { exact: true }).count(), 0); await shot(`audit-failure-${index}`); await audit.locator('.el-dialog__headerbtn').click(); await audit.waitFor({ state: 'hidden' }) }
  await select(page.locator('.audits-filters .el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: /^操作类型$/ }) }), '修改匹配阈值'); await select(page.locator('.audits-filters .el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: /^结果$/ }) }), '成功'); await button('查询').click(); await loaded(); await page.locator('.audit-page > .el-card > .el-card__body > .el-table .el-table__row').first().getByRole('button', { name: '详情', exact: true }).click(); await audit.waitFor(); await page.waitForFunction(() => !document.querySelector('.dialog-fade-enter-active')); await paint(); const labels = audit.locator('.el-descriptions__label'); const first = await labels.filter({ hasText: /^变更前值$/ }).boundingBox(), second = await labels.filter({ hasText: /^变更后值$/ }).boundingBox(); assert.ok(Math.abs(first.y - second.y) <= 1); await audit.locator('.el-dialog__headerbtn').click(); await audit.waitFor({ state: 'hidden' })
  pass('login audits present allowed failure category or unrecorded next to result while threshold before/after values stay side by side')

  await page.setViewportSize({ width: 1280, height: 360 }); await go('/monitor')
  for (const [label, instance, host] of [['异常', 'face-1', 'algorithm-vm-1'], ['未知', 'minio-1', 'minio-vm']]) {
    await button(label).click(); const original = await page.locator('.instance-row').count(); assert.equal(original, 1)
    const row = page.locator(`[data-instance="${instance}"]`); await row.getByRole('link', { name: '查看主机资源', exact: true }).scrollIntoViewIfNeeded(); await paint(); const monitorScroll = await page.evaluate(() => window.scrollY); assert.ok(monitorScroll > 0); await row.getByRole('link', { name: '查看主机资源', exact: true }).click(); await page.waitForURL(`**/host-resources?hostId=${host}`)
    await page.locator(`[data-host-id="${host}"].is-located`).getByText('未接入', { exact: true }).waitFor()
    await page.goBack(); await page.waitForURL('**/monitor'); await loaded(); await paint(); assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - monitorScroll) <= 1); assert.equal(await button(label).getAttribute('aria-pressed'), 'true'); assert.equal(await page.locator('.instance-row').count(), original)
    await row.getByRole('link', { name: '查看主机资源', exact: true }).click(); await page.waitForURL('**/host-resources?**'); await loaded(); await button('监控').click(); await page.getByRole('menuitem', { name: '服务状态', exact: true }).click(); await page.waitForURL('**/monitor'); await loaded(); assert.equal(await button(label).getAttribute('aria-pressed'), 'true'); assert.equal(await page.locator('.instance-row').count(), original)
  }
  await page.setViewportSize({ width: 1280, height: 720 }); await button('全部').click(); await shot('monitor-filter-restored')
  pass('abnormal and unknown monitor filters survive host navigation/browser back/menu return while recalculating current data')

  await querySessionCases()
  assert.deepEqual(errors, []); assert.deepEqual(backendRequests, []); pass('zero browser errors and zero real-backend calls')
} catch (error) { failure = { message: error.message, stack: error.stack, url: page.url() }; console.error(error); process.exitCode = 1; await shot('failure').catch(() => {}) }
finally { await fs.writeFile(`${out}/report.json`, JSON.stringify({ base, checks, measurements, sessions, errors, backendRequests, failure }, null, 2)); await browser.close() }
console.log(`COMPLETE ${checks.length} checks`)

async function querySessionCases() {
  // Exercise the existing session contract at bootstrap, without inventing a real HTTP service.
  for (const state of ['valid', 'expired']) for (const path of ['/monitor', '/logs']) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN' }); const p = await c.newPage(); observe(p)
    await c.addInitScript(() => { if (!sessionStorage.getItem('ux-fixture-seeded')) { localStorage.setItem('abis_console_token', 'ux-session-fixture'); sessionStorage.setItem('ux-fixture-seeded', 'true') } })
    await p.route('**/src/api/adapters/mock.js', async route => {
      const response = await route.fetch(); let body = await response.text()
      assert.ok(body.includes('async getSession() {'))
      body = body.replace('async getSession() {', `async getSession() { ${state === 'valid' ? 'sessionAccountId = accounts[0].id; return { account: { ...accounts[0] } };' : 'throw new Error("登录状态已失效，请重新登录");'}`)
      await route.fulfill({ response, body })
    })
    await p.goto(`${base}${path}`); await p.waitForURL(url => state === 'valid' ? url.pathname === path : url.pathname === '/login'); await p.reload(); await p.waitForURL(url => state === 'valid' ? url.pathname === path : url.pathname === '/login')
    if (state === 'expired') { assert.equal(await p.evaluate(() => localStorage.getItem('abis_console_token')), null); assert.equal(new URL(p.url()).searchParams.get('redirect'), path) }
    sessions.push({ state, path, result: state === 'valid' ? 'session-contract fixture keeps original page on refresh' : 'expired session clears credentials and redirects to login with original destination' }); await c.close()
  }
  await go('/logs'); await page.reload(); await page.waitForURL('**/login?**'); sessions.push({ state: 'actual Mock', result: 'module-memory session resets on refresh; no client-side token trust' })
  pass('session-contract valid/expired boundary fixtures cover monitor/log refresh; actual Mock expiry remains explicit, formal HTTP verification is pending its adapter')
}
