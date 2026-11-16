import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base=new URL(process.env.ABIS_PREVIEW_URL||'http://127.0.0.1:5186').origin
assert.match(await(await fetch(`${base}/src/api/index.js`)).text(),/"VITE_USE_MOCK": "true"/)
const out=process.env.ABIS_QA_OUTPUT_DIR||'./qa-output/log-images'
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1366,height:1100},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'})
page.setDefaultTimeout(10000)
const checks=[],errors=[],backendRequests=[]
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
page.on('request',r=>{const u=new URL(r.url());if(['xhr','fetch'].includes(r.resourceType())&&(u.origin!==base||/^\/(admin-api|abis-admin)(\/|$)/.test(u.pathname)))backendRequests.push(r.url())})
const pass=s=>{checks.push(s);console.log('PASS',s)}
const loaded=()=>page.waitForFunction(()=>!document.querySelector('.el-loading-mask,.el-button.is-loading'))
const button=name=>page.getByRole('button',{name,exact:true})
const drawer=page.getByRole('dialog',{name:'请求详情',exact:true}),source=drawer.locator('.comparison-image').nth(0),candidate=drawer.locator('.comparison-image').nth(1)
const open=async n=>{await page.locator('.request-table .el-table__row').filter({hasText:`REQ-${String(n).padStart(8,'0')}`}).first().click();await drawer.waitFor();await page.waitForFunction(()=>{const d=document.querySelector('.request-log-drawer');return d&&Math.abs(d.getBoundingClientRect().right-innerWidth)<2})}
const close=async()=>{await drawer.getByRole('button',{name:'关闭',exact:true}).click();await drawer.waitFor({state:'hidden'})}
const showResponse=async()=>{await drawer.getByRole('tab',{name:'接口报文',exact:true}).click();const h=drawer.getByRole('button',{name:'响应结果',exact:true});if(await h.getAttribute('aria-expanded')==='false')await h.click()}
const images=async()=>{await drawer.getByRole('tab',{name:'图像比对',exact:true}).click();await drawer.locator('.request-image-comparison').waitFor();await page.waitForFunction(()=>[...document.querySelectorAll('.comparison-frame')].every(el=>el.getAttribute('aria-busy')!=='true'))}
const choose=async index=>{await drawer.getByRole('button',{name:new RegExp(`^候选 ${index+1}$`)}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.comparison-frame')].every(el=>el.getAttribute('aria-busy')!=='true'))}
const state=el=>el.getAttribute('data-image-state')
const shot=async name=>{await drawer.locator('.request-image-comparison').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${name}.png`,animations:'disabled'})}
const fixture=async(candidates,extra={})=>{
 await page.evaluate(async({candidates,extra})=>{
  const api=(await import('/src/api/index.js')).default,r=structuredClone((await window.originalLogList({requestId:'REQ-00000003'})).items[0])
  const sent=r.stages[1].children[0].events.find(e=>e.kind==='RESPONDED');sent.responseBody.candidates=candidates
  if(extra.feature){r.feature=extra.feature;r.stages[0].events[0].payload.feature=extra.feature}
  if(extra.fingerPosition)r.stages[0].events[0].payload.fingerPosition=extra.fingerPosition
  if(extra.userId)r.stages[0].events[0].payload.userId=extra.userId
  api.listLogs=async()=>({total:1,items:[r]})
 },{candidates,extra})
 await button('查询').click();await loaded();await open(3)
}
const restore=async()=>{await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;api.listLogs=window.originalLogList;api.getUserImage=window.trackedImage});await button('重置').click();await loaded()}
try{
 await page.goto(`${base}/login`);await page.locator('.login-content input').nth(0).fill('admin');await page.locator('.login-content input').nth(1).fill('admin123');await button('登录').click();await page.waitForURL('**/monitor')
 await page.getByRole('menuitem',{name:'日志查询',exact:true}).click();await loaded()
 await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;window.originalLogList=api.listLogs;window.originalImage=api.getUserImage;window.imageCalls=[];window.trackedImage=async q=>{window.imageCalls.push({...q});return window.originalImage(q)};api.getUserImage=window.trackedImage})
 await open(1);assert.deepEqual(await drawer.getByRole('tab').allTextContents(),['处理过程','接口报文']);assert.equal(await drawer.getByLabel('ABIS 响应 JSON').count(),0);await showResponse();assert.equal(await drawer.getByLabel('ABIS 响应 JSON').count(),1);await close()
 await open(3);assert.equal(await drawer.getByRole('tab',{name:'处理过程',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await drawer.locator('.request-image-comparison').count(),0);assert.deepEqual(await page.evaluate(()=>window.imageCalls),[])
 const summary=await drawer.locator('.request-summary').innerText();await images();assert.equal(await drawer.locator('.request-summary').innerText(),summary);assert.equal(await source.locator('img').getAttribute('src'),'/mock/biometrics/face-U001-1.svg');assert.equal(await source.locator('.image-user').innerText(),'用户 ID：U001');await candidate.getByText('本次查重无候选',{exact:true}).waitFor()
 const frames=await drawer.locator('.comparison-frame').evaluateAll(ns=>ns.map(n=>({height:n.getBoundingClientRect().height,bg:getComputedStyle(n).backgroundColor})));assert.deepEqual(frames[0],frames[1]);await drawer.getByText('图像为当前入库版本',{exact:true}).waitFor();await shot('empty');await close()
 pass('identification alone has two tabs, defaults to process without fetching images, and keeps common metadata with matching zero-candidate frames')
 await open(6);await images();assert.equal(await state(source),'deleted');await source.getByText('图像已删除或不存在',{exact:true}).waitFor();assert.equal(await source.locator('.image-user').innerText(),'用户 ID：U002');assert.equal(await candidate.locator('img').getAttribute('src'),'/mock/biometrics/face-U001-1.svg');assert.match(await candidate.innerText(),/候选排名：1/);assert.match(await candidate.innerText(),/比对分数：96/);await shot('deleted-source');await close()
 pass('deleted U002 source remains identified while historical candidate U001 image, actual rank 1 and score 96 remain available')
 for(const n of [9,10,11]){await open(n);await images();await candidate.getByText(n===11?'本次查重失败':'查重处理中',{exact:true}).waitFor();assert.equal(await candidate.getByText('本次查重无候选',{exact:true}).count(),0);await close()}
 await open(12);await images();await candidate.getByText('本次查重无候选',{exact:true}).waitFor();assert.match(await source.locator('img').getAttribute('src'),/finger-U007/);await close()
 pass('running, waiting and failed calls show their corresponding image empty state; successful identification pending publication still shows a confirmed empty result')
 for(const [n,user,feature,ids] of [[14,'U009','finger',['U101','U102','U103']],[15,'U010','face',['U201','U202','U203']]]){
  await open(n);assert.equal(await drawer.getByTestId('business-summary').innerText(),'查重成功 · 候选 3 条');await showResponse();const body=JSON.parse(await drawer.getByLabel('ABIS 响应 JSON').innerText());assert.deepEqual(body.candidates.map(c=>c.userId),ids)
  assert.ok(body.candidates.every((c,i)=>c.rank===i+1&&(i===0||c.score<body.candidates[i-1].score)))
  await images();assert.equal(await drawer.locator('.candidate-choice').count(),3);assert.equal(await drawer.locator('.candidate-choice').first().getAttribute('aria-pressed'),'true')
  const original=await source.locator('img').elementHandle(),src=await source.locator('img').getAttribute('src');assert.ok(src.includes(`${feature}-${user}-`));assert.match(await source.innerText(),new RegExp(user))
  for(let i=0;i<3;i++){await choose(i);assert.equal(await candidate.locator('.image-user').innerText(),`用户 ID：${ids[i]}`);assert.ok((await candidate.locator('img').getAttribute('src')).includes(`${feature}-${ids[i]}-`));assert.match(await candidate.innerText(),new RegExp(`候选排名：${body.candidates[i].rank}`));assert.ok((await candidate.innerText()).includes(`比对分数：${body.candidates[i].score}`));assert.equal(await source.locator('img').evaluate((el,old)=>el===old,original),true);if(feature==='finger'){assert.equal(await source.locator('.image-position').innerText(),'左手食指');assert.equal(await candidate.locator('.image-position').innerText(),'左手食指')}}
  await shot(`default-${feature}-three`);await close()
 }
 pass('default requests 14/15 each expose all three ranked candidates with matching face/finger images and scores, preserving the source through every switch')
 const lookup=await page.evaluate(async()=>{
  const api=(await import('/src/api/index.js')).default
  const keys=(await import('/src/api/contract.js')).default,http=(await import('/src/api/adapters/http.js')).default
  return {parity:keys.every(k=>typeof api[k]==='function'&&typeof http[k]==='function'),items:await Promise.all([{userId:'U001',feature:'finger',fingerPosition:'right_index'},{userId:'U005',feature:'finger',fingerPosition:'right_thumb'},{userId:'U004',feature:'finger',fingerPosition:'right_little'},{userId:'U999',feature:'face'},{userId:'U002',feature:'face'},{userId:'000U001',feature:'face'}].map(q=>api.getUserImage(q)))}
 })
 assert.equal(lookup.parity,true);assert.match(lookup.items[0].imageUrl,/finger-U001-7/);assert.equal(lookup.items[0].fingerPosition,'right_index');assert.deepEqual(lookup.items.slice(1).map(x=>x.status),['missing','missing','missing','deleted','missing'])
 pass('current-record lookup strictly matches full IDs, modality and finger position, distinguishes deletion from missing data, and keeps adapter contracts aligned')
 const candidates=[{userId:'U006',rank:7,score:0},{userId:'U001',rank:2,score:96.25},{userId:'U999',rank:1,score:88},{userId:'U002',rank:4,score:79},{userId:'U004'}]
 await fixture(candidates);await images();const originalSource=await source.locator('img').elementHandle(),callsBefore=await page.evaluate(()=>window.imageCalls.filter(q=>q.userId==='U001').length)
 assert.match(await candidate.innerText(),/候选排名：7/);assert.match(await candidate.innerText(),/比对分数：0/)
 await choose(1);assert.match(await candidate.innerText(),/比对分数：96.25/);assert.equal(await source.locator('img').evaluate((el,previous)=>el===previous,originalSource),true)
 assert.equal(await page.evaluate(()=>window.imageCalls.filter(q=>q.userId==='U001').length),callsBefore+1)
 await choose(2);assert.equal(await state(candidate),'missing');assert.match(await candidate.innerText(),/用户 ID：U999/);assert.match(await candidate.innerText(),/候选排名：1/)
 await choose(3);assert.equal(await state(candidate),'deleted');assert.match(await candidate.innerText(),/比对分数：79/)
 await choose(4);assert.match(await candidate.innerText(),/候选排名：—/);assert.match(await candidate.innerText(),/比对分数：—/);await shot('multiple');await close();await restore()
 pass('multiple candidates retain response order and exact rank/score including zero; switching preserves the left image and missing/deleted candidates retain their evidence')
 await fixture([{userId:'U005',rank:1,score:88}],{feature:'finger',fingerPosition:'left_index'});await images();assert.match(await source.locator('img').getAttribute('src'),/finger-U001-2/);assert.match(await candidate.locator('img').getAttribute('src'),/left-index-b/);assert.equal(await source.locator('.image-position').innerText(),'左手食指');await close();await restore()
 await fixture([{userId:'U005',rank:1,score:88,fingerPosition:'right_thumb'}],{feature:'finger',fingerPosition:'left_index'});await images();assert.equal(await state(candidate),'missing');assert.match(await candidate.innerText(),/暂无可用图像/);assert.match(await candidate.innerText(),/右手拇指/);assert.match(await source.locator('img').getAttribute('src'),/finger-U001-2/);await close();await restore()
 pass('finger images honor request position and candidate-specific position; a missing link never falls back to a different finger or face')
 await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;api.getUserImage=async q=>{if(q.userId==='U006')throw new Error('temporary');return window.trackedImage(q)}})
 await fixture([{userId:'U006',rank:1,score:91}]);await images();assert.equal(await state(candidate),'failed');assert.match(await candidate.innerText(),/图像加载失败/);assert.match(await candidate.innerText(),/比对分数：91/);await page.evaluate(async()=>{(await import('/src/api/index.js')).default.getUserImage=window.trackedImage});await candidate.getByRole('button',{name:'候选图像重新加载',exact:true}).click();await candidate.locator('img').waitFor();await close();await restore()
 pass('temporary lookup failures retain candidate metadata and recover through image retry')
 await page.route('**/mock/biometrics/broken.svg',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'invalid image'}))
 await page.evaluate(async()=>{(await import('/src/api/index.js')).default.getUserImage=async q=>({...await window.trackedImage(q),imageUrl:'/mock/biometrics/broken.svg'})})
 await fixture([{userId:'U006',rank:1,score:91}]);await images();assert.equal(await state(source),'failed');assert.equal(await state(candidate),'failed');assert.match(await source.innerText(),/用户 ID：U001/);assert.match(await candidate.innerText(),/用户 ID：U006/);await shot('failed');await close();await restore();await page.unroute('**/mock/biometrics/broken.svg')
 pass('image decoding failures show the explicit loading-failed state on either side without losing IDs or response data')
 await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;api.getUserImage=async q=>{if(q.userId==='U006')return new Promise(resolve=>window.resolveOldImage=async()=>resolve(await window.originalImage(q)));return window.trackedImage(q)}})
 await fixture(candidates);await drawer.getByRole('tab',{name:'图像比对',exact:true}).click();await page.waitForFunction(()=>typeof window.resolveOldImage==='function');await choose(1);await page.evaluate(()=>window.resolveOldImage());await page.waitForFunction(()=>document.querySelectorAll('.comparison-image')[1].querySelector('img')?.complete)
 assert.match(await candidate.innerText(),/用户 ID：U001/);assert.match(await candidate.locator('img').getAttribute('src'),/face-U001/);await close();await restore()
 pass('a late image response for a previous candidate cannot overwrite the newly selected candidate')
 await page.evaluate(async()=>{(await import('/src/api/index.js')).default.getUserImage=async q=>({...await window.trackedImage(q),userId:'OTHER'})})
 await fixture([{userId:'U006',rank:1,score:91}]);await images();assert.equal(await state(source),'missing');assert.equal(await source.locator('img').count(),0);assert.equal(await state(candidate),'missing');await close();await restore()
 pass('mismatched backend identities are rejected rather than showing another user image')
 await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default,r=structuredClone((await window.originalLogList({requestId:'REQ-00000003'})).items[0]);const second=structuredClone(r.stages[1].children[0]);second.attemptId='attempt-2';second.instanceId+='-2';second.events.forEach(e=>{e.id+='-2';e.attemptId='attempt-2';e.at=new Date(Date.parse(e.at)+1000).toISOString();if(e.kind==='RESPONDED')e.responseBody.candidates=[{userId:'U006',rank:3,score:90}]});r.stages[1].children.push(second);api.listLogs=async()=>({total:1,items:[r]})})
 await button('查询').click();await loaded();await open(3);await images();assert.match(await candidate.innerText(),/用户 ID：U006/);await drawer.locator('.response-selector').click();await page.getByRole('option',{name:/^attempt-1/}).click();await candidate.getByText('本次查重无候选',{exact:true}).waitFor();await drawer.getByRole('tab',{name:'处理过程',exact:true}).click();await showResponse();assert.deepEqual(JSON.parse(await drawer.getByLabel('ABIS 响应 JSON').innerText()).candidates,[]);await close();await restore()
 pass('response attempt selection is shared between image comparison and formatted process JSON')
 await open(3);await drawer.locator('[data-stage="ADAPTER_CALLING"] > .stage-toggle').first().click();await images();await drawer.getByRole('tab',{name:'处理过程',exact:true}).click();assert.equal(await drawer.locator('[data-stage="ADAPTER_CALLING"] > .stage-toggle').first().getAttribute('aria-expanded'),'false');await close();await open(3);assert.equal(await drawer.getByRole('tab',{name:'处理过程',exact:true}).getAttribute('aria-selected'),'true');await close()
 pass('tab changes retain stage expansion and reopening resets to the default process view')
 for(const width of [1920,1366,1024,768,390,320]){
  await page.setViewportSize({width,height:width<768?844:1100});await open(width<768?14:6);await images();assert.ok(await drawer.locator('.el-drawer__body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`overflow ${width}`)
  const boxes=await drawer.locator('.comparison-frame').evaluateAll(ns=>ns.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}}));assert.equal(boxes[0].height,boxes[1].height);if(width>=768){assert.equal(boxes[0].y,boxes[1].y);assert.ok(boxes[0].x<boxes[1].x)}
  assert.equal(await drawer.locator('.request-summary').isVisible(),true);if([1366,390,320].includes(width))await shot(`comparison-${width}`);await close()
 }
 pass('common metadata, two image frames and candidate details fit 320–1920px with consistent desktop spacing and stacked mobile frames')
 const operator=await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;await api.logout();await api.login('ops.zhang','ops123');const r=await api.getUserImage({userId:'U001',feature:'face'});await api.logout();let denied=false;try{await api.getUserImage({userId:'U001',feature:'face'})}catch{denied=true}return {status:r.status,denied}})
 assert.equal(operator.status,'available');assert.equal(operator.denied,true)
 pass('operator can read images while unauthenticated lookup is rejected')
 assert.deepEqual(errors,[]);assert.deepEqual(backendRequests,[]);pass('zero browser errors and zero real-backend requests')
 await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,errors,backendRequests},null,2));console.log(`COMPLETE ${checks.length} checks`)
}catch(error){await page.screenshot({path:`${out}/failure.png`});console.error(error);process.exitCode=1}finally{await browser.close()}
