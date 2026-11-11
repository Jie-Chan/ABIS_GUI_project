import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
assert.match(await (await fetch(`${base}/src/api/index.js`)).text(), /"VITE_USE_MOCK": "true"/)
const out = process.env.ABIS_QA_OUTPUT_DIR || './qa-output/log-ids'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' })
page.setDefaultTimeout(10000)
const checks = [], errors = [], backendRequests = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('request', r => { const u=new URL(r.url()); if(['xhr','fetch'].includes(r.resourceType()) && (u.origin!==base || /^\/(abis-admin|admin-api)(\/|$)/.test(u.pathname))) backendRequests.push(r.url()) })
const pass=s=>{checks.push(s);console.log('PASS',s)}
const loaded=()=>page.waitForFunction(()=>!document.querySelector('.el-loading-mask,.el-button.is-loading'))
const button=name=>page.getByRole('button',{name,exact:true})
const user=page.getByPlaceholder('输入完整申请人 ID',{exact:true}),request=page.getByPlaceholder('输入完整业务请求 ID',{exact:true})
const search=async()=>{await button('查询').click();await loaded()}
const reset=async()=>{await button('重置').click();await loaded()}
const ids=column=>page.locator(`.request-table .el-table__body .el-table__row td:nth-child(${column}) .log-id`).allTextContents()
try{
 await page.goto(`${base}/login`);await page.locator('.login-content input').nth(0).fill('admin');await page.locator('.login-content input').nth(1).fill('admin123')
 await button('登录').click();await page.waitForURL('**/monitor');await loaded()
 await page.getByRole('menuitem',{name:'日志查询',exact:true}).click();await page.waitForURL('**/logs');await loaded()
 await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;window.originalLogs=api.listLogs;window.logQueries=[];api.listLogs=async q=>{window.logQueries.push({...q});return window.originalLogs(q)}})
 await user.fill(' U001 ');await user.press('Enter');await loaded()
 assert.deepEqual(await ids(1),['U001','U001']);assert.equal(await page.evaluate(()=>window.logQueries.at(-1).userId),'U001');assert.equal(await page.evaluate(()=>window.logQueries.length),1)
 pass('user ID trims whitespace and Enter submits exactly once, preserving U001 as an exact string')
 await reset();await page.locator('.el-pagination__sizes .el-select').click();await page.getByRole('option',{name:'5条/页',exact:true}).click();await loaded()
 await page.locator('.el-pager .number').filter({hasText:/^2$/}).click();await loaded()
 assert.equal(await page.evaluate(()=>window.logQueries.at(-1).page),2)
 const downloading=page.waitForEvent('download');await button('导出 CSV').click();await(await downloading).saveAs(`${out}/all.csv`)
 const lines=(await fs.readFile(`${out}/all.csv`,'utf8')).trim().split(/\r?\n/)
 assert.equal(lines.length,12);assert.match(lines[0],/用户 ID,请求 ID/)
 assert.match(lines.at(-1),/REQ-00000011/)
 pass('pagination uses five rows while CSV exports all 11 matching requests beyond the current page')
 await user.fill('U002');await search();assert.equal(await page.evaluate(()=>window.logQueries.at(-1).page),1);assert.deepEqual(await ids(1),['U002','U002','U002'])
 await request.fill('REQ-00000004');await search();assert.deepEqual(await ids(2),['REQ-00000004'])
 await button('详情').click();const detail=page.getByRole('dialog',{name:'请求详情',exact:true});assert.match(await detail.innerText(),/U002/)
 await detail.getByRole('button',{name:'关闭',exact:true}).click();await detail.waitFor({state:'hidden'})
 await user.fill('U001');await search();await page.getByText('暂无匹配记录',{exact:true}).waitFor()
 await user.fill('');await search();assert.equal(await page.locator('.request-table .el-table__row').count(),1)
 pass('user/request IDs intersect, new queries reset pages, request-only search returns one logical request and detail retains the IDs')
 await request.fill('REQ-0000000');await search();await page.getByText('暂无匹配记录',{exact:true}).waitFor()
 await request.fill('REQ-00000009');await user.fill('U006');await page.locator('.log-result-filter .el-select').click();await page.getByRole('option',{name:'失败',exact:true}).click();await search()
 assert.equal(await page.locator('.request-table .el-table__row').count(),1)
 pass('partial request IDs never match and exact IDs combine with business-result filters')
 await reset();assert.equal(await user.inputValue(),'');assert.equal(await request.inputValue(),'');assert.equal(await page.locator('.request-table .el-table__row').count(),11)
 pass('reset clears both IDs and restores exactly the 11 documented requests')
 await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;const row=structuredClone((await window.originalLogs({})).items[0]);row.stages[0].events.find(e=>e.kind==='RECEIVED').payload.userId=null;row.requestId=null;api.listLogs=async()=>({total:1,items:[row]})})
 await search();assert.deepEqual(await ids(1),['—']);assert.deepEqual(await ids(2),['—'])
 await button('详情').click();const missing=page.getByRole('dialog',{name:'请求详情',exact:true});assert.equal((await missing.locator('.log-id').allTextContents()).join(','),'—,—')
 await missing.getByRole('button',{name:'关闭',exact:true}).click();await missing.waitFor({state:'hidden'})
 await page.evaluate(async()=>{(await import('/src/api/index.js')).default.listLogs=window.originalLogs});await reset()
 pass('optional omitted userId and missing historical requestId show placeholders without adding extra default rows')
 for(const width of [1920,1366,1024,768,390,320]){
  await page.setViewportSize({width,height:width<768?844:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${width}`)
  for(const input of [user,request]){const b=await input.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width)}
  if(width===1366)assert.ok((await page.locator('.request-table').boundingBox()).y<=430)
  if([1366,390].includes(width))await page.screenshot({path:`${out}/logs-${width}.png`,fullPage:true})
 }
 pass('ID filters remain visible and fit 320–1920px with no page overflow')
 assert.deepEqual(errors,[]);assert.deepEqual(backendRequests,[]);pass('zero browser errors and zero real-backend requests')
 await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,errors,backendRequests},null,2));console.log(`COMPLETE ${checks.length} checks`)
}catch(e){await page.screenshot({path:`${out}/failure.png`,fullPage:true});console.error(e);process.exitCode=1}finally{await browser.close()}
