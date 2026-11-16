import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5187').origin
const out = process.env.ABIS_QA_OUTPUT_DIR || fileURLToPath(new URL('./qa-output/console-20261116-images/', import.meta.url))
await fs.mkdir(out, { recursive: true }); await fs.rm(`${out}/failure.png`, { force: true })
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
const pass = label => { checks.push(label); console.log('PASS', label) }
const button = name => page.getByRole('button', { name, exact: true })
const loaded = () => page.waitForFunction(() => !document.querySelector('.el-loading-mask,.el-button.is-loading'))
const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const shot = name => page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
const person = page.getByRole('dialog', { name: '申请人详情', exact: true })
const preview = page.getByRole('dialog', { name: '入库图像详情', exact: true })
const log = page.getByRole('dialog', { name: '请求详情', exact: true })
const positions = ['left_thumb', 'left_index', 'left_middle', 'left_ring', 'left_little', 'right_thumb', 'right_index', 'right_middle', 'right_ring', 'right_little']
const shortNames = ['拇指', '食指', '中指', '无名指', '小指']
async function go(path) { await page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path); await page.waitForURL(url => url.pathname === path); await loaded(); await paint() }
async function close(drawer) { await drawer.locator('.el-drawer__close-btn').click(); await drawer.waitFor({ state: 'hidden' }) }
async function openPerson(id) {
  await page.getByPlaceholder('输入完整申请人 ID').fill(id); await page.getByPlaceholder('输入完整申请人 ID').press('Enter'); await loaded()
  await page.locator('.applicants-page .el-table__row').filter({ hasText: id }).getByRole('button', { name: '查看详情', exact: true }).click()
  await person.waitFor(); await loaded(); await page.waitForFunction(() => Math.abs(document.querySelector('.applicant-drawer').getBoundingClientRect().right - innerWidth) < 1); await paint()
}
async function openLog(id) {
  await page.locator('.request-table .el-table__row').filter({ hasText: id }).getByRole('button', { name: '详情', exact: true }).click()
  await log.waitFor(); await page.waitForFunction(() => Math.abs(document.querySelector('.request-log-drawer').getBoundingClientRect().right - innerWidth) < 1)
}
async function images() {
  await log.getByRole('tab', { name: '图像比对', exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('.comparison-frame')].every(node => node.getAttribute('aria-busy') !== 'true')); await paint()
}
async function visibleBox(locator, top = 0, bottom = page.viewportSize().height) {
  const box = await locator.boundingBox()
  assert.ok(box && box.width > 0 && box.height > 0 && box.y >= top - 1 && box.y + box.height <= bottom + 1, `element clipped: ${JSON.stringify(box)}, visible y=${top}..${bottom}`)
  return box
}
async function previewMetadata(name) { return preview.locator('.el-descriptions__label').filter({ hasText: new RegExp(`^${name}$`) }).locator('xpath=following-sibling::*[contains(@class,"el-descriptions__content")][1]').innerText() }
async function checkPreview(image, label) {
  const source = await image.locator('img').getAttribute('src'), quality = (await image.locator('.quality-value').innerText()).trim()
  await image.scrollIntoViewIfNeeded(); await image.click(); await preview.waitFor()
  await page.waitForFunction(() => ![...document.querySelectorAll('.el-overlay')].some(node => /enter-active/.test(node.className))); await paint()
  assert.equal(await preview.locator('img').getAttribute('src'), source)
  assert.equal((await previewMetadata('质量分')).trim(), quality)
  assert.equal(await preview.locator('img').evaluate(node => getComputedStyle(node).objectFit), 'contain')
  const dialog = await preview.locator('.enrollment-preview').boundingBox(), height = page.viewportSize().height
  assert.ok(dialog.y >= 16 - .1 && dialog.y + dialog.height <= height - 16 + .1)
  for (const control of [preview.locator('.el-dialog__header'), preview.locator('.el-dialog__headerbtn'), preview.getByRole('button', { name: '关闭图像', exact: true })]) await visibleBox(control, 16 - .1, height - 16 + .1)
  await shot(label)
  await preview.getByRole('button', { name: '关闭图像', exact: true }).click(); await preview.waitFor({ state: 'hidden' })
}

