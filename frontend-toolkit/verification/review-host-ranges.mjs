import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { HOST_RESOURCES_PATH, HOST_RESOURCE_HOSTS, HOST_RESOURCE_RANGES } from '../../src/constants/hostResources.js'

const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Shanghai', locale: 'zh-CN', reducedMotion: 'reduce' })
const end = new Date('2026-11-19T02:00:00Z')
const errors = [], reads = [], unexpected = []
const host = HOST_RESOURCE_HOSTS[0]
const sample = (offset, cpuPercent) => ({
  collectedAt: new Date(end.getTime() - offset).toISOString(), cpuPercent, cpuUserPercent: cpuPercent / 2,
  cpuSystemPercent: 0.25, cpuIowaitPercent: 0, memoryPercent: 40, memoryUsedGiB: 12, memoryTotalGiB: 32,
  memoryCacheGiB: 16, swapUsedGiB: 0, swapTotalGiB: 8, diskPercent: 55,
  diskUsedGiB: 100, diskTotalGiB: 200, diskReadBps: 0, diskWriteBps: 250000,
  diskReadLatencyMs: 0, diskWriteLatencyMs: 1, netRxBps: 1055200, netTxBps: 1433,
})
const minute = sample(25_000, 42.25)
const endpoint = `${base}${HOST_RESOURCES_PATH}`
const rangeOf = value => new URL(value).searchParams.get('range') ?? '1h'
let emptyRange = '24h', failedRange, mapped = host, hold30d
let gotDelayed
const button = name => page.getByRole('button', { name, exact: true })
const rangeSelect = page.getByRole('combobox', { name: '历史范围', exact: true })
const cards = page.locator('.metric-card')
const cpu = cards.first()
const firstRow = page.locator('[data-host-id="app-1"]')
const overviewCpu = firstRow.locator('[data-metric="cpuPercent"] .host-metric-value')
const currentCpu = cpu.locator('.metric-current strong')
const status = firstRow.locator('.host-sample-state')
const pass = name => console.log('PASS', name)
const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const waitForRead = range => page.waitForResponse(response => response.url().startsWith(endpoint) && rangeOf(response.url()) === range)
const after = async (range, trigger) => { const pending = waitForRead(range); await trigger(); await pending; await paint() }
const choose = range => after(range, () => rangeSelect.selectOption(range))
const chartPaths = () => cpu.locator('.metric-line').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))
const go = path => page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path)

page.on('pageerror', error => errors.push(error.message))
page.on('request', request => {
  if (['fetch', 'xhr'].includes(request.resourceType()) && !request.url().startsWith(endpoint)) unexpected.push(request.url())
})
await page.route(url => url.origin === base && url.pathname === HOST_RESOURCES_PATH, async route => {
  const range = rangeOf(route.request().url())
  reads.push(range)
  const interval = HOST_RESOURCE_RANGES[range].intervalMs
  const history = range === emptyRange || range === failedRange ? [] : [sample(interval * 4, 8), sample(interval * 3, 12), sample(interval, 0)]
  let latest = minute
  if (range === '30d' && hold30d) {
    latest = sample(10_000, 99)
    gotDelayed()
    await hold30d
  }
  await route.fulfill({
    json: { items: [{ ...mapped, sample: latest, history, ...(range === failedRange ? { historyError: true } : {}) }] },
    headers: { Date: end.toUTCString() },
  })
})

