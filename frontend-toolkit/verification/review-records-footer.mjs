import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
assert.match(await (await fetch(`${base}/src/api/index.js`)).text(), /"VITE_USE_MOCK": "true"/)
const out='./qa-output/records-spacing-1854';await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1422,height:804},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'})
page.setDefaultTimeout(10000)
const checks=[],positions=[],errors=[],backendRequests=[]
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text())})
page.on('request',request=>{const url=new URL(request.url());if(['xhr','fetch'].includes(request.resourceType())&&(url.origin!==base||/^\/(admin-api|abis-admin)(\/|$)/.test(url.pathname)))backendRequests.push(request.url())})
const pass=text=>{checks.push(text);console.log('PASS',text)},button=name=>page.getByRole('button',{name,exact:true})
const loaded=()=>page.waitForFunction(()=>!document.querySelector('.el-loading-mask,.el-button.is-loading'))
const paint=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))))
const go=async path=>{await page.evaluate(path=>document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path),path);await page.waitForURL(`**${path}`);await loaded();await paint()}
const table=()=>page.locator('.records-page > .el-card > .el-card__body > .el-table'),wrap=()=>table().locator('.el-table__body-wrapper .el-scrollbar__wrap'),footer=()=>page.locator('.records-footer')
const select=async(selector,name)=>{await page.locator(selector).click();await page.getByRole('option',{name,exact:true}).click()}
const total=async()=>Number((await footer().locator('.el-pagination__total').innerText()).match(/\d+/)[0])
async function download(){const pending=page.waitForEvent('download');await footer().getByRole('button',{name:'导出 CSV',exact:true}).click();return fs.readFile(await(await pending).path(),'utf8')}
const csvCount=csv=>csv.trim().split(/\r?\n/).length-1
async function geometry(path,width,height){
 const panel=await page.locator('.query-panel').boundingBox(),head=await table().locator('.el-table__header-wrapper').boundingBox(),box=await table().boundingBox(),bottom=await footer().boundingBox(),pagination=await footer().locator('.el-pagination').boundingBox()
 const nav=await page.locator('.header').boundingBox(),card=await page.locator('.records-page > .el-card').boundingBox(),control=await page.locator('.query-filters .el-input__wrapper,.query-filters .el-date-editor,.query-filters .range-trigger').first().boundingBox()
 const cardGap=card.y-nav.y-nav.height,controlGap=control.y-nav.y-nav.height,expectedGap=width<768?8:12
 assert.ok(Math.abs(cardGap-expectedGap)<=1,`${path}/${width} navigation-to-card gap ${cardGap}`)
 assert.ok(Math.abs(control.y-card.y-13)<=1,`${path}/${width} card-to-control gap ${control.y-card.y}`)
 assert.ok(Math.abs(controlGap-expectedGap-13)<=1,`${path}/${width} navigation-to-control gap ${controlGap}`)
 assert.ok(Math.abs(head.y-(panel.y+panel.height))<=1,`${path}/${width} header gap ${head.y-panel.y-panel.height}`)
 assert.ok(Math.abs(box.x-bottom.x)<1&&Math.abs(box.x+box.width-bottom.x-bottom.width)<1,`${path}/${width} edges`)
 assert.ok(bottom.y>=box.y+box.height&&bottom.y+bottom.height<=height,`${path}/${width} footer clipped ${JSON.stringify(bottom)}`)
 assert.ok(Math.abs(pagination.x+pagination.width-bottom.x-bottom.width)<1,`${path}/${width} pager right`)
 assert.equal(await page.locator('.records-page .results-toolbar,.records-page .record-count,.population-note').count(),0)
 assert.equal(await footer().locator('.el-pagination__total').count(),1)
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
 if(path==='/applicants')assert.equal(await footer().getByRole('button',{name:'导出 CSV',exact:true}).count(),0)
 else{
  const exportBox=await footer().getByRole('button',{name:'导出 CSV',exact:true}).boundingBox();assert.ok(Math.abs(exportBox.x-bottom.x)<1)
  if(width>=624)assert.ok(Math.abs(exportBox.y+exportBox.height/2-pagination.y-pagination.height/2)<1,`${path}/${width} same footer row`)
 }
 return{panel:panel.y,head:head.y,footer:bottom.y,footerHeight:bottom.height,cardGap,controlGap}
}
try{
 await page.goto(`${base}/login`);await page.locator('.login-content input').nth(0).fill('admin');await page.locator('.login-content input').nth(1).fill('admin123');await button('登录').click();await page.waitForURL('**/monitor');await loaded()
 for(const[width,height]of[[1422,804],[1280,720],[624,850],[390,844],[320,844]]){
  await page.setViewportSize({width,height})
  for(const[path,count]of[['/applicants',9],['/logs',15],['/audits',64]]){
   await go(path);await button('重置').click();await loaded();await paint();assert.equal(await total(),count)
   const initial=await geometry(path,width,height),row=table().locator('.el-table__row').first(),rowTop=(await row.boundingBox()).y
   assert.ok(await wrap().evaluate(node=>node.scrollHeight>node.clientHeight+50))
   for(const y of[40,300,0]){await wrap().evaluate((node,y)=>node.scrollTop=y,y);await paint();const current=await geometry(path,width,height);assert.ok(Math.abs(current.panel-initial.panel)<1&&Math.abs(current.head-initial.head)<1&&Math.abs(current.footer-initial.footer)<1);if(y===40)assert.ok((await row.boundingBox()).y<rowTop-30)}
   if(width===624){await wrap().evaluate(node=>node.scrollLeft=240);await paint();const xs=await table().evaluate(node=>[node.querySelector('th').getBoundingClientRect().x,node.querySelector('td').getBoundingClientRect().x]);assert.ok(Math.abs(xs[0]-xs[1])<1);await wrap().evaluate(node=>node.scrollLeft=0)}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),`${path}/${width} document overflow`)
   positions.push({path,width,height,...initial});await page.screenshot({path:`${out}/${path.slice(1)}-${width}.png`})
   if(width>=624){
    const stable=async action=>{await loaded();await paint();const current=await geometry(path,width,height);assert.ok(Math.abs(current.panel-initial.panel)<1&&Math.abs(current.head-initial.head)<1,`${path}/${width} ${action} moved filters or header`);positions.push({path,width,height,action,...current})}
    const placeholder=path==='/applicants'?'输入完整申请人 ID':path==='/logs'?'输入完整业务请求 ID':'输入完整账号',value=path==='/applicants'?'U001':path==='/logs'?'REQ-00000014':'ops.zhang'
    await page.getByPlaceholder(placeholder).fill(value);await button('查询').click();await stable('query');assert.ok(await total()>0)
    await button('重置').click();await stable('reset')
    if(path==='/applicants'){await table().locator('th').filter({hasText:'首次注册'}).click();await stable('sort')}
    if(path!=='/audits'){await select('.records-footer .el-select',path==='/applicants'?'2条/页':'5条/页');await stable('page size')}
    await footer().locator('.btn-next').click();await stable('next page');assert.equal((await footer().locator('.el-pager .is-active').innerText()).trim(),'2')
    await footer().locator('.btn-prev').click();await stable('previous page')
    if(path!=='/audits'){await select('.records-footer .el-select','20条/页');await stable('restore page size')}
   }
  }
 }
 pass('all three pages put headers directly below filters with no count, explanation or export placeholders at 320–1422px')
 pass('body scrolling preserves filter/header/footer coordinates and synchronized columns while footer controls remain visible')
 pass('logs/audits align bottom CSV left and pagination right on desktop/624px; narrower screens wrap without clipping or overlap')
 pass('navigation-to-first-control spacing is 25px on desktop and 21px on mobile for all three pages before and during body scrolling')
 pass('all three pages retain measured spacing and header positions after queries, resets and pagination at 1422/1280/624px, including applicant sorting and page-size changes')

 await page.setViewportSize({width:1422,height:804});await go('/applicants');const headY=(await table().locator('.el-table__header-wrapper').boundingBox()).y
 await page.locator('.applicants-page th').filter({hasText:'首次注册'}).click();await loaded();await paint();assert.ok(Math.abs((await table().locator('.el-table__header-wrapper').boundingBox()).y-headY)<1)
 await select('.records-footer .el-select','2条/页');await loaded();await footer().locator('.btn-next').click();await loaded();assert.match(await footer().locator('.el-pager .is-active').innerText(),/2/);assert.equal(await total(),9);await paint();assert.ok(Math.abs((await table().locator('.el-table__header-wrapper').boundingBox()).y-headY)<1)
 await button('重置').click();await loaded();const padding=async()=>page.locator('.records-page .el-card').evaluate(node=>node.getBoundingClientRect().bottom-node.querySelector('.records-footer').getBoundingClientRect().bottom)
 const normalPadding=await padding(),manyHeight=(await page.locator('.records-page .el-card').boundingBox()).height
 for(const[id,count]of[['U001',1],['NOT-FOUND-ID',0]]){await page.getByPlaceholder('输入完整申请人 ID').fill(id);await button('查询').click();await loaded();await paint();assert.equal(await total(),count);assert.ok(Math.abs(await padding()-normalPadding)<1);assert.ok((await page.locator('.records-page .el-card').boundingBox()).height<manyHeight);await geometry('/applicants',1422,804)}
 await button('重置').click();await loaded();pass('sorting, size changes, pagination, zero/few queries and reset preserve header position, unique totals and consistent bottom padding')

 await go('/logs');await select('.log-api-filter .el-select','1：N查重');await button('查询').click();await loaded();await select('.records-footer .el-select','5条/页');await loaded();await footer().locator('.btn-next').click();await loaded();assert.equal(await total(),9)
 await page.getByPlaceholder('输入完整申请人 ID').fill('U001');const before=await download();assert.equal(csvCount(before),9);assert.ok(before.trim().split(/\r?\n/).slice(1).every(line=>/^"\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}"/.test(line)))
 await button('查询').click();await loaded();assert.equal(await total(),2);assert.equal(csvCount(await download()),2);await button('重置').click();await loaded();pass('bottom log export retains applied queries across draft editing and pagination and exports all matching rows with milliseconds')
 await go('/audits');await page.getByPlaceholder('输入完整账号').fill('ops.zhang');await select('.audits-filters .el-select >> nth=0','登录');await button('查询').click();await loaded();const auditTotal=await total();await page.getByPlaceholder('输入完整账号').fill('admin');const previous=await download();assert.equal(csvCount(previous),auditTotal);assert.ok(previous.trim().split(/\r?\n/).slice(1).every(row=>row.includes('"ops.zhang"')));await button('查询').click();await loaded();assert.equal(csvCount(await download()),await total());await button('重置').click();await loaded();assert.equal(csvCount(await download()),64);pass('bottom audit export matches the single applied total, preserves draft behavior and covers every result page')

 await page.setViewportSize({width:624,height:850});await go('/logs');await button('更多筛选').click();await paint();await geometry('/logs',624,850);await select('.log-publication-filter .el-select','待发布');await button('查询').click();await loaded();assert.equal(await total(),1);await button('收起筛选（1）').click();await paint();await geometry('/logs',624,850);assert.equal(csvCount(await download()),1)
 await button('选择时间范围').click();const panel=page.locator('.single-month-range').filter({visible:true});assert.equal(await panel.locator('.el-calendar').count(),1);await panel.getByRole('button',{name:'清空',exact:true}).click();await button('重置').click();await loaded();pass('expanded/collapsed mobile filters recalculate available table space and keep bottom export, pagination and date selection usable')
 assert.deepEqual(errors,[]);assert.deepEqual(backendRequests,[]);pass('zero browser errors and zero real-backend calls');await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,positions,errors,backendRequests},null,2));console.log(`COMPLETE ${checks.length} checks`)
}catch(error){await page.screenshot({path:`${out}/failure.png`});console.error(error);process.exitCode=1}finally{await browser.close()}
