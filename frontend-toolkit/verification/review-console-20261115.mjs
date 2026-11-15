import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
assert.match(await (await fetch(`${base}/src/api/index.js`)).text(), /"VITE_USE_MOCK": "true"/)
const out = './qa-output/console-20261115'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1422, height: 804 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
page.setDefaultTimeout(10000)
const checks = [], measurements = [], errors = [], backendRequests = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('request', request => {
  const url = new URL(request.url())
  if (['fetch', 'xhr'].includes(request.resourceType()) && (url.origin !== base || /^\/(admin-api|abis-admin)(\/|$)/.test(url.pathname))) backendRequests.push(request.url())
})
const button = name => page.getByRole('button', { name, exact: true })
const loaded = () => page.waitForFunction(() => !document.querySelector('.el-loading-mask,.el-button.is-loading'))
const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
const go = async path => { await page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path); await page.waitForURL(`**${path}`); await loaded(); await paint() }
const pass = label => { checks.push(label); console.log('PASS', label) }
const table = () => page.locator('.workspace-main > div > .el-card > .el-card__body > .el-table')
const wrap = () => table().locator('.el-table__body-wrapper .el-scrollbar__wrap')
const footer = () => page.locator('.records-footer')
const total = async () => Number((await footer().locator('.el-pagination__total').innerText()).match(/\d+/)[0])
const log = page.getByRole('dialog', { name: '请求详情', exact: true })
const person = page.getByRole('dialog', { name: '申请人详情', exact: true })
const preview = page.getByRole('dialog', { name: '入库图像详情', exact: true })
async function openLog(id) {
  await page.locator('.request-table .el-table__row').filter({ hasText: id }).click()
  await log.waitFor()
  await page.waitForFunction(() => Math.abs(document.querySelector('.request-log-drawer').getBoundingClientRect().right - innerWidth) < 1)
}
async function closeDrawer(drawer) { await drawer.getByRole('button', { name: '关闭', exact: true }).click(); await drawer.waitFor({ state: 'hidden' }) }
async function openPerson(id) {
  await page.locator('.applicants-page .el-table__row').filter({ hasText: id }).getByRole('button', { name: '查看详情', exact: true }).click()
  await person.waitFor(); await loaded()
  await page.waitForFunction(() => Math.abs(document.querySelector('.applicant-drawer').getBoundingClientRect().right - innerWidth) < 1)
}
async function drawerGap(drawer, selector, kind) {
  const header = await drawer.locator('.el-drawer__header').boundingBox(), summary = await drawer.locator(selector).boundingBox()
  const gap = summary.y - header.y - header.height
  assert.ok(gap >= 16 && gap <= 20, `${kind} gap: ${gap}`)
  measurements.push({ kind, viewport: page.viewportSize(), gap })
}
async function download() {
  const pending = page.waitForEvent('download'); await button('导出 CSV').click()
  return fs.readFile(await (await pending).path(), 'utf8')
}
async function images() {
  await log.getByRole('tab', { name: '图像比对', exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('.comparison-frame')].every(node => node.getAttribute('aria-busy') !== 'true'))
  await paint()
}
async function imageGeometry() {
  const frames = await log.locator('.comparison-frame').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))
  const titles = await log.locator('.image-title').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))
  assert.ok(Math.abs(frames[0].y - frames[1].y) < 1 && Math.abs(frames[0].height - frames[1].height) < 1)
  assert.ok(Math.abs(titles[0].y - titles[1].y) < 1)
  const positions = await log.locator('.image-position').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().y))
  if (positions.length === 2) assert.ok(Math.abs(positions[0] - positions[1]) < 1)
  const result = await log.locator('.candidate-result').boundingBox()
  assert.ok(result.y >= titles[1].y + titles[1].height)
  const content = await log.locator('.el-tabs__content').boundingBox()
  for (const user of await log.locator('.image-user').all()) {
    const bounds = await user.boundingBox()
    assert.ok(bounds.y >= content.y && bounds.y + bounds.height <= content.y + content.height + 1)
  }
  return frames[0].y
}
async function previewGeometry(label) {
  await page.waitForFunction(() => ![...document.querySelectorAll('.el-overlay')].some(node => /enter-active/.test(node.className)))
  await paint()
  const bounds = await preview.locator('.enrollment-preview').boundingBox(), viewport = page.viewportSize()
  assert.ok(bounds.y >= 16 - .1 && bounds.y + bounds.height <= viewport.height - 16 + .1, `${label}: ${JSON.stringify(bounds)}`)
  for (const control of [preview.locator('.el-dialog__header'), preview.locator('.el-dialog__headerbtn'), preview.getByRole('button', { name: '关闭图像', exact: true })]) {
    const box = await control.boundingBox()
    assert.ok(box.y >= 16 - .1 && box.y + box.height <= viewport.height - 16 + .1)
  }
  assert.equal(await preview.locator('img').evaluate(node => getComputedStyle(node).objectFit), 'contain')
  assert.ok(await preview.locator('.el-dialog__body').evaluate(node => node.scrollWidth <= node.clientWidth + 1))
  measurements.push({ kind: label, viewport, top: bounds.y, bottom: viewport.height - bounds.y - bounds.height })
}
async function accountGeometry() {
  assert.equal(await page.locator('.workspace-main .breadcrumb,.workspace-main .page-intro,.account-page .record-count').count(), 0)
  assert.equal(await page.getByRole('heading', { name: '账户管理', exact: true }).count(), 1)
  assert.equal(await footer().locator('.el-pagination__total').count(), 1)
  const last = await table().locator('.el-table__row').last().boundingBox(), bottom = await footer().boundingBox()
  assert.ok(last.y + last.height <= bottom.y && bottom.y + bottom.height <= page.viewportSize().height)
  assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1))
}

