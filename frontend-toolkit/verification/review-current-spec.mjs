import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
assert.match(await (await fetch(`${base}/src/api/index.js`)).text(), /"VITE_USE_MOCK": "true"/)
const out = process.env.ABIS_QA_OUTPUT_DIR || './qa-output/current-spec'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1422, height: 804 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
page.setDefaultTimeout(10000)
const checks = [], errors = [], backendRequests = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('request', request => {
  const url = new URL(request.url())
  if (['xhr', 'fetch'].includes(request.resourceType()) && (url.origin !== base || /^\/(admin-api|abis-admin)(\/|$)/.test(url.pathname))) backendRequests.push(request.url())
})
const pass = text => { checks.push(text); console.log('PASS', text) }
const button = name => page.getByRole('button', { name, exact: true })
const loaded = () => page.waitForFunction(() => !document.querySelector('.el-loading-mask,.el-button.is-loading'))
const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const go = async (name, path) => { await page.getByRole('menuitem', { name, exact: true }).click(); await page.waitForURL(`**/${path}`); await loaded(); await page.evaluate(() => scrollTo(0, 0)) }
const select = async (selector, name) => { await page.locator(selector).click(); await page.getByRole('option', { name, exact: true }).click() }
const download = async () => { const pending = page.waitForEvent('download'); await button('导出 CSV').click(); const file = await pending; return (await fs.readFile(await file.path(), 'utf8')).replace(/^\uFEFF/, '') }
const lines = csv => csv.trim().split(/\r?\n/)
const logTotal = async () => Number((await page.locator('.logs-page .el-pagination__total').innerText()).match(/\d+/)[0])
const logIds = () => page.locator('.request-table .el-table__row td:first-child .log-id').allTextContents()
const exportedLogIds = csv => lines(csv).slice(1).map(line => line.match(/^"[^"]*","[^"]*","([^"]+)"/)?.[1])
const log = page.getByRole('dialog', { name: '请求详情', exact: true })
const openLog = async id => { await page.locator('.request-table .el-table__row').filter({ hasText: id }).click(); await log.waitFor(); await page.waitForFunction(() => Math.abs(document.querySelector('.request-log-drawer').getBoundingClientRect().right - innerWidth) < 1) }
const closeLog = async () => { await log.getByRole('button', { name: '关闭', exact: true }).click(); await log.waitFor({ state: 'hidden' }) }
const images = async () => { await log.getByRole('tab', { name: '图像比对', exact: true }).click(); await page.waitForFunction(() => [...document.querySelectorAll('.comparison-frame')].every(el => el.getAttribute('aria-busy') !== 'true')) }
const acceptance = async () => { await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push('/acceptance/recapture')); await page.waitForURL('**/acceptance/recapture'); await loaded() }
const queryId = async id => { await button('重置').click(); await loaded(); await page.getByPlaceholder('输入完整业务请求 ID').fill(id); await button('查询').click(); await loaded() }

