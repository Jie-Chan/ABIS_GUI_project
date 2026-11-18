import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const base=new URL(process.env.ABIS_PREVIEW_URL||'http://127.0.0.1:5186').origin
const out=process.env.ABIS_QA_OUTPUT_DIR||fileURLToPath(new URL('./qa-output/timing-20261117/',import.meta.url))
await fs.mkdir(out,{recursive:true});await fs.rm(`${out}/failure.png`,{force:true})
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:900},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce',acceptDownloads:true})
page.setDefaultTimeout(10000)
const checks=[],measurements=[],errors=[],backendRequests=[];let failure=null,paused=false
const timingModuleUrls = {}
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
page.on('request',r=>{const u=new URL(r.url());if(['/src/api/index.js','/src/api/adapters/mock.js'].includes(u.pathname))timingModuleUrls[u.pathname]=u.href;if(['xhr','fetch'].includes(r.resourceType())&&(u.origin!==base||/^\/(abis-admin|admin-api)(\/|$)/.test(u.pathname)))backendRequests.push(r.url())})
const button=name=>page.getByRole('button',{name,exact:true}),table=()=>page.locator('.request-table'),body=()=>table().locator('.el-table__body-wrapper .el-scrollbar__wrap'),row=id=>table().locator('.el-table__row').filter({hasText:id}),duration=id=>row(id).locator('.duration-value'),requestInput=()=>page.locator('.log-request-filter input'),userInput=()=>page.locator('.log-user-filter input'),log=page.getByRole('dialog',{name:'请求详情',exact:true})
const pass=name=>{checks.push(name);console.log('PASS',name)}
const nativeYield=()=>new Promise(r=>setTimeout(r,0))
async function tick(ms){await page.clock.runFor(ms);await page.evaluate(()=>Promise.resolve());await page.clock.runFor(35)}
async function drive(promise){let done=false,value,error;Promise.resolve(promise).then(v=>{value=v},e=>{error=e}).finally(()=>{done=true});for(let i=0;i<60&&!done;i++){await page.clock.runFor(100);await nativeYield()}if(!done)throw new Error('Timed browser operation did not settle after 6s virtual time');if(error)throw error;return value}
async function settle(){if(paused){for(let i=0;i<40;i++){if(await page.evaluate(()=>!document.querySelector('.el-loading-mask,.el-button.is-loading'))){await tick(50);return}await tick(100)}throw new Error('loading did not settle')}await page.waitForFunction(()=>!document.querySelector('.el-loading-mask,.el-button.is-loading'));await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}
async function click(locator){if(paused)await drive(locator.click());else await locator.click();await settle()}
async function fill(locator,value){if(paused)await drive(locator.fill(value));else await locator.fill(value)}
async function go(path){const p=page.evaluate(p=>document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(p),path);if(paused)await drive(p);else await p;await page.waitForURL(u=>u.pathname===path);await settle()}
async function configure(values){await page.evaluate(v=>window.timingConfigure(v),values)}
async function query(id=''){await fill(requestInput(),id);await click(button('查询'))}
async function reset(){await click(button('重置'))}
async function open(id){await click(row(id).getByRole('button',{name:'详情',exact:true}));await log.waitFor();await tick(100)}
async function close(){await click(log.locator('.el-drawer__close-btn'));await log.waitFor({state:'hidden'})}
async function select(scope,label){await click(scope.locator('.el-select'));await click(page.getByRole('option',{name:label,exact:true}))}
const ids=()=>table().locator('.el-table__row td:first-child .log-id').allTextContents()
const reads=()=>page.evaluate(()=>window.timingReads.length)
function milliseconds(text){if(text==='—')return null;let sum=0;for(const m of text.matchAll(/([\d.]+)\s*(ms|s|min|h)\b/g))sum+=Number(m[1])*({ms:1,s:1000,min:60000,h:3600000}[m[2]]);return sum}
async function shot(name){await page.screenshot({path:`${out}/${name}.png`,fullPage:true})}
function csvRows(text){return text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(line=>[...line.matchAll(/(?:^|,)(?:"((?:[^"]|"")*)"|([^,]*))/g)].map(m=>(m[1]??m[2]??'').replaceAll('""','"')))}

try{
 await page.clock.install({time:'2026-11-17T08:00:00+08:00'});await page.goto(`${base}/login`);await page.getByLabel('用户名',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('admin123');await button('登录').click();await page.waitForURL('**/monitor');await settle()
 await page.evaluate(async moduleUrls => {
  // Vite can add a version query after an edit. Reuse the app's module instances so the overrides affect the displayed data.
  window.timingUtils = await import('/src/utils/log.js')
  window.timingConfigure = (await import(moduleUrls['/src/api/adapters/mock.js'])).configureLogTimingTest
  const api = (await import(moduleUrls['/src/api/index.js'])).default
  window.timingApi = api
  window.timingOriginalList = api.listLogs.bind(api)
  window.timingReads = []
  api.listLogs = async params => {
   const call = { params: structuredClone(params), started: performance.now() }
   window.timingReads.push(call)
   try {
    if (window.timingHoldRequest === params.requestId) {
     window.timingHoldRequest = null
     window.timingConfigure({ nextRead: { delayMs: 3000 } })
    }
    if (window.timingRejectReads) throw new Error('计时状态读取失败，请重试')
    const result = await window.timingOriginalList(params)
    Object.assign(call, {
     finished: performance.now(), serverTime: result.serverTime,
     ids: result.items.map(row => row.requestId),
     results: result.items.map(row => ({ id: row.requestId, publication: row.publication })),
    })
    return result
   } catch (error) {
    call.error = error.message
    throw error
   }
  }
 }, timingModuleUrls)
 const formats=await page.evaluate(()=>[320,1250,400000,4000000,97398000,0,1000,1500,59990,60000,null,undefined,NaN,-1].map(v=>window.timingUtils.formatDuration(v)))
 assert.deepEqual(formats,['320 ms','1.25 s','6 min 40 s','1 h 6 min 40 s','27 h 3 min 18 s','0 ms','1 s','1.5 s','59.99 s','1 min 0 s','—','—','—','—'])
 const completed=await page.evaluate(()=>{const u=window.timingUtils,s='2026-11-17T00:00:00Z',end='2026-11-17T00:00:01.250Z',now=Date.parse('2026-11-17T00:06:40Z');return{sync:u.requestDuration({mode:'sync',result:'success',receivedAt:s,responseSentAt:end},now),pending:u.requestDuration({mode:'async',result:'success',publication:'pending',receivedAt:s,publishedAt:end},now),unknown:u.requestDuration({mode:'async',result:'unknown',publication:'none',receivedAt:s},now),zero:u.requestDuration({mode:'async',publication:'published',receivedAt:s,publishedAt:end,confirmedDurationMs:0},now),missing:u.requestDuration({mode:'async',publication:'published',receivedAt:s,publishedAt:null},now)}})
 assert.equal(completed.sync.text,'1.25 s');assert.equal(completed.pending.text,'6 min 40 s');assert.equal(completed.unknown.text,'6 min 40 s');assert.equal(completed.zero.text,'0 ms');assert.equal(completed.missing.text,'—');pass('duration formats cover ms/s/min/h, trailing-zero removal, 27h, invalid/missing and zero with independent completion rules')
 await go('/logs');await page.waitForFunction(()=>document.querySelectorAll('.request-table .el-table__row').length===20)
 const now=await page.evaluate(()=>Date.now());await page.clock.pauseAt(now+100);paused=true
 const latest=await drive(page.evaluate(()=>window.timingOriginalList({requestId:'REQ-00000012'})));assert.ok(Number.isFinite(Date.parse(latest.serverTime)));const receipt=new Date(Date.parse(latest.serverTime)-400000).toISOString()
 await configure({records:[{requestId:'REQ-00000001',patch:{confirmedDurationMs:320}},{requestId:'REQ-00000002',patch:{confirmedDurationMs:1250}},{requestId:'REQ-00000003',patch:{confirmedDurationMs:400000}},{requestId:'REQ-00000004',patch:{confirmedDurationMs:4000000}},{requestId:'REQ-00000005',patch:{confirmedDurationMs:97398000}},{requestId:'REQ-00000006',patch:{confirmedDurationMs:0}},{requestId:'REQ-00000007',patch:{publishedAt:null,confirmedDurationMs:null}},{requestId:'REQ-00000012',patch:{receivedAt:receipt}},{requestId:'REQ-00000008',patch:{receivedAt:receipt}}]});await reset()
 for(const[width,height]of[[1440,900],[1280,720],[624,850]]){
  await drive(page.setViewportSize({width,height}));await tick(100)
  for(const[id,text]of[['REQ-00000001','320 ms'],['REQ-00000002','1.25 s'],['REQ-00000003','6 min 40 s'],['REQ-00000004','1 h 6 min 40 s'],['REQ-00000005','27 h 3 min 18 s'],['REQ-00000006','0 ms'],['REQ-00000007','—']]){assert.equal(await duration(id).innerText(),text);const d=await duration(id).evaluate(n=>({height:n.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(n).lineHeight),whiteSpace:getComputedStyle(n).whiteSpace,width:n.getBoundingClientRect().width}));assert.equal(d.whiteSpace,'nowrap');assert.ok(d.height<=d.lineHeight+1);measurements.push({kind:'duration cell',width,id,text,...d})}
  assert.equal(await table().locator('.duration-label').count(),0);await drive(body().evaluate(n=>{n.scrollLeft=n.scrollWidth;n.scrollTop=n.scrollHeight}));const long=duration('REQ-00000004');await drive(long.scrollIntoViewIfNeeded());await tick(100);const a=await long.boundingBox(),b=await row('REQ-00000004').getByRole('button',{name:'详情',exact:true}).boundingBox();assert.ok(a.x>=0&&a.x+a.width<=b.x+1)
  const before=await row('REQ-00000008').boundingBox();await tick(2000);const after=await row('REQ-00000008').boundingBox();assert.ok(Math.abs(before.height-after.height)<=1);await shot(`durations-${width}`)
 }
 pass('all three viewports show one-line full duration values through existing horizontal scrolling, no elapsed helper line and stable row heights')
 await drive(page.setViewportSize({width:1280,height:720}));await reset()
 let p=milliseconds(await duration('REQ-00000012').innerText()),u=milliseconds(await duration('REQ-00000008').innerText());await tick(2200);assert.ok(milliseconds(await duration('REQ-00000012').innerText())>=p+1000);assert.ok(milliseconds(await duration('REQ-00000008').innerText())>=u+1000)
 p=milliseconds(await duration('REQ-00000012').innerText());await page.clock.setSystemTime('2040-01-01T00:00:00Z');await tick(2200);assert.ok(Math.abs(milliseconds(await duration('REQ-00000012').innerText())-p-2200)<1200)
 p=milliseconds(await duration('REQ-00000012').innerText());await page.clock.setSystemTime('2020-01-01T00:00:00Z');await tick(2200);assert.ok(Math.abs(milliseconds(await duration('REQ-00000012').innerText())-p-2200)<1200)
 const sync=await duration('REQ-00000013').innerText();await configure({records:[{requestId:'REQ-00000012',patch:{publication:'published',publishedAt:new Date(Date.parse(receipt)+1250).toISOString()}}]});await tick(6200);assert.equal(await duration('REQ-00000012').innerText(),'1.25 s');await tick(6200);assert.equal(await duration('REQ-00000012').innerText(),'1.25 s');assert.equal(await duration('REQ-00000013').innerText(),sync)
 pass('pending publication and manual review accrue with monotonic time despite client clock jumps; published confirmation and completed sync durations freeze')

 await configure({records:[{requestId:'REQ-00000012',patch:{publication:'pending',publishedAt:null}}]});await query('REQ-00000012');await page.evaluate(()=>{window.timingRejectReads=true});await tick(6200);await page.getByRole('alert').filter({hasText:'日志数据暂未更新'}).waitFor();const frozen=await duration('REQ-00000012').innerText();await tick(3200);assert.equal(await duration('REQ-00000012').innerText(),frozen)
 await page.evaluate(()=>{window.timingRejectReads=false});await configure({serverOffsetMs:20000});await tick(6200);assert.equal(await page.locator('.query-panel .el-alert').count(),0);assert.notEqual(await duration('REQ-00000012').innerText(),frozen);p=milliseconds(await duration('REQ-00000012').innerText());await tick(2200);assert.ok(milliseconds(await duration('REQ-00000012').innerText())>=p+1000)
 pass('failed calibration preserves confirmed rows, freezes local elapsed values and resumes only after a successful recalibration')

 await page.evaluate(()=>{window.timingVisibility='hidden';Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.timingVisibility});Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.timingVisibility!=='visible'});document.dispatchEvent(new Event('visibilitychange'))});const hidden=await duration('REQ-00000012').innerText();await tick(12000);assert.equal(await duration('REQ-00000012').innerText(),hidden)
 await configure({serverOffsetMs:140000,nextRead:{delayMs:2000}});const countBeforeVisibility=await reads();await page.evaluate(()=>{window.timingVisibility='visible';document.dispatchEvent(new Event('visibilitychange'))});await tick(700);assert.ok(await reads()>countBeforeVisibility);assert.equal(await duration('REQ-00000012').innerText(),hidden);await tick(2000);assert.notEqual(await duration('REQ-00000012').innerText(),hidden);p=milliseconds(await duration('REQ-00000012').innerText());await tick(2100);assert.ok(milliseconds(await duration('REQ-00000012').innerText())>=p+1000)
 pass('hidden pages freeze; becoming visible re-reads and calibrates before local elapsed values resume')

 await reset();await drive(page.setViewportSize({width:1024,height:640}));await select(page.locator('.el-pagination__sizes'),'10 条/页');await click(table().locator('th.is-sortable').locator('.cell'))
 // The oldest pages contain completed history. Use the page with the open review request to exercise polling.
 const ascending = await drive(page.evaluate(() => window.timingOriginalList({ pageSize: 100, sortOrder: 'ascending' })))
 const reviewPage = Math.floor(ascending.items.findIndex(row => row.requestId === 'REQ-00000008') / 10) + 1
 await click(page.locator('.el-pager .number').filter({ hasText: new RegExp(`^${reviewPage}$`) }));await drive(body().evaluate(n=>{n.scrollTop=Math.min(35,n.scrollHeight-n.clientHeight);n.scrollLeft=Math.min(80,n.scrollWidth-n.clientWidth)}));await fill(userInput(),'unsubmitted-draft')
 assert.ok((await ids()).includes('REQ-00000008'))
 const readsBeforeRefresh = await reads()
 const context={ids:await ids(),scroll:await body().evaluate(n=>({x:n.scrollLeft,y:n.scrollTop})),sort:await table().locator('th.is-sortable').getAttribute('aria-sort'),page:await page.locator('.el-pager .is-active').innerText(),size:await page.locator('.el-pagination__sizes').innerText()};assert.ok(context.scroll.x>0&&context.scroll.y>0);await tick(6200);assert.deepEqual(await ids(),context.ids);assert.equal(await userInput().inputValue(),'unsubmitted-draft');assert.deepEqual(await body().evaluate(n=>({x:n.scrollLeft,y:n.scrollTop})),context.scroll);assert.equal(await page.locator('.el-pager .is-active').innerText(),context.page);assert.equal(await table().locator('th.is-sortable').getAttribute('aria-sort'),context.sort);assert.equal(await page.locator('.el-pagination__sizes').innerText(),context.size)
 const latestRead=await page.evaluate(()=>window.timingReads.filter(r=>!r.error).at(-1));assert.ok(await reads()>readsBeforeRefresh);assert.equal(latestRead.params.userId,'');assert.equal(latestRead.params.page,reviewPage);assert.equal(latestRead.params.pageSize,10);measurements.push({kind:'background context',context})
 await configure({records:[{requestId:'REQ-00000017',patch:{publication:'pending',publishedAt:null}}]});await reset();await query('REQ-00000017');await open('REQ-00000017');await click(log.getByRole('tab',{name:'接口报文',exact:true}));await click(log.locator('.response-selector'));await click(page.getByRole('option',{name:/^attempt-1/}));const chosen=await log.locator('.response-selector').innerText();await click(log.getByRole('button',{name:'请求参数',exact:true}));assert.equal(await log.getByRole('button',{name:'请求参数',exact:true}).getAttribute('aria-expanded'),'false');await tick(6200);assert.equal(await log.getByRole('button',{name:'请求参数',exact:true}).getAttribute('aria-expanded'),'false');assert.equal(await log.getByRole('tab',{name:'接口报文',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await log.locator('.response-selector').innerText(),chosen);await close()
 pass('background reads preserve draft/applied filters, page/size/sort and table scroll, plus open detail tab and selected call attempt')

 await configure({records:[{requestId:'REQ-00000015',patch:{publication:'pending',publishedAt:null}}]});await reset();await select(page.locator('.el-pagination__sizes'),'10 条/页');await open('REQ-00000015');await click(log.getByRole('tab',{name:'接口报文',exact:true}));await drive(page.locator('.el-pager .number').filter({hasText:/^2$/}).dispatchEvent('click'));await settle();assert.ok(!(await ids()).includes('REQ-00000015'))
 await configure({records:[{requestId:'REQ-00000015',patch:{publication:'published',confirmedDurationMs:1250}}]});await tick(6200);assert.equal(await log.getByTestId('request-duration').innerText(),'1.25 s');assert.equal(await log.getByRole('tab',{name:'接口报文',exact:true}).getAttribute('aria-selected'),'true');await tick(2200);assert.equal(await log.getByTestId('request-duration').innerText(),'1.25 s');assert.ok(await page.evaluate(()=>window.timingReads.some(r=>r.params.requestId==='REQ-00000015'&&r.params.pageSize===1)));await close()
 pass('an open request that is no longer on the current page still recalibrates via its ID and freezes once published without resetting the detail tab')

 await reset();await query('REQ-00000012');await page.evaluate(()=>{window.timingHoldRequest='REQ-00000008'});await fill(requestInput(),'REQ-00000008');await drive(button('查询').click({force:true}));await tick(100);await fill(requestInput(),'REQ-00000012');await click(button('查询'));assert.deepEqual(await ids(),['REQ-00000012']);await tick(3500);assert.deepEqual(await ids(),['REQ-00000012'])
 await configure({records:[{requestId:'REQ-00000012',patch:{publication:'pending',publishedAt:null}}]});await query('REQ-00000012');await page.evaluate(()=>{window.timingHoldRequest='REQ-00000012'});await drive(button('查询').click({force:true}));await tick(100);await configure({records:[{requestId:'REQ-00000012',patch:{publication:'published',publishedAt:new Date(Date.parse(receipt)+400000).toISOString()}}]});await click(button('查询'));assert.equal(await duration('REQ-00000012').innerText(),'6 min 40 s');await tick(3500);assert.equal(await duration('REQ-00000012').innerText(),'6 min 40 s');assert.match(await row('REQ-00000012').innerText(),/已发布/)
 pass('late older requests cannot replace a newer query or regress a confirmed published outcome back to pending')

 await configure({records:[{requestId:'REQ-00000012',patch:{publication:'pending',publishedAt:null,receivedAt:receipt}},{requestId:'REQ-00000008',patch:{receivedAt:receipt}}]});await reset();await fill(userInput(),'U001');const pendingDownload=page.waitForEvent('download');await click(button('导出 CSV'));const download=await pendingDownload;const csv=csvRows(await fs.readFile(await download.path(),'utf8'));const idColumn=csv[0].indexOf('请求 ID'),elapsedColumn=csv[0].indexOf('请求耗时');assert.equal(csv.length,46);const rows=Object.fromEntries(csv.slice(1).map(r=>[r[idColumn],r]));assert.equal(rows['REQ-00000012'][elapsedColumn],rows['REQ-00000008'][elapsedColumn]);assert.ok(milliseconds(rows['REQ-00000012'][elapsedColumn])>400000);assert.equal(rows['REQ-00000004'][elapsedColumn],'1 h 6 min 40 s');assert.equal(await userInput().inputValue(),'U001');measurements.push({kind:'CSV common snapshot',elapsed:rows['REQ-00000012'][elapsedColumn],records:csv.length-1})
 pass('CSV ignores unsubmitted filters and uses one export-time server snapshot for every unfinished duration in the same compact unit format')

 await go('/applicants');await fill(page.getByPlaceholder('输入完整申请人 ID',{exact:true}),'U001');await drive(page.getByPlaceholder('输入完整申请人 ID',{exact:true}).press('Enter'));await settle();assert.equal(await page.locator('.finger-count').count(),0);assert.doesNotMatch(await page.locator('.applicants-page .el-table__row').innerText(),/10\/10 指|指纹未入库/);await click(page.locator('.applicants-page .el-table__row').getByRole('button',{name:'查看详情',exact:true}));const person=page.getByRole('dialog',{name:'申请人详情',exact:true});await person.waitFor();await settle();assert.equal(await person.locator('[data-modality="finger"] h2').innerText(),'指纹');assert.equal(await person.locator('.finger-slot').count(),10)
 pass('applicant list has no independent finger-count/status line and detail keeps only the finger title with fixed image slots')
 assert.deepEqual(errors,[]);assert.deepEqual(backendRequests,[]);pass('zero browser errors and zero real-backend calls')
}catch(error){failure={message:error.message,stack:error.stack,url:page.url()};console.error(error);process.exitCode=1;await shot('failure').catch(()=>{})}finally{await fs.writeFile(`${out}/report.json`,JSON.stringify({base,checks,measurements,errors,backendRequests,failure},null,2));await browser.close()}
console.log(`COMPLETE ${checks.length} checks`)
