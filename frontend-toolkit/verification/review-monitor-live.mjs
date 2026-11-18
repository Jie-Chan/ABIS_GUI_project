import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
const out = process.env.ABIS_QA_OUTPUT_DIR || fileURLToPath(new URL('./qa-output/monitor-live-20261116/', import.meta.url))
await fs.mkdir(out, { recursive: true }); await fs.rm(`${out}/failure.png`, { force: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
const page = await context.newPage()
page.setDefaultTimeout(10000)
const checks = [], measurements = [], errors = [], backendRequests = []
let failure = null
function observe(p) {
  p.on('pageerror', e => errors.push(e.message))
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  p.on('request', r => { const u = new URL(r.url()); if (['xhr','fetch'].includes(r.resourceType()) && (u.origin !== base || /^\/(abis-admin|admin-api)(\/|$)/.test(u.pathname))) backendRequests.push(r.url()) })
}
function acceleratePolling() {
  const originalSet = window.setInterval.bind(window), originalClear = window.clearInterval.bind(window), ids = new Set()
  window.setInterval = (callback, delay, ...args) => { const id = originalSet(callback, delay === 60000 ? 300 : delay, ...args); if (delay === 60000) ids.add(id); return id }
  window.clearInterval = id => { ids.delete(id); return originalClear(id) }
  Object.defineProperty(window, '__monitorTimerCount', { get: () => ids.size })
}
await context.addInitScript(acceleratePolling); observe(page)
const pass = name => { checks.push(name); console.log('PASS', name) }
const button = name => page.getByRole('button', { name, exact: true })
const paint = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
const loaded = () => page.waitForFunction(() => !document.querySelector('.el-loading-mask,.el-button.is-loading'))
const settle = async () => { await loaded(); await paint(); await paint() }
const status = () => page.locator('.monitor-toolbar [role="status"]')
const shot = name => page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
const counts = () => page.locator('.status-overview dd').allTextContents()
async function go(path) { await page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path); await page.waitForURL(u => u.pathname === path); await settle() }
async function login(p = page) { await p.goto(`${base}/login`); await p.getByLabel('用户名', { exact: true }).fill('admin'); await p.getByLabel('密码', { exact: true }).fill('admin123'); await p.getByRole('button', { name: '登录', exact: true }).click(); await p.waitForURL('**/monitor'); await p.waitForFunction(() => !document.querySelector('.el-loading-mask,.el-button.is-loading')) }
async function monitorStore(p = page) { return p.evaluate(async () => { const store = (await import('/src/stores/monitor.js')).useMonitorStore(document.querySelector('#app').__vue_app__.config.globalProperties.$pinia); return { items: JSON.stringify(store.items), fetchedAt: store.fetchedAt, error: store.error } }) }
async function setMode(mode) { await page.evaluate(mode => { window.__liveMode = mode }, mode) }
async function waitCounts(expected) { await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('.status-overview dd')].map(n => n.textContent.trim())) === JSON.stringify(expected), expected.map(String)); await paint() }
async function layout(name) {
  await paint(); await paint()
  const boxes = await page.locator('.service-card').evaluateAll(cards => cards.map(card => ({ card: card.getBoundingClientRect().toJSON(), heading: card.querySelector('.service-heading').getBoundingClientRect().toJSON(), rows: [...card.querySelectorAll('.instance-row')].map(n => n.getBoundingClientRect().toJSON()) })))
  assert.equal(boxes.length, 3)
  const headings = boxes.map(c => c.heading.height), allRows = boxes.flatMap(c => c.rows), rowHeights = allRows.map(r => r.height)
  assert.ok(Math.max(...headings) - Math.min(...headings) <= 1, JSON.stringify({ name, headings }))
  assert.ok(Math.max(...rowHeights) - Math.min(...rowHeights) <= 1, JSON.stringify({ name, rowHeights }))
  assert.ok(Math.max(...boxes.map(c => c.rows[0].bottom)) - Math.min(...boxes.map(c => c.rows[0].bottom)) <= 1, JSON.stringify({ name, boxes }))
  assert.ok(Math.abs(boxes[2].rows[0].height - boxes[2].rows[1].height) <= 1)
  for (const selector of ['.instance-state', '.probe-reason', '.probe-diagnosis a']) {
    const clipped = await page.locator(`.service-card ${selector}`).evaluateAll(nodes => nodes.filter(n => { const a = n.getBoundingClientRect(), b = n.closest('.instance-row').getBoundingClientRect(); return a.top < b.top - 1 || a.bottom > b.bottom + 1 || a.left < b.left - 1 || a.right > b.right + 1 }).map(n => n.textContent))
    assert.deepEqual(clipped, [], `${name}: clipped ${selector}`)
  }
  measurements.push({ name, viewport: page.viewportSize(), boxes }); await shot(name)
}
try {
  await login(); await settle(); await status().getByText('监控中', { exact: true }).waitFor(); await waitCounts([10,8,1,1])
  assert.equal(await page.locator('.service-card').count(), 3); assert.equal(await page.locator('.storage-row').count(), 4)
  const text = await page.locator('.monitor-page').innerText(); assert.doesNotMatch(text, /状态更新于|立即刷新|最近探测|健康探测超时|\d+\s*秒|刷新频率|倒计时/)
  assert.match(await page.locator('[data-instance="face-1"]').innerText(), /异常[\s\S]*服务未响应/); assert.match(await page.locator('[data-instance="minio-1"]').innerText(), /未知[\s\S]*原因未记录/)
  const dot = status().locator('[aria-hidden="true"]'); assert.equal(await dot.count(), 1); const dotBox = await dot.boundingBox(); assert.ok(dotBox && dotBox.width > 0 && dotBox.height > 0)
  assert.equal(await page.evaluate(() => window.__monitorTimerCount), 1); await shot('monitor-live-default-1440')
  pass('initial monitoring reads ten instances with 10/8/1/1 counts, a live indicator and business wording while hiding timestamps/manual refresh/probe internals')

  await go('/audits')
  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    window.__liveOriginalHealth = api.getHealth; window.__liveBaseline = structuredClone(await api.getHealth()); window.__liveMode = 'default'; window.__liveCalls = 0; window.__liveBusy = 0; window.__liveMaxBusy = 0
    api.getHealth = async () => {
      window.__liveCalls++; window.__liveBusy++; window.__liveMaxBusy = Math.max(window.__liveMaxBusy, window.__liveBusy)
      const mode = window.__liveMode
      try {
        if (mode === 'pending' || mode === 'pending-failure') await new Promise(resolve => { window.__liveRelease = resolve })
        if (mode === 'failure' || mode === 'pending-failure') throw new Error('模拟后台读取中断')
        const data = structuredClone(window.__liveBaseline)
        if (mode === 'normal') for (const g of data.items) for (const i of g.instances) { i.status = 'normal'; i.reason = null }
        if (mode === 'changed' || mode === 'pending') for (const g of data.items) for (const i of g.instances) { i.status = i.id === 'face-2' ? 'abnormal' : 'normal'; i.reason = i.id === 'face-2' ? '服务未响应' : null }
        if (mode === 'long') data.items.find(g => g.key === 'algorithm-1').instances.find(i => i.id === 'face-1').reason = '服务未响应，请核对关联主机和业务连接状态，当前业务暂时无法处理。'.repeat(5)
        data.fetchedAt = `${data.fetchedAt.slice(0, 17)}${String(window.__liveCalls % 60).padStart(2, '0')}`
        return data
      } finally { window.__liveBusy-- }
    }
  })
  await go('/monitor'); await button('异常').click(); await setMode('changed'); await waitCounts([10,9,1,0]); assert.equal(await button('异常').getAttribute('aria-pressed'), 'true'); assert.equal(await page.locator('.instance-row').count(), 1); assert.equal(await page.locator('[data-instance="face-2"]').count(), 1)
  await setMode('pending'); await page.waitForFunction(() => typeof window.__liveRelease === 'function'); const pendingCalls = await page.evaluate(() => window.__liveCalls); assert.equal(await page.locator('.service-list .el-loading-mask').count(), 0); await page.waitForTimeout(700); assert.equal(await page.evaluate(() => window.__liveCalls), pendingCalls); assert.equal(await page.evaluate(() => window.__liveMaxBusy), 1)
  await setMode('changed'); await page.evaluate(() => { window.__liveRelease(); delete window.__liveRelease }); await paint(); await shot('monitor-live-background-changed')
  pass('background polling updates counts and filtered instances automatically, preserves the selected filter and keeps last results interactive without overlapping requests or a loading mask')

  const lastSuccessful = await monitorStore(); await setMode('failure'); await status().getByText('监控数据暂未更新', { exact: true }).waitFor(); assert.deepEqual(await counts(), ['10','9','1','0']); assert.equal((await monitorStore()).items, lastSuccessful.items)
  await setMode('pending-failure'); await page.waitForFunction(() => typeof window.__liveRelease === 'function'); assert.match(await status().innerText(), /监控数据暂未更新/); await setMode('failure'); await page.evaluate(() => { window.__liveRelease(); delete window.__liveRelease }); await shot('monitor-live-interrupted')
  await setMode('normal'); await waitCounts([10,10,0,0]); await status().getByText('监控中', { exact: true }).waitFor(); assert.equal(await button('异常').getAttribute('aria-pressed'), 'true'); assert.equal(await page.locator('.instance-row').count(), 0); await button('全部').click(); await shot('monitor-live-recovered')
  pass('interrupted monitoring retains the last snapshot and warning through retries, then automatically recovers live state and current counts without resetting the filter')

  await setMode('pending'); await page.waitForFunction(() => typeof window.__liveRelease === 'function'); const beforeLate = await monitorStore(); await go('/audits'); assert.equal(await page.evaluate(() => window.__monitorTimerCount), 0)
  const stoppedCalls = await page.evaluate(() => window.__liveCalls); await page.evaluate(() => { window.__liveRelease(); delete window.__liveRelease }); await page.waitForTimeout(800); assert.equal(await page.evaluate(() => window.__liveCalls), stoppedCalls); assert.deepEqual(await monitorStore(), beforeLate)
  pass('leaving the monitor stops its interval and ignores a delayed response instead of overwriting the retained snapshot')

  const firstContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN', reducedMotion: 'reduce' }); await firstContext.addInitScript(acceleratePolling); await firstContext.addInitScript(() => { window.__liveInitialFailure = true }); const first = await firstContext.newPage(); observe(first)
  await first.route('**/src/api/adapters/mock.js', async route => { const response = await route.fetch(); let source = await response.text(); assert.ok(source.includes('async getHealth() {')); source = source.replace('async getHealth() {', 'async getHealth() { if (window.__liveInitialFailure) throw new Error("模拟首次读取失败");'); await route.fulfill({ response, body: source }) })
  await login(first); const firstStatus = first.locator('.monitor-toolbar [role="status"]'); await firstStatus.getByText('监控数据暂不可用', { exact: true }).waitFor(); assert.equal(await first.locator('.instance-row').count(), 0); assert.deepEqual(await first.locator('.status-overview dd').allTextContents(), ['—','—','—','—']); await first.screenshot({ path: `${out}/monitor-first-unavailable.png` }); await first.evaluate(() => { window.__liveInitialFailure = false }); await firstStatus.getByText('监控中', { exact: true }).waitFor(); await first.waitForFunction(() => document.querySelectorAll('.instance-row').length === 10); await firstContext.close()
  pass('an initial read failure shows unavailable data and empty counts, then automatically recovers on a later scheduled read')

  await setMode('default'); await go('/monitor'); await waitCounts([10,8,1,1])
  for (const [width,height] of [[1440,900],[1920,1080]]) { await page.setViewportSize({width,height}); await layout(`monitor-aligned-abnormal-${width}`); await setMode('normal'); await waitCounts([10,10,0,0]); await layout(`monitor-aligned-normal-${width}`); const storage = await page.locator('.storage-section').boundingBox(); assert.ok(storage.y+storage.height <= height-16 && storage.y+storage.height >= height-100); await setMode('default'); await waitCounts([10,8,1,1]) }
  await setMode('long'); await page.waitForFunction(() => document.querySelector('.probe-reason')?.textContent.length > 100)
  for (const [width,height] of [[1440,900],[1920,1080]]) { await page.setViewportSize({width,height}); await layout(`monitor-aligned-wrapped-${width}`) }
  pass('normal, abnormal and wrapped-diagnostic desktop snapshots keep three equal headers, six equal body rows and aligned dividers, with complete causes/actions and full normal first-screen content')

  await setMode('default'); await waitCounts([10,8,1,1]); await page.setViewportSize({width:1440,height:900})
  for (const width of [736,560,480]) {
    await page.locator('.monitor-page').evaluate((n,w) => { n.style.width = `${w}px` }, width); await paint(); await paint()
    const cards = await page.locator('.service-card').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON()))
    if (width === 736) assert.ok(Math.max(...cards.map(c => c.y))-Math.min(...cards.map(c => c.y)) <= 1)
    if (width === 560) { assert.ok(Math.abs(cards[0].y-cards[1].y)<=1); assert.ok(cards[2].y>cards[0].y); assert.ok(Math.abs(cards[2].width-width)<=1) }
    if (width === 480) assert.ok(cards[1].y>cards[0].y && cards[2].y>cards[1].y)
    assert.ok(await page.locator('.monitor-page').evaluate(n => n.scrollWidth <= n.clientWidth + 1)); measurements.push({name:'container layout',width,cards}); await shot(`monitor-container-${width}`)
  }
  await page.locator('.monitor-page').evaluate(n => { n.style.width = '' }); await button('异常').click(); await paint(); const one = await page.locator('.service-card').boundingBox(), full = await page.locator('.monitor-page').boundingBox(); assert.ok(Math.abs(one.width-full.width)<=1 && one.height<400); await shot('monitor-filter-single')
  pass('736/560/480 container layouts retain three columns, two-plus-full-width and one column without overflow; a filtered single instance stays naturally sized')

  for (const [label, instance, host] of [['异常','face-1','算法 VM 1'], ['未知','minio-1','MinIO VM']]) {
    await button(label).click(); await page.locator(`[data-instance="${instance}"]`).getByRole('link',{name:'查看主机资源',exact:true}).click(); await page.waitForURL('**/host-resources?**'); await settle(); assert.match(await page.locator('.located-host').innerText(),new RegExp(host)); await page.goBack(); await page.waitForURL('**/monitor'); await settle(); assert.equal(await button(label).getAttribute('aria-pressed'),'true'); assert.equal(await page.locator(`[data-instance="${instance}"]`).count(),1)
  }
  await button('全部').click(); assert.equal(await page.locator('.instance-row').count(),10); await page.evaluate(async()=>{(await import('/src/api/index.js')).default.getHealth=window.__liveOriginalHealth})
  pass('business-diagnostic resource links still highlight the matching VM and browser return preserves abnormal/unknown filters')
  assert.deepEqual(errors, []); assert.deepEqual(backendRequests, []); pass('zero browser errors and zero real-backend calls')
} catch (error) { failure = { message: error.message, stack: error.stack, url: page.url() }; console.error(error); process.exitCode=1; await shot('failure').catch(()=>{}) }
finally { await fs.writeFile(`${out}/report.json`,JSON.stringify({base,checks,measurements,errors,backendRequests,failure},null,2)); await browser.close() }
console.log(`COMPLETE ${checks.length} checks`)
