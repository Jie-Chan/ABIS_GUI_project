import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
const out = process.env.ABIS_QA_OUTPUT_DIR || fileURLToPath(new URL('./qa-output/host-resources-fixtures/', import.meta.url))
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--disable-features=OverlayScrollbar,OverlayScrollbars'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
page.setDefaultTimeout(10000)
const checks = [], measurements = [], errors = [], unexpectedReads = []
const path = '/abis-admin/monitor/hosts'
const host = { id: 'app-1', name: '应用服务器 01（121）', ip: '10.200.51.121' }
const sample = (minute, cpuPercent, overrides = {}) => ({
  collectedAt: `2026-11-18T08:${minute}:41.000Z`, cpuPercent, memoryPercent: 37.69,
  cpuUserPercent: cpuPercent / 2, cpuSystemPercent: cpuPercent / 4, cpuIowaitPercent: 0.05,
  memoryCacheGiB: 15.53, swapUsedGiB: 6.19, swapTotalGiB: 8,
  memoryUsedGiB: 11.72, memoryTotalGiB: 31.09, diskPercent: 83.88, diskUsedGiB: 417.52, diskTotalGiB: 524.55,
  diskReadBps: 0, diskWriteBps: 206987, diskReadLatencyMs: 0.46, diskWriteLatencyMs: 1.09,
  netRxBps: 1048576, netTxBps: 1433, ...overrides,
})
let history = [
  sample(53, 1, { netTxBps: 0 }), sample(54, 2, {
    netTxBps: null, diskReadLatencyMs: null, cpuSystemPercent: null, cpuIowaitPercent: 0,
    memoryCacheGiB: 14.25, swapUsedGiB: 0,
  }),
  sample(57, 3, { netTxBps: 0.004, diskReadLatencyMs: null }), sample(58, 4),
  sample(59, 0, { diskReadLatencyMs: 0 }),
]
let windowEnd = new Date('2026-11-18T09:00:00Z')
let state = 'ready', reads = 0, failure
page.on('pageerror', error => errors.push(error.message))
const trackRequest = request => {
  if (['fetch', 'xhr'].includes(request.resourceType()) && request.url() !== base + path) unexpectedReads.push(request.url())
}
page.on('request', trackRequest)
const supplyHistory = async route => {
  assert.equal(route.request().method(), 'GET')
  reads++
  const points = state === 'empty' ? [] : history
  const item = state === 'failure'
    ? { ...host, sample: null, history: [], sampleError: true, historyError: true }
    : { ...host, sample: points.at(-1) ?? null, history: points }
  await route.fulfill({ status: state === 'failure' ? 502 : 200, json: { items: [item] }, headers: { Date: windowEnd.toUTCString() } })
}
await page.route(base + path, supplyHistory)

const button = name => page.getByRole('button', { name, exact: true })
const text = value => page.getByText(value, { exact: true })
const rows = page.locator('.host-roster > li')
const row = id => page.locator(`.host-roster > [data-host-id="${id}"]`)
const app = button(host.name)
const appRow = row(host.id)
const hostState = appRow.locator('.host-sample-state')
const cards = page.locator('.metric-card')
const card = name => cards.filter({ has: page.getByRole('heading', { name, exact: true }) })
const latest = page.locator('.detail-collection time')
const pass = name => { checks.push(name); console.log('PASS', name) }
const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const readAfter = async trigger => {
  const before = reads
  const response = page.waitForResponse(base + path)
  await trigger()
  await response
  await paint()
  assert.equal(reads, before + 1)
}
const poll = () => readAfter(() => page.clock.fastForward(60000))
const retry = () => readAfter(() => button('重试').click())
const go = async url => {
  await page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), url)
  await page.waitForURL(base + url)
}
const waitForLatest = time => page.waitForFunction(value => document.querySelector('.detail-collection time')?.dateTime === value, time)
const values = row => row.locator('.host-metric-value').allTextContents()
const tips = chart => chart.locator('.metric-tooltip strong').allTextContents()
const paths = chart => chart.locator('.metric-line').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))
const shot = (name, options) => page.screenshot({ path: `${out}/${name}.png`, ...options })

