import assert from 'node:assert/strict'

// Exercise the delivered HTTP adapter through locally intercepted responses.
// No application module replacement or real backend access is needed.
const serviceSnapshot = () => ({
  fetchedAt: '2026-10-28 10:00:00',
  items: [
    { key: 'gateway', name: 'ABIS Gateway', layer: '集成层', status: 'normal', instances: [{ id: 'gateway-1', status: 'normal' }, { id: 'gateway-2', status: 'normal' }] },
    { key: 'system', name: 'ABIS System', layer: '业务与编排层', status: 'normal', instances: [{ id: 'system-1', status: 'normal' }] },
    { key: 'face', name: 'Face 算法服务', layer: '生物识别层', status: 'abnormal', instances: [{ id: 'face-1', status: 'abnormal' }, { id: 'face-2', status: 'normal' }], metrics: { cdcHealthy: true, cdcReady: false, galleryCapacityLimit: 2000000, licenseStatus: 'VALID' } },
    { key: 'fingerprint', name: 'Fingerprint 算法服务', layer: '生物识别层', status: 'normal', instances: [{ id: 'fingerprint-1', status: 'normal' }], metrics: { cdcHealthy: false, cdcReady: false, galleryCapacityLimit: 0, licenseStatus: 'INVALID' } },
    { key: 'postgresql', name: 'PostgreSQL', layer: '数据层', status: 'unreachable', instances: [{ id: 'postgresql-1', status: 'unreachable' }, { id: 'postgresql-2', status: 'normal' }, { id: 'postgresql-3', status: 'normal' }] },
    { key: 'minio', name: 'MinIO', layer: '数据层', status: 'not_deployed', instances: [] },
  ],
})

