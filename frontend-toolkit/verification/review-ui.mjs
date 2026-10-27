import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base=new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
const out=process.env.ABIS_QA_OUTPUT_DIR || './qa-output'
const adapterSource=await(await fetch(`${base}/src/api/index.js`)).text()
assert.match(adapterSource,/\"VITE_USE_MOCK\": \"true\"/)
assert.doesNotMatch(adapterSource,/createHybrid/)
await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch()
const context=await browser.newContext({viewport:{width:1600,height:1000},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'})
const page=await context.newPage()
page.setDefaultTimeout(10000)
const checks=[],errors=[],backendRequests=[]
page.on('pageerror',e=>errors.push(e.message))
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
page.on('request',r=>{if(['xhr','fetch'].includes(r.resourceType())&&new URL(r.url()).origin!==base)backendRequests.push(r.url())})
const pass=s=>{checks.push(s);console.log('PASS',s)}
const waitLoaded=async()=>{await page.locator('.el-loading-mask').waitFor({state:'hidden'})}
const noOverflow=async name=>{
 const widths=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}))
 assert.ok(widths.scroll<=widths.client+1,`${name}: ${JSON.stringify(widths)}`)
 pass(`${name}: no page overflow`)
}
const snap=async name=>{await page.waitForFunction(()=>!document.querySelector('.el-message'));await page.screenshot({path:`${out}/${name}.png`,fullPage:true})}
const settings=page.getByRole('button',{name:'设置',exact:true})
const nav=async(name,path)=>{
 if(['threshold','accounts'].includes(path)){
   const submenu=page.getByRole('menuitem',{name,exact:true})
   if(!await submenu.isVisible())await settings.click()
 }
 await page.getByRole('menuitem',{name,exact:true}).click()
 await page.waitForURL(`**/${path}`)
 await waitLoaded()
}
const cancel=async()=>{
 await page.locator('.el-message-box').getByRole('button',{name:'取消',exact:true}).click()
 await page.locator('.el-message-box').waitFor({state:'hidden'})
}
const login=async(username,password)=>{
 await page.locator('.login-content input').nth(0).fill(username)
 await page.locator('.login-content input').nth(1).fill(password)
 await page.getByRole('button',{name:'登录',exact:true}).click()
 await page.waitForURL('**/monitor');await waitLoaded()
}
try{
 await page.goto(`${base}/login`)
 await page.getByRole('heading',{name:'欢迎登录'}).waitFor()
 const bounds=await page.locator('.login-content').boundingBox()
 assert.ok(Math.abs(bounds.x+bounds.width/2-800)<1)
 assert.equal(await page.locator('.login-card,.login-brand-panel').count(),0)
 pass('login form centered, no split panel or floating card')
 await snap('01-login')
 await noOverflow('login desktop')
 await page.getByRole('button',{name:'登录',exact:true}).click()
 await page.getByText('请输入用户名与密码',{exact:true}).waitFor()
 pass('login required-field validation')
 await page.locator('.login-content input').nth(0).fill('admin')
 await page.locator('.login-content input').nth(1).fill('invalid')
 await page.getByRole('button',{name:'登录',exact:true}).click()
 await page.getByText('用户名或密码错误',{exact:true}).waitFor()
 assert.match(page.url(),/login/)
 pass('wrong password remains rejected')
 await login('admin','admin123')
 assert.deepEqual(await page.locator('.status-overview dd').allTextContents(),['6','3','2','1'])
 assert.equal(await page.locator('.primary-navigation > .el-menu > .el-menu-item').count(),3)
 assert.equal(await settings.count(),1)
 assert.equal(await page.locator('.aside').count(),0)
 pass('admin sees three primary links plus Settings; monitoring counts unchanged')
 await page.locator('.el-table__row').filter({hasText:'PostgreSQL'}).locator('.el-table__expand-icon').click()
 await page.getByText('postgresql-1',{exact:false}).waitFor()
 await page.getByRole('button',{name:'立即刷新',exact:true}).click();await waitLoaded()
 await page.getByText('postgresql-1',{exact:false}).waitFor()
 pass('monitor refresh preserves expanded instances')
 await snap('02-monitor')
 await noOverflow('monitor desktop')
 // Keyboard access to Settings, followed by route selection and active-state validation.
 await settings.focus();await page.keyboard.press('Enter')
 await page.getByRole('menuitem',{name:'账户管理',exact:true}).waitFor()
 pass('Settings submenu opens by keyboard')
 await nav('账户管理','accounts')
 assert.ok(await page.locator('.primary-navigation .settings-trigger.is-active').count())
 const headers=await page.locator('.el-table__header th .cell').allTextContents()
 assert.deepEqual(headers.map(t=>t.trim()),['账户 ID','用户名','角色','启用状态','创建时间','更新时间','最近登录时间','操作'])
 const first=page.locator('.el-table__row').first()
 assert.equal((await first.locator('td').nth(0).innerText()).trim(),'1')
 assert.equal((await first.locator('td').nth(2).innerText()).trim(),'管理员')
 assert.equal((await first.locator('td').nth(4).innerText()).trim(),'2026-08-01 09:12:00')
 assert.equal((await first.locator('td').nth(5).innerText()).trim(),'—')
 pass('account columns Chinese and ordered; roles translated; legacy creation date and missing update date displayed correctly')
 await snap('03-accounts')
 await settings.click();await page.getByRole('menuitem',{name:'账户管理',exact:true}).waitFor()
 await snap('04-settings-open')
 await settings.click()
 // Supply requested timestamps through the adapter in this browser only, without changing source.
 await page.evaluate(async()=>{
   const api=(await import('/src/api/index.js')).default
   window.originalListAccounts=api.listAccounts
   api.listAccounts=async(...args)=>{
     const data=await window.originalListAccounts(...args)
     return {...data,items:data.items.map((r,i)=>i===0?{...r,createAt:'2026-10-01 01:02:03',updateAt:'2026-10-27 04:05:06'}:r)}
   }
 })
 await page.getByRole('button',{name:'查询',exact:true}).click();await waitLoaded()
 assert.equal((await first.locator('td').nth(4).innerText()).trim(),'2026-10-01 01:02:03')
 assert.equal((await first.locator('td').nth(5).innerText()).trim(),'2026-10-27 04:05:06')
 await page.evaluate(async()=>{(await import('/src/api/index.js')).default.listAccounts=window.originalListAccounts})
 pass('createAt takes precedence over createdAt and updateAt displays when present')
 await page.getByPlaceholder('搜索用户名',{exact:true}).fill('ops.zhang')
 await page.getByRole('button',{name:'查询',exact:true}).click();await waitLoaded()
 assert.equal(await page.locator('.el-table__row').count(),1)
 for(const action of ['删除','禁用','重置密码']){
   await page.getByRole('button',{name:action,exact:true}).click();await cancel()
 }
 assert.ok(await page.getByText('启用',{exact:true}).isVisible())
 assert.equal(await page.locator('.el-table__row').count(),1)
 pass('account search and cancellation of delete/disable/password reset')
 await page.getByRole('button',{name:'新建账户',exact:true}).click()
 await page.getByRole('dialog').getByRole('button',{name:'确定',exact:true}).click()
 await page.getByText('请填写用户名与姓名',{exact:true}).waitFor()
 await page.getByRole('dialog').locator('input').nth(0).fill('ui.v2')
 await page.getByRole('dialog').locator('input').nth(1).fill('界面验证账户')
 await page.getByRole('dialog').getByRole('button',{name:'确定',exact:true}).click()
 await page.getByText('账户已创建',{exact:true}).waitFor()
 await page.getByPlaceholder('搜索用户名',{exact:true}).fill('ui.v2')
 await page.getByRole('button',{name:'查询',exact:true}).click();await waitLoaded()
 assert.ok(await page.getByText('ui.v2',{exact:true}).isVisible())
 await page.getByRole('button',{name:'编辑',exact:true}).click()
 await page.getByRole('dialog').locator('input').nth(1).fill('界面验证账户二')
 await page.getByRole('dialog').getByRole('button',{name:'确定',exact:true}).click()
 await page.getByText('账户已更新',{exact:true}).waitFor()
 pass('existing creation/edit forms, required validation and Mock writes unchanged')
 await page.getByRole('button',{name:'删除',exact:true}).click()
 await page.locator('.el-message-box').getByRole('button',{name:'删除',exact:true}).click()
 await page.getByText('账户已删除',{exact:true}).waitFor()
 await nav('匹配阈值配置','threshold')
 const face=page.locator('.threshold-field input').first()
 const original=await face.inputValue()
 await face.fill('59');await face.blur()
 await page.getByRole('button',{name:'保存',exact:true}).click()
 await page.getByText(/协议尚未明确/).first().waitFor()
 assert.equal(await page.locator('.el-message-box:visible').count(),0)
 await page.getByRole('button',{name:'重置',exact:true}).click();await waitLoaded()
 await face.fill('85');await face.blur()
 await page.getByRole('button',{name:'保存',exact:true}).click();await cancel()
 await page.getByRole('button',{name:'重置',exact:true}).click();await waitLoaded()
 assert.equal(await face.inputValue(),original)
 pass('threshold validation and cancelled confirmation unchanged')
 await nav('日志查询','logs')
 assert.equal(await page.locator('.primary-navigation .settings-trigger.is-active').count(),0)
 await page.getByRole('button',{name:'详情',exact:true}).first().click()
 await page.getByRole('dialog',{name:'调用详情'}).waitFor()
 await page.getByRole('dialog').locator('.el-dialog__headerbtn').click()
 const logDownload=page.waitForEvent('download')
 await page.getByRole('button',{name:'导出 CSV',exact:true}).click()
 assert.match((await logDownload).suggestedFilename(),/^abis_api_logs.*\.csv$/)
 pass('primary navigation resets Settings highlight; log detail and export remain functional')
 await nav('审计查询','audits')
 await page.getByRole('button',{name:'详情',exact:true}).first().click()
 await page.getByRole('dialog',{name:'审计记录详情'}).waitFor()
 await page.getByRole('dialog').locator('.el-dialog__headerbtn').click()
 const auditDownload=page.waitForEvent('download')
 await page.getByRole('button',{name:'导出 CSV',exact:true}).click()
 assert.match((await auditDownload).suggestedFilename(),/^abis_audit.*\.csv$/)
 pass('audit navigation, detail and export')
 for(const width of [1280,1024,768,390,320]){
   await page.setViewportSize({width,height:900})
   for(const [name,path] of [['服务状态监控','monitor'],['匹配阈值配置','threshold'],['账户管理','accounts'],['日志查询','logs'],['审计查询','audits']]){
     await nav(name,path)
     await noOverflow(`${path} at ${width}px`)
     if(width===390&&path==='accounts'){
       const unmasked=await page.evaluate(()=>{
         const cell=document.querySelector('.el-table__body .el-table__row td:nth-child(2)')
         const r=cell.getBoundingClientRect()
         return cell.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))
       })
       assert.ok(unmasked)
       pass('mobile username remains readable without fixed-action-column overlap')
     }
     if(width===390&&['monitor','accounts'].includes(path))await snap(`mobile-${path}`)
   }
 }
 await page.getByRole('button',{name:'退出登录',exact:true}).click();await cancel()
 assert.match(page.url(),/audits/)
 await page.getByRole('button',{name:'退出登录',exact:true}).click()
 await page.locator('.el-message-box').getByRole('button',{name:'确定',exact:true}).click()
 await page.waitForURL('**/login')
 pass('logout cancellation and confirmation')
 for(const width of [390,320]){
   await page.setViewportSize({width,height:844})
   const b=await page.locator('.login-content').boundingBox()
   assert.ok(Math.abs(b.x+b.width/2-width/2)<1)
   await noOverflow(`login centered at ${width}px`)
 }
 await page.setViewportSize({width:390,height:844});await snap('mobile-login')
 await login('ops.zhang','ops123')
 assert.equal(await settings.count(),0)
 assert.equal(await page.locator('.primary-navigation > .el-menu > .el-menu-item').count(),3)
 for(const path of ['/threshold','/accounts']){
   await page.evaluate(async path=>{await(await import('/src/router/index.js')).default.push(path)},path)
   await page.waitForURL('**/monitor')
   assert.equal(await settings.count(),0)
 }
 pass('operator has no Settings menu and cannot navigate to either protected route')
 assert.deepEqual(errors,[]);assert.deepEqual(backendRequests,[])
 pass('zero browser errors and zero real-backend requests')
 await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,errors,backendRequests},null,2))
 console.log(`COMPLETE ${checks.length} checks`)
}catch(e){
 await page.screenshot({path:`${out}/failure.png`,fullPage:true})
 await fs.writeFile(`${out}/failure.txt`,`${e.stack}\n${JSON.stringify(errors)}`)
 console.error(e);process.exitCode=1
}finally{await browser.close()}