async function desktopGeometry() {
  return page.evaluate(() => {
    const selector = value => document.querySelector(value)
    const rect = element => element.getBoundingClientRect().toJSON()
    const list = selector('.host-content')
    const header = selector('.host-list-header')
    return {
      nav: rect(selector('.primary-navigation')),
      card: rect(selector('.host-card')),
      title: rect(selector('.host-card .el-card__header')),
      tableHeader: rect(header),
      columnEdges: [...header.children].map(element => rect(element).x),
      valueEdges: ['.host-identity', '.host-metric'].flatMap(value =>
        [...selector('.host-row').querySelectorAll(value)].map(element => rect(element).x)),
      gutter: list.offsetWidth - list.clientWidth,
      contentHeight: list.clientHeight, scrollHeight: list.scrollHeight,
      docHeight: document.documentElement.scrollHeight,
      bottomMargin: parseFloat(getComputedStyle(selector('.workspace-main')).paddingBottom),
      font: getComputedStyle(selector('.resource-title')).fontSize,
      weight: getComputedStyle(selector('.resource-title')).fontWeight,
      tableFont: getComputedStyle(header).fontSize,
      tableBackground: getComputedStyle(header).backgroundColor,
      rowHeights: [...list.querySelectorAll('.host-row')].map(element => rect(element).height),
    }
  })
}