export async function reviewMonitor({ fixture, loaded, go, snapshot, pass }) {
  const f = await fixture('admin', true, { monitorSnapshot: serviceSnapshot(), clock: true })
  const p = f.page
  const cards = p.locator('.service-card')
  const card = key => p.locator(`.service-card[data-service="${key}"]`)
  const totals = () => p.locator('.status-overview dd').allTextContents()
  const names = () => cards.locator('h3').allTextContents()
  const all = p.locator('.monitor-filter').getByText('全部', { exact: true })
  const attention = p.locator('.monitor-filter').getByText('异常', { exact: true })
  const attentionInput = p.getByRole('radio', { name: '异常', exact: true })
  const requests = () => f.calls.filter(c => c.path === '/abis/monitor/snapshot').length
  const noLicenseContent = async () => {
    assert.equal(await p.locator('.algorithm-metrics,.license-value').count(), 0)
    assert.doesNotMatch(await p.locator('.monitor-page').innerText(), /授权状态|底库(?:规模|容量)|系统授权|CDC|License|\bVALID\b|\bINVALID\b/)
  }
  const refresh = async () => {
    await p.getByRole('button', { name: '立即刷新', exact: true }).click()
    await loaded(p)
  }
  const checkLayout = async width => {
    await p.setViewportSize({ width, height: 1000 })
    await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const positions = await cards.evaluateAll(xs => xs.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y } }))
    if (width > 767) {
      assert.equal(positions[0].y, positions[1].y)
      assert.ok(positions[1].x > positions[0].x)
    } else {
      assert.equal(positions[0].x, positions[1].x)
      assert.ok(positions[1].y > positions[0].y)
    }
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    assert.ok(await cards.evaluateAll(xs => xs.every(el => el.scrollWidth <= el.clientWidth + 1)))
  }

  await go(p, '/monitor')
  assert.equal(await cards.count(), 6)
  assert.deepEqual(await names(), ['ABIS Gateway', 'ABIS System', '人脸识别服务', '指纹识别服务', 'PostgreSQL', 'MinIO'])
  assert.deepEqual(await totals(), ['6', '3', '3'])
  pass('monitor: six cards keep backend order and global totals with Chinese algorithm names')
  assert.equal(await card('postgresql').locator('.instance-chip').count(), 3)
  assert.ok(await card('postgresql').getByText('postgresql-1', { exact: true }).isVisible())
  assert.equal((await card('postgresql').locator('.instance-state').first().innerText()).trim(), '异常')
  assert.ok(await card('face').getByText('face-1', { exact: true }).isVisible())
  assert.equal(await p.locator('.el-table__expand-icon').count(), 0)
  pass('monitor: every instance state is directly accessible without table expansion')
  assert.equal(await p.locator('.service-card--attention').count(), 3)
  assert.match(await card('minio').getAttribute('class'), /service-card--attention/)
  await card('minio').getByText('暂无实例信息。', { exact: true }).waitFor()
  assert.doesNotMatch(await p.locator('.monitor-page').innerText(), /不可达|未部署/)
  pass('monitor: unreachable and undeployed services are displayed and counted as abnormal without extra health states')
  await noLicenseContent()
  pass('monitor: no authorization or gallery-capacity content is shown in service cards or a global panel')
  await snapshot(p, 'monitor-cards-desktop')

  const beforeFilter = requests()
  await attention.click()
  assert.deepEqual(await names(), ['人脸识别服务', 'PostgreSQL', 'MinIO'])
  assert.deepEqual(await totals(), ['6', '3', '3'])
  assert.equal(requests(), beforeFilter)
  pass('monitor: attention filter covers all abnormal raw states without requests or changing global totals')
  await refresh()
  assert.ok(await attentionInput.isChecked())
  assert.equal(await cards.count(), 3)
  assert.ok(await card('postgresql').getByText('postgresql-1', { exact: true }).isVisible())
  pass('monitor: manual refresh preserves the filter and visible instances')
  const beforePoll = requests()
  const polled = p.waitForResponse(r => new URL(r.url()).pathname === '/admin-api/abis/monitor/snapshot')
  await p.clock.runFor(60000)
  await polled; await loaded(p)
  assert.equal(requests(), beforePoll + 1)
  assert.ok(await attentionInput.isChecked())
  assert.equal(await cards.count(), 3)
  pass('monitor: existing 60-second HTTP polling retains the selected filter')
  await all.click()
  assert.equal(await cards.count(), 6)
  assert.equal(requests(), beforePoll + 1)
  pass('monitor: All restores the original card order without refetching')

  for (const width of [1600, 1280, 1024, 768, 767, 390, 320]) {
    await checkLayout(width)
    assert.ok(await card('postgresql').getByText('postgresql-1', { exact: true }).isVisible())
    if (width === 390) await snapshot(p, 'monitor-cards-mobile')
  }
  pass('monitor: cards switch from two columns to one at 767px without overflow down to 320px')
  await p.setViewportSize({ width: 1440, height: 1000 })

  const timestamp = await p.locator('.refresh-time .meta').innerText()
  await attention.click()
  f.state.failMonitor = true
  await refresh()
  await p.getByText('读取失败，以下保留上次成功获取的数据。', { exact: true }).waitFor()
  assert.equal(await cards.count(), 3)
  assert.deepEqual(await totals(), ['6', '3', '3'])
  assert.equal(await p.locator('.refresh-time .meta').innerText(), timestamp)
  assert.match(await p.locator('.panel-heading').innerText(), /状态待确认/)
  assert.ok(await attentionInput.isChecked())
  pass('monitor: failed refresh keeps prior cards, totals, successful time and filter with a stale warning')
  f.state.failMonitor = false
  f.state.monitorSnapshot.fetchedAt = '2026-10-28 10:02:00'
  await refresh()
  assert.equal(await p.locator('.stale-note').count(), 0)
  assert.match(await p.locator('.refresh-time .meta').innerText(), /10:02:00/)
  pass('monitor: retry clears errors and updates the last-success timestamp')
  await all.click()

  for (const metrics of [null, {}, { galleryCapacityLimit: -1, licenseStatus: 'unrecognized' }, { galleryCapacityLimit: '2000', licenseStatus: 'VALID' }]) {
    f.state.monitorSnapshot.items[2].metrics = metrics
    f.state.monitorSnapshot.items[3].metrics = metrics
    await refresh()
    await noLicenseContent()
    assert.deepEqual(await totals(), ['6', '3', '3'])
  }
  pass('monitor: absent or malformed unused metrics do not affect service health or restore removed content')
  f.state.monitorSnapshot.items[0].instances = []
  f.state.monitorSnapshot.items[1].instances[0].status = 'pending'
  await refresh()
  await card('gateway').getByText('暂无实例信息。', { exact: true }).waitFor()
  assert.doesNotMatch(await card('gateway').innerText(), /未部署/)
  assert.equal((await card('system').locator('.instance-state').innerText()).trim(), '异常')
  pass('monitor: absent instance details and unknown instance states are abnormal and absent details are not treated as healthy')

  f.state.monitorSnapshot = serviceSnapshot()
  f.state.monitorSnapshot.items = f.state.monitorSnapshot.items.filter(item => item.key !== 'gateway')
  for (const item of f.state.monitorSnapshot.items) item.metrics = null
  const licenseCheck = { ok: true, response_json: { results: { gallery: { total_size: 0 }, license: { status: 'VALID', capacity: { limit: 999999999, used: 0, full: false, over_limit: false } } } } }
  f.state.monitorSnapshot.checks = { face_register: { ok: false, response_json: null }, face_match: { ok: false, response_json: null }, finger_register: licenseCheck, finger_match: licenseCheck }
  await refresh()
  assert.equal(await cards.count(), 5)
  await noLicenseContent()
  pass('monitor: raw checks containing valid license and capacity data still render only service health and instances')

  f.state.monitorSnapshot = serviceSnapshot()
  f.state.monitorSnapshot.items.push({ key: 'backend-extra', name: '附加服务', layer: '扩展层', status: 'normal', instances: [] })
  await refresh()
  assert.equal(await cards.count(), 7)
  assert.deepEqual(await totals(), ['7', '4', '3'])
  assert.equal((await cards.last().locator('h3').innerText()).trim(), '附加服务')
  assert.equal(await cards.last().locator('.algorithm-metrics').count(), 0)
  pass('monitor: backend-added services are rendered dynamically instead of hardcoding six mock objects')
  f.state.monitorSnapshot.items[0].name = 'gateway-' + 'VeryLongService'.repeat(20)
  f.state.monitorSnapshot.items[0].layer = 'Layer'.repeat(30)
  f.state.monitorSnapshot.items[0].instances[0].id = 'node-'.repeat(40)
  await refresh()
  await checkLayout(320)
  pass('monitor: long Latin service names, layers and instance IDs wrap safely on narrow screens')
  f.state.monitorSnapshot.items[0].name = ''
  f.state.monitorSnapshot.items[0].layer = ''
  await refresh()
  assert.equal((await card('gateway').locator('h3').innerText()).trim(), '未命名服务')
  assert.match(await card('gateway').locator('.service-meta').innerText(), /—/)
  pass('monitor: missing display names and layers have explicit fallbacks')

  f.state.monitorSnapshot = serviceSnapshot()
  for (const item of f.state.monitorSnapshot.items) item.status = 'normal'
  await refresh()
  await attention.click()
  await p.getByText('暂无异常服务', { exact: true }).waitFor()
  assert.equal(await cards.count(), 0)
  assert.deepEqual(await totals(), ['6', '6', '0'])
  assert.match(await p.locator('.panel-heading').innerText(), /无异常服务/)
  pass('monitor: an empty attention filter is explained after all services become normal')
  await all.click()

  const valid = structuredClone(f.state.monitorSnapshot)
  const invalid = [
    [{ fetchedAt: valid.fetchedAt, items: [] }, '监控响应缺少非空 items，无法判断服务状态'],
    [{ ...valid, items: [{ ...valid.items[0], status: 'pending' }] }, '监控对象缺少 key、有效 status 或 instances'],
    [{ ...valid, items: [{ ...valid.items[0], instances: null }] }, '监控对象缺少 key、有效 status 或 instances'],
  ]
  for (const [response, message] of invalid) {
    f.state.monitorSnapshot = response
    await refresh()
    await p.getByText(message, { exact: true }).waitFor()
    assert.equal(await cards.count(), 6)
    assert.deepEqual(await totals(), ['6', '6', '0'])
    assert.match(await p.locator('.panel-heading').innerText(), /状态待确认/)
  }
  pass('monitor: main HTTP validation still rejects empty, unknown-state and malformed-instance snapshots while keeping old data')
  await go(p, '/accounts')
  const beforeStop = requests()
  await p.clock.runFor(60000)
  assert.equal(requests(), beforeStop)
  pass('monitor: leaving the page stops its polling timer')
  await f.context.close()

  const failed = await fixture('operator', true, { failMonitor: true, monitorSnapshot: serviceSnapshot() })
  await failed.page.getByText('监控读取测试失败', { exact: true }).waitFor()
  assert.deepEqual(await failed.page.locator('.status-overview dd').allTextContents(), ['—', '—', '—'])
  assert.equal(await failed.page.locator('.service-card').count(), 0)
  await failed.page.getByText('暂时无法获取服务状态', { exact: true }).waitFor()
  assert.equal(await failed.page.locator('.stale-note').count(), 0)
  pass('monitor: first-load failure has no fabricated cards or totals and operators can view the page')
  failed.state.failMonitor = false
  await failed.page.getByRole('button', { name: '立即刷新', exact: true }).click()
  await loaded(failed.page)
  assert.equal(await failed.page.locator('.service-card').count(), 6)
  assert.equal(await failed.page.locator('.el-alert--error').count(), 0)
  pass('monitor: retry after initial failure restores real-adapter rendering')
  await failed.context.close()

  const initial = await fixture('admin', true, { monitorSnapshot: serviceSnapshot() })
  let release
  initial.state.monitorGate = new Promise(resolve => { release = resolve })
  try {
    await initial.page.getByRole('menuitem', { name: '服务状态监控', exact: true }).click()
    await initial.page.waitForURL('**/monitor')
    await initial.page.locator('.monitor-placeholder').waitFor()
    assert.deepEqual(await initial.page.locator('.status-overview dd').allTextContents(), ['—', '—', '—'])
    assert.equal(await initial.page.locator('.service-card').count(), 0)
    assert.equal(await initial.page.locator('.service-list').getAttribute('aria-busy'), 'true')
    release()
    await loaded(initial.page)
    assert.equal(await initial.page.locator('.service-card').count(), 6)
    assert.equal(await initial.page.locator('.monitor-placeholder').count(), 0)
    pass('monitor: delayed first response shows a loading skeleton, then the accepted HTTP snapshot')
  } finally {
    release()
    await initial.context.close()
  }
}
