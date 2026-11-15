import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
const out = './qa-output/query-empty-states'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1422, height: 804 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
const errors = [], checks = []
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
const button = name => page.getByRole('button', { name, exact: true })
const loaded = () => page.waitForFunction(() => !document.querySelector('.el-loading-mask,.el-button.is-loading'))
const pass = text => { checks.push(text); console.log('PASS', text) }
const pages = [['申请人列表','applicants','输入完整申请人 ID','U001'], ['日志查询','logs','输入完整业务请求 ID','REQ-00000016'], ['审计查询','audits','输入完整账号','ops.zhang']]
async function go(name,path) { await page.getByRole('menuitem',{name,exact:true}).click(); await page.waitForURL(`**/${path}`); await loaded(); await page.evaluate(()=>scrollTo(0,0)) }
async function padding() { return page.locator('.records-page').evaluate(root => { const card=root.querySelector('.el-card').getBoundingClientRect(), note=root.querySelector('.note').getBoundingClientRect(); return { gap: card.bottom-note.bottom, height: card.height } }) }
try {
  await page.goto(`${base}/login`); await page.locator('.login-content input').nth(0).fill('admin'); await page.locator('.login-content input').nth(1).fill('admin123'); await button('登录').click(); await page.waitForURL('**/monitor'); await loaded()
  for(const width of [1422,624]) {
    await page.setViewportSize({width,height:850})
    for(const [name,path,placeholder,value] of pages) {
      await go(name,path); await button('重置').click(); await loaded(); const many=await padding()
      await page.getByPlaceholder(placeholder,{exact:true}).fill('MISSING-MOCK-ID'); await button('查询').click(); await loaded(); assert.equal(await page.locator('.records-page .el-table__row').count(),0); const empty=await padding()
      await page.getByPlaceholder(placeholder,{exact:true}).fill(value)
      if(path==='audits') {
        for(const [index,option] of [[0,'登录'],[1,'失败']]) { await page.locator('.audits-filters .el-select').nth(index).click(); await page.getByRole('option',{name:option,exact:true}).click() }
      }
      await button('查询').click(); await loaded(); const count=await page.locator('.records-page .el-table__row').count(); assert.ok(count>0&&count<=3); const few=await padding()
      assert.ok(Math.abs(empty.gap-few.gap)<1 && Math.abs(few.gap-many.gap)<1); assert.ok(empty.height<many.height && few.height<many.height)
      await button('重置').click(); await loaded()
    }
  }
  pass('all three cards keep identical bottom padding for zero/few/many rows and shrink with content on desktop and mobile')
  await page.setViewportSize({width:320,height:600})
  for(const [name,path] of pages) {
    await go(name,path); await button('选择时间范围').click(); const panel=page.locator('.single-month-range').filter({visible:true}); await panel.waitFor()
    assert.equal(await panel.locator('.el-calendar').count(),1); assert.ok(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1)); assert.ok(await panel.locator('.el-dialog__body').evaluate(n=>n.scrollWidth<=n.clientWidth+1))
    for(const name of ['确定','清空']) { const box=await panel.getByRole('button',{name,exact:true}).boundingBox(); assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=320&&box.y+box.height<=600) }
    await page.screenshot({path:`${out}/${path}-date-320.png`}); await panel.getByRole('button',{name:'清空',exact:true}).click()
  }
  pass('three 320×600 date dialogs retain one calendar, no horizontal clipping, and visible confirm/clear while contents scroll')
  assert.deepEqual(errors,[]); pass('zero browser errors')
  await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,errors},null,2)); console.log(`COMPLETE ${checks.length} checks`)
} catch(error) { await page.screenshot({path:`${out}/failure.png`}); console.error(error); process.exitCode=1 } finally { await browser.close() }