try {
  await page.clock.install()
  await page.goto(`${base}/login`)
  await page.getByLabel('用户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('admin123')
  await button('登录').click()
  await page.waitForURL('**/monitor')
  await text('监控中').waitFor()
  assert.deepEqual(await page.locator('.status-overview dd').allTextContents(), ['10', '8', '1', '1'])
  assert.equal(reads, 0)
  await button('异常').click()
  await page.locator('[data-instance="face-1"]').getByRole('link', { name: '查看主机资源', exact: true }).click()
  await page.waitForURL('**/host-resources?hostId=algorithm-vm-1')
  await appRow.getByText('83.88%', { exact: true }).waitFor()
  assert.equal(await row('algorithm-vm-1').evaluate(node => node.classList.contains('is-located')), true)
  assert.equal(reads, 1)
  await go('/host-resources?hostId=app-2')
  const target = row('app-2')
  await target.getByText('未接入', { exact: true }).waitFor()
  assert.equal(await target.evaluate(node => node.classList.contains('is-located')), true)
  assert.deepEqual(await values(target), Array(5).fill('—'))
  await target.locator('.host-row').click()
  assert.equal(await cards.count(), 0)
  assert.equal(reads, 1)
  await go('/host-resources?hostId=unknown-host')
  await text('该主机尚未接入本次测试').waitFor()
  assert.equal(await rows.count(), 0)
  assert.equal(reads, 1)
  await go('/monitor')
  await text('监控中').waitFor()
  assert.equal(await button('异常').getAttribute('aria-pressed'), 'true')
  pass('service monitoring retains its Mock values and VM links locate static rows without per-host reads; unknown IDs are explicit')

  state = 'failure'
  await button('监控').click()
  await page.getByRole('menuitem', { name: '主机资源', exact: true }).click()
  await hostState.getByText('读取失败', { exact: true }).waitFor()
  const heading = page.locator('.host-card > .el-card__header')
  assert.equal(await heading.innerText(), '主机资源')
  assert.equal(await button('立即刷新').count(), 0)
  assert.deepEqual(await rows.locator('.host-toggle, .host-identity strong').allTextContents(), [
    host.name, '应用服务器 02', '算法服务 VM1', '算法服务 VM2', 'PostgreSQL VM1', 'PostgreSQL VM2', 'PostgreSQL VM3', 'MinIO VM',
  ])
  assert.equal(await app.getAttribute('aria-expanded'), 'false')
  assert.equal(await rows.locator('.host-arrow').count(), 1)
  for (const item of (await rows.all()).slice(1)) {
    assert.equal(await item.getByRole('button').count(), 0)
    assert.equal(await item.getByText('未接入', { exact: true }).count(), 1)
    assert.deepEqual(await values(item), Array(5).fill('—'))
  }
  state = 'empty'
  await retry()
  await text('暂无数据').waitFor()
  assert.equal(await button('重试').count(), 0)
  assert.equal(await latest.count(), 0)
  assert.equal(await row(host.id).getByText('未接入', { exact: true }).count(), 0)
  state = 'ready'
  await poll()
  assert.deepEqual(await values(appRow), ['0%', '37.69%', '83.88%', '1.00 MiB/s', '1.40 KiB/s'])
  assert.equal(await hostState.count(), 0)
  assert.equal(await latest.count(), 0)
  assert.equal(await cards.count(), 0)
  await app.press('Enter')
  assert.equal(await app.getAttribute('aria-expanded'), 'true')
  await waitForLatest(history.at(-1).collectedAt)
  assert.equal(await page.locator('.detail-collection').innerText(), '采集于 16:59:41')
  assert.equal(await latest.count(), 1)
  assert.deepEqual(await cards.locator('h2').allTextContents(), ['CPU', '内存', '磁盘', '网络'])
  await app.press('Space')
  assert.equal(await app.getAttribute('aria-expanded'), 'false')
  assert.equal(await latest.count(), 0)
  const metric = await appRow.locator('.host-metric-value').last().boundingBox()
  await page.mouse.click(metric.x + metric.width / 2, metric.y + metric.height / 2)
  assert.equal(await app.getAttribute('aria-expanded'), 'true')
  pass('menu shows eight collapsed rows; initial error, empty and live values are distinct, and mouse/keyboard toggle the inline charts')

  const cpu = card('CPU'), disk = card('磁盘'), network = card('网络')
  const xAxis = await cpu.locator('text.axis').allTextContents()
  for (const chart of await cards.all()) assert.deepEqual(await chart.locator('text.axis').allTextContents(), xAxis)
  for (const [key, color, opacity, count] of [
    ['cpuPercent', '#275bd7', '0.4', 2], ['memoryPercent', '#087e75', '0.4', 2],
    ['diskReadBps', '#275bd7', '0.3', 2], ['diskWriteBps', '#bf5b0a', '0.3', 2],
    ['netRxBps', '#087e75', '0.2', 2], ['netTxBps', '#bb3674', '0.2', 1],
  ]) {
    const line = page.locator(`[data-series="${key}"]`)
    const area = page.locator(`[data-series-area="${key}"]`)
    assert.equal(await line.getAttribute('stroke'), color)
    assert.equal(await area.getAttribute('fill'), color)
    assert.equal(await area.getAttribute('fill-opacity'), opacity)
    const strokes = await paths(line)
    const fills = await area.locator('.metric-area').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))
    assert.equal(strokes.length, count)
    assert.equal(fills.length, count)
    const baseline = await line.locator('xpath=..').locator('g.axis line').first().getAttribute('y1')
    for (let index = 0; index < count; index++) {
      assert.match(strokes[index], /^M .* C /)
      assert.ok(fills[index].startsWith(strokes[index]))
      assert.equal(fills[index].match(/ L \S+ (\S+) H \S+ Z$/)?.[1], baseline)
    }
  }
  assert.equal(await cpu.locator('.metric-current strong').innerText(), '0%')
  assert.deepEqual(await network.locator('.metric-current strong').allTextContents(), ['1.00 MiB/s', '1.40 KiB/s'])
  assert.ok((await network.locator('g.axis text').allTextContents()).every(label => label.endsWith(' MiB/s')))
  const trend = network.locator('.metric-trend')
  await trend.focus()
  assert.deepEqual(await tips(network), ['1.00 MiB/s', '1.40 KiB/s'])
  const dot = await network.locator('[data-series="netRxBps"] circle').last().boundingBox()
  await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2)
  assert.deepEqual(await tips(network), ['1.00 MiB/s', '1.40 KiB/s'])
  await trend.press('ArrowLeft')
  await trend.press('ArrowLeft')
  assert.deepEqual(await tips(network), ['1.00 MiB/s', '<0.01 B/s'])
  await trend.press('ArrowLeft')
  assert.deepEqual(await tips(network), ['1.00 MiB/s', '—'])
  await trend.press('ArrowLeft')
  assert.deepEqual(await tips(network), ['1.00 MiB/s', '0 B/s'])
  await trend.blur()
  pass('smooth strokes and same-colored independent fills share a zero baseline and break at gaps; low rates retain usable units in current values and tooltips')

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
  try {
    phone.on('pageerror', error => errors.push(error.message))
    phone.on('request', trackRequest)
    await phone.route(base + path, supplyHistory)
    await phone.goto(`${base}/host-resources?hostId=app-1`)
    await phone.getByLabel('用户名', { exact: true }).fill('admin')
    await phone.getByLabel('密码', { exact: true }).fill('admin123')
    await phone.getByRole('button', { name: '登录', exact: true }).click()
    await phone.locator('.metric-card').last().waitFor()
    const currentReads = reads
    const cdp = await phone.context().newCDPSession(phone)
    for (const [title, expected] of [
      ['CPU', [['2%', '1%', '—', '0%'], ['4%', '2%', '1%', '0.05%']]],
      ['内存', [['37.69%', '14.25 GiB', '0 / 8 GiB'], ['37.69%', '15.53 GiB', '6.19 / 8 GiB']]],
      ['磁盘', [['0 B/s', '202.14 KiB/s'], ['0 B/s', '202.14 KiB/s']]],
      ['网络', [['1.00 MiB/s', '—'], ['1.00 MiB/s', '1.40 KiB/s']]],
    ]) {
      const selected = phone.getByRole('article', { name: title, exact: true })
      const svg = selected.locator('svg')
      const tooltip = selected.locator('.metric-tooltip')
      const cursor = selected.locator('.metric-cursor')
      let previousX = null
      for (const [index, values] of [[1, expected[0]], [3, expected[1]]]) {
        const { collectedAt } = history[index]
        const fraction = (Date.parse(collectedAt) - windowEnd.getTime() + 3600000) / 3600000
        await svg.scrollIntoViewIfNeeded()
        const point = await svg.evaluate((node, fraction) => {
          const axis = node.querySelector('g.axis line')
          const bounds = node.getBoundingClientRect()
          const x = axis.x1.baseVal.value + fraction * (axis.x2.baseVal.value - axis.x1.baseVal.value)
          return { x: bounds.left + x * bounds.width / node.viewBox.baseVal.width, y: bounds.top + 70 }
        }, fraction)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
        await tooltip.waitFor()
        assert.equal(await tooltip.locator('time').getAttribute('datetime'), collectedAt)
        assert.deepEqual(await tips(selected), values)
        const x = await cursor.getAttribute('x1')
        assert.notEqual(x, previousX)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        assert.equal(await cursor.getAttribute('x1'), x)
        assert.equal(await tooltip.locator('time').getAttribute('datetime'), collectedAt)
        assert.deepEqual(await tips(selected), values)
        previousX = x
      }
      await selected.getByRole('heading', { name: title, exact: true }).tap()
      assert.equal(await selected.locator('.metric-cursor, .metric-tooltip').count(), 0)
    }
    assert.equal(reads, currentReads)
  } finally {
    await phone.close()
  }
  pass('390px touch selects and releases two points in every chart, preserves missing CPU and zero Swap values, clears outside and makes no extra request')

  const capacity = await disk.locator('.metric-current strong').innerText()
  assert.equal(await button('吞吐量').getAttribute('aria-pressed'), 'true')
  await button('延迟').click()
  assert.equal(await disk.locator('.legend-unit').innerText(), 'ms')
  assert.equal(await disk.locator('.metric-current strong').innerText(), capacity)
  assert.deepEqual(await disk.locator('text.axis').allTextContents(), xAxis)
  assert.equal(await disk.locator('[data-series="diskReadLatencyMs"] .metric-line').count(), 1)
  assert.equal(await disk.locator('[data-series="diskWriteLatencyMs"] .metric-line').count(), 2)
  const diskTrend = disk.locator('.metric-trend')
  await diskTrend.focus()
  assert.deepEqual(await tips(disk), ['0 ms', '1.09 ms'])
  for (let index = 0; index < 3; index++) await diskTrend.press('ArrowLeft')
  assert.deepEqual(await tips(disk), ['—', '1.09 ms'])
  await diskTrend.blur()
  const initialHistory = history
  history = history.map(point => ({ ...point, diskPercent: null, diskReadLatencyMs: null, diskWriteLatencyMs: null }))
  await poll()
  await text('暂无延迟数据').waitFor()
  assert.equal((await values(appRow))[2], '—')
  await button('吞吐量').click()
  assert.equal(await disk.locator('.metric-line').count(), 4)
  await button('延迟').click()
  history = initialHistory
  await poll()
  assert.equal(await button('延迟').getAttribute('aria-pressed'), 'true')
  pass('disk modes retain the capacity, use ms in axes and legend, and handle zero, one missing line, or an empty latency window')

  const previousTime = await latest.getAttribute('datetime')
  windowEnd = new Date(Date.parse(previousTime) + 60000)
  await poll()
  assert.equal(await hostState.count(), 0)
  const previousPaths = await paths(disk)
  windowEnd = new Date(Date.parse(previousTime) + 120000)
  await poll()
  assert.equal(await hostState.innerText(), '数据暂未更新 · 最后采集 16:59')
  assert.equal(await latest.getAttribute('datetime'), previousTime)
  assert.deepEqual(await paths(disk), previousPaths)
  assert.equal(await button('重试').count(), 0)

  const recoveredSample = { ...sample(59, 8), collectedAt: '2026-11-18T09:00:41.000Z' }
  history = [...history, recoveredSample]
  await poll()
  await waitForLatest(recoveredSample.collectedAt)
  assert.equal(await hostState.count(), 0)

  const savedPaths = await paths(disk)
  const savedValues = await values(appRow)
  state = 'failure'
  await poll()
  await button('重试').waitFor()
  assert.match(await hostState.innerText(), /数据暂未更新 · 最后采集 17:00/)
  assert.equal(await latest.getAttribute('datetime'), recoveredSample.collectedAt)
  assert.deepEqual(await paths(disk), savedPaths)
  state = 'empty'
  windowEnd = new Date(Date.parse(recoveredSample.collectedAt) + 3601000)
  await retry()
  assert.equal(await button('重试').count(), 0)
  assert.deepEqual(await values(appRow), savedValues)
  assert.equal(await hostState.innerText(), '数据暂未更新 · 最后采集 17:00')
  assert.equal(await latest.getAttribute('datetime'), recoveredSample.collectedAt)
  assert.deepEqual(await paths(disk), savedPaths)
  assert.equal(await app.getAttribute('aria-expanded'), 'true')
  assert.equal(await button('延迟').getAttribute('aria-pressed'), 'true')
  assert.equal(await appRow.getByText('未接入', { exact: true }).count(), 0)

  state = 'ready'
  await poll()
  assert.deepEqual(await paths(disk), savedPaths)
  assert.equal(await hostState.innerText(), '数据暂未更新 · 最后采集 17:00')

  await app.click()
  const newSample = { ...sample(59, 12, { diskPercent: 0 }), collectedAt: '2026-11-18T10:00:41.000Z' }
  history = [newSample]
  await poll()
  assert.equal(await app.getAttribute('aria-expanded'), 'false')
  assert.equal((await values(appRow))[2], '0%')
  assert.equal(await hostState.count(), 0)
  await app.click()
  await waitForLatest(newSample.collectedAt)
  assert.equal(await button('延迟').getAttribute('aria-pressed'), 'true')
  pass('two missed cycles, failed reads, empty windows and stale samples keep time, metrics and curves; retry clears on success and a new sample restores existing UI selections')

  await go('/monitor')
  const stoppedAt = reads
  await page.clock.fastForward(120000)
  assert.equal(reads, stoppedAt)
  await go('/host-resources?hostId=app-1')
  await waitForLatest(newSample.collectedAt)
  assert.equal(await app.getAttribute('aria-expanded'), 'true')
  assert.equal(await row(host.id).evaluate(node => node.classList.contains('is-located')), true)
  assert.equal(reads, stoppedAt + 1)
  await poll()
  assert.equal(reads, stoppedAt + 2)
  for (const width of [624, 320]) {
    await page.setViewportSize({ width, height: 850 })
    await paint()
    const positions = await cards.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))
    assert.ok(positions.every((point, index) => index === 0 || point.top >= positions[index - 1].bottom))
    const pageWidth = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
    assert.ok(pageWidth.scroll <= pageWidth.client + 1, `${width}px ${JSON.stringify(pageWidth)}`)
  }
  await page.setViewportSize({ width: 624, height: 360 })
  await go('/host-resources?hostId=minio-vm')
  await page.waitForFunction(() => {
    const selected = document.querySelector('.is-located > .host-row')?.getBoundingClientRect()
    const header = document.querySelector('.header')?.getBoundingClientRect()
    return selected && header && selected.top >= header.bottom && selected.bottom <= innerHeight
  })
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpectedReads, [])
  pass('the app-1 deep link expands automatically, narrow charts fit, a deep VM row scrolls into view, and only one poll runs after re-entry')

  const content = page.locator('.host-content')
  for (const [width, height] of [[1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height })
    await go('/host-resources')
    await appRow.getByText('12%', { exact: true }).waitFor()
    await page.evaluate(() => window.scrollTo(0, 0))
    await paint()
    const collapsed = await desktopGeometry()
    assert.equal(collapsed.font, '16px')
    assert.equal(collapsed.weight, '600')
    assert.equal(collapsed.tableFont, '12px')
    assert.equal(collapsed.rowHeights.length, 8)
    assert.ok(collapsed.rowHeights.every(value => value >= 54))
    assert.ok(Math.max(...collapsed.rowHeights) - Math.min(...collapsed.rowHeights) <= 1)
    assert.ok(Math.abs(height - collapsed.card.bottom - collapsed.bottomMargin) <= 1,
      `${width}×${height}: card ends at ${collapsed.card.bottom}px, expected ${height - collapsed.bottomMargin}px`)
    assert.ok(collapsed.scrollHeight <= collapsed.contentHeight + 1)
    assert.ok(collapsed.gutter > 0, 'classic scrollbar gutter must be reserved before expansion')
    assert.deepEqual(collapsed.valueEdges, collapsed.columnEdges)
    await app.click()
    await cards.last().waitFor()
    await paint()
    const expanded = await desktopGeometry()
    assert.ok(expanded.scrollHeight > expanded.contentHeight)
    assert.ok(expanded.docHeight <= height + 1)
    for (const key of ['nav', 'card', 'title', 'tableHeader', 'columnEdges', 'valueEdges', 'gutter']) assert.deepEqual(expanded[key], collapsed[key], key)
    await content.hover()
    await page.mouse.wheel(0, 5000)
    await page.waitForFunction(() => {
      const list = document.querySelector('.host-content')
      const last = document.querySelector('[data-host-id="minio-vm"]').getBoundingClientRect()
      const head = document.querySelector('.host-list-header').getBoundingClientRect()
      return list.scrollTop > 0 && last.top >= head.bottom && last.bottom <= list.getBoundingClientRect().bottom + 1
    })
    assert.equal(await page.evaluate(() => window.scrollY), 0)
    const scrolled = await desktopGeometry()
    assert.deepEqual(scrolled.title, collapsed.title)
    assert.deepEqual(scrolled.tableHeader, collapsed.tableHeader)
    await content.evaluate(node => { node.scrollTop = 0 })
    await app.click()
    for (const key of ['nav', 'card', 'columnEdges']) assert.deepEqual((await desktopGeometry())[key], collapsed[key])
    for (const route of ['/applicants', '/logs', '/audits']) {
      await go(route)
      const recordCard = page.locator('.records-page > .el-card')
      await recordCard.waitFor()
      const box = await recordCard.boundingBox()
      assert.ok(Math.abs(box.x - collapsed.card.x) <= 1 && Math.abs(box.y - collapsed.card.y) <= 1 && Math.abs(box.width - collapsed.card.width) <= 1)
      const style = await recordCard.locator('th.el-table__cell').first().evaluate(node => {
        const css = getComputedStyle(node)
        return [css.fontSize, css.backgroundColor]
      })
      assert.deepEqual(style, [collapsed.tableFont, collapsed.tableBackground])
    }
    measurements.push({ viewport: [width, height], collapsed, expanded })
  }
  pass('1440×900 and 1920×1080 fill eight readable rows with standard margins; a classic scrollbar leaves navigation, card and columns fixed')

  await page.setViewportSize({ width: 390, height: 844 })
  const menu = name => page.getByRole('menuitem', { name, exact: true })
  const captureNav = async name => {
    await page.evaluate(() => window.scrollTo(0, 0))
    await paint()
    const geometry = await page.evaluate(() => {
      const header = document.querySelector('.header')
      const navigation = document.querySelector('.primary-navigation')
      const y = node => node.getBoundingClientRect().y - header.getBoundingClientRect().y
      return {
        height: header.getBoundingClientRect().height,
        width: navigation.getBoundingClientRect().width,
        rowOffsets: [...navigation.querySelectorAll('.settings-trigger, .el-menu-item')].map(y),
        overflow: navigation.scrollWidth > navigation.clientWidth || document.documentElement.scrollWidth > document.documentElement.clientWidth,
      }
    })
    assert.equal(geometry.overflow, false)
    await shot(`390-${name}`, { clip: { x: 0, y: 0, width: 390, height: 234 } })
    measurements.push({ view: name, viewport: [390, 844], ...geometry })
    return geometry
  }
  await button('监控').click()
  await menu('主机资源').click()
  await app.waitFor()
  const mobileNav = await captureNav('hosts-collapsed')
  await app.click()
  await cards.last().waitFor()
  assert.deepEqual(await captureNav('hosts-expanded'), mobileNav)
  const positions = await cards.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))
  assert.ok(positions.every((rect, index) => index === 0 || rect.top >= positions[index - 1].bottom))
  await button('监控').click()
  await menu('服务状态').click()
  await text('监控中').waitFor()
  assert.deepEqual(await captureNav('service-status'), mobileNav)
  for (const [label, name, url] of [['申请人列表', 'applicants', '/applicants'], ['日志查询', 'logs', '/logs'], ['审计查询', 'audits', '/audits']]) {
    await menu(label).click()
    await page.waitForURL(base + url)
    assert.deepEqual(await captureNav(name), mobileNav)
  }
  await button('更多').click()
  await menu('账户管理').click()
  await page.waitForURL('**/accounts')
  await button('更多').click()
  await menu('匹配阈值配置').waitFor()
  assert.equal(await page.locator('.settings-nav-trigger.is-active').count(), 1)
  assert.equal(new Set(mobileNav.rowOffsets).size, 1)
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpectedReads, [])
  pass('390px resources, service status and query pages share one navigation row and height; More retains settings without horizontal overflow')
} catch (error) {
  failure = error.stack
  console.error(error)
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  await fs.writeFile(`${out}/report.json`, JSON.stringify({ checks, measurements, errors, unexpectedReads, failure }, null, 2))
  await browser.close()
}
