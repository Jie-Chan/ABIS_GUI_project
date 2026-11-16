import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Run with ABIS_PREVIEW_URL=http://127.0.0.1:5186 node review-console-20261116.mjs.
// Browser sessions own their Mock changes; only the missing audit-field case injects a boundary fixture.
const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
const out = process.env.ABIS_QA_OUTPUT_DIR || fileURLToPath(new URL('./qa-output/console-20261116/', import.meta.url))
await fs.mkdir(out, { recursive: true })
await fs.rm(`${out}/failure.png`, { force: true })
assert.match(await (await fetch(`${base}/src/api/index.js`)).text(), /"VITE_USE_MOCK": "true"/)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
page.setDefaultTimeout(10000)
const checks = [], measurements = [], errors = [], backendRequests = []
let failure = null
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
async function startNavigation(path) {
  await page.evaluate(path => { void document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path) }, path)
}
const field = (scope, name) => scope.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: new RegExp(`^${name}$`) }) })
const descriptionRow = (scope, name) => scope.locator('tr').filter({ has: page.locator('.el-descriptions__label').filter({ hasText: new RegExp(`^${name}$`) }) })
const descriptionValue = (scope, name) => scope.locator('.el-descriptions__label').filter({ hasText: new RegExp(`^${name}$`) }).locator('xpath=following-sibling::*[contains(@class,"el-descriptions__content")][1]').innerText()
const table = () => page.locator('.workspace-main > div > .el-card > .el-card__body > .el-table')
const total = async () => Number((await page.locator('.records-footer .el-pagination__total').innerText()).match(/\d+/)[0])
const log = page.getByRole('dialog', { name: '请求详情', exact: true })
const person = page.getByRole('dialog', { name: '申请人详情', exact: true })
const preview = page.getByRole('dialog', { name: '入库图像详情', exact: true })
const confirmation = () => page.locator('.el-message-box:visible')
async function closeDrawer(drawer) { await drawer.locator('.el-drawer__close-btn').click(); await drawer.waitFor({ state: 'hidden' }) }
async function openLog(id) {
  await page.locator('.request-table .el-table__row').filter({ hasText: id }).getByRole('button', { name: '详情', exact: true }).click()
  await log.waitFor(); await paint()
}
async function openPerson(id) {
  await page.locator('.applicants-page .el-table__row').filter({ hasText: id }).getByRole('button', { name: '查看详情', exact: true }).click()
  await person.waitFor(); await loaded(); await paint()
}
async function queryLog(id) {
  await button('重置').click(); await loaded()
  await page.getByPlaceholder('输入完整业务请求 ID').fill(id)
  await page.getByPlaceholder('输入完整业务请求 ID').press('Enter'); await loaded()
  assert.equal(await total(), 1)
}
async function login(password = 'admin123') {
  await page.locator('.login-content input').nth(0).fill('admin')
  await page.locator('.login-content input').nth(1).fill(password)
  await button('登录').click(); await page.waitForURL('**/monitor'); await loaded()
}
async function images() {
  await log.getByRole('tab', { name: '图像比对', exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('.comparison-frame')].every(node => node.getAttribute('aria-busy') !== 'true'))
  await paint()
}
async function download() {
  const pending = page.waitForEvent('download'); await button('导出 CSV').click()
  return fs.readFile(await (await pending).path(), 'utf8')
}

