import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
const out = process.env.ABIS_QA_OUTPUT_DIR || fileURLToPath(new URL('./qa-output/console-20261116-followup/', import.meta.url))
await fs.mkdir(out, { recursive: true })
await fs.rm(`${out}/failure.png`, { force: true })
const checks = [], measurements = [], errors = [], backendRequests = []
const visualReview = []
let failure = null

// Focused follow-up cases are appended below; UI assertions use business labels,
// layout measurements and user actions rather than matching implementation strings.
assert.match(await (await fetch(`${base}/src/api/index.js`)).text(), /"VITE_USE_MOCK": "true"/)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
page.setDefaultTimeout(10000)
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('request', request => {
  const url = new URL(request.url())
  if (['fetch', 'xhr'].includes(request.resourceType()) && (url.origin !== base || /^\/(admin-api|abis-admin)(\/|$)/.test(url.pathname))) backendRequests.push(request.url())
})
const button = name => page.getByRole('button', { name, exact: true })
const loaded = () => page.waitForFunction(() => !document.querySelector('.el-loading-mask,.el-button.is-loading'))
const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const pass = label => { checks.push(label); console.log('PASS', label) }
const shot = name => page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
async function go(path) {
  await page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path)
  await page.waitForURL(url => url.pathname === path); await loaded(); await paint()
}
async function startNavigation(path) { await page.evaluate(path => { void document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path) }, path) }
const field = (scope, name) => scope.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: new RegExp(`^${name}$`) }) })
const table = () => page.locator('.workspace-main > div > .el-card > .el-card__body > .el-table')
const total = async () => Number((await page.locator('.records-footer .el-pagination__total').innerText()).match(/\d+/)[0])
const log = page.getByRole('dialog', { name: '请求详情', exact: true })
const person = page.getByRole('dialog', { name: '申请人详情', exact: true })
const preview = page.getByRole('dialog', { name: '入库图像详情', exact: true })
const confirmation = () => page.locator('.el-message-box:visible')
const summaryValue = label => log.locator('.request-summary th').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::td[1]')
async function closeDrawer(drawer) { await drawer.locator('.el-drawer__close-btn').click(); await drawer.waitFor({ state: 'hidden' }) }
async function openLog(id) {
  await page.locator('.request-table .el-table__row').filter({ hasText: id }).getByRole('button', { name: '详情', exact: true }).click()
  await log.waitFor(); await page.waitForFunction(() => Math.abs(document.querySelector('.request-log-drawer').getBoundingClientRect().right - innerWidth) < 1); await paint()
}
async function openPerson(id) {
  await page.locator('.applicants-page .el-table__row').filter({ hasText: id }).getByRole('button', { name: '查看详情', exact: true }).click()
  await person.waitFor(); await loaded(); await page.waitForFunction(() => Math.abs(document.querySelector('.applicant-drawer').getBoundingClientRect().right - innerWidth) < 1); await paint()
}
async function checkWithin(locator, top, bottom) {
  const box = await locator.boundingBox()
  assert.ok(box && box.y >= top - 1 && box.y + box.height <= bottom + 1, `expected complete visible element: ${JSON.stringify(box)} inside ${top}–${bottom}`)
  return box
}