try {
  await page.clock.install()
  await page.goto(`${base}/login`)
  await page.getByLabel('用户名', { exact: true }).fill('admin')
  await page.getByLabel('密码', { exact: true }).fill('admin123')
  await button('登录').click()
  await page.waitForURL('**/monitor')
  await button('监控').click()
  await page.getByRole('menuitem', { name: '主机资源', exact: true }).click()
  await firstRow.getByText('42.25%', { exact: true }).waitFor()
  assert.equal(await rangeSelect.count(), 0)
  assert.equal(await page.getByText('未接入', { exact: true }).count(), 7)
  await button(host.name).click()
  assert.equal(await rangeSelect.inputValue(), '1h')
  assert.deepEqual(await rangeSelect.locator('option').allTextContents(), ['近 1 小时', '近 12 小时', '近 24 小时', '近 7 天', '近 30 天'])
  await button('延迟').click()
  await choose('1w')
  assert.equal(await button('延迟').getAttribute('aria-pressed'), 'true')
  assert.equal(await overviewCpu.innerText(), '42.25%')
  assert.equal(await currentCpu.innerText(), '42.25%')
  assert.equal(await page.locator('.detail-collection time').getAttribute('datetime'), minute.collectedAt)
  assert.equal(await status.count(), 0)
  const axis = await cpu.locator('text.axis tspan').allTextContents()
  assert.deepEqual([axis[0], axis.at(-1)], ['11/12', '11/19'])
  for (const card of await cards.all()) assert.deepEqual(await card.locator('text.axis tspan').allTextContents(), axis)
  const paths = await chartPaths()
  assert.equal(paths.length, 1)
  assert.equal(await cpu.locator('.metric-area').count(), 1)
  assert.equal(await cpu.locator('[data-series="cpuPercent"] circle').count(), 1)
  assert.ok(Number(paths[0].split(' ')[1]) > 300, 'week with sparse history leaves a blank lead-in')
  const trend = cpu.locator('.metric-trend')
  await trend.focus()
  assert.deepEqual(await cpu.locator('.tooltip-reading strong').allTextContents(), ['0%', '0%', '0.25%', '0%'])
  assert.equal(await cpu.locator('.metric-tooltip time').getAttribute('datetime'), sample(7_200_000, 0).collectedAt)
  pass('the five options share one window; a long range retains minute readings, uses its expected gap, and selects its own historical point')

  failedRange = '1w'
  await after('1w', () => page.clock.fastForward(60000))
  assert.match(await status.innerText(), /读取趋势失败/)
  assert.deepEqual(await chartPaths(), paths)
  assert.equal(await currentCpu.innerText(), '42.25%')
  failedRange = undefined
  await after('1w', () => button('重试').click())
  assert.equal(await status.count(), 0)
  assert.equal(await rangeSelect.inputValue(), '1w')
  assert.equal(await button('延迟').getAttribute('aria-pressed'), 'true')
  await choose('24h')
  assert.equal(await page.locator('.metric-tooltip').count(), 0)
  assert.equal(await page.getByText('该时段暂无数据', { exact: true }).count(), 4)
  assert.equal(await currentCpu.innerText(), '42.25%')
  assert.equal(await overviewCpu.innerText(), '42.25%')
  failedRange = '12h'
  await choose('12h')
  assert.equal(await page.locator('.metric-line').count(), 0)
  assert.equal(await page.getByText('读取趋势失败', { exact: true }).count(), 5)
  assert.equal(await currentCpu.innerText(), '42.25%')
  failedRange = undefined
  await after('12h', () => button('重试').click())
  assert.equal(await status.count(), 0)
  assert.deepEqual(await cpu.locator('text.axis').first().locator('tspan').allTextContents(), ['22:00', '11/18'])
  pass('polling and retry retain range and disk mode; empty and failed windows preserve minute values without borrowing another range')

  // Let a superseded response complete even after the view cancels its request.
  await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    const read = api.getHostResources
    api.getHostResources = args => args?.range === '30d' ? read({ range: '30d' }) : read(args)
  })
  let release30d
  hold30d = new Promise(resolve => { release30d = resolve })
  const received30d = new Promise(resolve => { gotDelayed = resolve })
  const response30d = waitForRead('30d')
  await rangeSelect.selectOption('30d')
  await received30d
  await choose('1h')
  const minutePaths = await chartPaths()
  release30d()
  await response30d
  await paint()
  hold30d = undefined
  assert.equal(await rangeSelect.inputValue(), '1h')
  assert.deepEqual(await chartPaths(), minutePaths)
  assert.equal(await currentCpu.innerText(), '42.25%')
  assert.equal(await overviewCpu.innerText(), '42.25%')
  assert.equal(await button('延迟').getAttribute('aria-pressed'), 'true')
  await button(host.name).click()
  const readsBefore = reads.length
  await after('1h', () => page.clock.fastForward(60000))
  assert.deepEqual(reads.slice(readsBefore), ['1h'])
  pass('a superseded 30-day response cannot overwrite 1-hour charts or minute values, and collapsed polling still runs once')

  mapped = HOST_RESOURCE_HOSTS[1]
  await go('/monitor')
  await page.waitForURL(`${base}/monitor`)
  await go('/host-resources?hostId=app-2')
  await button(mapped.name).waitFor()
  assert.equal(await button(mapped.name).getAttribute('aria-expanded'), 'true')
  assert.equal(await button(host.name).count(), 0)
  assert.deepEqual(errors, [])
  assert.deepEqual(unexpected, [])
  pass('a different returned host mapping controls connection, expansion and deep links without a client-side host binding')
} finally {
  await browser.close()
}
