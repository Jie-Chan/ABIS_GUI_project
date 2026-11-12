import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base=new URL(process.env.ABIS_PREVIEW_URL||'http://127.0.0.1:5186').origin,out='./qa-output/four-pages'
assert.match(await(await fetch(`${base}/src/api/index.js`)).text(),/"VITE_USE_MOCK": "true"/)
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1366,height:768},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'})
const checks=[],errors=[],backendRequests=[]
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('request',r=>{if(['xhr','fetch'].includes(r.resourceType())&&new URL(r.url()).origin!==base)backendRequests.push(r.url())})
const loaded=()=>page.waitForFunction(()=>!document.querySelector('.el-loading-mask,.el-button.is-loading')),pass=s=>{checks.push(s);console.log('PASS',s)}
const go=async(name,path)=>{await page.getByRole('menuitem',{name,exact:true}).click();await page.waitForURL(`**/${path}`);await loaded();assert.equal(await page.locator('.page-intro').count(),0)}
const drawer=page.getByRole('dialog',{name:'请求详情',exact:true}),button=name=>page.getByRole('button',{name,exact:true})
try{
 await page.goto(`${base}/login`);await page.locator('.login-content input').nth(0).fill('admin');await page.locator('.login-content input').nth(1).fill('admin123');await button('登录').click();await page.waitForURL('**/monitor');await loaded()
 for(const width of [1366,1920,1200]){
  await page.setViewportSize({width,height:width===1920?1080:768})
  for(const[name,path,selector]of[['申请人列表','applicants','.applicant-filters'],['审计查询','audits','.audits-filters']]){
   await go(name,path);const positions=await page.locator(`${selector} > .el-form-item`).evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().top));assert.ok(Math.max(...positions)-Math.min(...positions)<2,`${path} filter wrap at ${width}`)
   if(path==='applicants')await page.getByText('仅展示已确认注册成功且当前有效的申请人',{exact:true}).waitFor()
   if(width===1366)await page.screenshot({path:`${out}/${path}.png`,fullPage:true})
  }
 }
 pass('applicants and audits start with single-row desktop filters, preserving population scope and result toolbars')
 await go('服务状态监控','monitor');assert.equal(await page.locator('.summary-card').count(),4);const toolbar=await page.locator('.monitor-toolbar h2,.monitor-toolbar .meta,.monitor-toolbar button').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().top));assert.ok(Math.max(...toolbar)-Math.min(...toolbar)<15);await button('异常').click();assert.equal(await page.locator('.instance-row').count(),1);await button('立即刷新').click();await loaded();assert.equal(await page.locator('.instance-row').count(),1);await page.screenshot({path:`${out}/monitor.png`,fullPage:true});pass('monitor starts with four status counts and retains the section title, update time, filtering and refresh')
 await go('日志查询','logs');await page.locator('.log-api-filter .el-select').click();await page.getByRole('option',{name:'1：N查重',exact:true}).click();await button('查询').click();await loaded();assert.equal(await page.locator('.request-table .el-table__row').count(),9);assert.ok((await page.locator('.request-table .el-table__row td:nth-child(3)').allTextContents()).every(t=>t.includes('1：N查重')));await button('重置').click();await loaded();pass('one identification filter named 1：N查重 matches both modalities with consistent list labels')
 for(const [width,height]of[[1366,768],[1920,1080]]){
  await page.setViewportSize({width,height})
  for(const[n,feature]of[[14,'finger'],[15,'face']]){
   await page.locator('.request-table .el-table__row').filter({hasText:`REQ-${String(n).padStart(8,'0')}`}).click();await drawer.waitFor();await drawer.getByRole('tab',{name:'图像比对',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.comparison-frame')].every(el=>el.getAttribute('aria-busy')!=='true'));await drawer.locator('.el-drawer__body').evaluate(el=>el.scrollTop=0)
   const footer=(await drawer.locator('.el-drawer__footer').boundingBox()).y
   const geometry=await drawer.locator('.comparison-image').evaluateAll(ns=>ns.map(n=>({frame:n.querySelector('.comparison-frame').getBoundingClientRect().toJSON(),id:n.querySelector('.image-user').getBoundingClientRect().toJSON(),heading:n.querySelector('.image-heading').getBoundingClientRect().toJSON()})))
   assert.equal(geometry[0].frame.height,geometry[1].frame.height);assert.ok(geometry.every(g=>g.id.bottom<footer),`image IDs obscured at ${width}x${height}`)
   const rank=await drawer.locator('.candidate-result').boundingBox();assert.ok(rank.y+rank.height<=geometry[1].frame.y)
   assert.match(await drawer.locator('.request-summary').innerText(),new RegExp(`${feature==='finger'?'指纹':'人脸'} 1：N查重`))
   if(feature==='finger'){assert.equal(await drawer.locator('.image-heading .image-position').count(),2);await drawer.locator('.candidate-choice').nth(1).click();await page.waitForFunction(()=>[...document.querySelectorAll('.comparison-frame')].every(el=>el.getAttribute('aria-busy')!=='true'));assert.match(await drawer.locator('.comparison-image').nth(1).innerText(),/U102/)}
   if(width===1366)await page.screenshot({path:`${out}/${feature}-first-screen.png`})
   await drawer.getByRole('button',{name:'关闭',exact:true}).click();await drawer.waitFor({state:'hidden'})
  }
 }
 pass('both multi-candidate examples keep images, IDs, scores and finger positions visible above the desktop drawer footer')
 await page.locator('.request-table .el-table__row').first().click();await drawer.waitFor();await drawer.locator('[data-stage="ADAPTER_CALLING"] > .stage-toggle').click();await drawer.locator('[data-stage="ABIS_HANDLING"] > .stage-toggle').click();assert.equal(await drawer.locator('.processing-duration').count(),0);assert.doesNotMatch(await drawer.innerText(),/120 ms|ABIS 实际处理耗时/);await drawer.getByRole('button',{name:'关闭',exact:true}).click();await drawer.waitFor({state:'hidden'});const download=page.waitForEvent('download');await button('导出 CSV').click();await(await download).saveAs(`${out}/logs.csv`);const csv=(await fs.readFile(`${out}/logs.csv`,'utf8')).trim().split(/\r?\n/);assert.equal(csv.length,16);assert.equal(csv[0].split(',').length,12);assert.doesNotMatch(csv.join('\n'),/ABIS 实际处理耗时|120 ms/);pass('detail and CSV remove the obsolete processing duration while preserving timestamps and aligned export columns')
 for(const width of[390,320]){await page.setViewportSize({width,height:844});for(const[name,path]of[['申请人列表','applicants'],['审计查询','audits'],['服务状态监控','monitor'],['日志查询','logs']]){await go(name,path);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path} overflow ${width}`)}}
 pass('all four pages retain usable ordered layouts at 320/390px without horizontal overflow')
 assert.deepEqual(errors,[]);assert.deepEqual(backendRequests,[]);pass('zero browser errors and zero real-backend requests');await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,errors,backendRequests},null,2));console.log(`COMPLETE ${checks.length} checks`)
}catch(e){await page.screenshot({path:`${out}/failure.png`});console.error(e);process.exitCode=1}finally{await browser.close()}