try {
  await page.clock.setFixedTime(new Date('2026-11-18T09:00:00+08:00'))
  await page.goto(`${base}/login`)
  await page.locator('.login-content input').nth(0).fill('admin'); await page.locator('.login-content input').nth(1).fill('admin123'); await button('登录').click(); await page.waitForURL('**/monitor'); await loaded()
  await go('日志查询', 'logs')
  const seed = await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    const utils = await import('/src/utils/log.js')
    const normal = await api.listLogs({ pageSize: 100 }), missing = await api.listLogs({ requestId: 'REQ-00000016' }), retry = (await api.listLogs({ requestId: 'REQ-00000017' })).items[0]
    const publications = await Promise.all(['published', 'pending', 'none'].map(publication => api.listLogs({ publication, pageSize: 100 })))
    const history = await api.listLogs({ userId: 'U301' })
    const calling = retry.stages.find(stage => stage.key === 'ADAPTER_CALLING')
    return { normal, missing, retry, publications, history,
      bodies: ['attempt-1','attempt-2'].map(attempt => ({ request: utils.requestForAttempt(retry, attempt), response: utils.responseForEvent(retry, utils.handlingStages(retry).flatMap(s => s.events).find(e => e.kind === 'RESPONDED' && e.attemptId === attempt)) })),
      order: utils.stageTimeline(calling).map(entry => ({ type: entry.type, kind: entry.event?.kind, attempt: entry.event?.attemptId || entry.stage?.attemptId })) }
  })
  assert.equal(seed.normal.total, 45); assert.equal(seed.missing.total, 1); assert.equal(seed.missing.items[0].userId, null)
  assert.equal(seed.retry.result, 'success'); assert.equal(seed.retry.publication, 'published')
  assert.deepEqual(seed.bodies[0], { request: null, response: null }); assert.equal(seed.bodies[1].request.userId, 'U017'); assert.equal(seed.bodies[1].response.requestId, 'REQ-00000017')
  assert.ok(seed.order.findIndex(e => e.kind === 'CALL_FAILED') < seed.order.findIndex(e => e.kind === 'CALL_STARTED' && e.attempt === 'attempt-2'))
  assert.equal(seed.history.total, 7); assert.deepEqual(seed.publications.map(p => p.total), [39, 1, 4]); assert.ok(seed.publications.every(p => p.items.every(r => r.mode !== 'sync')))
  pass('full-snapshot publication filtering retains supplemental requests and strict retry request/response pairing')

  assert.equal(await logTotal(), 45)
  assert.match(await page.locator('.logs-page .el-pagination__sizes').innerText(), /20 条\/页/)
  const fullIds = seed.normal.items.map(row => row.requestId)
  const allTimes = seed.normal.items.map(row => Date.parse(row.receivedAt))
  assert.ok(allTimes.every((time, index) => index === 0 || time <= allTimes[index - 1]))
  const pagedIds = []
  for (const size of [20, 20, 5]) {
    const ids = await logIds()
    assert.equal(ids.length, size)
    pagedIds.push(...ids)
    if (size === 20) {
      await page.locator('.logs-page .el-pagination .btn-next').click()
      await loaded()
    }
  }
  assert.equal(new Set(pagedIds).size, 45)
  assert.deepEqual(pagedIds, fullIds)
  assert.deepEqual(exportedLogIds(await download()), fullIds)
  await button('重置').click(); await loaded()
  assert.equal(await logTotal(), 45)
  assert.deepEqual(await logIds(), fullIds.slice(0, 20))
  pass('full logs are newest first across 20/20/5 rows, CSV from the last page includes every request, and reset returns to page one')

  await page.setViewportSize({ width: 624, height: 850 })
  await button('选择时间范围').click()
  const date = page.getByRole('dialog', { name: '选择时间范围', exact: true })
  const recaptureDay = date.getByRole('button', { name: '2026-11-12', exact: true })
  await recaptureDay.click()
  await recaptureDay.click()
  await date.getByRole('button', { name: '确定', exact: true }).click()
  await date.waitFor({ state: 'hidden' })
  await button('查询').click(); await loaded()
  const recaptured = seed.normal.items.filter(row => /^RECAP-U30[12]-/.test(row.requestId))
  assert.equal(await logTotal(), 13)
  assert.deepEqual(await logIds(), recaptured.map(row => row.requestId))
  await page.setViewportSize({ width: 1422, height: 804 })
  await select('.log-api-filter .el-select', 'Biometric Delete（删除）')
  await select('.log-feature-filter .el-select', '指纹')
  await select('.log-result-filter .el-select', '成功')
  await button('查询').click(); await loaded()
  assert.equal(await logTotal(), 2)
  assert.deepEqual(await logIds(), ['RECAP-U302-004', 'RECAP-U301-004'])
  pass('a date range without IDs finds both recapture histories and intersects with interface, modality and result filters')

  for (const [label, count] of [['Biometric Enrollment（注册）', 27], ['1：N查重', 12], ['Biometric Delete（删除）', 6]]) {
    await button('重置').click(); await loaded()
    await select('.log-api-filter .el-select', label)
    await button('查询').click(); await loaded()
    assert.equal(await logTotal(), count)
  }
  await button('重置').click(); await loaded()
  const applicantId = page.getByPlaceholder('输入完整申请人 ID')
  for (const [id, count] of [['U001', 4], ['U004', 3], ['U201', 1], ['U301', 7]]) {
    await applicantId.fill(id)
    await button('查询').click(); await loaded()
    assert.equal(await logTotal(), count)
    assert.deepEqual(await logIds(), seed.normal.items.filter(row => row.userId === id).map(row => row.requestId))
  }
  pass('interface totals are 27/12/6 and applicant IDs retrieve the original and historical requests together')

  await button('重置').click(); await loaded()
  await select('.log-api-filter .el-select', '1：N查重'); await button('查询').click(); await loaded()
  assert.equal(await logTotal(), 12)
  await select('.logs-page .el-pagination .el-select', '10 条/页'); await loaded()
  await page.getByPlaceholder('输入完整申请人 ID').fill('U001')
  await page.locator('.logs-page .el-pagination .btn-next').click(); await loaded(); assert.equal(await logTotal(), 12)
  let csv = await download(); assert.equal(lines(csv).length, 13); assert.deepEqual(exportedLogIds(csv), seed.normal.items.filter(row => row.api === 'identification').map(row => row.requestId)); assert.ok(lines(csv).slice(1).every(line => /^"\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}"/.test(line))); assert.doesNotMatch(csv, /ABIS 实际处理耗时/)
  await button('查询').click(); await loaded(); assert.match(await page.locator('.el-pagination__total').innerText(), /2/); csv = await download(); assert.equal(lines(csv).length, 3); assert.ok(lines(csv).slice(1).every(line => line.includes('"U001"')))
  pass('draft edits and pagination retain applied result; CSV exports all twelve rows with milliseconds, then two rows after query')

  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    window.savedLogs = api.listLogs
    api.listLogs = async () => { throw new Error('模拟查询失败') }
  })
  await page.getByPlaceholder('输入完整申请人 ID').fill('U999'); await button('查询').click(); await loaded()
  assert.match(await page.locator('.query-panel .el-alert').innerText(), /模拟查询失败/); assert.match(await page.locator('.el-pagination__total').innerText(), /2/); assert.equal(lines(await download()).length, 3)
  await page.evaluate(async () => {
    window.pendingLogs = []
    const api = (await import('/src/api/index.js')).default
    api.listLogs = params => new Promise(resolve => window.pendingLogs.push({ params, resolve }))
  })
  await page.getByPlaceholder('输入完整申请人 ID').fill('U001')
  await page.getByPlaceholder('输入完整业务请求 ID').fill('REQ-00000003'); await button('查询').click()
  await page.getByPlaceholder('输入完整业务请求 ID').fill('REQ-00000004'); await button('查询').click()
  await page.waitForFunction(() => window.pendingLogs.length === 2)
  await page.evaluate(async () => { const pending = window.pendingLogs[1]; pending.resolve(await window.savedLogs(pending.params)) }); await loaded()
  await page.evaluate(async () => { const pending = window.pendingLogs[0]; pending.resolve(await window.savedLogs(pending.params)) }); await paint()
  assert.equal(await page.locator('.request-table .el-table__row td:first-child').innerText(), 'REQ-00000004')
  assert.ok(lines(await download())[1].includes('REQ-00000004'))
  await page.evaluate(async () => { (await import('/src/api/index.js')).default.listLogs = window.savedLogs })
  await button('重置').click(); await loaded(); await select('.log-api-filter .el-select', '1：N查重'); await page.getByPlaceholder('输入完整申请人 ID').fill('U001'); await button('查询').click(); await loaded()
  pass('query failures retain applied rows/export and out-of-order responses cannot replace the latest result')

  await select('.log-publication-filter .el-select', '待发布'); await button('查询').click(); await loaded(); assert.match(await page.locator('.el-pagination__total').innerText(), /0/)
  await button('重置').click(); await loaded(); await select('.log-publication-filter .el-select', '待发布'); await button('查询').click(); await loaded(); assert.equal(await page.locator('.request-table .el-table__row').count(), 1); assert.match(await page.locator('.request-table .el-table__row').innerText(), /REQ-00000012/)
  await openLog('REQ-00000012'); assert.match(await log.getByTestId('business-summary').innerText(), /查重成功 · 响应待发布/)
  await log.locator('[data-stage="ADAPTER_RECEIVED"] > .stage-toggle').click()
  await log.locator('[data-stage="ADAPTER_RESPONDED"] > .stage-toggle').click()
  await log.getByRole('tab', { name: '接口报文', exact: true }).click(); await log.getByRole('button', { name: '查看事件', exact: true }).click()
  assert.equal(await log.getByRole('tab', { name: '处理过程', exact: true }).getAttribute('aria-selected'), 'true')
  assert.equal(await log.locator('[data-stage="ADAPTER_RESPONDED"] > .stage-toggle').getAttribute('aria-expanded'), 'true')
  assert.equal(await log.locator('[data-stage="ADAPTER_RECEIVED"] > .stage-toggle').getAttribute('aria-expanded'), 'false')
  await log.locator('.focused-event').filter({ hasText: 'PUBLISH_NACK' }).waitFor()
  await page.screenshot({ path: `${out}/publish-event.png` }); await closeLog()
  pass('publication filter combines with IDs and summary locates PUBLISH_NACK without resetting other expansion choices')

  for (const [id, message] of [['REQ-00000003','本次查重无候选'], ['REQ-00000009','查重处理中'], ['REQ-00000010','查重处理中'], ['REQ-00000011','本次查重失败'], ['REQ-00000012','本次查重无候选']]) {
    await queryId(id); await openLog(id)
    assert.equal(await log.locator('.focused-event').count(), 0)
    if (id.endsWith('11')) {
      assert.match(await log.getByTestId('business-summary').innerText(), /查重失败 · 失败响应已发布/)
      await log.getByRole('button', { name: '查看事件', exact: true }).click()
      assert.equal(await log.locator('[data-stage="ABIS_HANDLING"] > .stage-toggle').getAttribute('aria-expanded'), 'true')
      assert.match(await log.locator('.focused-event').innerText(), /IDENTIFICATION_FAILED/)
    }
    await images(); await log.getByText(message, { exact: true }).waitFor(); await closeLog()
  }
  pass('image empty states distinguish confirmed failure, empty success, processing and success pending publication')

  for (const id of ['REQ-00000014', 'REQ-00000015']) {
    await queryId(id); await openLog(id); await images()
    assert.equal(await log.locator('.comparison-image h3').first().innerText(), '待查图像'); assert.match(await log.locator('.candidate-result').innerText(), /本次响应/)
    await log.getByRole('button', { name: '候选 3', exact: true }).click(); await images()
    const candidate = await log.locator('.comparison-image').nth(1).locator('.image-user').innerText()
    for (const title of ['待查图像','候选图像']) {
      await log.getByRole('button', { name: `放大${title}`, exact: true }).click()
      const preview = page.locator('.comparison-preview').filter({ visible: true })
      assert.match(await preview.locator('.preview-user').innerText(), /申请人 ID：U/)
      if (id.endsWith('14')) assert.match(await preview.locator('.preview-user').innerText(), /左手食指/)
      assert.equal(await preview.locator('.preview-image').evaluate(el => getComputedStyle(el).objectFit), 'contain')
      await preview.getByRole('button', { name: '关闭预览', exact: true }).click(); await preview.waitFor({ state: 'hidden' })
    }
    await log.getByRole('tab', { name: '接口报文', exact: true }).click(); await images(); assert.equal(await log.locator('.comparison-image').nth(1).locator('.image-user').innerText(), candidate)
    assert.equal(await log.getByRole('button', { name: '候选 3', exact: true }).getAttribute('aria-pressed'), 'true')
    await closeLog(); await openLog(id); await images(); assert.equal(await log.getByRole('button', { name: '候选 1', exact: true }).getAttribute('aria-pressed'), 'true'); await closeLog()
  }
  pass('face/finger zoom preserves identity/position and candidate; tab changes retain selection and reopening resets to candidate one')

  await queryId('REQ-00000016'); assert.equal(await page.locator('.request-table .el-table__row td').nth(1).innerText(), '—'); await openLog('REQ-00000016'); assert.match(await log.locator('.request-summary').innerText(), /申请人 ID\s+—/); await closeLog()
  await queryId('REQ-00000017'); await openLog('REQ-00000017'); await log.getByRole('button', { name: '历史异常', exact: true }).click(); assert.match(await log.locator('.focused-event').innerText(), /CONNECT_TIMEOUT/); assert.equal(await log.locator('[data-stage="ABIS_HANDLING"]').count(), 2)
  await log.getByRole('tab', { name: '接口报文', exact: true }).click(); assert.match(await log.locator('.response-selector').innerText(), /attempt-1/)
  assert.equal(await log.getByLabel('ABIS 请求 JSON').count(), 0); assert.equal(await log.getByLabel('ABIS 响应 JSON').count(), 0); assert.match(await log.locator('.request-tabs').innerText(), /正文|参数|响应/)
  await log.locator('.response-selector').click(); await page.getByRole('option', { name: /^attempt-2/ }).click()
  assert.equal(JSON.parse(await log.getByLabel('ABIS 请求 JSON').innerText()).userId, 'U017')
  const responseToggle = log.getByRole('button', { name: '响应结果', exact: true }); if (await responseToggle.getAttribute('aria-expanded') === 'false') await responseToggle.click()
  assert.equal(JSON.parse(await log.getByLabel('ABIS 响应 JSON').innerText()).requestId, 'REQ-00000017'); await closeLog()
  pass('supplemental missing user opens correctly; two attempts show absent first bodies and exact second bodies')

  await go('申请人列表', 'applicants')
  for (const [id, count] of [['U001', 10], ['U004', 6], ['U301', 8]]) { const row = page.locator('.applicants-page .el-table__row').filter({ hasText: id }); assert.equal(await row.locator('.finger-count').count(), 0); assert.equal(await row.locator('.list-finger img').count(), count); assert.equal(await row.locator('.finger-placeholder').count(), 10 - count) }
  await page.getByPlaceholder('输入完整申请人 ID').fill('U002'); await button('查询').click(); await loaded(); await page.getByPlaceholder('输入完整申请人 ID').fill('U999')
  await button('按此 ID 查看请求日志').click(); await page.waitForURL('**/logs?userId=U002'); await loaded(); assert.equal(await page.getByPlaceholder('输入完整申请人 ID').inputValue(), 'U002'); assert.ok((await page.locator('.request-table').innerText()).includes('人脸删除'))
  await acceptance()
  assert.equal(await page.locator('.legacy-samples').getAttribute('open'), null)
  for (const [label, phase] of [['三人旧数据有效','旧数据有效'],['三人双模态删除','双模态删除'],['三人新人脸入库','新人脸入库'],['三人重采结果','重采结果']]) {
    await button(label).click(); await loaded(); assert.equal(await page.locator('.current-scenario').innerText(), `当前状态：${label}`)
    const people = await page.evaluate(async () => (await (await import('/src/api/index.js')).default.listApplicants()).items.map(p => p.userId))
    assert.equal(people.includes('U301'), phase !== '双模态删除')
  }
  await page.getByRole('link', { name: '查看申请人列表' }).click(); await page.waitForURL('**/applicants'); await loaded()
  const unrecorded = page.locator('.applicants-page .el-table__row').filter({ hasText: 'U303' }); assert.equal(await unrecorded.locator('.finger-count').count(), 0); assert.equal(await unrecorded.locator('.list-finger img').count(), 0); assert.equal(await unrecorded.locator('.finger-placeholder').count(), 10)
  await page.screenshot({ path: `${out}/recapture-panel.png` }); await acceptance(); await button('恢复默认数据').click(); await loaded()
  pass('distinct finger counts, empty applicant applied-ID navigation and four marked recapture phases through a dedicated acceptance page')

  await go('审计查询', 'audits'); assert.equal(await page.locator('.demo-date-range').count(), 0)
  await page.getByPlaceholder('输入完整账号').fill('ops.zhang'); await select('.audits-filters .el-select >> nth=0', '登录'); await button('查询').click(); await loaded()
  const auditTotal = Number((await page.locator('.el-pagination__total').innerText()).match(/\d+/)[0]); assert.ok(auditTotal > 0)
  await page.getByPlaceholder('输入完整账号').fill('admin'); csv = await download(); assert.equal(lines(csv).length, auditTotal + 1); assert.doesNotMatch(csv, /登录成功|登录失败/); assert.ok(lines(csv).slice(1).every(row => row.includes('"ops.zhang"')))
  await button('查询').click(); await loaded(); csv = await download(); assert.ok(lines(csv).slice(1).every(row => row.includes('"admin"')))
  await button('重置').click(); await loaded(); csv = await download(); assert.equal(lines(csv).length, 65)
  for (const result of ['成功','失败']) {
    await select('.audits-filters .el-select >> nth=0', '登录'); await select('.audits-filters .el-select >> nth=1', result); await button('查询').click(); await loaded()
    assert.ok(await page.locator('.audit-page .el-table__row').count() > 0)
    assert.ok((await page.locator('.audit-page .el-table__row td:nth-child(4)').allTextContents()).every(text => text === '登录'))
    await page.locator('.audit-page .el-table__row').first().getByRole('button', { name: '详情', exact: true }).click(); assert.match(await page.getByRole('dialog', { name: '审计记录详情', exact: true }).innerText(), new RegExp(`结果\\s+${result}`)); await page.keyboard.press('Escape')
  }
  const auditPermissions = await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    return Promise.all(['创建账户','禁用账户'].map(action => api.listAudits({ action, result: '成功' })))
  }); assert.ok(auditPermissions.every(result => result.items.every(row => row.operator === 'admin' && row.role === 'admin')))
  pass('audit exact account, normalized login result/detail/CSV, fixed demo dates, authorized management samples and applied export over all pages')

  await button('监控').click(); await page.getByRole('menuitem', { name: '服务状态', exact: true }).click(); await loaded()
  for (const [filter, id, host] of [['异常','face-1','algorithm-vm-1'],['未知','minio-1','minio-vm']]) {
    await button(filter).click(); const instance = page.locator(`[data-instance="${id}"]`); assert.doesNotMatch(await instance.innerText(), /最近探测|健康探测超时/)
    if (id === 'face-1') assert.match(await instance.innerText(), /服务未响应/); else assert.match(await instance.innerText(), /原因未记录/)
    await instance.getByRole('link', { name: '查看主机资源' }).click(); await page.waitForURL(`**/host-resources?hostId=${host}`); await loaded(); assert.equal(await page.locator('.located-host').count(), 1); assert.match(await page.locator('.located-host').innerText(), host === 'minio-vm' ? /MinIO VM/ : /算法 VM 1/)
    await button('监控').click(); await page.getByRole('menuitem', { name: '服务状态', exact: true }).click(); await loaded()
  }
  pass('abnormal/unknown probe facts and fallbacks link to and highlight the associated host')

  await button('设置').click(); await page.getByRole('menuitem', { name: '匹配阈值配置', exact: true }).click(); await loaded()
  const fields = page.locator('.threshold-field input'), save = button('保存修改')
  await fields.nth(0).fill('59'); await fields.nth(0).blur(); assert.equal(await save.isDisabled(), true); assert.match(await page.locator('.threshold-field').nth(0).innerText(), /协议生效下限 60/)
  await fields.nth(0).fill('60'); await fields.nth(1).fill('39'); await fields.nth(1).blur(); assert.equal(await save.isDisabled(), true); assert.match(await page.locator('.threshold-field').nth(1).innerText(), /协议生效下限 40/)
  await fields.nth(1).fill('40'); await fields.nth(1).blur(); assert.equal(await save.isEnabled(), true); await save.click(); const confirm = page.getByRole('dialog', { name: '保存阈值修改？', exact: true }); await confirm.waitFor(); assert.match(await confirm.innerText(), /指纹 1:N 去重相似度阈值：\d+ → 40/); assert.equal(await confirm.locator('.confirmation-details p').count(), 2); assert.equal(await confirm.locator('.confirmation-question').count(), 0); await confirm.getByRole('button', { name: '保存', exact: true }).click(); await loaded()
  await button('填入默认值').click(); assert.deepEqual(await fields.evaluateAll(inputs => inputs.map(input => input.value)), ['60','60']); assert.match(await page.locator('.edit-state').innerText(), /未保存/)
  await page.getByRole('menuitem', { name: '日志查询', exact: true }).click(); const leave = page.getByRole('dialog', { name: '未保存的修改', exact: true }); await leave.waitFor(); await leave.getByRole('button', { name: '放弃修改', exact: true }).click(); await loaded()
  const unchanged = await page.evaluate(async () => (await import('/src/api/index.js')).default.getThresholds()); assert.equal(unchanged.finger, 40)
  await button('设置').click(); await page.getByRole('menuitem', { name: '匹配阈值配置', exact: true }).click(); await loaded(); await button('填入默认值').click(); await save.click(); await confirm.waitFor(); assert.deepEqual(await confirm.locator('.confirmation-details p').allTextContents(), ['指纹 1:N 去重相似度阈值：40 → 60']); await confirm.getByRole('button', { name: '保存', exact: true }).click(); await loaded(); assert.deepEqual(await page.evaluate(async () => (await import('/src/api/index.js')).default.getThresholds()), { face: 60, finger: 60 })
  const rejected = await page.evaluate(async () => { const api = (await import('/src/api/index.js')).default; return Promise.all([{face:59,finger:60},{face:60,finger:39},{face:60,finger:40.5}].map(async payload => { try { await api.updateThresholds(payload); return false } catch { return true } })) }); assert.deepEqual(rejected, [true,true,true])
  pass('threshold lower bounds disable saving immediately; boundary saves, defaults remain draft, discard/save and adapter validation work')

  assert.deepEqual(errors, []); assert.deepEqual(backendRequests, []); pass('zero browser errors and zero real-backend requests')
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ checks, errors, backendRequests }, null, 2)); console.log(`COMPLETE ${checks.length} checks`)
} catch (error) { await page.screenshot({ path: `${out}/failure.png` }); console.error(error); process.exitCode = 1 } finally { await browser.close() }
