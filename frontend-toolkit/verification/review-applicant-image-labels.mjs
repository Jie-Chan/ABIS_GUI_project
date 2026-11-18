import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
assert.match(await (await fetch(`${base}/src/api/index.js`)).text(), /"VITE_USE_MOCK": "true"/)
const out = process.env.ABIS_QA_OUTPUT_DIR || './qa-output/image-labels-1730'
await fs.mkdir(out,{recursive:true})
const browser = await chromium.launch(), page = await browser.newPage({viewport:{width:1422,height:804},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'})
page.setDefaultTimeout(10000)
const checks=[],errors=[],backendRequests=[]
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
page.on('request',request=>{const url=new URL(request.url());if(['xhr','fetch'].includes(request.resourceType())&&(url.origin!==base||/^\/(admin-api|abis-admin)(\/|$)/.test(url.pathname)))backendRequests.push(request.url())})
const pass=text=>{checks.push(text);console.log('PASS',text)}
const button=name=>page.getByRole('button',{name,exact:true})
const loaded=()=>page.waitForFunction(()=>!document.querySelector('.el-loading-mask,.el-button.is-loading'))
const drawer=page.getByRole('dialog',{name:'申请人详情',exact:true}),preview=page.getByRole('dialog',{name:'入库图像详情',exact:true})
async function open(id){await page.locator('.applicants-page .el-table__row').filter({hasText:id}).getByRole('button',{name:'查看详情',exact:true}).click();await loaded();await drawer.waitFor();await page.waitForFunction(()=>Math.abs(document.querySelector('.applicant-drawer').getBoundingClientRect().right-innerWidth)<1)}
async function close(){await drawer.locator('.el-drawer__close-btn').click();await drawer.waitFor({state:'hidden'})}
async function namesAreClean(ids){
 const text=await page.evaluate(()=>[document.body.innerText,...[...document.querySelectorAll('[title],[aria-label],img[alt]')].map(node=>['title','aria-label','alt'].map(key=>node.getAttribute(key)||'').join(' '))].join('\n'))
 for(const id of ids.filter(Boolean))assert.ok(!text.includes(id),`internal ID exposed: ${id}`)
 assert.doesNotMatch(text,/记录 ID|Mock 样例|演示/)
 assert.equal(await drawer.locator('.record-id').count(),0)
}
async function metadata(label){const cell=preview.locator('tr').filter({has:page.locator('.el-descriptions__label').filter({hasText:new RegExp(`^${label}$`)})}).locator('.el-descriptions__content');return label==='质量分'?cell.locator('.quality-value').innerText():cell.innerText()}
try{
 await page.goto(`${base}/login`);await page.locator('.login-content input').nth(0).fill('admin');await page.locator('.login-content input').nth(1).fill('admin123');await button('登录').click();await page.waitForURL('**/monitor');await page.getByRole('menuitem',{name:'申请人列表',exact:true}).click();await page.waitForURL('**/applicants');await loaded()
 const people=await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;return(await api.listApplicants()).items})
 const ids=people.flatMap(person=>person.records.map(record=>record.recordId))
 await namesAreClean(ids);await open('U301');await namesAreClean(ids)
 assert.equal(await drawer.locator('.finger-slot').count(),10);assert.equal(await drawer.locator('[data-modality="finger"] img').count(),8);assert.equal(await drawer.locator('.finger-placeholder').count(),2);assert.equal(await drawer.locator('[data-modality="finger"] h2').innerText(),'指纹')
 for(const position of ['right_ring','right_little']){const slot=drawer.locator(`[data-finger="${position}"]`);assert.match(await slot.locator('.finger-placeholder').getAttribute('aria-label'),/右手.*未入库/);assert.equal(await slot.locator('button,.quality-score').count(),0)}
 const expected=await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default,latest=(await import('/src/utils/applicant.js')).latestEnrollmentRecord,format=(await import('/src/utils/log.js')).formatLogTime,person=await api.getApplicant('U301');return[latest(person.records.filter(r=>r.feature==='face')),latest(person.records.filter(r=>r.fingerPosition==='left_index'))].map(record=>({...record,displayTime:format(record.updatedAt)}))})
 assert.match(expected[1].recordId,/duplicate/)
 for(const [index,selector]of[[0,'[data-modality="face"] .enrollment-image'],[1,'[data-finger="left_index"] .enrollment-image']]){
  const image=drawer.locator(selector);assert.equal(await image.locator('img').getAttribute('src'),expected[index].imageUrl);assert.equal(await image.locator('.quality-caption').innerText(),'质量分');assert.equal(await image.locator('.quality-value').innerText(),String(expected[index].qualityScore));assert.match(await image.getAttribute('aria-label'),/申请人 U301/);if(index===1)assert.match(await image.getAttribute('aria-label'),/指纹.*左手食指/)
  await image.click();await preview.waitFor();assert.equal(await preview.locator('.quality-score').count(),0);assert.equal(await preview.locator('.quality-value').count(),1);await namesAreClean(ids);assert.equal(await preview.locator('img').getAttribute('src'),expected[index].imageUrl);assert.equal(await metadata('申请人 ID'),'U301');assert.equal(await metadata('质量分'),String(expected[index].qualityScore));assert.equal(await metadata('图像更新时间'),expected[index].displayTime);if(index===1)assert.equal(await metadata('指位'),'左手食指')
  assert.equal(await preview.locator('img').evaluate(node=>getComputedStyle(node).objectFit),'contain')
  await page.screenshot({path:`${out}/${index?'finger':'face'}-preview.png`});await preview.getByRole('button',{name:'关闭图像',exact:true}).click();await preview.waitFor({state:'hidden'})
 }
 await page.screenshot({path:`${out}/u301-current-images.png`});await close()
 pass('list, face/finger cards, previews and accessible names hide internal IDs while latest image, quality, applicant, finger and update time remain paired')

 for(const [width,height]of[[1422,804],[1280,720]]){
  await page.setViewportSize({width,height});await open('U001');assert.equal(await drawer.locator('.finger-slot').count(),10);const body=await drawer.locator('.el-drawer__body').boundingBox(),visibleBottom=Math.min(height,body.y+body.height)
  assert.ok(await drawer.locator('.current-images .enrollment-image').evaluateAll((nodes,bottom)=>nodes.every(node=>node.getBoundingClientRect().bottom<=bottom+1),visibleBottom));assert.equal(await drawer.locator('.el-drawer__body').evaluate(node=>node.scrollTop),0);await namesAreClean(ids);await page.screenshot({path:`${out}/u001-${width}.png`});await close()
 }
 pass('1422×804 and 1280×720 keep the face and ten fingers visible without the removed labels leaving blank rows')

 await page.setViewportSize({width:624,height:850});await open('U302')
 for(const [position,value]of[['right_ring','—'],['right_little','0']]){
  const image=drawer.locator(`[data-finger="${position}"] .enrollment-image`);assert.equal(await image.locator('.quality-value').innerText(),value);await image.click();await preview.waitFor();assert.equal(await metadata('质量分'),value);assert.equal(await preview.locator('.quality-score').count(),0);if(value==='—')assert.equal(await preview.locator('.quality-note').innerText(),'未提供');await namesAreClean(ids);await preview.getByRole('button',{name:'关闭图像',exact:true}).click();await preview.waitFor({state:'hidden'})
 }
 await drawer.locator('.el-drawer__body').evaluate(node=>node.scrollTop=node.scrollHeight);assert.ok(await drawer.locator('.el-drawer__body').evaluate(node=>node.scrollWidth<=node.clientWidth+1));await page.screenshot({path:`${out}/mobile-fingers.png`});await close()
 pass('narrow layouts retain scrollable fingers and preserve missing/zero quality values in previews')

 await page.setViewportSize({width:1422,height:804});await page.route('**/image-read-failure.svg',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'invalid image'}))
 await page.evaluate(async()=>{
  const api=(await import('/src/api/index.js')).default;window.originalImagePeople=api.listApplicants;window.originalImagePerson=api.getApplicant
  const withoutIds=person=>({...person,records:person.records.map(({recordId,...record})=>({...record,...(person.userId==='U001'&&record.fingerPosition==='left_thumb'?{imageUrl:'/image-read-failure.svg',qualityScore:0}:{})}))})
  api.listApplicants=async params=>{const result=await window.originalImagePeople(params);return{...result,items:result.items.map(withoutIds)}}
  api.getApplicant=async id=>withoutIds(await window.originalImagePerson(id))
 })
 await button('查询').click();await loaded();const row=page.locator('.applicants-page .el-table__row').filter({hasText:'U001'});await row.locator('[data-finger="left_thumb"] .image-unavailable').waitFor();assert.equal(await row.locator('.list-finger[title$="图像不可用"]').count(),1);assert.equal(await row.locator('.list-finger[title$="已入库"]').count(),9);await namesAreClean(ids)
 await open('U001');const broken=drawer.locator('[data-finger="left_thumb"]');await broken.getByText('图像不可用',{exact:true}).waitFor();assert.match(await broken.locator('.enrollment-image').getAttribute('aria-label'),/申请人 U001.*左手拇指.*图像不可用/);assert.equal(await broken.locator('button').count(),0);assert.equal(await broken.locator('.quality-value').innerText(),'0');await broken.locator('.enrollment-image').click();assert.equal(await preview.isVisible(),false);await namesAreClean(ids);await close()
 await open('U301');await drawer.locator('[data-finger="left_index"] .enrollment-image').click();await preview.waitFor();assert.equal(await metadata('质量分'),'97');await namesAreClean(ids);await preview.getByRole('button',{name:'关闭图像',exact:true}).click();await preview.waitFor({state:'hidden'});await close()
 await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;api.listApplicants=window.originalImagePeople;api.getApplicant=window.originalImagePerson});await button('重置').click();await loaded()
 pass('records without Mock IDs still render and select the latest image; failed images retain identity and zero quality without a button or preview')
 assert.deepEqual(errors,[]);assert.deepEqual(backendRequests,[]);pass('zero browser errors and zero real-backend calls')
 await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,errors,backendRequests},null,2));console.log(`COMPLETE ${checks.length} checks`)
}catch(error){await page.screenshot({path:`${out}/failure.png`});console.error(error);process.exitCode=1}finally{await browser.close()}
