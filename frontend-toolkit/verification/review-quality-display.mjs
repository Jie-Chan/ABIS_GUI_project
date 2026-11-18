import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base=new URL(process.env.ABIS_PREVIEW_URL||'http://127.0.0.1:5186').origin
const out=process.env.ABIS_QA_OUTPUT_DIR||fileURLToPath(new URL('./qa-output/quality-display-20261117/',import.meta.url))
await fs.mkdir(out,{recursive:true});await fs.rm(`${out}/failure.png`,{force:true})
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:900},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'})
page.setDefaultTimeout(10000)
const checks=[],measurements=[],contrasts=[],errors=[],backendRequests=[];let failure=null
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
page.on('request',r=>{const u=new URL(r.url());if(['xhr','fetch'].includes(r.resourceType())&&(u.origin!==base||/^\/(abis-admin|admin-api)(\/|$)/.test(u.pathname)))backendRequests.push(r.url())})
const person=page.getByRole('dialog',{name:'申请人详情',exact:true}),preview=page.getByRole('dialog',{name:'入库图像详情',exact:true})
const button=name=>page.getByRole('button',{name,exact:true})
const paint=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))
const loaded=async()=>{await page.waitForFunction(()=>!document.querySelector('.el-loading-mask,.el-button.is-loading'));await paint()}
const shot=name=>page.screenshot({path:`${out}/${name}.png`,fullPage:true})
const pass=label=>{checks.push(label);console.log('PASS',label)}
async function open(id){await page.getByPlaceholder('输入完整申请人 ID',{exact:true}).fill(id);await page.getByPlaceholder('输入完整申请人 ID',{exact:true}).press('Enter');await loaded();await page.locator('.applicants-page .el-table__row').filter({hasText:id}).getByRole('button',{name:'查看详情',exact:true}).click();await person.waitFor();await loaded();await page.waitForFunction(()=>Math.abs(document.querySelector('.applicant-drawer').getBoundingClientRect().right-innerWidth)<1);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.applicant-drawer img')].map(img=>img.decode().catch(()=>{})))});await paint()}
async function close(){await person.locator('.el-drawer__close-btn').click();await person.waitFor({state:'hidden'})}
const value=record=>Number.isFinite(record.qualityScore)?String(record.qualityScore):'—'
async function checkContrast(locator,label){
const c=await locator.evaluate(n=>{const parse=s=>{const v=s.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];return[v[0],v[1],v[2],v[3]??1]},over=(f,b)=>[0,1,2].map(i=>f[i]*f[3]+b[i]*(1-f[3]));const stack=[];for(let p=n;p;p=p.parentElement)stack.push(getComputedStyle(p));let bg=[255,255,255];for(const s of stack.reverse())bg=over(parse(s.backgroundColor),bg);return{foreground:over(parse(getComputedStyle(n).color),bg),background:bg,text:n.textContent}})
const lum=a=>a.map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0),a=lum(c.foreground),b=lum(c.background),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);contrasts.push({label,...c,ratio});assert.ok(ratio>=4.5,`${label}: contrast ${ratio}`)
}
async function checkPreview(image,record,id,name){
 await image.scrollIntoViewIfNeeded();await image.click();await preview.waitFor();await loaded();await page.waitForFunction(()=>!document.querySelector('.dialog-fade-enter-active'));await paint()
 assert.equal(await preview.locator('.quality-score').count(),0);assert.equal((await preview.innerText()).match(/质量分/g)?.length,1)
 const label=preview.locator('.image-metadata .el-descriptions__label').filter({hasText:/^质量分$/}),quality=label.locator('xpath=following-sibling::*[1]')
 assert.equal(await label.count(),1);assert.equal(await quality.locator('.quality-value').innerText(),value(record))
 assert.equal(await quality.getByText('未提供',{exact:true}).count(),Number(!Number.isFinite(record.qualityScore)))
 assert.equal(await preview.locator('img').getAttribute('src'),record.imageUrl)
 const metadata=async label=>preview.locator('.image-metadata .el-descriptions__label').filter({hasText:new RegExp(`^${label}$`)}).locator('xpath=following-sibling::*[1]').innerText()
 assert.equal(await metadata('申请人 ID'),id);assert.equal(await metadata('图像更新时间'),record.displayTime)
 const box=await preview.locator('.enrollment-preview').boundingBox();assert.ok(box.y>=15.9&&box.y+box.height<=page.viewportSize().height-15.9)
 for(const target of[preview.locator('.el-dialog__header'),preview.locator('.el-dialog__headerbtn'),preview.getByRole('button',{name:'关闭图像',exact:true})]){const r=await target.boundingBox();assert.ok(r&&r.y>=15.9&&r.y+r.height<=page.viewportSize().height-15.9)}
 assert.equal(await preview.locator('img').evaluate(n=>getComputedStyle(n).objectFit),'contain')
 await shot(`preview-${name}`);measurements.push({kind:'preview',name,viewport:page.viewportSize(),box,quality:(await quality.innerText()).trim()});await preview.getByRole('button',{name:'关闭图像',exact:true}).click();await preview.waitFor({state:'hidden'})
}
try{
 await page.goto(`${base}/login`);await page.getByLabel('用户名',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('admin123');await button('登录').click();await page.waitForURL('**/monitor');await page.getByRole('menuitem',{name:'申请人列表',exact:true}).click();await page.waitForURL('**/applicants');await loaded()
 const expected=await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default,latest=(await import('/src/utils/applicant.js')).latestEnrollmentRecord,format=(await import('/src/utils/log.js')).formatLogTime;return Object.fromEntries(await Promise.all(['U001','U004','U301','U302','U006'].map(async id=>{const p=await api.getApplicant(id),positions=[null,'left_thumb','left_index','left_middle','left_ring','left_little','right_thumb','right_index','right_middle','right_ring','right_little'];return[id,Object.fromEntries(positions.map(key=>{const record=latest(p.records.filter(r=>key?r.fingerPosition===key:r.feature==='face'));return[key||'face',record?{...record,displayTime:format(record.updatedAt)}:null]}))]})))})
 assert.equal(expected.U301.left_index.qualityScore,97);assert.equal(expected.U001.right_ring.qualityScore,null);assert.equal(expected.U001.right_little.qualityScore,0)
 for(const[width,height]of[[1440,900],[1280,720],[624,850],[320,850]]){
  await page.setViewportSize({width,height})
  for(const[id,fingers]of[['U001',10],['U004',6],['U301',8],['U302',10],['U006',0]]){
   await open(id);assert.equal(await person.locator('.finger-slot').count(),10);assert.equal(await person.locator('.finger-placeholder').count(),10-fingers);assert.equal(await person.locator('.quality-legend').count(),0)
   const cards=await person.locator('.current-images .enrollment-image').all();assert.equal(cards.length,fingers+1)
   for(const image of cards){const position=await image.evaluate(n=>n.closest('[data-finger]')?.getAttribute('data-finger')||'face'),record=expected[id][position],bar=image.locator('.quality-score');assert.ok(record);assert.equal(await image.locator('img').getAttribute('src'),record.imageUrl);assert.equal(await bar.count(),1);assert.equal(await bar.locator('.quality-caption,.quality-note').count(),0);assert.equal(await bar.locator('.quality-value').innerText(),value(record));assert.equal((await bar.innerText()).trim(),value(record))
    const aria=await image.getAttribute('aria-label');assert.match(aria,new RegExp(`申请人 ${id}`));assert.match(aria,Number.isFinite(record.qualityScore)?new RegExp(`质量分[：:\\s]*${record.qualityScore}(?:[ ·]|$)`):/质量分未提供/)
    const box=await bar.boundingBox(),number=await bar.locator('.quality-value').boundingBox();assert.ok(Math.abs(number.x+number.width/2-box.x-box.width/2)<=1);assert.ok(number.y>=box.y-1&&number.y+number.height<=box.y+box.height+1)
    if(width===1440&&id==='U001'&&['face','right_ring','right_little'].includes(position)){await checkContrast(bar.locator('.quality-value'),`${position} score`)}
    measurements.push({kind:'quality bar',id,position,viewport:{width,height},text:await bar.innerText(),box,number})
   }
   for(const empty of await person.locator('.finger-slot.is-empty').all()){assert.equal(await empty.locator('.quality-score').count(),0);assert.equal(await empty.getByRole('button').count(),0)}
   assert.ok(await person.locator('.el-drawer__body').evaluate(n=>n.scrollWidth<=n.clientWidth+1))
   if(id==='U001'&&[1440,624,320].includes(width))await shot(`quality-detail-${width}`)
   if(width===1440&&id==='U001'){
    const missing=person.locator('[data-finger="right_ring"] .enrollment-image');await missing.focus();const tip=page.getByRole('tooltip').filter({hasText:/^质量分未提供$/});await tip.waitFor();await missing.hover();await tip.waitFor();await checkPreview(person.locator('[data-modality="face"] .enrollment-image'),expected[id].face,id,'face-1440');await checkPreview(missing,expected[id].right_ring,id,'missing-1440');await checkPreview(person.locator('[data-finger="right_little"] .enrollment-image'),expected[id].right_little,id,'zero-1440')
   }
   if(width===1440&&id==='U301')await checkPreview(person.locator('[data-finger="left_index"] .enrollment-image'),expected[id].left_index,id,'latest-97-1440')
   if(width===624&&id==='U302')await checkPreview(person.locator('[data-finger="right_ring"] .enrollment-image'),expected[id].right_ring,id,'missing-624')
   await close()
  }
  pass(`${width}×${height}: all five applicants keep latest image/score pairing, bare centered numeric/dash bars, accessible values and ten fixed slots without missing-slot score bars`)
 }
 await page.setViewportSize({width:1280,height:640});await open('U001');await checkPreview(person.locator('[data-modality="face"] .enrollment-image'),expected.U001.face,'U001','face-short');await checkPreview(person.locator('[data-finger="right_little"] .enrollment-image'),expected.U001.right_little,'U001','finger-short');await close();pass('face/finger previews show quality only once in metadata with at least 16px outer margins and accessible close controls at short heights')
 assert.deepEqual(errors,[]);assert.deepEqual(backendRequests,[]);pass('zero browser errors and zero real-backend calls')
}catch(error){failure={message:error.message,stack:error.stack,url:page.url()};console.error(error);process.exitCode=1;await shot('failure').catch(()=>{})}finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({base,checks,measurements,contrasts,errors,backendRequests,failure},null,2));await browser.close()}
console.log(`COMPLETE ${checks.length} checks`)
