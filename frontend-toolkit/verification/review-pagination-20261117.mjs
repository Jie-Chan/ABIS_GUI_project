import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base=new URL(process.env.ABIS_PREVIEW_URL||'http://127.0.0.1:5186').origin
const out=process.env.ABIS_QA_OUTPUT_DIR||fileURLToPath(new URL('./qa-output/pagination-20261117/',import.meta.url))
await fs.mkdir(out,{recursive:true});await fs.rm(`${out}/failure.png`,{force:true})
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:900},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'})
page.setDefaultTimeout(10000)
const checks=[],measurements=[],errors=[],backendRequests=[];let failure=null
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
page.on('request',r=>{const u=new URL(r.url());if(['xhr','fetch'].includes(r.resourceType())&&(u.origin!==base||/^\/(abis-admin|admin-api)(\/|$)/.test(u.pathname)))backendRequests.push(r.url())})
const kinds=['applicants','logs','audits','accounts'],labels=[10,20,50,100].map(n=>`${n} 条/页`)
const table=()=>page.locator('.workspace-main > div > .el-card > .el-card__body > .el-table'),rows=()=>table().locator('.el-table__body .el-table__row'),footer=()=>page.locator('.records-footer'),size=()=>footer().locator('.el-select'),selected=()=>size().innerText(),button=n=>page.getByRole('button',{name:n,exact:true})
const pass=n=>{checks.push(n);console.log('PASS',n)}
async function settle(){await page.waitForFunction(()=>!document.querySelector('.el-loading-mask,.el-button.is-loading'));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}
async function go(kind){await page.evaluate(p=>document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(p),`/${kind}`);await page.waitForURL(`**/${kind}`);await settle()}
async function login(){await page.getByLabel('用户名',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('admin123');await button('登录').click();await page.waitForURL('**/monitor');await settle()}
async function options(){await size().click();const opts=page.getByRole('option');await opts.last().waitFor();assert.deepEqual(await opts.allInnerTexts(),labels);await page.keyboard.press('Escape')}
async function setSize(n){if((await selected()).trim()!==`${n} 条/页`){await size().click();await page.getByRole('option',{name:`${n} 条/页`,exact:true}).click();await settle()}}
async function pageTo(n){if((await footer().locator('.el-pager .is-active').innerText())!==String(n)){await footer().locator('.el-pager .number').filter({hasText:new RegExp(`^${n}$`)}).click();await settle()}}
async function latest(kind){return page.evaluate(k=>window.paginationReads.filter(r=>r.kind===k).at(-1),kind)}
async function keys(){return rows().evaluateAll(ns=>ns.map(n=>n.querySelector('td .cell').textContent.trim()))}
async function clearQuery(kind){const input=filterInput(kind);await input.fill('');await button('查询').click();await settle()}
function filterInput(kind){return page.locator({applicants:'.applicant-id-filter input',logs:'.log-user-filter input',audits:'input[placeholder="输入完整账号"]',accounts:'.account-search input'}[kind])}
async function total(n){assert.equal(await footer().locator('.el-pagination__total').count(),1);assert.equal((await footer().locator('.el-pagination__total').innerText()).replace(/\s/g,''),`共${n}条`)}

try{
 await page.goto(`${base}/login`);await login()
 for(const kind of kinds){await go(kind);assert.equal((await selected()).trim(),'20 条/页');await options();assert.equal(await footer().locator('.el-pagination__total').count(),1)}
 pass('a fresh login defaults all four lists to 20 条/页, with the same complete ordered and spaced options and one total')
 await page.evaluate(async()=>{
  const api=(await import('/src/api/index.js')).default,methods={applicants:'listApplicants',logs:'listLogs',audits:'listAudits',accounts:'listAccounts'}
  window.paginationReads=[];window.paginationLimits={};window.paginationOriginals={};window.paginationFixtures={}
  for(const[kind,method]of Object.entries(methods)){
   const original=api[method].bind(api),result=await original({page:1,pageSize:100});window.paginationOriginals[kind]=original
   const seed=result.items.find(r=>kind!=='logs'||r.publication==='published')||result.items[0]
   window.paginationFixtures[kind]=Array.from({length:137},(_,index)=>{
    const i=index+1,row=structuredClone(seed),id=String(i).padStart(4,'0'),date=new Date(Date.UTC(2026,10,1,0,i)).toISOString(),match=i%2===1
    if(kind==='applicants'){Object.assign(row,{userId:`P-${id}`,enrolledAt:date,updatedAt:date});for(const r of row.records||[])r.userId=row.userId}
    if(kind==='logs'){Object.assign(row,{id:`pagination-${id}`,requestId:`PAGE-LOG-${id}`,userId:match?'MATCH-USER':'OTHER-USER',receivedAt:date,publication:'published',publishedAt:new Date(Date.parse(date)+1250).toISOString(),confirmedDurationMs:1250});const visit=s=>{for(const e of s.events||[]){if(e.kind==='RECEIVED'){e.at=date;if(e.payload)e.payload.userId=row.userId}};for(const c of s.children||[])visit(c)};for(const s of row.stages||[])visit(s)}
    if(kind==='audits')Object.assign(row,{id:`pagination-${id}`,operatedAt:date.replace('T',' ').slice(0,19),operator:match?'match.admin':'other.admin',target:`pagination-${id}`})
    if(kind==='accounts')Object.assign(row,{id:1000+i,username:`page.${match?'match':'other'}.${id}`,displayName:`分页账户${id}`,createdAt:date,updatedAt:date})
    return row
   })
   api[method]=async(params={})=>{
    window.paginationReads.push({kind,params:structuredClone(params)});let data=window.paginationFixtures[kind].slice(0,window.paginationLimits[kind]??137)
    if(params.userId)data=data.filter(r=>r.userId===params.userId)
    if(params.requestId)data=data.filter(r=>r.requestId===params.requestId)
    if(params.operator)data=data.filter(r=>r.operator===params.operator)
    if(params.keyword)data=data.filter(r=>r.username.includes(params.keyword)||r.displayName.includes(params.keyword))
    if(params.sortBy&&params.sortOrder)data.sort((a,b)=>String(a[params.sortBy]||'').localeCompare(String(b[params.sortBy]||''))*(params.sortOrder==='ascending'?1:-1))
    const p=params.page||1,s=params.pageSize||20;return{total:data.length,items:structuredClone(data.slice((p-1)*s,p*s)),serverTime:new Date().toISOString(),...(result.demoDateRange?{demoDateRange:result.demoDateRange}:{})}
   }
  }
 })
 // Enter from monitor so every list reads the isolated 137-row fixture.
 await go('monitor')
 for(const kind of kinds){
  await go(kind);await clearQuery(kind)
  for(const n of [10,20,50,100]){
   await setSize(n);await pageTo(1);const first=await latest(kind);assert.equal(first.params.pageSize,n);assert.equal(first.params.page,1);await total(137);assert.equal(await rows().count(),n)
   const all=[];for(let p=1;p<=Math.ceil(137/n);p++){await pageTo(p);const ids=await keys();assert.equal(ids.length,Math.min(n,137-(p-1)*n));all.push(...ids)}
   assert.equal(new Set(all).size,137);assert.equal(all.length,137);measurements.push({kind,pageSize:n,pages:Math.ceil(137/n),rows:all.length,lastPageRows:137%n||n})
  }
 }
 pass('137 isolated records on every list honor all four request sizes, first/last-page counts, and complete unique traversal without altering Mock seeds')
 if(process.env.ABIS_PAGINATION_CORE_ONLY==='1')throw Object.assign(new Error('CORE_ONLY_COMPLETE'),{coreOnly:true})
 const remembered={applicants:10,logs:50,audits:100,accounts:20}
 for(const kind of kinds){await go(kind);await setSize(remembered[kind])}
 for(const kind of kinds){await go(kind);assert.equal((await selected()).trim(),`${remembered[kind]} 条/页`)}
 await page.getByRole('button',{name:'账户菜单',exact:true}).click();await page.getByRole('menuitem',{name:'退出登录',exact:true}).click();await page.getByRole('dialog',{name:'提示',exact:true}).getByRole('button',{name:'确定',exact:true}).click();await page.waitForURL('**/login');await login()
 for(const kind of kinds){await go(kind);assert.equal((await selected()).trim(),'20 条/页')}
 pass('page sizes are independent across navigation during one login and all reset to 20 after logout and login')
 for(const kind of kinds){
  await go(kind);await clearQuery(kind);await setSize(20)
  const input=filterInput(kind),applied={applicants:'P-0001',logs:'MATCH-USER',audits:'match.admin',accounts:'page.match'}[kind],draft={applicants:'P-0002',logs:'OTHER-USER',audits:'other.admin',accounts:'page.other'}[kind]
  await input.fill(applied);await button('查询').click();await settle()
  if(kind!=='accounts'){await table().locator('th.is-sortable .cell').first().click();await settle()}
  const before=await latest(kind);if(kind!=='applicants')await pageTo(2)
  await input.fill(draft);await setSize(10);const after=await latest(kind),filterKey={applicants:'userId',logs:'userId',audits:'operator',accounts:'keyword'}[kind]
  assert.equal(after.params[filterKey],applied);assert.equal(after.params.sortBy,before.params.sortBy);assert.equal(after.params.sortOrder,before.params.sortOrder);assert.equal(after.params.page,1);assert.equal(after.params.pageSize,10);assert.equal(await input.inputValue(),draft);await total(kind==='applicants'?1:69)
  measurements.push({kind,applied:after.params,draft:await input.inputValue()});await clearQuery(kind)
 }
 pass('changing size uses the applied filters and sort, resets later pages to page 1, and keeps unsubmitted draft inputs on all lists')
 for(const kind of kinds){
  await go(kind);await clearQuery(kind);await setSize(20)
  for(const n of [0,7,20,37]){await page.evaluate(([k,n])=>window.paginationLimits[k]=n,[kind,n]);await button('查询').click();await settle();await total(n);assert.equal(await rows().count(),Math.min(n,20));assert.equal((await selected()).trim(),'20 条/页');await options();if(n>20){await pageTo(2);assert.equal(await rows().count(),17);assert.equal(new Set(await keys()).size,17)}}
  await page.evaluate(k=>delete window.paginationLimits[k],kind)
 }
 pass('zero, fewer than ten, exactly one page and multiple pages keep accurate unique totals, actual rows and all four size options')
 for(const[width,height]of[[1440,900],[1280,720],[624,850]]){
  await page.setViewportSize({width,height});let reference=null
  for(const kind of kinds){
   await go(kind);await clearQuery(kind);await setSize(20);await options()
   const m=await footer().evaluate(n=>{const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}},pager=n.querySelector('.el-pagination'),select=n.querySelector('.el-select__wrapper'),style=getComputedStyle(select),prev=n.querySelector('.btn-prev'),card=n.closest('.el-card__body'),cs=getComputedStyle(card);return{footer:box(n),pager:box(pager),select:box(select),button:box(prev),font:style.fontSize,padding:style.padding,innerRight:card.getBoundingClientRect().right-parseFloat(cs.paddingRight),innerLeft:card.getBoundingClientRect().left+parseFloat(cs.paddingLeft),export:n.querySelector('.footer-actions')?box(n.querySelector('.footer-actions')):null,bodyOverflow:document.documentElement.scrollWidth>innerWidth}})
   assert.equal(m.select.width,114);assert.equal(m.select.height,36);assert.equal(m.font,'13px');assert.equal(m.padding,'4px 12px');assert.ok(Math.abs(m.select.y+m.select.height/2-m.button.y-m.button.height/2)<=1);assert.ok(Math.abs(m.pager.right-m.innerRight)<=2);assert.equal(m.bodyOverflow,false)
   const appearance={width:m.select.width,height:m.select.height,font:m.font,padding:m.padding};if(reference)assert.deepEqual(appearance,reference);else reference=appearance
   if(['logs','audits'].includes(kind)){assert.ok(m.export);assert.ok(Math.abs(m.export.x-m.innerLeft)<=2);assert.ok(Math.abs(m.export.y+m.export.height/2-m.pager.y-m.pager.height/2)<=2)}
   const scroll=table().locator('.el-table__body-wrapper .el-scrollbar__wrap');await scroll.evaluate(n=>n.scrollLeft=n.scrollWidth);await settle();const after=await footer().boundingBox();assert.ok(Math.abs(after.y-m.footer.y)<=1);assert.ok(after.x>=0&&after.x+after.width<=width+1);await total(137)
   measurements.push({kind,viewport:{width,height},...m});if(kind==='logs')await page.screenshot({path:`${out}/pagination-${width}.png`,fullPage:true})
  }
 }
 pass('1440/1280/624 layouts share 114×36 controls, 13px text and padding, centered buttons, right aligned single totals and left CSV actions; horizontal scrolling preserves visible footers')
 assert.deepEqual(errors,[]);assert.deepEqual(backendRequests,[])
}catch(e){if(!e.coreOnly){failure=e.stack||String(e);console.error(failure);await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{})}}
finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({base,checks,measurements,errors,backendRequests,failure},null,2));await browser.close()}
if(failure)process.exitCode=1
