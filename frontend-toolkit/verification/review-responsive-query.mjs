import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
const out = './qa-output/responsive-query'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1422, height: 804 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
page.setDefaultTimeout(10000)
const checks = [], errors = [], coordinates = []
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
const pass = text => { checks.push(text); console.log('PASS', text) }
const button = name => page.getByRole('button', { name, exact: true })
const loaded = () => page.waitForFunction(() => !document.querySelector('.el-loading-mask,.el-button.is-loading'))
const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const go = async (name, path) => { await page.getByRole('menuitem', { name, exact: true }).click(); await page.waitForURL(`**/${path}`); await loaded(); await page.evaluate(() => scrollTo(0,0)); await paint() }
const select = async (selector, name) => { await page.locator(selector).click(); await page.getByRole('option', { name, exact: true }).click() }
const log = page.getByRole('dialog', { name: '请求详情', exact: true })
const open = async id => { await page.locator('.request-table .el-table__row').filter({ hasText: id }).click(); await log.waitFor(); await page.waitForFunction(() => Math.abs(document.querySelector('.request-log-drawer').getBoundingClientRect().right - innerWidth) < 1) }
const close = async () => { await log.getByRole('button', { name: '关闭', exact: true }).click(); await log.waitFor({ state: 'hidden' }) }
async function alignment(path, label) {
  const bounds = await page.locator('.records-page .el-card,.query-panel,.query-filters,.results-toolbar,.records-page .el-table').evaluateAll(nodes => nodes.map(node => ({ selector: node.className, ...node.getBoundingClientRect().toJSON() })))
  const [card,panel,form,toolbar,table] = bounds
  assert.ok(Math.abs(card.left + 1 - panel.left) < 1 && Math.abs(card.right - 1 - panel.right) < 1, `${path}/${label} white edges`)
  assert.ok(Math.abs(form.left - toolbar.left) < 1 && Math.abs(toolbar.left - table.left) < 1, `${path}/${label} inner left`)
  assert.ok(Math.abs(form.right - toolbar.right) < 1 && Math.abs(toolbar.right - table.right) < 1, `${path}/${label} inner right`)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path}/${label} page overflow`)
}
try {
  await page.goto(`${base}/login`); await page.locator('.login-content input').nth(0).fill('admin'); await page.locator('.login-content input').nth(1).fill('admin123'); await button('登录').click(); await page.waitForURL('**/monitor'); await loaded()
  for (const [width,height] of [[1422,804],[1280,720],[624,850]]) {
    await page.setViewportSize({width,height})
    for (const [name,path] of [['申请人列表','applicants'],['日志查询','logs'],['审计查询','audits']]) {
      await go(name,path); await button('重置').click(); await loaded(); await alignment(path, width)
      const form = page.locator('.query-filters'), firstRow = page.locator('.records-page .el-table__row').first()
      const initialY = (await form.boundingBox()).y, rowY = (await firstRow.boundingBox()).y
      const positions = []
      for (const y of [0,40,400,0]) {
        await page.evaluate(y => scrollTo(0,y),y); await paint()
        const top = (await form.boundingBox()).y; positions.push(top); assert.ok(Math.abs(top-initialY) <= 1, `${path}/${width} sticky at ${y}: ${top}/${initialY}`)
        if(y === 40) assert.ok((await firstRow.boundingBox()).y < rowY - 30)
        await alignment(path, `${width}/scroll${y}`)
      }
      coordinates.push({path,width,positions})
      if(path==='logs' && width>=1200) {
        const headers = page.locator('.request-table .el-table__header-wrapper'), initial = await headers.boundingBox()
        await page.evaluate(() => scrollTo(0,400)); await paint()
        const fixed = await headers.boundingBox(), panel = await page.locator('.query-panel').boundingBox()
        assert.ok(Math.abs(fixed.y - (panel.y+panel.height)) <= 1, `header top ${fixed.y}/${panel.y+panel.height}`)
        assert.ok(fixed.y < initial.y)
        const columns = await page.locator('.request-table th').evaluateAll(nodes => nodes.map(n => ({name:n.textContent, ...n.getBoundingClientRect().toJSON()})))
        const cells = await firstRow.locator('td').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON()))
        columns.forEach((column,i) => { assert.ok(Math.abs(column.x-cells[i].x)<1); assert.ok(Math.abs(column.width-cells[i].width)<1); assert.ok(column.right<=width) })
        const data = await firstRow.innerText(); assert.match(data,/REQ-00000001/); assert.equal(await page.locator('.request-table .el-scrollbar__wrap').evaluate(n=>n.scrollWidth-n.clientWidth),0)
        await page.screenshot({path:`${out}/logs-sticky-${width}.png`}); await page.evaluate(()=>scrollTo(0,0)); await paint()
        const labels = await page.locator('.logs-filters .el-form-item__label').evaluateAll(nodes=>nodes.map(n=>({name:n.textContent,x:n.getBoundingClientRect().x})))
        for(const [a,b] of [['请求 ID','接口类型'],['申请人 ID','生物模态'],['时间范围','执行状态']]) assert.ok(Math.abs(labels.find(l=>l.name===a).x-labels.find(l=>l.name===b).x)<1)
      }
      if(width===624) {
        const total = await page.locator('.record-count').innerText()
        await button('选择时间范围').click(); const picker=page.locator('.single-month-range').filter({visible:true})
        assert.equal(await picker.locator('.el-calendar').count(),1)
        for(const name of ['清空','确定']) { const rect=await picker.getByRole('button',{name,exact:true}).boundingBox(); assert.ok(rect.y>=0 && rect.y+rect.height<=height) }
        await picker.getByRole('button',{name:'2026-11-13',exact:true}).click(); await picker.getByRole('button',{name:'下个月',exact:true}).click(); await picker.getByRole('button',{name:'2026-12-14',exact:true}).click()
        await picker.getByLabel('开始时间',{exact:true}).fill('08:09:10'); await picker.getByLabel('结束时间',{exact:true}).fill('18:19:20'); await picker.getByRole('button',{name:'确定',exact:true}).click(); await picker.waitFor({state:'hidden'})
        assert.match(await page.locator('.range-trigger').innerText(),/2026-11-13 08:09:10[\s\S]*2026-12-14 18:19:20/)
        assert.equal(await page.locator('.record-count').innerText(), total)
        await button('查询').click(); await loaded(); await button('选择时间范围').click(); await picker.getByRole('button',{name:'清空',exact:true}).click(); assert.match(await page.locator('.range-trigger').innerText(),/开始时间[\s\S]*结束时间/)
        await button('查询').click(); await loaded()
        await button('选择时间范围').click(); await page.screenshot({path:`${out}/${path}-single-month.png`}); await picker.getByRole('button',{name:'清空',exact:true}).click()
        if(path==='logs') {
          assert.equal(await page.locator('.log-api-filter').isVisible(),false)
          await button('更多筛选').click(); await select('.log-api-filter .el-select','1：N查重'); await select('.log-publication-filter .el-select','待发布'); await button('查询').click(); await loaded(); await page.getByRole('button',{name:/^收起筛选/}).click()
          assert.match(await page.getByRole('button',{name:/^更多筛选/}).innerText(),/2/); assert.equal(await page.locator('.request-table .el-table__row').count(),1); assert.match(await page.locator('.request-table .el-table__row').innerText(),/REQ-00000012/)
          await button('查询').click(); await loaded(); assert.match(await page.locator('.record-count').innerText(),/1/); await button('重置').click(); await loaded(); assert.equal(await page.getByRole('button',{name:'更多筛选',exact:true}).count(),1)
        }
      }
      await button('重置').click(); await loaded()
    }
  }
  pass('three pages: continuous aligned white card, stable filters at first/40px/middle/top with moving rows at 1422/1280/624px')
  pass('desktop logs: all key columns fit without horizontal scroll, three filter column lines align and sticky header retains body alignment')
  pass('all three mobile date panels: one month, cross-month endpoints and HH:mm:ss, visible confirm/clear, query applies, clear works')
  pass('mobile more filters preserve two applied conditions when collapsed and reset clears their count')

  for(const [width,height] of [[1422,804],[1280,720]]) {
    await page.setViewportSize({width,height}); await go('日志查询','logs')
    await open('REQ-00000013'); const titles=await log.locator('.handling-events h4').evaluateAll(nodes=>nodes.map(n=>({name:n.textContent,...n.getBoundingClientRect().toJSON()}))), scroll=await log.locator('.el-tabs__content').boundingBox()
    assert.deepEqual(titles.map(t=>t.name),['接收请求','业务处理','发送响应']); assert.ok(titles.every(t=>t.top>=scroll.y && t.bottom<=scroll.y+scroll.height),JSON.stringify({width,titles,scroll})); assert.equal(await log.locator('.el-tabs__content').evaluate(n=>n.scrollTop),0)
    await page.screenshot({path:`${out}/sync-first-screen-${width}.png`}); await close()
    for(const id of ['REQ-00000014','REQ-00000015']) {
      await open(id); await log.getByRole('tab',{name:'图像比对',exact:true}).click(); await page.waitForFunction(()=>[...document.querySelectorAll('.comparison-frame')].every(el=>el.getAttribute('aria-busy')!=='true'))
      const frames=await log.locator('.comparison-frame').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON())), users=await log.locator('.image-user').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON())), footer=await log.locator('.el-drawer__footer').boundingBox()
      assert.ok(frames[0].height>=50); assert.equal(frames[0].height,frames[1].height); assert.ok(users.every(u=>u.bottom<=footer.y)); assert.equal(await log.locator('.el-tabs__content').evaluate(n=>n.scrollTop),0)
      await page.screenshot({path:`${out}/images-${id}-${width}.png`}); await close()
    }
  }
  pass('sync three event titles and both complete comparison images/IDs/scores/positions are visible on first screen at 1422×804 and 1280×720')

  const inputWidths=[]
  for(const width of [1422,1920]) {
    await page.setViewportSize({width,height:900}); await go('审计查询','audits')
    const input=page.locator('.audit-time .el-date-editor'); inputWidths.push((await input.boundingBox()).width)
    const y=(await page.locator('.audit-time').boundingBox()).y; assert.ok((await page.locator('.audits-filters > .el-form-item').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().y))).every(top=>Math.abs(top-y)<1))
    await page.locator('.el-range-input').first().fill('2026-09-13 01:02:03'); await page.locator('.el-range-input').last().fill('2026-09-14 21:22:23'); await page.keyboard.press('Tab'); await page.keyboard.press('Escape')
    assert.ok(await page.locator('.el-range-input').evaluateAll(ns=>ns.every(input=>input.scrollWidth<=input.clientWidth)))
    await page.screenshot({path:`${out}/audit-${width}.png`})
  }
  assert.ok(inputWidths.every(width=>width>=390 && width<=410)); assert.ok(Math.abs(inputWidths[0]-inputWidths[1])<1)
  pass('audit date inputs keep complete timestamps in a fixed ~400px field and one compact row at 1422/1920px')

  await page.setViewportSize({width:1024,height:900}); await button('监控').click(); await page.getByRole('menuitem',{name:'服务状态',exact:true}).click(); await loaded(); await page.evaluate(()=>scrollTo(0,0)); await paint()
  assert.equal(await page.locator('.service-card').count(),3); assert.equal(await page.locator('.storage-row').count(),4)
  assert.ok((await page.locator('.storage-row').last().boundingBox()).y+(await page.locator('.storage-row').last().boundingBox()).height<=900)
  await page.screenshot({path:`${out}/monitor-1024.png`})
  for(const width of [736,560,480]) {
    await page.locator('.monitor-page').evaluate((n,width)=>n.style.width=`${width}px`,width); await paint(); const cards=await page.locator('.service-card').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().toJSON()))
    if(width===736) assert.equal(cards[0].y,cards[2].y); if(width===560){assert.equal(cards[0].y,cards[1].y);assert.ok(cards[2].y>cards[0].y);assert.equal(cards[2].width,width)} if(width===480) assert.ok(cards[2].y>cards[1].y && cards[1].y>cards[0].y)
    assert.ok(await page.locator('.instance-row').evaluateAll(ns=>ns.every(n=>n.scrollWidth<=n.clientWidth+1)))
  }
  pass('monitor with probe facts retains all 3 service cards and 4 storage rows at 1024×900, and 3/2+1/1 columns at 736/560/480px')
  assert.deepEqual(errors,[]); pass('zero browser errors')
  await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,coordinates,errors},null,2)); console.log(`COMPLETE ${checks.length} checks`)
} catch(error) { await page.screenshot({path:`${out}/failure.png`}); console.error(error); process.exitCode=1 } finally { await browser.close() }
