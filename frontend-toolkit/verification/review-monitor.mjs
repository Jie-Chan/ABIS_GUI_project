import {chromium} from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base=new URL(process.env.ABIS_PREVIEW_URL||'http://127.0.0.1:5186').origin
assert.match(await(await fetch(`${base}/src/api/index.js`)).text(),/"VITE_USE_MOCK": "true"/)
const out=process.env.ABIS_QA_OUTPUT_DIR||'./qa-output/monitor';await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1600,height:1000},locale:'zh-CN',reducedMotion:'reduce'})
const checks=[],errors=[],backendRequests=[];const pass=s=>{checks.push(s);console.log('PASS',s)}
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
page.on('request',r=>{if(['xhr','fetch'].includes(r.resourceType())&&new URL(r.url()).origin!==base)backendRequests.push(r.url())})
const button=name=>page.getByRole('button',{name,exact:true}),loaded=()=>page.waitForFunction(()=>!document.querySelector('.el-loading-mask,.el-button.is-loading'))
const counts=()=>page.locator('.status-overview dd').allTextContents()
const refresh=async()=>{await button('立即刷新').click();await loaded()}
try{
 await page.goto(`${base}/login`);await page.locator('.login-content input').nth(0).fill('admin');await page.locator('.login-content input').nth(1).fill('admin123');await button('登录').click();await page.waitForURL('**/monitor');await loaded()
 assert.deepEqual(await counts(),['10','8','1','1'])
 assert.deepEqual(await page.locator('.service-card h3').allTextContents(),['ABIS-System','算法服务 1','算法服务 2','PostgreSQL','MinIO'])
 assert.deepEqual(await page.locator('.instance-id').allTextContents(),['system-1','system-2','face-1','fingerprint-1','face-2','fingerprint-2','postgresql-1','postgresql-2','postgresql-3','minio-1'])
 assert.equal(await page.locator('.instance-row').count(),10);assert.doesNotMatch(await page.locator('.monitor-page').innerText(),/Gateway/)
 pass('five expanded groups contain exactly the ten deployed instances, including both algorithm pairs and no Gateway')
 for(const [label,count,id]of[['正常',8],['异常',1,'face-1'],['未知',1,'minio-1'],['全部',10]]){
  await button(label).click();assert.equal(await page.locator('.instance-row').count(),count);assert.equal(await button(label).getAttribute('aria-pressed'),'true');assert.deepEqual(await counts(),['10','8','1','1'])
  if(id)assert.deepEqual(await page.locator('.instance-id').allTextContents(),[id])
 }
 pass('all four clickable summary filters show 10/8/1/1 matching rows and hide unmatched groups without changing totals')
 await button('未知').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.service-card').count(),1);await refresh();assert.deepEqual(await page.locator('.instance-id').allTextContents(),['minio-1'])
 await button('全部').click()
 pass('keyboard filtering and manual refresh retain the selected instance filter')
 assert.match(await page.locator('.refresh-area .meta').innerText(),/^状态更新于 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
 assert.doesNotMatch(await page.locator('.monitor-page').innerText(),/每.*秒|自动刷新|倒计时|HTTP|接口调用|刷新频率/)
 const layout=await page.locator('.service-card').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y}}))
 assert.equal(layout[0].y,layout[2].y);assert.equal(layout[3].y,layout[4].y);assert.ok(layout[3].y>layout[0].y)
 pass('desktop layout has three cards above two, success timestamp only and no frequency/countdown or transport details')
 await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;window.originalHealth=api.getHealth})
 const timestamp=await page.locator('.meta').innerText()
 await page.evaluate(async()=>{(await import('/src/api/index.js')).default.getHealth=async()=>{throw new Error('模拟读取失败')}});await refresh()
 await page.getByText('读取失败，以下保留上次成功获取的数据。',{exact:true}).waitFor();assert.equal(await page.locator('.meta').innerText(),timestamp);assert.equal(await page.locator('.instance-row').count(),10)
 await page.evaluate(async()=>{(await import('/src/api/index.js')).default.getHealth=window.originalHealth});await refresh();assert.equal(await page.locator('.stale-note').count(),0)
 pass('failed refresh preserves last successful data/time and recovery clears the stale warning')
 await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;api.getHealth=async()=>{const r=await window.originalHealth();r.items[0].instances[0].status='unexpected';return r}});await refresh();assert.deepEqual(await counts(),['10','7','1','2'])
 await button('未知').click();assert.deepEqual(await page.locator('.instance-id').allTextContents(),['system-1','minio-1'])
 pass('unrecognized or unavailable state remains counted as unknown rather than being fabricated as normal')
 await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;api.getHealth=async()=>({items:[],fetchedAt:'2026-11-11 12:00:00'})});await refresh();assert.deepEqual(await counts(),['0','0','0','0']);await page.getByText('暂无服务状态数据',{exact:true}).waitFor()
 await page.evaluate(async()=>{(await import('/src/api/index.js')).default.getHealth=window.originalHealth});await button('全部').click();await refresh()
 pass('empty snapshots show zero rows with an empty state and restore normally')
 for(const width of[1920,1366,1100,1024,768,640,390,320]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`page overflow ${width}`)
  for(const row of await page.locator('.instance-row').all())assert.ok(await row.evaluate(el=>{const label=el.querySelector('.instance-identity').getBoundingClientRect(),state=el.querySelector('.instance-state').getBoundingClientRect();return label.right<=state.left&&el.scrollWidth<=el.clientWidth+1}))
  if([1366,390].includes(width))await page.screenshot({path:`${out}/monitor-${width}.png`,fullPage:true})
 }
 pass('instance names and right-aligned states fit 320–1920px with no overlap or clipping')
 assert.deepEqual(errors,[]);assert.deepEqual(backendRequests,[]);pass('zero browser errors and zero real-backend requests')
 await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,errors,backendRequests},null,2));console.log(`COMPLETE ${checks.length} checks`)
}catch(e){await page.screenshot({path:`${out}/failure.png`});console.error(e);process.exitCode=1}finally{await browser.close()}
