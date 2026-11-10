import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
const out = process.env.ABIS_QA_OUTPUT_DIR || './qa-output/monitor'
const source = await (await fetch(`${base}/src/api/index.js`)).text()
assert.match(source, /"VITE_USE_MOCK": "true"/)
assert.doesNotMatch(source, /createHybrid/)
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, locale: 'zh-CN', reducedMotion: 'reduce' })
page.setDefaultTimeout(10000)
const checks = [], errors = [], backendRequests = []
const pass = label => { checks.push(label); console.log('PASS', label) }
page.on('pageerror', e => errors.push(e.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('request', request => {
  const url = new URL(request.url())
  if (['fetch', 'xhr'].includes(request.resourceType()) && (url.origin !== base || /^\/(admin-api|abis-admin)(\/|$)/.test(url.pathname))) backendRequests.push(request.url())
})
const cards = page.locator('.service-card')
const card = key => page.locator(`.service-card[data-service="${key}"]`)
const all = page.locator('.monitor-filter').getByText('全部', { exact: true })
const attention = page.locator('.monitor-filter').getByText('异常', { exact: true })
const counts = () => page.locator('.status-overview dd').allTextContents()
const waitLoaded = () => page.locator('.service-list .el-loading-mask').waitFor({ state: 'hidden' })
const refresh = async () => { await page.getByRole('button', { name: '立即刷新', exact: true }).click(); await waitLoaded() }
const login = async () => {
  await page.locator('.login-content input').nth(0).fill('admin')
  await page.locator('.login-content input').nth(1).fill('admin123')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/monitor')
  await page.getByRole('heading', { name: '服务运行概览', exact: true }).waitFor()
  await waitLoaded()
}
const fixture = async scenario => {
  await page.evaluate(async scenario => {
    const api = (await import('/src/api/index.js')).default
    const snapshot = structuredClone(await window.originalHealth())
    if (scenario === 'healthy') {
      for (const item of snapshot.items) {
        item.status = 'normal'
        item.instances.forEach(instance => { instance.status = 'normal' })
      }
    } else if (scenario === 'metrics') {
      snapshot.items.find(item => item.key === 'face').metrics = { galleryTotalSize: 0, licenseStatus: 'INVALID', cdcHealthy: false, cdcReady: false }
      snapshot.items.find(item => item.key === 'fingerprint').metrics = null
    } else if (scenario === 'unknown') {
      snapshot.items.find(item => item.key === 'gateway').instances = []
      snapshot.items.find(item => item.key === 'system').status = 'pending'
      snapshot.items.find(item => item.key === 'fingerprint').metrics.licenseStatus = 'UNRECOGNIZED'
    } else if (scenario === 'long') {
      snapshot.items[0].name = `ABIS Gateway ${'演示服务'.repeat(20)}`
      snapshot.items[0].instances[0].id = `gateway-${'node'.repeat(40)}`
    } else if (scenario === 'empty') snapshot.items = []
    api.getHealth = async () => {
      window.healthCalls++
      if (scenario === 'error') throw new Error('模拟读取失败')
      return structuredClone(snapshot)
    }
  }, scenario)
  await refresh()
}

try {
  await page.goto(`${base}/login`)
  await page.getByRole('heading', { name: '欢迎登录' }).waitFor()
  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    window.originalHealth = api.getHealth
    window.healthCalls = 0
    api.getHealth = async () => { window.healthCalls++; return window.originalHealth() }
  })
  await login()
  assert.equal(await cards.count(), 6)
  assert.deepEqual(await cards.locator('h3').allTextContents(), ['ABIS Gateway', 'ABIS System', '人脸识别服务', '指纹识别服务', 'PostgreSQL', 'MinIO'])
  assert.deepEqual(await counts(), ['6', '3', '3'])
  const bounds = await cards.evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y } }))
  assert.equal(bounds[0].y, bounds[1].y)
  assert.equal(bounds[2].y, bounds[3].y)
  assert.ok(bounds[1].x > bounds[0].x && bounds[2].y > bounds[0].y)
  pass('six Chinese-named service cards retain order, counts and desktop two-column layout')
  assert.equal(await card('postgresql').locator('.instance-chip').count(), 3)
  assert.ok(await card('postgresql').getByText('postgresql-1', { exact: true }).isVisible())
  assert.equal((await card('postgresql').locator('.instance-state').first().innerText()).trim(), '异常')
  assert.equal((await card('face').locator('.instance-state').first().innerText()).trim(), '异常')
  pass('abnormal and unreachable instances are directly visible without expansion')
  assert.ok((await card('minio').getAttribute('class')).includes('service-card--attention'))
  await card('minio').getByText('暂无实例信息。', { exact: true }).waitFor()
  assert.equal(await card('minio').locator('.instance-chip').count(), 0)
  assert.equal(await card('gateway').locator('.algorithm-metrics').count(), 0)
  assert.equal(await page.locator('.algorithm-metrics').count(), 0)
  assert.doesNotMatch(await page.locator('.monitor-page').innerText(), /底库|授权状态|不可达|未部署/)
  pass('undeployed services count as abnormal and no cards display gallery or license information')
  assert.doesNotMatch(await page.locator('.monitor-page').innerText(), /CDC|License|\bVALID\b/)
  const original = await page.evaluate(() => window.originalHealth())
  assert.equal(original.items.find(item => item.key === 'face').name, 'Face 算法服务')
  assert.equal(original.items.find(item => item.key === 'face').metrics.cdcHealthy, true)
  assert.equal(original.items.find(item => item.key === 'face').metrics.cdcReady, true)
  pass('customer UI omits technical metrics while original response names and fields remain intact')
  await page.screenshot({ path: `${out}/01-monitor-cards.png`, fullPage: true })

  const calls = await page.evaluate(() => window.healthCalls)
  await attention.click()
  assert.deepEqual(await cards.locator('h3').allTextContents(), ['人脸识别服务', 'PostgreSQL', 'MinIO'])
  assert.deepEqual(await counts(), ['6', '3', '3'])
  assert.equal(await page.evaluate(() => window.healthCalls), calls)
  pass('attention filter selects both abnormal states without fetching or changing global totals')
  await refresh()
  assert.equal(await cards.count(), 3)
  assert.ok(await page.getByRole('radio', { name: '异常', exact: true }).isChecked())
  assert.ok(await card('postgresql').getByText('postgresql-1', { exact: true }).isVisible())
  pass('manual refresh keeps the chosen filter and visible instance information')
  await all.click()
  assert.equal(await cards.count(), 6)
  pass('All restores all six services in their original order')

  for (const width of [1280, 1024, 768, 767, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const layout = await cards.evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y } }))
    if (width > 767) assert.equal(layout[0].y, layout[1].y)
    else { assert.equal(layout[0].x, layout[1].x); assert.ok(layout[1].y > layout[0].y) }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    assert.ok(await card('postgresql').getByText('postgresql-1', { exact: true }).isVisible())
    if (width === 390) await page.screenshot({ path: `${out}/02-monitor-mobile.png`, fullPage: true })
  }
  pass('responsive cards switch to one column without overflow or hidden instances down to 320px')

  await page.setViewportSize({ width: 1600, height: 1100 })
  await fixture('healthy')
  await attention.click()
  await page.getByText('暂无异常服务', { exact: true }).waitFor()
  assert.equal(await cards.count(), 0)
  assert.deepEqual(await counts(), ['6', '6', '0'])
  await all.click()
  assert.equal(await cards.count(), 6)
  pass('empty attention results explain no matching services and retain the full snapshot')

  const fetchedAt = await page.locator('.refresh-time .meta').innerText()
  await fixture('error')
  await page.getByText('模拟读取失败', { exact: true }).waitFor()
  await page.getByText('读取失败，以下保留上次成功获取的数据。', { exact: true }).waitFor()
  assert.equal(await cards.count(), 6)
  assert.equal(await page.locator('.refresh-time .meta').innerText(), fetchedAt)
  assert.match(await page.locator('.panel-heading').innerText(), /状态待确认/)
  pass('failed refresh preserves prior data and successful timestamp with an explicit stale warning')
  await fixture('default')
  assert.equal(await page.locator('.stale-note').count(), 0)
  assert.deepEqual(await counts(), ['6', '3', '3'])
  pass('successful retry clears stale warnings and restores current summary')

  await fixture('metrics')
  assert.equal(await page.locator('.algorithm-metrics').count(), 0)
  assert.deepEqual(await counts(), ['6', '3', '3'])
  pass('metrics in snapshots remain hidden regardless of value or availability')
  await fixture('unknown')
  await card('gateway').getByText('暂无实例信息。', { exact: true }).waitFor()
  assert.doesNotMatch(await card('gateway').innerText(), /未部署/)
  assert.equal((await card('system').locator('.service-status').innerText()).trim(), '异常')
  assert.equal(await card('fingerprint').locator('.license-value').count(), 0)
  assert.match(await page.locator('.panel-heading').innerText(), /状态待确认/)
  pass('unknown values and absent instance details are not misreported as healthy or undeployed')
  await fixture('long')
  await page.setViewportSize({ width: 320, height: 900 })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
  assert.ok(await card('gateway').evaluate(el => el.scrollWidth <= el.clientWidth + 1))
  pass('long service names and instance identifiers wrap safely on mobile')

  await fixture('empty')
  await page.getByText('暂无服务状态数据', { exact: true }).waitFor()
  assert.deepEqual(await counts(), ['0', '0', '0'])
  assert.doesNotMatch(await page.locator('.panel-heading').innerText(), /无异常服务/)
  pass('empty snapshots do not claim that all services are healthy')
  await page.reload()
  await page.waitForURL(url => url.pathname === '/login')
  await page.getByRole('heading', { name: '欢迎登录' }).waitFor()
  await page.evaluate(async () => { (await import('/src/api/index.js')).default.getHealth = async () => { throw new Error('首次读取失败') } })
  await login()
  await page.getByText('首次读取失败', { exact: true }).waitFor()
  assert.equal(await cards.count(), 0)
  assert.deepEqual(await counts(), ['—', '—', '—'])
  await page.getByText('暂时无法获取服务状态', { exact: true }).waitFor()
  pass('initial load failure has an error state and no fabricated counts')

  assert.deepEqual(errors, [])
  assert.deepEqual(backendRequests, [])
  pass('zero browser errors and zero real-backend requests')
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ checks, errors, backendRequests }, null, 2))
  console.log(`COMPLETE ${checks.length} checks`)
} catch (e) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true })
  await fs.writeFile(`${out}/failure.txt`, `${e.stack}\n${JSON.stringify(errors)}`)
  console.error(e)
  process.exitCode = 1
} finally { await browser.close() }
