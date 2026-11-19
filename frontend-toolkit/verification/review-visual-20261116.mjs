import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { stubHostOverview } from './host-overview-fixture.mjs'

const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
const out = process.env.ABIS_QA_OUTPUT_DIR || fileURLToPath(new URL('./qa-output/visual-20261116/', import.meta.url))
await fs.mkdir(out, { recursive: true }); await fs.rm(`${out}/failure.png`, { force: true })
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
const overviewEndpoint = await stubHostOverview(page, base)
page.setDefaultTimeout(10000)
const checks = [], contrasts = [], measurements = [], errors = [], backendRequests = []
let failure = null
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('request', r => { const u = new URL(r.url()); if (['xhr','fetch'].includes(r.resourceType()) && r.url() !== overviewEndpoint && (u.origin !== base || /^\/(abis-admin|admin-api)(\/|$)/.test(u.pathname))) backendRequests.push(r.url()) })
const button = name => page.getByRole('button', { name, exact: true })
const loaded = () => page.waitForFunction(() => {
  const views = { monitor: '.monitor-page', logs: '.logs-page', audits: '.audit-page', applicants: '.applicants-page', threshold: '.threshold-page', accounts: '.account-page', 'host-resources': '.host-resources' }
  const name = location.pathname.split('/').at(-1), selector = views[name], view = selector && document.querySelector(selector)
  if (selector && !view) return false
  // The UI intentionally has no background loading mask. Read the active View's
  // busy state as well, without a Promise predicate or a fixed-time delay.
  for (let component = view?.__vueParentComponent; component; component = component.parent) {
    if (!component.type.__file?.includes('/views/')) continue
    const state = component.setupState
    if (name === 'monitor' ? state.store?.loading : state.loading) return false
    break
  }
  return !document.querySelector('.el-loading-mask,.el-button.is-loading')
})
const paint = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
const settle = async () => { await loaded(); await paint(); await paint() }
const pass = name => { checks.push(name); console.log('PASS', name) }
const shot = name => page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
const table = () => page.locator('.workspace-main > div > .el-card > .el-card__body > .el-table')
const log = page.getByRole('dialog', { name: '请求详情', exact: true })
const person = page.getByRole('dialog', { name: '申请人详情', exact: true })
const preview = page.getByRole('dialog', { name: '入库图像详情', exact: true })
const body = () => table().locator('.el-table__body-wrapper .el-scrollbar__wrap')
const labels = async () => (await table().locator('th').allTextContents()).map(t => t.replace(/正序|倒序/g, '').trim())
const row = id => table().locator('.el-table__row').filter({ hasText: id })
const cell = async (id, label) => row(id).locator('td').nth((await labels()).indexOf(label)).locator('.cell')
async function go(path) { await page.evaluate(p => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(p), path); await page.waitForURL(u => u.pathname === path); await settle() }
async function close(drawer) { await drawer.locator('.el-drawer__close-btn').click(); await drawer.waitFor({ state: 'hidden' }) }
async function openLog(id) { await row(id).getByRole('button', { name: '详情', exact: true }).click(); await log.waitFor(); await page.waitForFunction(() => Math.abs(document.querySelector('.request-log-drawer').getBoundingClientRect().right - innerWidth) < 1); await paint() }
async function openPerson(id) { await row(id).getByRole('button', { name: '查看详情', exact: true }).click(); await person.waitFor(); await settle(); await page.waitForFunction(() => Math.abs(document.querySelector('.applicant-drawer').getBoundingClientRect().right - innerWidth) < 1) }
async function visible(locator, minY = 0, maxY = page.viewportSize().height) { const b = await locator.boundingBox(); assert.ok(b && b.y >= minY - 1 && b.y + b.height <= maxY + 1, JSON.stringify(b)); return b }
function luminance(rgb) { const c = rgb.slice(0, 3).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4 }); return .2126*c[0]+.7152*c[1]+.0722*c[2] }
async function contrast(locator, label) {
  const colors = await locator.evaluate(n => {
    const parse = value => { const v = value.match(/[\d.]+/g)?.map(Number) || [0,0,0,0]; return [v[0],v[1],v[2],v[3] ?? 1] }
    const over = (f, b) => [0,1,2].map(i => f[i]*f[3]+b[i]*(1-f[3]))
    const chain = []; for (let p=n; p; p=p.parentElement) chain.push(getComputedStyle(p))
    let bg=[255,255,255]; for (const s of [...chain].reverse()) bg=over(parse(s.backgroundColor), bg)
    const fg=over(parse(getComputedStyle(n).color), bg)
    return { foreground: fg, background: bg, fontSize: getComputedStyle(n).fontSize, text: n.textContent.trim() }
  })
  const a=luminance(colors.foreground), b=luminance(colors.background), ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05)
  contrasts.push({ label, ...colors, ratio }); assert.ok(ratio>=4.5, `${label}: ${ratio.toFixed(3)} ${JSON.stringify(colors)}`)
  return colors
}
async function singleLine(locator, label) { const geometry=await locator.evaluate(n=>{ const s=getComputedStyle(n),r=document.createRange(); r.selectNodeContents(n); const rects=[...r.getClientRects()].filter(r=>r.width>0&&r.height>0); return { text:n.textContent.trim(), height:n.getBoundingClientRect().height, lineHeight:parseFloat(s.lineHeight), lines:[...new Set(rects.map(r=>Math.round(r.y)))], scrollWidth:n.scrollWidth,clientWidth:n.clientWidth } }); assert.ok(geometry.height<=geometry.lineHeight+1,`${label}: ${JSON.stringify(geometry)}`); return geometry }