try {
  await page.goto(`${base}/login`)
  await page.locator('.login-content input').nth(0).fill('admin')
  await page.locator('.login-content input').nth(1).fill('admin123')
  await button('登录').click(); await page.waitForURL('**/monitor'); await loaded()

  await go('/audits'); await footer().locator('.btn-next').click(); await loaded()
  await page.getByPlaceholder('输入完整账号').fill('admin'); await page.getByPlaceholder('输入完整账号').press('Enter'); await loaded()
  assert.equal(await total(), 33)
  assert.equal((await footer().locator('.el-pager .is-active').innerText()).trim(), '1')
  assert.ok((await table().locator('.el-table__row td:nth-child(2)').allTextContents()).every(text => text.trim() === 'admin'))
  const enterCsv = await download()
  assert.equal(enterCsv.trim().split(/\r?\n/).length, 34)
  assert.ok(enterCsv.trim().split(/\r?\n/).slice(1).every(line => /^"[^"]*","admin",/.test(line)))
  await button('查询').click(); await loaded(); assert.equal(await download(), enterCsv)
  await page.screenshot({ path: `${out}/audit-enter-admin.png` })
  pass('audit Enter returns all 33 admin records on page one and exports the same complete CSV as the query button')

  await go('/applicants'); await page.getByPlaceholder('输入完整申请人 ID').fill('U301'); await page.getByPlaceholder('输入完整申请人 ID').press('Enter'); await loaded(); assert.equal(await total(), 1)
  await button('重置').click(); await loaded()
  await go('/logs'); await page.getByPlaceholder('输入完整业务请求 ID').fill('REQ-00000017'); await page.getByPlaceholder('输入完整业务请求 ID').press('Enter'); await loaded(); assert.equal(await total(), 1)
  await button('重置').click(); await loaded(); await page.getByPlaceholder('输入完整申请人 ID').fill('U001'); await page.getByPlaceholder('输入完整申请人 ID').press('Enter'); await loaded(); assert.ok(await total() > 0)
  assert.ok((await table().locator('.el-table__row td:nth-child(2)').allTextContents()).every(text => text.trim() === 'U001'))
  pass('applicant ID and both log IDs retain Enter queries and apply the submitted full ID')

  for (const [width, height] of [[1422, 804], [1280, 720], [624, 850]]) {
    await page.setViewportSize({ width, height }); await go('/logs'); await button('重置').click(); await loaded()
    await openLog('REQ-00000013'); await drawerGap(log, '.request-summary', 'sync request')
    await log.getByRole('tab', { name: '接口报文', exact: true }).click(); await drawerGap(log, '.request-summary', 'sync messages'); await closeDrawer(log)
    for (const id of ['REQ-00000014', 'REQ-00000015']) {
      await openLog(id); await drawerGap(log, '.request-summary', 'async request'); await images()
      const initial = await imageGeometry(), source = await log.locator('.comparison-image').first().locator('img').getAttribute('src')
      for (const index of [1, 2, 0]) {
        await log.getByRole('button', { name: `候选 ${index + 1}`, exact: true }).click(); await images()
        assert.ok(Math.abs(await imageGeometry() - initial) < 1)
        assert.equal(await log.locator('.comparison-image').first().locator('img').getAttribute('src'), source)
      }
      await page.screenshot({ path: `${out}/${id.endsWith('14') ? 'finger' : 'face'}-comparison-${width}.png` }); await closeDrawer(log)
    }
    await go('/applicants'); await openPerson('U001'); await drawerGap(person, '.applicant-summary', 'applicant')
    await person.getByRole('tab', { name: '入库变更记录', exact: true }).click(); await drawerGap(person, '.applicant-summary', 'applicant changes')
    await person.locator('.el-drawer__body').evaluate(node => node.scrollTop = node.scrollHeight)
    await person.getByRole('button', { name: '关闭', exact: true }).click(); await person.waitFor({ state: 'hidden' })
  }
  pass('both detail drawers use a 16–20px title-to-summary gap, including sync requests and tab changes at all three required viewports')
  pass('face/finger titles, finger labels and equal-height frames align while candidate switches retain image and title positions on desktop and 624px')

  await page.setViewportSize({ width: 624, height: 850 }); await go('/logs'); await button('重置').click(); await loaded()
  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    window.qaOriginalLogs = api.listLogs
    api.listLogs = async params => {
      const result = structuredClone(await window.qaOriginalLogs(params))
      const record = result.items.find(row => row.requestId === 'REQ-00000014')
      if (record) {
        const event = record.stages[1].children[0].events.find(event => event.kind === 'RESPONDED')
        event.responseBody.candidates.forEach(candidate => { candidate.score = 97.1234567890123 - candidate.rank })
      }
      return result
    }
  })
  await button('查询').click(); await loaded(); await openLog('REQ-00000014'); await images(); await imageGeometry()
  assert.ok((await log.locator('.candidate-result').boundingBox()).height > 25)
  await page.screenshot({ path: `${out}/finger-comparison-wrapped-624.png` }); await closeDrawer(log)
  await page.evaluate(async () => { (await import('/src/api/index.js')).default.listLogs = window.qaOriginalLogs })
  pass('wrapped response metadata reserves matching space on both image sides without displacing titles or hiding user IDs')

  for (const [width, height] of [[1280, 720], [1280, 640], [624, 850]]) {
    await page.setViewportSize({ width, height }); await go('/applicants'); await openPerson('U001')
    await person.getByRole('tab', { name: '当前入库图像', exact: true }).click()
    for (const [kind, selector] of [['face', '[data-modality="face"] .enrollment-image'], ['finger', '[data-finger="right_little"] .enrollment-image']]) {
      await person.locator(selector).click(); await preview.waitFor(); await previewGeometry(`${kind} preview`)
      await page.screenshot({ path: `${out}/${kind}-preview-${width}-${height}.png` })
      await page.setViewportSize({ width, height: height - 180 }); await previewGeometry(`${kind} resized preview`)
      await preview.locator('.el-dialog__body').evaluate(node => node.scrollTop = node.scrollHeight)
      await previewGeometry(`${kind} scrolled preview`)
      await preview.getByRole('button', { name: '关闭图像', exact: true }).click(); await preview.waitFor({ state: 'hidden' })
      await page.setViewportSize({ width, height })
    }
    await closeDrawer(person)
  }
  pass('face/finger previews retain 16px viewport margins, visible title and both close controls through resizing and internal scrolling')

  await go('/accounts')
  for (const [width, height] of [[1422, 804], [1280, 720], [624, 850]]) {
    await page.setViewportSize({ width, height }); await paint(); assert.equal(await total(), 4); await accountGeometry()
    if (width >= 1280) {
      const query = await button('查询').boundingBox(), create = await button('新建账户').boundingBox()
      assert.ok(create.x > query.x + query.width + 100)
    }
    await page.screenshot({ path: `${out}/accounts-${width}.png` })
  }
  pass('account management has one compact title, one footer total and four fully visible accounts at the three required viewports')

  await page.setViewportSize({ width: 1422, height: 804 })
  const form = page.getByRole('dialog', { name: '新建账户', exact: true })
  const field = (dialog, name) => dialog.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label').filter({ hasText: new RegExp(`^${name}$`) }) }).locator('input,textarea')
  await button('新建账户').click()
  for (const label of ['电话', '邮箱', '备注']) { assert.equal(await field(form, label).inputValue(), ''); assert.equal(await field(form, label).getAttribute('placeholder'), '选填'); await field(form, label).fill(label === '邮箱' ? 'cancel@example.test' : '取消的内容') }
  await form.getByRole('button', { name: '取消', exact: true }).click(); await form.waitFor({ state: 'hidden' }); await button('新建账户').click()
  for (const label of ['电话', '邮箱', '备注']) assert.equal(await field(form, label).inputValue(), '')
  await form.getByRole('button', { name: '取消', exact: true }).click(); await form.waitFor({ state: 'hidden' })
  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    window.qaOriginalCreate = api.createAccount; window.qaAccountPayloads = []
    api.createAccount = async payload => { window.qaAccountPayloads.push({ ...payload }); return window.qaOriginalCreate(payload) }
  })
  for (const populated of [false, true]) {
    await button('新建账户').click(); await field(form, '用户名').fill(populated ? 'qa.contact' : 'qa.blank'); await field(form, '姓名').fill(populated ? '选填完整账户' : '空选填账户')
    if (populated) { await field(form, '电话').fill('13800138000'); await field(form, '邮箱').fill('contact@example.test'); await field(form, '备注').fill('已填写备注') }
    await form.getByRole('button', { name: '确定', exact: true }).click(); await page.locator('.el-message-box').getByRole('button', { name: '确定', exact: true }).click()
    const result = page.getByRole('dialog', { name: '账户创建结果', exact: true }); await result.waitFor(); await result.getByRole('button', { name: '关闭', exact: true }).click(); await result.waitFor({ state: 'hidden' }); await loaded()
  }
  const payloads = await page.evaluate(() => window.qaAccountPayloads)
  assert.deepEqual(['phone', 'email', 'remark'].map(key => payloads[0][key]), ['-', '-', '-'])
  assert.deepEqual(['phone', 'email', 'remark'].map(key => payloads[1][key]), ['13800138000', 'contact@example.test', '已填写备注'])
  const edit = page.getByRole('dialog', { name: '编辑账户', exact: true })
  for (const [username, values] of [['qa.blank', ['', '', '']], ['qa.contact', ['13800138000', 'contact@example.test', '已填写备注']]]) {
    await table().locator('.el-table__row').filter({ hasText: username }).getByRole('button', { name: '编辑', exact: true }).click()
    assert.deepEqual(await Promise.all(['电话', '邮箱', '备注'].map(label => field(edit, label).inputValue())), values)
    await edit.getByRole('button', { name: '取消', exact: true }).click(); await edit.waitFor({ state: 'hidden' })
  }
  await button('账户菜单').click(); await page.getByRole('menuitem', { name: '个人信息', exact: true }).click(); await loaded()
  const profile = page.getByRole('dialog', { name: '个人信息', exact: true })
  for (const label of ['电话', '邮箱', '备注']) assert.match(await profile.locator('tr').filter({ has: page.locator('.el-descriptions__label').filter({ hasText: new RegExp(`^${label}$`) }) }).innerText(), /—/)
  await profile.getByRole('button', { name: '关闭', exact: true }).click(); await profile.waitFor({ state: 'hidden' })
  pass('optional contact fields reset empty after cancellation, preserve the API empty convention, save valid values and show missing details as an em dash')

  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default; api.createAccount = window.qaOriginalCreate
    const created = (await api.listAccounts({ keyword: 'qa.', pageSize: 100 })).items
    await Promise.all(created.map(account => api.deleteAccount(account.id)))
    await Promise.all(Array.from({ length: 24 }, (_, index) => api.createAccount({ username: `qa.scroll.${index}`, displayName: `滚动验收 ${index}`, role: 'operator' })))
  })
  await button('查询').click(); await loaded()
  for (const [width, height] of [[1422, 804], [1280, 720], [624, 850]]) {
    await page.setViewportSize({ width, height }); await paint()
    await page.waitForFunction(() => {
      const body = document.querySelector('.account-page > .el-card > .el-card__body')
      const footer = body.querySelector('.records-footer'), main = body.closest('.workspace-main')
      const reserved = parseFloat(getComputedStyle(body).paddingBottom) + parseFloat(getComputedStyle(main).paddingBottom) + 1
      return Math.abs(innerHeight - footer.getBoundingClientRect().bottom - reserved) <= 3
    })
    await paint()
    const fixed = page.locator('.account-title,.account-page .toolbar,.account-page .el-table__header-wrapper,.records-footer')
    const initial = await fixed.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().y)), first = await table().locator('.el-table__row').first().boundingBox()
    assert.ok(await wrap().evaluate(node => node.scrollHeight > node.clientHeight + 40))
    for (const y of [40, 250, 0]) {
      await wrap().evaluate((node, y) => node.scrollTop = y, y); await paint()
      assert.deepEqual(await fixed.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().y)), initial)
      if (y === 40) assert.ok((await table().locator('.el-table__row').first().boundingBox()).y < first.y - 30)
    }
    await wrap().evaluate(node => node.scrollLeft = node.scrollWidth); await paint()
    const action = await table().locator('.el-table__row').first().getByRole('button', { name: '编辑', exact: true }).boundingBox()
    assert.ok(action.x >= 0 && action.x + action.width <= width)
    await wrap().evaluate(node => node.scrollLeft = 0)
    await footer().locator('.btn-next').click(); await loaded(); assert.equal((await footer().locator('.el-pager .is-active').innerText()).trim(), '2')
    await footer().locator('.btn-prev').click(); await loaded()
    const padding = async () => page.locator('.account-page > .el-card').evaluate(node => node.getBoundingClientRect().bottom - node.querySelector('.records-footer').getBoundingClientRect().bottom)
    const originalPadding = await padding(), manyHeight = (await page.locator('.account-page > .el-card').boundingBox()).height
    for (const [keyword, count] of [['ops.zhang', 1], ['NO-SUCH-ACCOUNT', 0]]) {
      await page.getByPlaceholder('搜索用户名或姓名').fill(keyword); await button('查询').click(); await loaded(); await paint(); assert.equal(await total(), count)
      assert.ok((await page.locator('.account-page > .el-card').boundingBox()).height < manyHeight)
      assert.ok(Math.abs(await padding() - originalPadding) < 1)
    }
    await page.getByPlaceholder('搜索用户名或姓名').fill(''); await button('查询').click(); await loaded(); assert.equal(await total(), 28)
    await page.screenshot({ path: `${out}/accounts-scroll-${width}.png` })
  }
  pass('long account lists scroll below fixed controls/header and above pagination; horizontal actions, paging and natural short/empty cards remain usable')
  assert.deepEqual(errors, []); assert.deepEqual(backendRequests, []); pass('zero browser errors and zero real-backend calls')
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ checks, measurements, errors, backendRequests }, null, 2))
  console.log(`COMPLETE ${checks.length} checks`)
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` }); console.error(error); process.exitCode = 1
} finally { await browser.close() }