try {
  await page.goto(`${base}/login`); await page.getByLabel('用户名', { exact: true }).fill('admin'); await page.getByLabel('密码', { exact: true }).fill('admin123'); await page.getByLabel('密码', { exact: true }).press('Enter'); await page.waitForURL('**/monitor'); await loaded()
  await go('/logs')
  for (const [width, height] of [[1440, 900], [1280, 720], [624, 850]]) {
    await page.setViewportSize({ width, height })
    for (const id of ['REQ-00000014', 'REQ-00000015']) {
      await openLog(id); await images()
      const note = log.getByText('图像为当前入库版本', { exact: true }), controls = log.getByRole('group', { name: '切换候选图像', exact: true })
      assert.equal(await note.count(), 1); assert.equal(await log.locator('.comparison-notice').count(), 0)
      assert.doesNotMatch(await log.locator('.request-image-comparison').innerText(), /图像取自当前入库记录，可能与查重时不同/)
      const noteBox = await note.boundingBox(), controlsBox = await controls.boundingBox()
      if (width >= 1280) {
        assert.ok(noteBox.x >= controlsBox.x + controlsBox.width)
        assert.ok(Math.abs(noteBox.y + noteBox.height / 2 - controlsBox.y - controlsBox.height / 2) <= 1)
      }
      const source = log.locator('.comparison-image').first(), candidate = log.locator('.comparison-image').last(), sourceUrl = await source.locator('img').getAttribute('src')
      for (const index of [1, 2, 3]) {
        const choice = controls.getByRole('button', { name: `候选 ${index}`, exact: true })
        await choice.click(); await images(); assert.equal(await choice.getAttribute('aria-pressed'), 'true')
        assert.equal(await source.locator('img').getAttribute('src'), sourceUrl)
        assert.match(await candidate.locator('.candidate-result').innerText(), new RegExp(`本次响应[\\s\\S]*候选排名[：:]\\s*${index}[\\s\\S]*比对分数[：:]\\s*\\d`))
        assert.equal(await note.count(), 1)
        const frames = await log.locator('.comparison-frame').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))
        assert.ok(Math.abs(frames[0].y - frames[1].y) <= 1 && Math.abs(frames[0].height - frames[1].height) <= 1)
        for (const element of await log.locator('.image-title,.image-user,.candidate-result').all()) await visibleBox(element)
        for (const choice of await controls.getByRole('button').all()) { const box = await choice.boundingBox(); assert.ok(box.width >= 60 && box.x >= 0 && box.x + box.width <= width) }
      }
      await log.getByRole('tab', { name: '处理过程', exact: true }).click(); await images()
      assert.equal(await controls.getByRole('button', { name: '候选 3', exact: true }).getAttribute('aria-pressed'), 'true')
      measurements.push({ kind: 'comparison source row', viewport: { width, height }, requestId: id, note: noteBox, controls: controlsBox })
      await shot(`comparison-${id.endsWith('14') ? '14' : '15'}-${width}`); await close(log)
    }
  }
  pass('face/finger comparisons share one compact source note; desktop note/buttons share a row, narrow controls stay usable, and candidate metadata/source/tab selection are preserved')
  await page.setViewportSize({ width: 1280, height: 720 })
  for (const [id, expected] of [['REQ-00000003', '本次查重无候选'], ['REQ-00000006', '图像已删除或不存在']]) {
    await openLog(id); await images(); assert.equal(await log.locator('.candidate-choice').count(), 0)
    const note = log.getByText('图像为当前入库版本', { exact: true }); await note.waitFor()
    assert.equal(await note.count(), 1); await log.getByText(expected, { exact: true }).waitFor()
    const noteBox = await note.boundingBox(), heading = await log.locator('.image-heading').first().boundingBox()
    assert.ok(noteBox.y + noteBox.height <= heading.y)
    await shot(`comparison-no-buttons-${id.endsWith('03') ? 'no-candidate' : 'single-candidate'}`); await close(log)
  }
  pass('without candidate buttons, an available source/candidate still has one source note at the image area top and retains its empty/deleted state')

  await page.setViewportSize({ width: 1440, height: 900 }); await go('/applicants')
  for (const [id, count, missing] of [['U301', 8, ['right_ring', 'right_little']], ['U004', 6, ['right_index', 'right_middle', 'right_ring', 'right_little']], ['U006', 0, positions]]) {
    await openPerson(id)
    assert.equal(await person.locator('.finger-slot').count(), 10); assert.equal(await person.locator('[data-modality="finger"] img').count(), count)
    assert.match(await person.locator('[data-modality="finger"] h2').innerText(), new RegExp(`^指纹\\s*${count} 指$`))
    assert.deepEqual(await person.locator('.finger-slot').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-finger'))), positions)
    assert.deepEqual(await person.locator('.finger-slot h4').allTextContents(), [...shortNames, ...shortNames])
    assert.equal(await person.locator('.hand-group').count(), 2)
    for (const hand of await person.locator('.hand-group').all()) {
      const row = await hand.locator('.finger-slot').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))
      assert.equal(row.length, 5); assert.ok(Math.max(...row.map(box => box.y)) - Math.min(...row.map(box => box.y)) <= 1)
      assert.ok(row.every((box, index) => index === 0 || box.x > row[index - 1].x))
    }
    for (const key of missing) {
      const slot = person.locator(`[data-finger="${key}"]`), placeholder = slot.getByRole('img', { name: /未入库/ })
      const label = `${key.startsWith('left') ? '左手' : '右手'}${shortNames[positions.indexOf(key) % 5]}`
      assert.match(await placeholder.getAttribute('aria-label'), new RegExp(`${label}.*未入库`)); assert.equal((await placeholder.innerText()).trim(), '—')
      assert.equal(await slot.getByRole('button').count(), 0); assert.equal(await slot.locator('.quality-score').count(), 0)
    }
    const drawerBox = await person.boundingBox(); assert.ok(Math.abs(drawerBox.y) <= 1 && Math.abs(drawerBox.height - 900) <= 1)
    assert.equal(await person.locator('.el-drawer__footer').count(), 0); await visibleBox(person.locator('.el-drawer__close-btn'))
    const heights = await person.locator('.finger-slot').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))
    assert.ok(Math.max(...heights) - Math.min(...heights) <= 1)
    const frames = await person.locator('.finger-slot .enrollment-image,.finger-placeholder').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))
    assert.ok(frames.every(height => height >= 160 && height <= 180))
    const white = await person.locator('.applicant-detail').boundingBox(), last = await person.locator('.finger-slot').last().boundingBox()
    assert.ok(white.y + white.height - last.y - last.height >= 21 && white.y + white.height - last.y - last.height <= 27)
    const colors = await person.evaluate(node => ({ body: getComputedStyle(node.querySelector('.el-drawer__body')).backgroundColor, content: getComputedStyle(node.querySelector('.applicant-detail')).backgroundColor, drawer: getComputedStyle(node).backgroundColor }))
    assert.equal(colors.content, 'rgb(255, 255, 255)'); assert.ok(colors.body !== colors.content || colors.drawer !== colors.content)
    measurements.push({ kind: 'full-height fixed ten slots', userId: id, drawer: drawerBox, heights, previewHeights: frames, bottomPadding: white.y + white.height - last.y - last.height, colors })
    if (id === 'U301') {
      const index = person.locator('[data-finger="left_index"] .enrollment-image')
      assert.equal((await index.locator('.quality-value').innerText()).trim(), '97')
      await checkPreview(index, 'U301-latest-index-preview')
    }
    await shot(`applicant-${id}-1440`); await close(person)
  }
  await page.evaluate(async () => (await import('/src/api/index.js')).default.setRecaptureScenario('document-complete'))
  await openPerson('U303'); assert.equal(await person.locator('.finger-slot').count(), 10); assert.equal(await person.locator('[data-modality="finger"] img').count(), 0)
  assert.match(await person.locator('[data-modality="finger"] h2').innerText(), /^指纹\s*0 指$/)
  assert.equal(await person.locator('.finger-placeholder').count(), 10); await shot('applicant-U303-failed-recapture'); await close(person)
  await page.evaluate(async () => (await import('/src/api/index.js')).default.setRecaptureScenario('default'))
  pass('full-height drawers keep two ordered five-position hand rows, 170px equal-height image/missing frames, complete missing-state names, no empty quality/zoom controls, and 24px white-card padding')

  for (const [width, height] of [[1422, 804], [1280, 720], [1280, 640], [624, 850]]) {
    await page.setViewportSize({ width, height }); await openPerson('U301')
    const body = person.locator('.el-drawer__body'), initialHeader = await person.locator('.el-drawer__header').boundingBox()
    assert.ok(await body.evaluate(node => node.scrollWidth <= node.clientWidth + 1))
    assert.ok((await person.locator('.finger-slot .enrollment-image,.finger-placeholder').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))).every(height => height <= 120))
    if (width >= 1280 && height >= 720) {
      await visibleBox(person.locator('[data-modality="face"] .enrollment-image'))
      for (const slot of await person.locator('.finger-slot').all()) await visibleBox(slot)
    }
    if (width === 624) {
      const bodyBox = await body.boundingBox()
      await visibleBox(person.locator('[data-modality="face"] .enrollment-image'), bodyBox.y, height)
      for (const key of positions.slice(0, 4)) for (const selector of ['h4', '.enrollment-image', '.quality-score']) await visibleBox(person.locator(`[data-finger="${key}"] ${selector}`), bodyBox.y, height)
    }
    const lastImage = person.locator('.finger-slot').filter({ has: page.getByRole('button') }).last().locator('.enrollment-image')
    await lastImage.scrollIntoViewIfNeeded(); await body.evaluate(node => node.scrollTop = node.scrollHeight); await paint()
    const scrolledHeader = await person.locator('.el-drawer__header').boundingBox(); assert.ok(Math.abs(initialHeader.y - scrolledHeader.y) <= 1)
    await visibleBox(person.locator('.el-drawer__close-btn'))
    await checkPreview(lastImage, `finger-preview-${width}-${height}`)
    await checkPreview(person.locator('[data-modality="face"] .enrollment-image'), `face-preview-${width}-${height}`)
    await shot(`applicant-scroll-${width}-${height}`); await close(person)
  }
  pass('compact and narrow drawers keep the first four left fingers at 624px, retain internal scrolling and a fixed close control, and contain face/finger previews at short heights')

  // Boundary records: aspect ratios and absent/failed storage references do not
  // depend on normal applicant admission rules or mutate the original snapshot.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.route('**/qa-image-read-failure.svg', route => route.fulfill({ status: 200, contentType: 'image/svg+xml', body: 'invalid image' }))
  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default; window.qaImagesOriginalPerson = api.getApplicant
    const sample = (width, height) => `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="3" y="3" width="${width - 6}" height="${height - 6}" fill="#eef5ff" stroke="#c72f3b" stroke-width="6"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="#4263ac"/><text x="12" y="30" font-size="20">${width}:${height}</text></svg>`)}`
    api.getApplicant = async id => {
      const person = structuredClone(await window.qaImagesOriginalPerson(id))
      if (id === 'U001') {
        person.records = person.records.filter(record => record.feature !== 'face')
        person.records.forEach(record => {
          if (record.fingerPosition === 'left_thumb') { record.imageUrl = sample(300, 400); record.qualityScore = 0 }
          if (record.fingerPosition === 'left_index') { record.imageUrl = sample(320, 300); record.qualityScore = null }
          if (record.fingerPosition === 'left_middle') { record.imageUrl = '/qa-image-read-failure.svg'; record.qualityScore = 83 }
          if (record.fingerPosition === 'left_ring') { record.imageUrl = ''; record.qualityScore = 77 }
        })
      }
      return person
    }
  })
  try {
    await openPerson('U001')
    const face = person.locator('[data-modality="face"]')
    await face.getByRole('img', { name: /人脸.*未入库/ }).waitFor(); assert.equal((await face.locator('.enrollment-placeholder').innerText()).trim(), '未入库')
    assert.equal(await face.getByRole('button').count(), 0); assert.equal(await face.locator('.quality-score').count(), 0)
    for (const [key, quality] of [['left_middle', '83'], ['left_ring', '77']]) {
      const slot = person.locator(`[data-finger="${key}"]`)
      await slot.getByText('图像不可用', { exact: true }).waitFor(); assert.equal(await slot.getByRole('button').count(), 0)
      assert.match(await slot.getByRole('img').getAttribute('aria-label'), /左手.*图像不可用/)
      assert.equal((await slot.locator('.quality-value').innerText()).trim(), quality)
    }
    for (const [key, width, height, quality] of [['left_thumb', 300, 400, '0'], ['left_index', 320, 300, '—']]) {
      const image = person.locator(`[data-finger="${key}"] .enrollment-image`)
      await image.locator('img').evaluate(node => node.decode())
      assert.deepEqual(await image.locator('img').evaluate(node => ({ width: node.naturalWidth, height: node.naturalHeight, fit: getComputedStyle(node).objectFit })), { width, height, fit: 'contain' })
      assert.equal((await image.locator('.quality-value').innerText()).trim(), quality)
      await checkPreview(image, `aspect-${width}-${height}-preview`)
      measurements.push({ kind: 'aspect-ratio sample', finger: key, naturalWidth: width, naturalHeight: height, quality })
    }
    await shot('boundary-face-missing-and-finger-ratios'); await close(person)
  } finally {
    await page.evaluate(async () => { (await import('/src/api/index.js')).default.getApplicant = window.qaImagesOriginalPerson; delete window.qaImagesOriginalPerson })
    await page.unroute('**/qa-image-read-failure.svg')
  }
  pass('missing face and failed/absent image URLs cannot zoom; recorded quality remains, while 3:4 and 16:15 samples retain their natural ratios and zero/missing quality in previews')

  await openPerson('U301'); await person.getByRole('tab', { name: '入库变更记录', exact: true }).click()
  const firstRequest = await page.evaluate(async () => (await (await import('/src/api/index.js')).default.getApplicant('U301')).changes[0].requestId)
  await person.locator('.enrollment-changes .el-table__row').first().getByRole('button', { name: '查看日志', exact: true }).click(); await page.waitForURL('**/logs?**'); await loaded()
  assert.equal(await page.locator('.request-table .el-table__row').count(), 1); assert.match(await page.locator('.request-table .el-table__row').innerText(), new RegExp(firstRequest))
  await button('返回申请人详情').click(); await page.waitForURL('**/applicants'); await person.waitFor(); await loaded()
  assert.equal(await person.getByRole('tab', { name: '入库变更记录', exact: true }).getAttribute('aria-selected'), 'true'); await close(person)
  pass('the full-height drawer preserves exact change-log navigation and restores the applicant changes tab')
  assert.deepEqual(errors, []); assert.deepEqual(backendRequests, []); pass('zero browser errors and zero real-backend calls')
  console.log(`COMPLETE ${checks.length} checks`)
} catch (error) {
  failure = { message: error.message, stack: error.stack, url: page.url() }; await shot('failure').catch(() => {}); console.error(error); process.exitCode = 1
} finally {
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ base, checks, measurements, errors, backendRequests, failure }, null, 2)); await browser.close()
}