try {
  await page.goto(`${base}/login`); await page.getByLabel('用户名', {exact:true}).fill('admin'); await page.getByLabel('密码', {exact:true}).fill('admin123'); await button('登录').click(); await page.waitForURL('**/monitor'); await settle(); await go('/logs')
  for (const [id, state] of [['REQ-00000015','成功'],['REQ-00000011','失败'],['REQ-00000008','待人工核查'],['REQ-00000010','等待处理'],['REQ-00000009','处理中']]) {
    const tag=row(id).locator('.el-tag').filter({hasText:new RegExp(`^${state}$`)}); await contrast(tag,`log ${state}`); await row(id).hover(); await paint(); await contrast(tag,`log hovered ${state}`)
  }
  await contrast(row('REQ-00000010').locator('.el-tag').filter({hasText:'暂无最终响应'}),'log no final response')
  await openLog('REQ-00000008')
  const order=await log.locator('.request-summary > tbody > tr').evaluateAll(nodes=>nodes.map(n=>n.querySelector('th')?.textContent.trim()))
  assert.deepEqual(order.slice(0,3),['请求 ID','执行状态','业务结果摘要'])
  for(const control of [log.getByRole('button',{name:'复制请求 ID',exact:true}),log.getByTestId('business-summary'),log.getByRole('button',{name:'查看事件',exact:true})]) await visible(control)
  await contrast(log.locator('.el-tag').filter({hasText:/^待人工核查$/}).first(),'detail review status'); await contrast(log.locator('.review-guide'),'detail review guide'); await contrast(log.locator('.summary-exception code'),'detail error code'); await contrast(log.getByRole('button',{name:'查看事件',exact:true}),'detail event link'); await log.getByRole('button',{name:'查看事件',exact:true}).hover(); await paint(); await contrast(log.getByRole('button',{name:'查看事件',exact:true}),'detail event link hovered')
  await log.getByRole('button',{name:'查看事件',exact:true}).click(); await page.waitForFunction(()=>{const n=document.querySelector('.focused-event'),p=n?.closest('.el-tabs__content');if(!n||!p)return false;const a=n.getBoundingClientRect(),b=p.getBoundingClientRect();return a.top>=b.top&&a.bottom<=b.bottom}); assert.match(await log.locator('.focused-event').innerText(),/ABIS_TIMEOUT/); await shot('request-priority-summary-1280'); await close(log)
  pass('five log state classes and hovered/detail states meet 4.5 contrast; request ID/state/summary lead and timeout event remains focusable')

  for(const [id, text] of [['REQ-00000014','指纹'],['REQ-00000015','人脸']]) { const api=await cell(id,'接口类型'); assert.match(await api.innerText(),new RegExp(text)); measurements.push({kind:'single-line API',id,...await singleLine(api,'common API')}) }
  for(const id of ['REQ-00000015','REQ-00000014','REQ-00000013']) { const ip=await cell(id,'请求来源 IP'); measurements.push({kind:'single-line IPv4',id,...await singleLine(ip,'IPv4')}); const target=ip.locator('[tabindex="0"]'); await target.focus(); await page.getByRole('tooltip').filter({hasText:new RegExp(`^${(await target.innerText()).replaceAll('.','\\.')}$`)}).waitFor() }
  const stateCells=await Promise.all(['接收时间','执行状态','响应发布状态'].map(label=>cell('REQ-00000015',label))); const action=await row('REQ-00000015').getByRole('button',{name:'详情',exact:true}).boundingBox()
  for(const c of stateCells) {const b=await visible(c);assert.ok(b.x+b.width<=action.x+1)}
  await body().evaluate(n=>n.scrollTop=0); await shot('logs-readable-1280'); pass('1280 common face/finger API names and source IPv4 stay on one line; receipt/statuses/details remain readable and IP focus exposes full value')

  await page.setViewportSize({width:1024,height:768}); await settle(); const header=await labels(); assert.deepEqual(header.slice(0,4),['请求 ID','接收时间','执行状态','响应发布状态'])
  const bar=table().locator('.el-scrollbar__bar.is-horizontal'); await bar.waitFor({state:'visible'}); const barBox=await visible(bar); assert.ok(barBox.height>=6)
  const sourceIndex=header.indexOf('请求来源 IP'); await body().evaluate((n,index)=>{const c=n.querySelector(`tr td:nth-child(${index+1})`);n.scrollLeft=Math.min(c.offsetLeft-20,n.scrollWidth-n.clientWidth)},sourceIndex); await paint()
  const ip=await cell('REQ-00000015','请求来源 IP'), ipBox=await ip.boundingBox(), ipHead=await table().locator('th').nth(sourceIndex).locator('.cell').boundingBox(), op=await row('REQ-00000015').getByRole('button',{name:'详情',exact:true}).boundingBox(), tableBox=await table().boundingBox()
  assert.ok(ipBox.x>=tableBox.x&&ipBox.x+ipBox.width<=op.x+1); assert.ok(Math.abs(ipBox.x-ipHead.x)<=1); await singleLine(ip,'scrolled IPv4')
  const anchors=await page.locator('.query-panel,.request-table .el-table__header-wrapper,.records-footer').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().y)); await body().evaluate(n=>n.scrollTop=n.scrollHeight); await paint(); assert.deepEqual(await page.locator('.query-panel,.request-table .el-table__header-wrapper,.records-footer').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().y)),anchors)
  measurements.push({kind:'1024 horizontal scroll',bar:barBox,ip:ipBox,header:ipHead}); await shot('logs-scrollbar-1024'); pass('1024 keeps key columns, an always-visible horizontal bar, synchronized headers and readable source IP with fixed detail/filters/footer')

  await page.setViewportSize({width:624,height:850}); await settle(); const nav=page.locator('.primary-navigation'); assert.ok(await nav.evaluate(n=>n.scrollWidth<=n.clientWidth+1)); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await body().evaluate(n=>{n.scrollLeft=0;n.scrollTop=0}); await paint(); assert.deepEqual((await labels()).slice(0,3),['请求 ID','执行状态','响应发布状态'])
  const mobileAction=await row('REQ-00000015').getByRole('button',{name:'详情',exact:true}).boundingBox(); for(const label of ['请求 ID','执行状态','响应发布状态']) {const c=await cell('REQ-00000015',label),b=await c.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=mobileAction.x+1)}
  await nav.getByRole('button',{name:'更多',exact:true}).click(); await page.getByRole('menuitem',{name:'匹配阈值配置',exact:true}).click(); await page.waitForURL('**/threshold'); await settle(); assert.equal(await nav.locator('.settings-trigger.is-active').count(),1)
  await nav.getByRole('button',{name:/^更多/}).click(); await page.getByRole('menuitem',{name:'账户管理',exact:true}).click(); await page.waitForURL('**/accounts'); await settle(); assert.equal(await nav.locator('.settings-trigger.is-active').count(),1); await go('/logs'); await body().evaluate(n=>{n.scrollLeft=0;n.scrollTop=0}); await paint(); await shot('logs-priority-and-navigation-624')
  const oldestRequestId = await page.evaluate(async () => {
    const api = (await import('/src/api/index.js')).default
    const { items } = await api.listLogs({ pageSize: 1, sortOrder: 'ascending' })
    return items[0].requestId
  })
  const timeIndex=(await labels()).indexOf('接收时间'); await body().evaluate((n,i)=>{const c=n.querySelector(`tr td:nth-child(${i+1})`);n.scrollLeft=Math.max(0,c.offsetLeft-20)},timeIndex); await paint(); await table().locator('th.is-sortable .sort-caret.ascending').click(); await settle(); assert.equal(await table().locator('th[aria-sort="ascending"]').count(),1); assert.ok((await table().locator('.el-table__row').first().innerText()).includes(oldestRequestId))
  await visible(table().locator('.el-table__row').first().getByRole('button',{name:'详情',exact:true})); pass('624 navigation uses More without horizontal scrolling; key states/details show initially and scrolled receipt sorting still works')

  await page.setViewportSize({width:1280,height:720}); await go('/monitor'); await button('全部').click(); await settle()
  for(const id of ['face-1','minio-1']) { const instance=page.locator(`[data-instance="${id}"]`), reason=instance.locator('.probe-reason'), tag=instance.locator('.instance-state'), link=instance.getByRole('link',{name:'查看主机资源',exact:true}), cause=await contrast(reason,`monitor ${id} diagnosis`); assert.ok(parseFloat(cause.fontSize)>=13); await contrast(tag,`monitor ${id} state`); await contrast(link,`monitor ${id} resource link`); assert.equal(await instance.locator('.probe-meta').count(),0); assert.equal(await reason.innerText(),id==='face-1'?'服务未响应':'原因未记录'); assert.equal(await reason.locator('xpath=..').evaluate(n=>n.contains(n.querySelector('a'))&&n.contains(n.querySelector('.instance-state'))),true); if(id==='face-1'){await visible(reason);await visible(link)} }
  await contrast(page.locator('[data-instance="system-1"] .instance-state'),'monitor normal'); await page.locator('[data-instance="face-1"]').getByRole('link',{name:'查看主机资源',exact:true}).click(); await page.waitForURL('**/host-resources?hostId=algorithm-vm-1')
  await page.locator('[data-host-id="algorithm-vm-1"].is-located').getByText('未接入', { exact: true }).waitFor()
  await go('/monitor'); await shot('monitor-diagnostics-1280')
  pass('monitor status/reason/resource link share a diagnostic cluster, causes are 13px with sufficient contrast, and the VM link locates its unconnected row')

  await go('/audits'); for(const state of ['成功','失败']) {const tag=table().locator('.el-tag').filter({hasText:new RegExp(`^${state}$`)}).first();await contrast(tag,`audit ${state}`);await tag.hover();await paint();await contrast(tag,`audit hovered ${state}`)}
  await go('/accounts'); for(const state of ['启用','禁用']) {const tag=table().locator('.el-tag').filter({hasText:new RegExp(`^${state}$`)}).first();await contrast(tag,`account ${state}`);await tag.hover();await paint();await contrast(tag,`account hovered ${state}`)}
  pass('audit success/failure and account enabled/disabled use readable shared status colors on normal and hovered rows')

  const accountHeights=[]
  for(const [width,height] of [[1440,900],[1920,1080]]) { await page.setViewportSize({width,height}); await go('/threshold'); const card=page.locator('.threshold-page > .el-card'),cardBox=await card.boundingBox(), main=await page.locator('.workspace-main').boundingBox(), pad=await page.locator('.workspace-main').evaluate(n=>parseFloat(getComputedStyle(n).paddingLeft)); assert.ok(Math.abs(cardBox.x-main.x-pad)<=1);assert.ok(Math.abs(cardBox.width-(main.width-pad*2))<=1);const groups=await page.locator('.threshold-field').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));assert.ok(Math.abs(groups[0].y-groups[1].y)<=1&&Math.abs(groups[0].width-groups[1].width)<=1);await visible(button('保存修改'));await visible(button('填入默认值'));measurements.push({kind:'threshold compact desktop',width,height,card:cardBox,groups});await shot(`threshold-${width}`)
    await go('/accounts'); const account=await page.locator('.account-page > .el-card').boundingBox(),tableBounds=await table().boundingBox(),footer=await page.locator('.records-footer').boundingBox();accountHeights.push(account.height);assert.ok(footer.y-tableBounds.y-tableBounds.height>=0&&footer.y-tableBounds.y-tableBounds.height<=24);assert.ok(account.y+account.height<height-60)
  }
  assert.ok(Math.abs(accountHeights[0]-accountHeights[1])<=2)
  await page.setViewportSize({width:624,height:850});await go('/threshold');const smallGroups=await page.locator('.threshold-field').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));assert.ok(smallGroups[1].y>smallGroups[0].y&&Math.abs(smallGroups[0].x-smallGroups[1].x)<=1); await shot('threshold-624');pass('threshold cards fill the desktop content width with equal groups and narrow stacking; short account pagination stays adjacent and natural height')

  const longViews=[]
  for(const [width,height] of [[1440,900],[1920,1080]]) {await page.setViewportSize({width,height});await go('/audits');const wrap=table().locator('.el-table__body-wrapper .el-scrollbar__wrap');const info=await wrap.evaluate(n=>{const b=n.getBoundingClientRect();return{height:b.height,fullyVisible:[...n.querySelectorAll('.el-table__row')].filter(r=>{const v=r.getBoundingClientRect();return v.top>=b.top&&v.bottom<=b.bottom}).length}});longViews.push(info);await visible(page.locator('.records-footer'));await shot(`audit-long-${width}`)}
  assert.ok(longViews[1].height>longViews[0].height&&longViews[1].fullyVisible>longViews[0].fullyVisible)
  await go('/logs');await button('重置').click();await settle();await page.locator('.log-request-filter input').fill('REQ-NO-MATCH');await button('查询').click();await settle();const emptyCard=await page.locator('.logs-page > .el-card').boundingBox(),emptyTable=await table().boundingBox(),emptyFooter=await page.locator('.records-footer').boundingBox();assert.ok(emptyFooter.y-emptyTable.y-emptyTable.height<=24);assert.ok(emptyCard.height<600);await shot('logs-empty-1920');measurements.push({kind:'natural table heights',accountHeights,longViews,emptyCard});pass('taller desktop viewports expose more long-table records while empty results and short tables shrink with adjacent pagination')

  await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;window.visualOriginalHealth=api.getHealth;api.getHealth=async()=>{const r=await window.visualOriginalHealth();r.items=r.items.map(g=>({...g,instances:g.instances.map(i=>({...i,status:'normal',reason:null}))}));return r}})
  for(const [width,height] of [[1440,900],[1920,1080]]) {await page.setViewportSize({width,height});await go('/monitor');await button('全部').click();await settle();assert.equal(await page.locator('.service-card').count(),3);assert.equal(await page.locator('.storage-row').count(),4);assert.equal(await page.locator('.instance-row').count(),10);const monitor=await page.locator('.monitor-page').boundingBox(),storage=await page.locator('.storage-section').boundingBox(),overview=await page.locator('.status-overview').boundingBox(),navBottom=await page.locator('.header').evaluate(n=>n.getBoundingClientRect().bottom);assert.ok(monitor.y>=navBottom+16);assert.ok(storage.y+storage.height<=height-16);assert.ok(storage.y+storage.height>=height-100);for(const card of await page.locator('.service-card').all())await visible(card);assert.ok(overview.width===monitor.width);measurements.push({kind:'all-normal monitor',width,height,monitor,storage,overview});await shot(`monitor-normal-${width}`)}
  await page.evaluate(async()=>{(await import('/src/api/index.js')).default.getHealth=window.visualOriginalHealth;await(await import('/src/stores/monitor.js')).useMonitorStore().refresh()});await settle();await button('异常').click();await settle();assert.equal(await page.locator('.instance-row').count(),1);const filtered=await page.locator('.monitor-page').boundingBox();assert.ok(filtered.y+filtered.height<page.viewportSize().height-150);await button('全部').click();pass('all-normal desktop snapshots fill the first screen with three services and storage, while abnormal filtered results keep natural whitespace')

  await page.setViewportSize({width:1440,height:900});await go('/applicants')
  for (const [id,count] of [['U001',10],['U004',6],['U006',0]]) {
    const current=row(id); assert.equal(await current.locator('.list-face img').count(),1); assert.equal(await current.locator('.list-finger img').count(),count); assert.equal(await current.locator('.finger-placeholder').count(),10-count)
    await openPerson(id); assert.equal(await person.locator('.finger-slot').count(),10); assert.equal(await person.locator('.finger-placeholder').count(),10-count)
    assert.equal(await person.locator('.quality-legend,.quality-caption').count(),0); assert.equal(await person.locator('.current-images .quality-note').count(),0)
    const bars=await person.locator('.quality-score').evaluateAll(nodes=>nodes.map(node=>({bar:node.getBoundingClientRect().toJSON(),value:node.querySelector('.quality-value').getBoundingClientRect().toJSON(),text:node.textContent.trim()})))
    assert.ok(bars.every(item=>/^(\d+|—)$/.test(item.text)&&Math.abs(item.value.x+item.value.width/2-item.bar.x-item.bar.width/2)<=1)); measurements.push({kind:'per-image centered quality values',id,bars})
    if (id==='U001') {
      for (const [position,value] of [['left_thumb','96'],['right_ring','—'],['right_little','0']]) {
        const image=person.locator(`[data-finger="${position}"] .enrollment-image`); assert.equal(await image.locator('.quality-value').innerText(),value)
        if(value==='—')assert.equal(await image.locator('.quality-score').innerText(),'—')
        await image.click(); await preview.waitFor(); assert.equal(await preview.locator('.quality-value').innerText(),value); assert.equal(await preview.locator('.quality-score').count(),0); assert.equal(await preview.locator('.quality-value').count(),1)
        if(value==='—')assert.equal(await preview.locator('.quality-note').innerText(),'未提供')
        await preview.getByRole('button',{name:'关闭图像',exact:true}).click(); await preview.waitFor({state:'hidden'})
      }
      await shot('applicant-quality-bars')
    }
    await close(person)
  }
  pass('applicant thumbnails/fixed missing slots remain intact, each image shows a bare centered quality value, and previews show one matching metadata value for normal/missing/zero scores')
  assert.deepEqual(errors,[]);assert.deepEqual(backendRequests,[]);pass('zero browser errors and zero real-backend calls')
} catch(error) {failure={message:error.message,stack:error.stack,url:page.url()};console.error(error);process.exitCode=1;await shot('failure').catch(()=>{})}
finally {await fs.writeFile(`${out}/report.json`,JSON.stringify({base,checks,contrasts,measurements,errors,backendRequests,failure},null,2));await browser.close()}
console.log(`COMPLETE ${checks.length} checks`)