try {
  for (const [width, height] of [[1440, 900], [1280, 720], [390, 844]]) {
    await page.setViewportSize({ width, height }); await page.goto(`${base}/login`); await paint()
    const content = page.locator('.login-content')
    assert.match((await content.locator('.brand').innerText()).replace(/\s+/g, ''), /ABIS管理控制台/)
    assert.doesNotMatch(await content.innerText(), /欢迎登录|请使用控制台账户登录/)
    assert.equal(await page.locator('.login-page footer').count(), 0)
    assert.deepEqual(await content.locator('input').evaluateAll(nodes => nodes.map(node => node.getAttribute('placeholder') || '')), ['', ''])
    const geometry = await content.evaluate(node => {
      const box = element => { const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height, center: x + width / 2 } }
      const brand = node.querySelector('.brand')
      const children = [...brand.children].filter(element => element.getBoundingClientRect().width > 0)
      const left = Math.min(...children.map(element => element.getBoundingClientRect().left)), right = Math.max(...children.map(element => element.getBoundingClientRect().right))
      return { title: { left, right, width: right - left, center: (left + right) / 2 }, fields: [...node.querySelectorAll('.el-input')].map(box), labels: [...node.querySelectorAll('.el-form-item__label')].map(box), button: box(node.querySelector('.login-button')), content: box(node), documentWidth: document.documentElement.scrollWidth }
    })
    measurements.push({ kind: 'login geometry', viewport: { width, height }, ...geometry })
    for (const box of [...geometry.fields, geometry.button]) {
      assert.ok(Math.abs(box.center - width / 2) <= 2, `login control center: ${JSON.stringify(box)}`)
      assert.ok(Math.abs(box.width - geometry.fields[0].width) <= 1)
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height)
    }
    assert.ok(Math.abs(geometry.title.center - width / 2) <= 2)
    assert.ok(geometry.title.left >= 0 && geometry.title.right <= width)
    if (width >= 1280) assert.ok(geometry.title.width / geometry.fields[0].width >= .82 && geometry.title.width / geometry.fields[0].width <= .92, `title/form ratio: ${geometry.title.width / geometry.fields[0].width}`)
    geometry.labels.forEach((label, index) => {
      assert.ok(Math.abs(label.x - geometry.fields[index].x) <= 1)
      assert.ok(label.y + label.height <= geometry.fields[index].y + 1)
    })
    assert.ok(geometry.documentWidth <= width + 1)
    await shot(`login-${width}-${height}`)
    await button('登录').click()
    const inlineError = content.getByText('请输入用户名与密码', { exact: true })
    await inlineError.waitFor()
    assert.equal(new URL(page.url()).pathname, '/login')
    if (width === 390) {
      await content.locator('input').nth(0).fill('admin'); await content.locator('input').nth(1).fill('wrong-password')
      await button('登录').click(); await loaded()
      await content.getByText('用户名或密码错误', { exact: true }).waitFor()
    }
    const error = await content.locator('[role="alert"],.el-form-item__error').filter({ visible: true }).first().boundingBox()
    const contentBox = await content.boundingBox()
    assert.ok(error && error.x >= contentBox.x - 1 && error.x + error.width <= contentBox.x + contentBox.width + 1 && error.y + error.height <= height)
    await shot(`login-inline-error-${width}`)
    await login()
  }
  pass('login is centered at 1440×900, 1280×720 and 390px; desktop title is about 87% of equal-width controls, labels align, errors stay inline and login succeeds')

  await page.setViewportSize({ width: 1422, height: 804 }); await go('/logs')
  const headers = await table().locator('.el-table__header th').allTextContents()
  const durationColumn = headers.findIndex(text => text.trim() === '请求耗时') + 1
  assert.ok(durationColumn > 0)
  const completed = table().locator('.el-table__row').filter({ hasText: 'REQ-00000014' }).locator(`td:nth-child(${durationColumn})`)
  assert.match((await completed.innerText()).trim(), /^\d+(?:\.\d+)?\s*(?:ms|s|秒|分钟|分|h|小时)$/)
  assert.doesNotMatch(await completed.innerText(), /总耗时|已用时/)
  const ongoing = table().locator('.el-table__row').filter({ hasText: 'REQ-00000009' }).locator(`td:nth-child(${durationColumn})`)
  assert.match(await ongoing.innerText(), /已用时/); assert.match(await ongoing.innerText(), /\d/)
  await shot('request-duration')
  pass('completed request duration contains only value/unit while an active request retains 已用时')

  await openLog('REQ-00000014')
  for (const stageName of ['接收请求', '发布结果']) {
    const stage = log.locator('.request-stage').filter({ has: page.locator('.stage-name').filter({ hasText: new RegExp(`^${stageName}$`) }) }).first()
    const toggle = stage.locator(':scope > .stage-toggle')
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
  }
  const received = log.locator('.event-entry[data-event-kind="RECEIVED"]').first()
  assert.match(await received.innerText(), /调用方[：:]\s*MOSIP-Adapter/)
  assert.match(await received.locator('time').innerText(), /\d{2}:\d{2}:\d{2}/)
  assert.ok(await received.locator('time').getAttribute('datetime'))
  assert.doesNotMatch(await received.innerText(), /适配服务首次收到本次请求\s*MQ\s*消息|ABIS\s*入口记录本次业务对象和接口类型/)
  const publication = log.locator('.request-stage[data-stage="ADAPTER_RESPONDED"]')
  assert.match(await publication.innerText(), /MQ\s*已确认发布/)
  assert.match(await publication.innerText(), /响应未被退回/)
  await shot('request-receive-publish'); await closeDrawer(log)
  pass('receiving event keeps its actual time/caller without restating receipt; publishing keeps MQ confirmation and non-return facts')

  for (const [width, height] of [[1422, 804], [1280, 720], [624, 850]]) {
    await page.setViewportSize({ width, height })
    for (const id of ['REQ-00000014', 'REQ-00000015']) {
      await openLog(id); await images()
      assert.equal(await log.getByText('候选图像', { exact: true }).count(), 1)
      const group = log.getByRole('group').filter({ has: page.getByRole('button', { name: '候选 1', exact: true }) })
      assert.equal(await group.count(), 1)
      assert.ok(await group.evaluate(node => (node.getAttribute('aria-label') || document.getElementById(node.getAttribute('aria-labelledby'))?.textContent || '').trim()), 'candidate controls need an accessible group name')
      assert.deepEqual(await group.getByRole('button').allTextContents(), ['候选 1', '候选 2', '候选 3'])
      const left = log.locator('.comparison-image').first(), right = log.locator('.comparison-image').last()
      const original = { source: await left.locator('img').getAttribute('src'), user: await left.locator('.image-user').innerText() }
      for (const [index, user, score] of id.endsWith('14') ? [[2, 'U102', '92.3'], [3, 'U103', '86.8'], [1, 'U101', '97.5']] : [[2, 'U202', '94.6'], [3, 'U203', '89.1'], [1, 'U201', '98.2']]) {
        await group.getByRole('button', { name: `候选 ${index}`, exact: true }).click(); await images()
        assert.equal(await group.getByRole('button', { name: `候选 ${index}`, exact: true }).getAttribute('aria-pressed'), 'true')
        assert.match(await right.locator('.image-user').innerText(), new RegExp(user))
        assert.match(await right.locator('.candidate-result').innerText(), new RegExp(`本次响应[\\s\\S]*候选排名[：:]\\s*${index}[\\s\\S]*比对分数[：:]\\s*${score.replace('.', '\\.')}`))
        assert.equal(await left.locator('img').getAttribute('src'), original.source); assert.equal(await left.locator('.image-user').innerText(), original.user)
        assert.equal(await log.getByText('图像为当前入库版本', { exact: true }).count(), 1)
        const frames = await log.locator('.comparison-frame').evaluateAll(nodes => nodes.map(node => ({ y: node.getBoundingClientRect().y, height: node.getBoundingClientRect().height })))
        assert.ok(Math.abs(frames[0].y - frames[1].y) <= 1 && Math.abs(frames[0].height - frames[1].height) <= 1)
        for (const userLabel of await log.locator('.image-user').all()) { const box = await userLabel.boundingBox(); assert.ok(box.y + box.height <= height + 1) }
      }
      await shot(`${id.endsWith('14') ? 'finger' : 'face'}-candidates-${width}`); await closeDrawer(log)
    }
  }
  pass('candidate controls have an accessible group name and one right-side title; all three face/finger candidates update the response while retaining the query image at desktop/narrow widths')
  await page.setViewportSize({ width: 1422, height: 804 })
  for (const [id, text] of [['REQ-00000003', '本次查重无候选'], ['REQ-00000009', '查重处理中'], ['REQ-00000011', '本次查重失败']]) {
    await openLog(id); await images(); await log.getByText(text, { exact: true }).waitFor(); await closeDrawer(log)
  }
  await queryLog('REQ-00000016'); await openLog('REQ-00000016')
  assert.match(await log.locator('.request-summary').innerText(), /用户 ID[\s\S]*—/); await closeDrawer(log)
  pass('no-candidate, processing and failed comparisons remain distinct, and a request lacking user ID is queryable by Enter')

  await go('/applicants'); await page.getByPlaceholder('输入完整申请人 ID').fill('U301'); await page.getByPlaceholder('输入完整申请人 ID').press('Enter'); await loaded(); assert.equal(await total(), 1)
  await openPerson('U301')
  const leftHand = person.locator('.hand-group').filter({ has: page.getByRole('heading', { name: '左手', exact: true }) })
  const finger = leftHand.locator('[data-finger="left_index"]')
  assert.equal((await finger.locator('h4').innerText()).trim(), '食指')
  assert.equal(await leftHand.getByRole('heading', { name: '左手食指', exact: true }).count(), 0)
  const fingerButton = finger.getByRole('button', { name: /左手食指/ })
  assert.equal(await fingerButton.count(), 1); assert.match(await finger.locator('img').getAttribute('alt'), /U301.*左手食指/)
  const thumbSource = await finger.locator('img').getAttribute('src'), thumbQuality = (await finger.locator('.quality-score').innerText()).trim()
  assert.equal(thumbQuality, '97')
  await fingerButton.click(); await preview.waitFor()
  assert.equal((await descriptionValue(preview, '指位')).trim(), '左手食指')
  assert.equal((await descriptionValue(preview, '申请人 ID')).trim(), 'U301')
  assert.equal((await descriptionValue(preview, '质量分')).trim(), thumbQuality)
  assert.equal(await preview.locator('img').getAttribute('src'), thumbSource)
  await shot('applicant-full-finger-preview')
  await preview.getByRole('button', { name: '关闭图像', exact: true }).click(); await preview.waitFor({ state: 'hidden' })
  await page.setViewportSize({ width: 624, height: 850 }); await paint()
  for (const hand of await person.locator('.hand-group').all()) {
    const heading = await hand.locator('h3').innerText()
    for (const card of await hand.locator('.finger-slot').all()) {
      assert.match((await card.locator('h4').innerText()).trim(), /^(拇指|食指|中指|无名指|小指)$/)
      const accessibleName = await card.evaluate(node => [node, ...node.querySelectorAll('[aria-label]')].map(item => item.getAttribute('aria-label') || '').join(' '))
      assert.match(accessibleName, new RegExp(heading))
    }
  }
  await shot('applicant-hand-groups-624'); await page.setViewportSize({ width: 1422, height: 804 })
  await person.getByRole('tab', { name: '入库变更记录', exact: true }).click()
  assert.ok(!(await person.locator('.enrollment-changes .el-table__header th').allTextContents()).map(text => text.trim()).includes('模态'))
  const changes = await page.evaluate(async () => (await (await import('/src/api/index.js')).default.getApplicant('U301')).changes)
  assert.ok(changes.some(row => row.feature === 'finger' && row.operation === '注册' && row.fingerCount === 8))
  for (let index = 0; index < changes.length; index++) {
    const change = changes[index], row = person.locator('.enrollment-changes .el-table__row').nth(index)
    const operation = `${change.feature === 'face' ? '人脸' : '指纹'}${change.operation}`
    assert.equal((await row.locator('td').first().innerText()).trim(), operation)
    await row.getByRole('button', { name: '查看日志', exact: true }).click(); await page.waitForURL('**/logs?**'); await loaded()
    assert.equal(await total(), 1); assert.match(await table().locator('.el-table__row').innerText(), new RegExp(change.requestId))
    assert.match(await table().locator('.el-table__row').innerText(), /U301/)
    await openLog(change.requestId); assert.match(await log.locator('.request-summary').innerText(), new RegExp(operation)); await closeDrawer(log)
    await page.getByRole('button', { name: '返回申请人详情', exact: true }).click(); await page.waitForURL('**/applicants'); await person.waitFor(); await loaded()
    assert.equal(await person.getByRole('tab', { name: '入库变更记录', exact: true }).getAttribute('aria-selected'), 'true')
    assert.match(await person.locator('.applicant-summary').innerText(), /U301/)
  }
  await shot('applicant-changes'); await closeDrawer(person)
  pass('hand groups use short visible finger labels while accessible names/previews retain hand; current quality stays bound to the image and every modality-specific change opens its exact request then restores the detail')

  await go('/audits')
  const audit = page.getByRole('dialog', { name: '审计记录详情', exact: true })
  for (const action of ['登录', '登出', '密码重置']) {
    const row = table().locator('.el-table__row').filter({ has: page.locator('td:nth-child(4)').filter({ hasText: new RegExp(`^${action}$`) }) }).first()
    const operator = (await row.locator('td:nth-child(2)').innerText()).trim()
    await row.getByRole('button', { name: '详情', exact: true }).click(); await audit.waitFor()
    assert.equal((await descriptionValue(audit, '操作人')).trim(), operator)
    for (const label of ['会话 ID', '来源 IP', '时间', '结果']) assert.ok((await descriptionValue(audit, label)).trim())
    assert.equal(await descriptionRow(audit, '变更前值').count(), 0); assert.equal(await descriptionRow(audit, '变更后值').count(), 0)
    await audit.locator('.el-dialog__headerbtn').click(); await audit.waitFor({ state: 'hidden' })
  }
  const changed = table().locator('.el-table__row').filter({ hasText: '修改匹配阈值' }).first()
  await changed.getByRole('button', { name: '详情', exact: true }).click(); await audit.waitFor()
  assert.equal((await descriptionValue(audit, '变更前值')).trim(), '70'); assert.equal((await descriptionValue(audit, '变更后值')).trim(), '75')
  await shot('audit-threshold-before-after'); await audit.locator('.el-dialog__headerbtn').click(); await audit.waitFor({ state: 'hidden' })
  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    window.qa20261116OriginalAudits = api.listAudits
    api.listAudits = async params => {
      const result = structuredClone(await window.qa20261116OriginalAudits(params))
      const row = result.items.find(row => row.action === '修改匹配阈值')
      if (row) { delete row.beforeValue; delete row.afterValue }
      return result
    }
  })
  try {
    await button('查询').click(); await loaded(); await changed.getByRole('button', { name: '详情', exact: true }).click(); await audit.waitFor()
    assert.equal((await descriptionValue(audit, '变更前值')).trim(), '—'); assert.equal((await descriptionValue(audit, '变更后值')).trim(), '—')
    await shot('audit-applicable-missing-values'); await audit.locator('.el-dialog__headerbtn').click(); await audit.waitFor({ state: 'hidden' })
  } finally {
    await page.evaluate(async () => { (await import('/src/api/index.js')).default.listAudits = window.qa20261116OriginalAudits; delete window.qa20261116OriginalAudits })
  }
  await page.getByPlaceholder('输入完整账号').fill('admin'); await page.getByPlaceholder('输入完整账号').press('Enter'); await loaded()
  assert.ok((await table().locator('.el-table__row td:nth-child(2)').allTextContents()).every(text => text.trim() === 'admin'))
  const enterCsv = await download(); assert.equal(enterCsv.trim().split(/\r?\n/).length, await total() + 1)
  await button('查询').click(); await loaded(); assert.equal(await download(), enterCsv)
  pass('non-change audit details omit before/after rows; threshold changes retain values and missing-field dashes, with Enter/query/CSV behavior preserved')

  await go('/threshold')
  const workspace = page.locator('.workspace-main'), thresholdFields = page.locator('.threshold-field')
  const thresholdInputs = thresholdFields.locator('input')
  const values = async () => Promise.all([thresholdInputs.nth(0).inputValue(), thresholdInputs.nth(1).inputValue()])
  const setValues = async (face, finger) => { await thresholdInputs.nth(0).fill(String(face)); await thresholdInputs.nth(0).blur(); await thresholdInputs.nth(1).fill(String(finger)); await thresholdInputs.nth(1).blur(); await paint() }
  const original = await values()
  assert.equal(await workspace.getByRole('heading', { name: '匹配阈值配置', exact: true }).count(), 1)
  assert.equal(await workspace.locator('.breadcrumb').count(), 0)
  assert.equal(await workspace.getByText('保存后生效', { exact: true }).count(), 0)
  await workspace.getByText('调用方指定阈值时，以请求值为准。', { exact: true }).waitFor()
  assert.equal(await workspace.getByText('未保存', { exact: true }).count(), 0)
  assert.equal(await button('保存修改').isDisabled(), true)
  for (const [face, finger, index, minimum] of [[59, 60, 0, 60], [60, 39, 1, 40]]) {
    await setValues(face, finger)
    assert.match(await thresholdFields.nth(index).getByRole('alert').innerText(), new RegExp(`协议生效下限\\s*${minimum}`))
    assert.equal(await button('保存修改').isDisabled(), true)
  }
  await setValues(60, 40); assert.equal(await page.locator('.threshold-field [role="alert"]').count(), 0); assert.equal(await button('保存修改').isEnabled(), true)
  await setValues(61, 41); await workspace.getByText('未保存', { exact: true }).waitFor(); await button('保存修改').click()
  await confirmation().waitFor(); assert.equal((await confirmation().locator('.el-message-box__title').innerText()).trim(), '保存阈值修改？')
  assert.match(await confirmation().innerText(), new RegExp(`${original[0]}\\s*→\\s*61`)); assert.match(await confirmation().innerText(), new RegExp(`${original[1]}\\s*→\\s*41`))
  await shot('threshold-save-confirmation')
  await confirmation().getByRole('button', { name: '取消', exact: true }).click(); await confirmation().waitFor({ state: 'hidden' })
  assert.deepEqual(await values(), ['61', '41']); await workspace.getByText('未保存', { exact: true }).waitFor()
  await button('保存修改').click(); await confirmation().getByRole('button', { name: '保存', exact: true }).click(); await confirmation().waitFor({ state: 'hidden' }); await loaded()
  assert.deepEqual(await values(), ['61', '41']); assert.equal(await workspace.getByText('未保存', { exact: true }).count(), 0); assert.equal(await button('保存修改').isDisabled(), true)
  await go('/monitor'); await go('/threshold'); assert.deepEqual(await values(), ['61', '41'])
  await button('填入默认值').click(); assert.deepEqual(await values(), ['60', '60']); await workspace.getByText('未保存', { exact: true }).waitFor()
  await startNavigation('/monitor'); await confirmation().waitFor(); assert.match(await confirmation().innerText(), /未保存/)
  await confirmation().getByRole('button', { name: '继续编辑', exact: true }).click(); await confirmation().waitFor({ state: 'hidden' })
  assert.equal(new URL(page.url()).pathname, '/threshold'); assert.deepEqual(await values(), ['60', '60'])
  await startNavigation('/monitor'); await confirmation().getByRole('button', { name: '放弃修改', exact: true }).click(); await page.waitForURL('**/monitor')
  await go('/threshold'); assert.deepEqual(await values(), ['61', '41'])
  await button('填入默认值').click(); await button('保存修改').click(); await confirmation().getByRole('button', { name: '保存', exact: true }).click(); await loaded(); await confirmation().waitFor({ state: 'hidden' })
  await go('/monitor'); await go('/threshold'); assert.deepEqual(await values(), ['60', '60']); await shot('threshold-clean')
  // A one-field change should list only that field, without an unchanged threshold row.
  await setValues(62, 60); await button('保存修改').click(); await confirmation().waitFor()
  assert.match(await confirmation().innerText(), /人脸/); assert.doesNotMatch(await confirmation().locator('.el-message-box__message').innerText(), /指纹/)
  await confirmation().getByRole('button', { name: '取消', exact: true }).click(); await setValues(60, 60)
  pass('threshold page has one title and dirty-only state; lower bounds, changed-field confirmation, cancel/save, default values and stay/discard navigation all work')

  await button('账户菜单').click(); await page.getByRole('menuitem', { name: '个人信息', exact: true }).click(); await loaded()
  const profile = page.getByRole('dialog', { name: '个人信息', exact: true })
  await profile.waitFor()
  assert.equal(await profile.locator('.profile-summary').count(), 0)
  assert.equal(await profile.getByText('admin', { exact: true }).count(), 1); assert.equal(await profile.getByText('管理员', { exact: true }).count(), 1)
  for (const label of ['用户名', '角色']) assert.equal(await descriptionRow(profile, label).count(), 1)
  await shot('profile-details')
  await profile.getByRole('tab', { name: '修改密码', exact: true }).click()
  assert.equal(await profile.getByText('新密码至少 7 位', { exact: true }).count(), 1)
  await profile.getByText('修改成功后请重新登录。', { exact: true }).waitFor()
  await field(profile, '原密码').locator('input').fill('admin123')
  await field(profile, '新密码').locator('input').fill('qaPass'); await field(profile, '确认新密码').locator('input').fill('qaPass')
  await profile.getByRole('button', { name: '保存新密码', exact: true }).click()
  await field(profile, '新密码').getByRole('alert').waitFor()
  assert.equal(await profile.getByText('新密码至少 7 位', { exact: true }).count(), 1)
  assert.equal(await confirmation().count(), 0)
  await shot('profile-password-six')
  await field(profile, '新密码').locator('input').fill('qaPass7'); await field(profile, '确认新密码').locator('input').fill('qaPass7')
  await profile.getByRole('button', { name: '保存新密码', exact: true }).click(); await confirmation().waitFor()
  assert.equal(await field(profile, '新密码').getByRole('alert').count(), 0)
  await confirmation().getByRole('button', { name: '确定', exact: true }).click(); await page.waitForURL('**/login')
  await login('qaPass7')
  pass('profile lists username/role once, gives one concise length hint, rejects six characters, accepts seven and requires a successful fresh login')

  assert.deepEqual(errors, []); assert.deepEqual(backendRequests, []); pass('zero browser errors and zero real-backend calls')
  console.log(`COMPLETE ${checks.length} checks`)
} catch (error) {
  failure = { message: error.message, stack: error.stack, url: page.url() }
  await shot('failure').catch(() => {})
  console.error(error); process.exitCode = 1
} finally {
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ base, checks, measurements, errors, backendRequests, failure }, null, 2))
  await browser.close()
}