try {
  for (const [width, height] of [[1440, 900], [1280, 720], [390, 844]]) {
    await page.setViewportSize({ width, height }); await page.goto(`${base}/login`); await paint()
    const content = page.locator('.login-content'), username = page.getByLabel('用户名', { exact: true }), password = page.getByLabel('密码', { exact: true })
    await username.waitFor(); await password.waitFor()
    assert.equal(await content.locator('.el-input__prefix').count(), 0); assert.equal(await page.locator('.login-page footer').count(), 0)
    assert.deepEqual(await content.locator('input').evaluateAll(nodes => nodes.map(node => node.getAttribute('placeholder') || '')), ['', ''])
    assert.doesNotMatch(await content.innerText(), /欢迎登录|请使用控制台账户登录/)
    const geometry = await content.evaluate(node => {
      const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, centerX: r.x + r.width / 2 } }
      const parts = [...node.querySelector('.brand').children].map(element => element.getBoundingClientRect())
      const left = Math.min(...parts.map(r => r.left)), right = Math.max(...parts.map(r => r.right))
      return { title: { left, right, width: right - left, centerX: (left + right) / 2 }, controls: [...node.querySelectorAll('.el-input,.login-button')].map(box), labels: [...node.querySelectorAll('.el-form-item__label')].map(box), scrollWidth: document.documentElement.scrollWidth }
    })
    measurements.push({ kind: 'login', viewport: { width, height }, ...geometry })
    assert.ok(Math.abs(geometry.title.centerX - width / 2) <= 1 && geometry.title.left >= 0 && geometry.title.right <= width)
    for (const control of geometry.controls) {
      assert.ok(Math.abs(control.centerX - width / 2) <= 1 && Math.abs(control.width - geometry.controls[0].width) <= 1)
      assert.ok(Math.abs(control.height - 48) <= .1)
    }
    geometry.labels.forEach((label, index) => assert.ok(Math.abs(label.x - geometry.controls[index].x) <= 1))
    if (width >= 1280) assert.ok(Math.abs(geometry.title.width / geometry.controls[0].width - .87) <= .01)
    assert.ok(geometry.scrollWidth <= width + 1)
    await shot(`login-${width}-${height}`)
    visualReview.push({ viewport: { width, height }, screenshot: `login-${width}-${height}.png`, review: 'Compare the local nose/lips/chin and fading upper/lower ends against docs/20261116-ABIS登录页设计示意.png; keep edge textures away from fields. No SVG path-string assertion.' })
    await button('登录').click(); await content.getByText('请输入用户名与密码', { exact: true }).waitFor()
    await username.fill('admin'); await password.fill('wrong-password'); await password.press('Enter')
    await content.getByText('用户名或密码错误', { exact: true }).waitFor()
    assert.ok(await content.getByRole('alert').evaluate(node => !!node.closest('form')))
    await checkWithin(content.getByRole('alert'), 0, height); await shot(`login-inline-error-${width}`)
    await password.fill('admin123'); await password.press('Enter'); await page.waitForURL('**/monitor'); await loaded()
  }
  pass('login title/form geometry, inline empty/password errors and Enter sign-in pass at 1440, 1280 and 390px; screenshots are ready for face-fade review')

  await page.setViewportSize({ width: 1422, height: 804 }); await go('/logs')
  const headings = await table().locator('.el-table__header th').allTextContents()
  const operationColumn = headings.findIndex(text => text.trim() === '接口类型') + 1
  assert.ok(operationColumn > 0)
  for (const [id, operation, mode] of [['REQ-00000001', '人脸注册', '异步'], ['REQ-00000013', '人脸删除', '同步']]) {
    const cell = table().locator('.el-table__row').filter({ hasText: id }).locator(`td:nth-child(${operationColumn})`)
    assert.equal((await cell.innerText()).trim(), operation); assert.equal(await cell.locator('small,.el-tag').count(), 0)
    await openLog(id)
    assert.equal((await summaryValue('接口类型').innerText()).trim(), operation)
    const modeCell = summaryValue('调用方式')
    assert.equal((await modeCell.innerText()).trim(), mode); assert.equal(await modeCell.getAttribute('colspan'), '3')
    const rows = await log.locator('.request-summary tr').allTextContents()
    assert.ok(rows.findIndex(text => text.includes('调用方式')) === rows.findIndex(text => text.includes('接收时间')) + 1)
    if (mode === '同步') {
      await page.setViewportSize({ width: 1280, height: 720 }); await paint()
      for (const name of ['接收请求', '业务处理', '发送响应']) await checkWithin(log.getByRole('heading', { name, exact: true }), 0, 720)
      assert.equal(await log.locator('.request-summary th').filter({ hasText: /^响应发布状态$/ }).count(), 0)
      await shot('sync-process-1280-720'); await page.setViewportSize({ width: 1422, height: 804 })
    }
    await closeDrawer(log)
  }
  pass('list/detail interface types contain business names only; call mode follows receipt in a full-width row and known-sync event titles remain visible at 720px height')

  // The supplemental historical record is reachable by its real request ID and
  // retains the original missing-user case alongside its unrecorded call mode.
  await page.getByPlaceholder('输入完整业务请求 ID').fill('REQ-00000016')
  await page.getByPlaceholder('输入完整业务请求 ID').press('Enter'); await loaded(); assert.equal(await total(), 1)
  await openLog('REQ-00000016')
  assert.equal((await summaryValue('调用方式').innerText()).trim(), '未记录')
  assert.equal((await summaryValue('用户 ID').innerText()).trim(), '—')
  await shot('historical-mode-unrecorded-sample'); await closeDrawer(log)
  await button('重置').click(); await loaded(); assert.equal(await total(), 15)

  // Missing source data must remain unknown even when a record otherwise resembles an async sample.
  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    window.qaFollowupOriginalLogs = api.listLogs
    api.listLogs = async params => {
      const result = structuredClone(await window.qaFollowupOriginalLogs(params))
      const history = result.items.find(row => row.requestId === 'REQ-00000001')
      if (history) delete history.mode
      return result
    }
  })
  try {
    await button('查询').click(); await loaded(); await openLog('REQ-00000001')
    assert.equal((await summaryValue('调用方式').innerText()).trim(), '未记录')
    assert.equal((await summaryValue('接口类型').innerText()).trim(), '人脸注册')
    await shot('historical-mode-unrecorded'); await closeDrawer(log)
  } finally {
    await page.evaluate(async () => { (await import('/src/api/index.js')).default.listLogs = window.qaFollowupOriginalLogs; delete window.qaFollowupOriginalLogs })
  }
  await button('查询').click(); await loaded(); await openLog('REQ-00000014')
  for (const toggle of await log.locator('.stage-toggle[aria-expanded="false"]').all()) await toggle.click()
  const processText = await log.locator('.request-process').innerText()
  assert.doesNotMatch(processText, /接收\s*Stage\s*在此完成|落库后/)
  assert.match(processText, /任务状态\s*PENDING/); assert.match(processText, /调用方[：:]\s*MOSIP-Adapter/)
  assert.match(processText, /MQ\s*已确认发布/); assert.match(processText, /响应未被退回/)
  for (const kind of ['RECEIVED', 'TASK_SAVED', 'PUBLISH_CONFIRMED']) {
    const time = log.locator(`.event-entry[data-event-kind="${kind}"]`).first().locator(':scope > time')
    assert.match(await time.innerText(), /\d{2}:\d{2}:\d{2}/); assert.ok(await time.getAttribute('datetime'))
  }
  await shot('request-timeline-facts'); await closeDrawer(log)
  pass('missing call mode stays 未记录; timeline removes ordering commentary while retaining task status, occurrence times, caller and MQ delivery evidence')

  for (const [width, height] of [[1422, 804], [1280, 720]]) {
    await page.setViewportSize({ width, height })
    for (const id of ['REQ-00000014', 'REQ-00000015']) {
      await openLog(id)
      const showImages = async () => {
        await log.getByRole('tab', { name: '图像比对', exact: true }).click()
        await page.waitForFunction(() => [...document.querySelectorAll('.comparison-frame')].every(node => node.getAttribute('aria-busy') !== 'true'))
        await paint()
      }
      await showImages()
      const source = log.locator('.comparison-image').first(), candidate = log.locator('.comparison-image').last()
      const sourceImage = await source.locator('img').getAttribute('src'), sourceUser = await source.locator('.image-user').innerText()
      const controls = log.getByRole('group').filter({ has: page.getByRole('button', { name: '候选 1', exact: true }) })
      const geometry = async selection => {
        const bounds = []
        for (const selector of ['.image-title', '.comparison-frame', '.image-user', '.candidate-result > span']) {
          for (const element of await log.locator(selector).all()) bounds.push({ selector, bounds: await checkWithin(element, 0, height) })
        }
        const frames = bounds.filter(item => item.selector === '.comparison-frame').map(item => item.bounds)
        assert.equal(frames.length, 2)
        assert.ok(frames.every(frame => frame.width > 50 && frame.height >= 50))
        assert.ok(Math.abs(frames[0].y - frames[1].y) <= 1 && Math.abs(frames[0].height - frames[1].height) <= 1)
        measurements.push({ kind: 'comparison below call-mode row', viewport: { width, height }, requestId: id, selection, elements: bounds })
      }
      for (const index of [2, 3, 1]) {
        await controls.getByRole('button', { name: `候选 ${index}`, exact: true }).click(); await showImages()
        assert.equal(await controls.getByRole('button', { name: `候选 ${index}`, exact: true }).getAttribute('aria-pressed'), 'true')
        assert.equal(await source.locator('img').getAttribute('src'), sourceImage); assert.equal(await source.locator('.image-user').innerText(), sourceUser)
        assert.match(await candidate.locator('.candidate-result').innerText(), new RegExp(`本次响应[\\s\\S]*候选排名[：:]\\s*${index}[\\s\\S]*比对分数[：:]\\s*\\d`))
        assert.match(await candidate.locator('.image-user').innerText(), new RegExp(id.endsWith('14') ? `U10${index}` : `U20${index}`))
        await geometry(index)
      }
      await controls.getByRole('button', { name: '候选 2', exact: true }).click(); await showImages()
      const selectedSource = await candidate.locator('img').getAttribute('src'), selectedUser = await candidate.locator('.image-user').innerText()
      await log.getByRole('tab', { name: '处理过程', exact: true }).click(); await showImages()
      assert.equal(await controls.getByRole('button', { name: '候选 2', exact: true }).getAttribute('aria-pressed'), 'true')
      assert.equal(await candidate.locator('img').getAttribute('src'), selectedSource); assert.equal(await candidate.locator('.image-user').innerText(), selectedUser)
      assert.equal(await source.locator('img').getAttribute('src'), sourceImage)
      await geometry('2 after tab return')
      await shot(`comparison-${id.endsWith('14') ? '14' : '15'}-${width}`); await closeDrawer(log)
    }
  }
  pass('the call-mode row leaves both face/finger comparison frames, user IDs and response metadata visible at 1422×804 and 1280×720; all candidates preserve the source and tab changes preserve the selection')

  await page.setViewportSize({ width: 624, height: 850 }); await go('/applicants')
  await page.getByPlaceholder('输入完整申请人 ID').fill('U301'); await page.getByPlaceholder('输入完整申请人 ID').press('Enter'); await loaded(); assert.equal(await total(), 1)
  await openPerson('U301')
  const body = person.locator('.el-drawer__body'), bodyBox = await body.boundingBox()
  const visibleBottom = Math.min(850, bodyBox.y + bodyBox.height)
  const face = person.locator('[data-modality="face"] .enrollment-image')
  assert.equal(await face.locator('img').evaluate(node => getComputedStyle(node).objectFit), 'contain')
  await checkWithin(face, bodyBox.y, visibleBottom)
  const fingerGeometry = []
  for (const key of ['left_thumb', 'left_index', 'left_middle', 'left_ring']) {
    const slot = person.locator(`[data-finger="${key}"]`)
    for (const selector of ['h4', '.enrollment-image', '.quality-score']) fingerGeometry.push({ key, selector, bounds: await checkWithin(slot.locator(selector), bodyBox.y, visibleBottom) })
    assert.match((await slot.locator('h4').innerText()).trim(), /^(拇指|食指|中指|无名指)$/)
  }
  measurements.push({ kind: '624 applicant first four fingers', viewport: page.viewportSize(), body: bodyBox, fingers: fingerGeometry })
  await shot('applicant-U301-first-screen-624')
  const last = person.locator('.finger-slot').filter({ has: page.getByRole('button') }).last()
  await last.scrollIntoViewIfNeeded(); await last.getByRole('button').click(); await preview.waitFor()
  assert.equal(await preview.locator('img').evaluate(node => getComputedStyle(node).objectFit), 'contain')
  assert.match(await preview.innerText(), /U301/)
  await shot('applicant-remaining-finger-preview-624')
  await preview.getByRole('button', { name: '关闭图像', exact: true }).click(); await preview.waitFor({ state: 'hidden' })
  await person.getByRole('tab', { name: '入库变更记录', exact: true }).click()
  const changesPane = person.getByRole('tabpanel', { name: '入库变更记录', exact: true })
  assert.doesNotMatch(await changesPane.innerText(), /仅显示已生效的入库变更|失败请求可在日志查询/)
  assert.ok(await changesPane.evaluate(node => node.firstElementChild?.classList.contains('el-table')), 'change tab begins with the table')
  assert.ok(!(await changesPane.locator('.el-table__header th').allTextContents()).some(text => text.trim() === '模态'))
  const changes = await page.evaluate(async () => (await (await import('/src/api/index.js')).default.getApplicant('U301')).changes)
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index], row = person.locator('.enrollment-changes .el-table__row').nth(index)
    const operation = `${change.feature === 'face' ? '人脸' : '指纹'}${change.operation}`
    assert.equal((await row.locator('td').first().innerText()).trim(), operation)
    await row.getByRole('button', { name: '查看日志', exact: true }).click(); await page.waitForURL('**/logs?**'); await loaded()
    assert.equal(await total(), 1); assert.match(await table().locator('.el-table__row').innerText(), new RegExp(change.requestId))
    await openLog(change.requestId); assert.equal((await summaryValue('接口类型').innerText()).trim(), operation); await closeDrawer(log)
    await button('返回申请人详情').click(); await page.waitForURL('**/applicants'); await person.waitFor(); await loaded()
    assert.equal(await person.getByRole('tab', { name: '入库变更记录', exact: true }).getAttribute('aria-selected'), 'true')
    assert.match(await person.locator('.applicant-summary').innerText(), /U301/)
  }
  await shot('applicant-change-tab-direct-table'); await closeDrawer(person)
  pass('624px applicant drawer shows the contained face and complete first four left-hand cards; remaining fingers preview, and every table-first change opens its exact request then restores the tab')

  await go('/audits')
  const filters = page.locator('.audits-filters')
  const controls = [field(filters, '时间范围').locator('.range-trigger'), field(filters, '操作人').locator('.el-input'), field(filters, '操作类型').locator('.el-select'), field(filters, '结果').locator('.el-select')]
  const controlBounds = await Promise.all(controls.map(control => control.boundingBox()))
  assert.ok(Math.max(...controlBounds.map(box => box.x)) - Math.min(...controlBounds.map(box => box.x)) <= 1)
  measurements.push({ kind: '624 audit filter alignment', controls: controlBounds })
  await button('选择时间范围').click()
  const date = page.getByRole('dialog', { name: '选择时间范围', exact: true }); await date.waitFor()
  const days = await date.locator('.range-day').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')))
  await date.getByRole('button', { name: days[14], exact: true }).click(); await date.getByRole('button', { name: days[15], exact: true }).click()
  await date.getByLabel('开始时间', { exact: true }).fill('08:00:00'); await date.getByLabel('结束时间', { exact: true }).fill('18:00:00')
  await date.getByRole('button', { name: '确定', exact: true }).click(); await date.waitFor({ state: 'hidden' })
  assert.match(await controls[0].innerText(), /08:00:00/); assert.match(await controls[0].innerText(), /18:00:00/)
  await button('选择时间范围').click(); await date.getByRole('button', { name: '清空', exact: true }).click(); await date.waitFor({ state: 'hidden' })
  await page.getByPlaceholder('输入完整账号').fill('admin')
  for (const [label, option] of [['操作类型', '登录'], ['结果', '成功']]) {
    await field(filters, label).locator('.el-select').click(); await page.getByRole('option', { name: option, exact: true }).click()
  }
  await button('查询').click(); await loaded(); assert.ok(await total() > 0)
  for (const row of await table().locator('.el-table__row').all()) {
    assert.equal((await row.locator('td:nth-child(2)').innerText()).trim(), 'admin')
    assert.equal((await row.locator('td:nth-child(4)').innerText()).trim(), '登录')
    assert.equal((await row.locator('td:nth-child(6)').innerText()).trim(), '成功')
  }
  await shot('audit-aligned-filters-624'); await button('重置').click(); await loaded()
  assert.equal(await page.getByPlaceholder('输入完整账号').inputValue(), ''); assert.equal(await total(), 64)
  pass('624px audit date/operator/action/result controls align on one left edge and preserve date/time, dropdown, query and reset interactions')

  const workspace = page.locator('.workspace-main')
  for (const [width, height] of [[1422, 804], [1280, 720], [624, 850]]) {
    await page.setViewportSize({ width, height }); await go('/threshold')
    const title = workspace.getByRole('heading', { name: '匹配阈值配置', exact: true })
    assert.equal(await title.count(), 1); assert.ok(await title.evaluate(node => !!node.closest('.el-card')))
    assert.equal(await workspace.locator('.breadcrumb,.page-intro').count(), 0)
    const form = workspace.locator('.threshold-form'), fields = workspace.locator('.threshold-field')
    const boxes = await fields.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))
    const formBox = await form.boundingBox()
    assert.ok(Math.abs(boxes[0].width - boxes[1].width) <= 1)
    assert.ok(Math.abs(boxes[0].x - formBox.x) <= 1)
    if (width >= 1280) {
      assert.ok(Math.abs(boxes[0].y - boxes[1].y) <= 1)
      assert.ok(Math.abs(boxes[1].x + boxes[1].width - formBox.x - formBox.width) <= 1)
    } else {
      assert.ok(Math.abs(boxes[0].x - boxes[1].x) <= 1 && boxes[1].y >= boxes[0].y + boxes[0].height)
      assert.ok(Math.abs(boxes[0].width - formBox.width) <= 1)
    }
    const fillsCard = await form.evaluate(node => {
      const body = node.closest('.el-card__body'), r = body.getBoundingClientRect(), style = getComputedStyle(body), form = node.getBoundingClientRect()
      return { left: form.left - r.left - parseFloat(style.paddingLeft), right: r.right - form.right - parseFloat(style.paddingRight) }
    })
    assert.ok(Math.abs(fillsCard.left) <= 1 && Math.abs(fillsCard.right) <= 1)
    const rule = await workspace.getByText('调用方指定阈值时，以请求值为准。', { exact: true }).boundingBox()
    const actions = await workspace.locator('.threshold-actions').boundingBox(), lastFieldBottom = Math.max(...boxes.map(box => box.y + box.height))
    assert.ok(rule.y >= lastFieldBottom - 1 && rule.y - lastFieldBottom <= 24)
    assert.ok(actions.y >= rule.y + rule.height - 1 && actions.y - rule.y - rule.height <= 24)
    assert.equal(await workspace.locator('.el-divider,hr').count(), 0)
    measurements.push({ kind: 'threshold layout', viewport: { width, height }, fields: boxes, form: formBox, rule, actions, fillsCard })
    await shot(`threshold-layout-${width}`)
  }
  const thresholdFields = workspace.locator('.threshold-field'), inputs = thresholdFields.locator('input')
  const values = async () => Promise.all([inputs.nth(0).inputValue(), inputs.nth(1).inputValue()])
  const setValues = async (face, finger) => { await inputs.nth(0).fill(String(face)); await inputs.nth(0).blur(); await inputs.nth(1).fill(String(finger)); await inputs.nth(1).blur(); await paint() }
  const original = await values()
  assert.equal(await button('保存修改').isDisabled(), true)
  for (const [face, finger, index, bound] of [[59, 55, 0, 60], [75, 39, 1, 40]]) {
    await setValues(face, finger); assert.match(await thresholdFields.nth(index).getByRole('alert').innerText(), new RegExp(`协议生效下限\\s*${bound}`)); assert.equal(await button('保存修改').isDisabled(), true)
  }
  await setValues(60, 40); assert.equal(await thresholdFields.getByRole('alert').count(), 0); assert.equal(await button('保存修改').isEnabled(), true)
  await setValues(61, 41); await workspace.getByText('未保存', { exact: true }).waitFor(); await button('保存修改').click(); await confirmation().waitFor()
  assert.equal((await confirmation().locator('.el-message-box__title').innerText()).trim(), '保存阈值修改？')
  for (const [oldValue, newValue] of [[original[0], 61], [original[1], 41]]) assert.match(await confirmation().innerText(), new RegExp(`${oldValue}\\s*→\\s*${newValue}`))
  await confirmation().getByRole('button', { name: '取消', exact: true }).click(); await confirmation().waitFor({ state: 'hidden' }); assert.deepEqual(await values(), ['61', '41'])
  await button('保存修改').click(); await confirmation().getByRole('button', { name: '保存', exact: true }).click(); await confirmation().waitFor({ state: 'hidden' }); await loaded()
  assert.equal(await workspace.getByText('未保存', { exact: true }).count(), 0); await go('/monitor'); await go('/threshold'); assert.deepEqual(await values(), ['61', '41'])
  await button('填入默认值').click(); assert.deepEqual(await values(), ['60', '60']); await startNavigation('/monitor'); await confirmation().waitFor()
  await confirmation().getByRole('button', { name: '继续编辑', exact: true }).click(); await confirmation().waitFor({ state: 'hidden' }); assert.equal(new URL(page.url()).pathname, '/threshold')
  await startNavigation('/monitor'); await confirmation().getByRole('button', { name: '放弃修改', exact: true }).click(); await page.waitForURL('**/monitor')
  await go('/threshold'); assert.deepEqual(await values(), ['61', '41'])
  await button('填入默认值').click(); await button('保存修改').click(); await confirmation().getByRole('button', { name: '保存', exact: true }).click(); await confirmation().waitFor({ state: 'hidden' }); await loaded()
  await go('/monitor'); await go('/threshold'); assert.deepEqual(await values(), ['60', '60'])
  pass('threshold card owns one title, fills two equal desktop columns or one narrow column, keeps the priority rule beside inputs/actions, and retains bounds/dirty/confirm/default/save/leave behavior')

  assert.deepEqual(errors, []); assert.deepEqual(backendRequests, []); pass('zero browser errors and zero real-backend calls')
  console.log(`COMPLETE ${checks.length} checks`)
} catch (error) {
  failure = { message: error.message, stack: error.stack, url: page.url() }
  await shot('failure').catch(() => {})
  console.error(error); process.exitCode = 1
} finally {
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ base, checks, measurements, visualReview, errors, backendRequests, failure }, null, 2))
  await browser.close()
}
