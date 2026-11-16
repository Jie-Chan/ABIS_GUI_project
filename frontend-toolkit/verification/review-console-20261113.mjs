import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const base = new URL(process.env.ABIS_PREVIEW_URL || 'http://127.0.0.1:5186').origin
assert.match(await (await fetch(`${base}/src/api/index.js`)).text(), /"VITE_USE_MOCK": "true"/)
const out = process.env.ABIS_QA_OUTPUT_DIR || './qa-output/console-1720'
await fs.mkdir(out, { recursive: true })
const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1422, height: 804 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' })
page.setDefaultTimeout(10000)
const checks = [], errors = [], backendRequests = [], positions = []
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('request', r => { const url = new URL(r.url()); if (['xhr','fetch'].includes(r.resourceType()) && (url.origin !== base || /^\/(admin-api|abis-admin)(\/|$)/.test(url.pathname))) backendRequests.push(r.url()) })
const button = name => page.getByRole('button', { name, exact: true })
const loaded = () => page.waitForFunction(() => !document.querySelector('.el-loading-mask,.el-button.is-loading'))
const paint = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
const go = async path => { await page.evaluate(path => document.querySelector('#app').__vue_app__.config.globalProperties.$router.push(path), path); await page.waitForURL(`**${path}`); await loaded(); await paint() }
const pass = text => { checks.push(text); console.log('PASS', text) }
const table = () => page.locator('.records-page > .el-card > .el-card__body > .el-table')
const wrap = () => table().locator('.el-table__body-wrapper .el-scrollbar__wrap')
const select = async (selector,name) => { await page.locator(selector).click(); await page.getByRole('option',{name,exact:true}).click(); await paint() }
const log = page.getByRole('dialog',{name:'请求详情',exact:true}), applicant = page.getByRole('dialog',{name:'申请人详情',exact:true})
async function clean() {
  const contents = await page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll('[title],[aria-label],img[alt]')].map(n => [n.getAttribute('title'),n.getAttribute('aria-label'),n.getAttribute('alt')].filter(Boolean).join(' '))].join('\n'))
  assert.doesNotMatch(contents, /mock|演示|本地虚构|模拟数据|非真实服务环境|HTTP 接口模式|操作结果将在密码结果弹窗中显示|刷新页面后恢复/i)
  assert.equal(await page.locator('.source-badge,.login-source,.demo-section').count(),0)
}
async function openLog(id) { await page.locator('.request-table .el-table__row').filter({hasText:id}).click(); await log.waitFor(); await page.waitForFunction(()=>Math.abs(document.querySelector('.request-log-drawer').getBoundingClientRect().right-innerWidth)<1) }
async function closeLog() { await log.getByRole('button',{name:'关闭',exact:true}).click(); await log.waitFor({state:'hidden'}) }
async function queryLog(id) { await button('重置').click(); await loaded(); await page.getByPlaceholder('输入完整业务请求 ID').fill(id); await button('查询').click(); await loaded() }
async function openApplicant(id) { await page.locator('.applicants-page .el-table__row').filter({hasText:id}).getByRole('button',{name:'查看详情',exact:true}).click(); await applicant.waitFor(); await loaded(); await page.waitForFunction(()=>Math.abs(document.querySelector('.applicant-drawer').getBoundingClientRect().right-innerWidth)<1) }
async function closeApplicant() { await applicant.locator('.el-drawer__close-btn').click(); await applicant.waitFor({state:'hidden'}) }
async function download() { const pending=page.waitForEvent('download'); await button('导出 CSV').click(); return fs.readFile(await (await pending).path(),'utf8') }
function count(csv) { return csv.trim().split(/\r?\n/).length-1 }
try {
  await page.goto(`${base}/login`); await clean(); await page.getByRole('heading',{name:'ABIS 管理控制台',exact:true}).waitFor(); assert.equal(await page.locator('.preview-footer').count(),0); assert.equal(await page.getByText('欢迎登录',{exact:true}).count(),0); await page.screenshot({path:`${out}/login.png`})
  await page.locator('.login-content input').nth(0).fill('admin'); await page.locator('.login-content input').nth(1).fill('admin123'); await button('登录').click(); await page.waitForURL('**/monitor'); await loaded(); await clean()
  pass('login and navigation remove environment badges, demo accounts and mode text while retaining normal authentication')

  for (const [width,height] of [[1422,804],[1280,720],[624,850]]) {
    await page.setViewportSize({width,height})
    for (const path of ['/applicants','/logs','/audits']) {
      await go(path); await button('重置').click(); await loaded(); await paint(); await clean()
      const header=table().locator('.el-table__header-wrapper'), filters=page.locator('.query-filters'), first=table().locator('.el-table__row').first()
      const initial={filter:(await filters.boundingBox()).y,header:(await header.boundingBox()).y,row:(await first.boundingBox()).y}
      const measured=[]
      assert.ok(await wrap().evaluate(n=>n.scrollHeight>n.clientHeight+100),`${path}/${width} can scroll`)
      for(const scroll of [0,40,300,0]) {
        await wrap().evaluate((n,y)=>n.scrollTop=y,scroll); await paint()
        const top=(await header.boundingBox()).y, filterTop=(await filters.boundingBox()).y
        assert.ok(Math.abs(top-initial.header)<=1); assert.ok(Math.abs(filterTop-initial.filter)<=1)
        if(scroll===40)assert.ok((await first.boundingBox()).y<initial.row-30)
        measured.push({scroll,top,filterTop})
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),`${path}/${width} avoids page scrolling`)
      const alignment=await table().evaluate(n=>({header:n.querySelector('th').getBoundingClientRect().x,cell:n.querySelector('td').getBoundingClientRect().x,table:n.getBoundingClientRect().x}))
      assert.ok(Math.abs(alignment.header-alignment.cell)<=1)
      if(width===624) { await wrap().evaluate(n=>n.scrollLeft=220); await paint(); const xs=await table().evaluate(n=>[n.querySelector('th').getBoundingClientRect().x,n.querySelector('td').getBoundingClientRect().x]); assert.ok(Math.abs(xs[0]-xs[1])<=1); await wrap().evaluate(n=>n.scrollLeft=0) }
      positions.push({path,width,initial,measured})
      await page.screenshot({path:`${out}/${path.slice(1)}-${width}.png`})
      if(width===624) {
        await button('选择时间范围').click(); const panel=page.locator('.single-month-range').filter({visible:true}); assert.equal(await panel.locator('.el-calendar').count(),1)
        for(const name of ['清空','确定']) { const r=await panel.getByRole('button',{name,exact:true}).boundingBox(); assert.ok(r.y+r.height<=height) }
        await panel.getByRole('button',{name:'2026-11-13',exact:true}).click(); await panel.getByRole('button',{name:'下个月',exact:true}).click(); await panel.getByRole('button',{name:'2026-12-14',exact:true}).click(); await panel.getByLabel('开始时间',{exact:true}).fill('08:09:10'); await panel.getByLabel('结束时间',{exact:true}).fill('18:19:20'); await panel.getByRole('button',{name:'确定',exact:true}).click(); assert.match(await page.locator('.range-trigger').innerText(),/2026-11-13 08:09:10[\s\S]*2026-12-14 18:19:20/)
        await button('选择时间范围').click(); await panel.getByRole('button',{name:'清空',exact:true}).click()
        if(path==='/logs') {
          await button('更多筛选').click(); await page.waitForFunction(()=>document.documentElement.scrollHeight<=innerHeight+1)
          await page.screenshot({path:`${out}/more-filters-624.png`})
          await select('.log-api-filter .el-select','1：N查重'); await select('.log-publication-filter .el-select','待发布'); await button('查询').click(); await loaded(); assert.equal(await page.locator('.request-table .el-table__row').count(),1)
          await button('收起筛选（2）').click(); assert.equal(await button('更多筛选（2）').count(),1); await button('查询').click(); await loaded(); assert.match(await page.locator('.request-table .el-table__row').innerText(),/REQ-00000012/); await button('重置').click(); await loaded()
        }
      }
    }
  }
  pass('all three pages keep filters and header fixed from first screen through 40px/middle/top body scrolling at desktop and mobile widths')
  pass('native table headers cover scrolling rows, align columns horizontally and keep the document within the viewport')
  pass('three single-month mobile panels retain cross-month HH:mm:ss selection and accessible confirm/clear actions')
  pass('mobile extra filters fit the viewport, retain two applied conditions when collapsed and reset their count')

  await page.setViewportSize({width:1422,height:804}); await go('/applicants')
  const headerY=(await table().locator('.el-table__header-wrapper').boundingBox()).y
  await page.locator('.applicants-page th').filter({hasText:'首次注册'}).click(); await loaded(); await paint(); assert.ok(Math.abs((await table().locator('.el-table__header-wrapper').boundingBox()).y-headerY)<1)
  await select('.applicants-page .el-pagination .el-select','2条/页'); await loaded(); await page.locator('.el-pagination .btn-next').click(); await loaded(); await paint(); assert.ok(Math.abs((await table().locator('.el-table__header-wrapper').boundingBox()).y-headerY)<1)
  await button('重置').click(); await loaded()
  const gap=async()=>page.locator('.records-page .el-card').evaluate(n=>n.getBoundingClientRect().bottom-n.querySelector('.el-pagination').getBoundingClientRect().bottom)
  const normalGap=await gap(), manyHeight=(await page.locator('.el-card').boundingBox()).height; await page.getByPlaceholder('输入完整申请人 ID').fill('U001'); await button('查询').click(); await loaded(); const fewHeight=(await page.locator('.el-card').boundingBox()).height; assert.ok(Math.abs(await gap()-normalGap)<1)
  await page.getByPlaceholder('输入完整申请人 ID').fill('UNKNOWN-ID'); await button('查询').click(); await loaded(); assert.ok(Math.abs(await gap()-normalGap)<1); assert.ok((await page.locator('.el-card').boundingBox()).height<manyHeight && fewHeight<manyHeight)
  await button('重置').click(); await loaded(); pass('sort, pagination and reset preserve header position; zero/few rows retain bottom padding and natural card height')

  await openApplicant('U301'); const finger=applicant.locator('[data-finger="left_index"]')
  assert.equal(await applicant.locator('.finger-slot').count(),10); assert.equal(await applicant.locator('[data-modality="finger"] img').count(),8); assert.equal(await applicant.locator('.finger-placeholder').count(),2); assert.equal(await applicant.locator('[data-modality="finger"] .el-select').count(),0); assert.equal(await applicant.locator('[data-modality="finger"] h2').innerText(),'指纹 8 指'); assert.equal(await applicant.locator('.record-id').count(),0)
  const actual=await page.evaluate(async()=>{const api=(await import('/src/api/index.js')).default;const person=await api.getApplicant('U301');const records=person.records.filter(r=>r.fingerPosition==='left_index');const helper=(await import('/src/utils/applicant.js')).latestEnrollmentRecord;return{chosen:helper(records),image:await api.getUserImage({userId:'U301',feature:'finger',fingerPosition:'left_index'}),newest:helper([{recordId:'old',enrolledAt:'2020-01-01',updatedAt:'2030-01-01'},{recordId:'new',enrolledAt:'2021-01-01',updatedAt:'2021-01-01'}]).recordId,tie:helper([{recordId:'first',enrolledAt:'2021-01-01'},{recordId:'last',enrolledAt:'2021-01-01'}]).recordId}})
  assert.equal(actual.newest,'new'); assert.equal(actual.tie,'last'); assert.equal(actual.image.recordId,actual.chosen.recordId); assert.equal(await finger.locator('img').getAttribute('src'),actual.chosen.imageUrl)
  await finger.locator('.enrollment-image').click(); const preview=page.getByRole('dialog',{name:'入库图像详情',exact:true}); await preview.waitFor(); assert.doesNotMatch(await preview.innerText(),new RegExp(actual.chosen.recordId)); assert.doesNotMatch(await preview.innerText(),/记录 ID/); assert.match(await preview.innerText(),/图像更新时间/); assert.match(await preview.innerText(),new RegExp(String(actual.chosen.qualityScore))); await clean(); await page.screenshot({path:`${out}/applicant-latest-preview.png`}); await preview.getByRole('button',{name:'关闭图像',exact:true}).click(); await preview.waitFor({state:'hidden'}); await closeApplicant()
  await openApplicant('U302'); assert.equal(await applicant.locator('[data-finger="right_ring"] .quality-score').innerText(),'—'); assert.equal(await applicant.locator('[data-finger="right_little"] .quality-score').innerText(),'0'); await closeApplicant()
  pass('one latest record per finger uses successful enrollment time then write order, with matching image, quality and update time while internal IDs stay hidden')

  await wrap().evaluate(n=>n.scrollTop=200)
  await openApplicant('U301'); const bodyY=await wrap().evaluate(n=>n.scrollTop); assert.ok(bodyY>0); await applicant.getByRole('tab',{name:'入库变更记录',exact:true}).click(); await applicant.locator('.enrollment-changes .el-table__row').first().getByRole('button',{name:'查看日志',exact:true}).click(); await page.waitForURL('**/logs?**'); await loaded(); await button('返回申请人详情').click(); await page.waitForURL('**/applicants'); await loaded(); await applicant.waitFor(); assert.equal(await applicant.getByRole('tab',{name:'入库变更记录',exact:true}).getAttribute('aria-selected'),'true'); assert.ok(Math.abs(await wrap().evaluate(n=>n.scrollTop)-bodyY)<2); await closeApplicant()
  pass('applicant-to-log return restores the changes tab and the independently scrolling applicant rows')

  await go('/acceptance/recapture'); assert.equal(await page.getByRole('menuitem',{name:'重采验收',exact:true}).count(),0)
  for(const [label,present] of [['三人旧数据有效',true],['三人双模态删除',false],['三人新人脸入库',true],['三人重采结果',true]]) {
    await button(label).click(); await loaded(); assert.equal(await page.locator('.current-scenario').innerText(),`当前状态：${label}`); await page.getByRole('link',{name:'查看申请人列表'}).click(); await page.waitForURL('**/applicants'); await loaded(); assert.equal(await page.locator('.applicants-page .el-table__row').filter({hasText:'U301'}).count(),present?1:0); assert.equal(await button('重采样例').count(),0); await clean(); await go('/acceptance/recapture')
  }
  await button('恢复默认数据').click(); await loaded(); await go('/applicants'); assert.equal(await page.locator('.applicants-page .el-table__row').count(),9); pass('dedicated authenticated acceptance route changes four phases and restores defaults without adding controls to normal applicants')

  await go('/logs'); await queryLog('REQ-00000017'); await openLog('REQ-00000017'); assert.match(await log.getByTestId('business-summary').innerText(),/^查重成功 · 重试后完成/); assert.equal(await log.getByRole('button',{name:'查看事件',exact:true}).count(),0); await log.getByRole('button',{name:'历史异常',exact:true}).click(); assert.match(await log.locator('.focused-event').innerText(),/CONNECT_TIMEOUT/); assert.match(await log.locator('.response-selector').innerText(),/attempt-1/); await log.getByRole('tab',{name:'接口报文',exact:true}).click(); assert.equal(await log.locator('h2').count(),0); assert.equal(await log.getByLabel('ABIS 请求 JSON').count(),0); await log.locator('.response-selector').click(); await page.getByRole('option',{name:/^attempt-2/}).click(); assert.equal(JSON.parse(await log.getByLabel('ABIS 请求 JSON').innerText()).userId,'U017'); await clean(); await closeLog()
  await queryLog('REQ-00000012'); await openLog('REQ-00000012'); assert.match(await log.getByTestId('business-summary').innerText(),/^查重成功 · 响应待发布/); await log.getByRole('button',{name:'查看事件',exact:true}).click(); assert.match(await log.locator('.focused-event').innerText(),/PUBLISH_NACK/); await clean(); await page.screenshot({path:`${out}/current-exception.png`}); await closeLog()
  await queryLog('REQ-00000011'); await openLog('REQ-00000011'); assert.match(await log.getByTestId('business-summary').innerText(),/^查重失败 · 失败响应已发布/); await closeLog(); pass('retry recovery is labeled historical; unresolved publication failure keeps current event targeting and business failure remains explicit')

  await button('重置').click(); await loaded(); assert.equal(await page.locator('.logs-page .record-count,.scope-notice,.logs-page .note').count(),0); await select('.log-api-filter .el-select','1：N查重'); await button('查询').click(); await loaded(); await page.getByPlaceholder('输入完整申请人 ID').fill('U001'); assert.equal(count(await download()),9); await button('查询').click(); await loaded(); const csv=await download(); assert.equal(count(csv),2); assert.match(csv,/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}/); await button('导出 CSV').hover(); await page.getByRole('tooltip',{name:'导出当前查询的全部日志字段'}).waitFor(); await clean(); pass('log footer has a single total and export retains applied all-page results, millisecond time and business tooltip')

  await button('重置').click(); await loaded(); await openLog('REQ-00000014'); await log.getByRole('tab',{name:'图像比对',exact:true}).click(); await page.waitForFunction(()=>[...document.querySelectorAll('.comparison-frame')].every(n=>n.getAttribute('aria-busy')!=='true')); await clean(); assert.equal(await log.locator('.comparison-source').innerText(),'图像为当前入库版本'); await log.getByRole('button',{name:'候选 3',exact:true}).click(); await page.waitForFunction(()=>[...document.querySelectorAll('.comparison-frame')].every(n=>n.getAttribute('aria-busy')!=='true')); await log.getByRole('button',{name:'放大候选图像',exact:true}).click(); const zoom=page.locator('.comparison-preview').filter({visible:true}); await zoom.waitFor(); await clean(); await zoom.getByRole('button',{name:'关闭预览',exact:true}).click(); await zoom.waitFor({state:'hidden'}); await log.getByRole('tab',{name:'接口报文',exact:true}).click(); await log.getByRole('tab',{name:'图像比对',exact:true}).click(); assert.equal(await log.getByRole('button',{name:'候选 3',exact:true}).getAttribute('aria-pressed'),'true'); await closeLog(); pass('comparison source-time notice, candidate retention and both zoom context and clean accessible image names remain available')

  await go('/audits'); assert.equal(await page.locator('.demo-date-range,.audit-page .note').count(),0); await page.getByPlaceholder('输入完整账号').fill('ops.zhang'); await select('.audits-filters .el-select >> nth=0','登录'); await button('查询').click(); await loaded(); const auditCount=Number((await page.locator('.el-pagination__total').innerText()).match(/\d+/)[0]); await page.getByPlaceholder('输入完整账号').fill('admin'); const auditCsv=await download(); assert.equal(count(auditCsv),auditCount); assert.doesNotMatch(auditCsv,/登录成功|登录失败/); assert.ok(auditCsv.split(/\r?\n/).slice(1).filter(Boolean).every(row=>row.includes('"ops.zhang"'))); await page.locator('.audit-page .el-table__row').first().getByRole('button',{name:'详情',exact:true}).click(); await clean(); assert.equal(await page.getByRole('dialog',{name:'审计记录详情',exact:true}).locator('.note').count(),0); await page.keyboard.press('Escape'); pass('audit removes demo date and field instructions while preserving exact-account normalized login querying and applied export')

  await go('/threshold'); assert.equal(await page.locator('.threshold-page .el-card__header h1').innerText(),'匹配阈值配置'); assert.equal(await page.getByRole('heading',{name:'匹配阈值配置',exact:true}).count(),1); assert.equal(await page.locator('.threshold-form').count(),1); assert.equal(await page.locator('.page-intro,.breadcrumb,.threshold-page .note,.threshold-page .el-divider').count(),0); assert.equal(await page.locator('.threshold-form .threshold-rule').innerText(),'调用方指定阈值时，以请求值为准。'); await clean()
  const thresholdLayout=await page.locator('.threshold-fields').evaluate(n=>{const area=n.getBoundingClientRect();return{area:{left:area.left,right:area.right},fields:[...n.querySelectorAll('.threshold-field')].map(el=>{const r=el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,width:r.width}})}}); assert.equal(thresholdLayout.fields.length,2); assert.ok(Math.abs(thresholdLayout.fields[0].width-thresholdLayout.fields[1].width)<=1); assert.ok(Math.abs(thresholdLayout.fields[0].top-thresholdLayout.fields[1].top)<=1); assert.ok(Math.abs(thresholdLayout.fields[0].left-thresholdLayout.area.left)<=1); assert.ok(Math.abs(thresholdLayout.fields[1].right-thresholdLayout.area.right)<=1)
  const fields=page.locator('.threshold-field input'); await fields.nth(0).fill('59'); await fields.nth(1).fill('39'); await fields.nth(1).blur(); assert.equal(await button('保存修改').isDisabled(),true); await page.screenshot({path:`${out}/threshold.png`}); await button('填入默认值').click(); await button('保存修改').click(); const confirm=page.getByRole('dialog',{name:'保存阈值修改？',exact:true}); await confirm.waitFor(); assert.equal(await confirm.locator('.confirmation-details p').count(),2); assert.equal(await confirm.locator('.confirmation-question').count(),0); await clean(); await confirm.getByRole('button',{name:'保存',exact:true}).click(); await loaded(); pass('threshold retains one page title, concise override rule, lower-bound lock, defaults and before/after save confirmation')

  await go('/accounts'); assert.equal(await page.locator('.page-intro p,.accounts-page .note').count(),0); await clean(); await button('新建账户').click(); await clean(); await page.getByRole('dialog').filter({visible:true}).getByRole('button',{name:'取消',exact:true}).click(); const row=page.locator('.el-table__row').filter({hasText:'ops.zhang'}); await row.getByRole('button',{name:'编辑',exact:true}).click(); await clean(); await page.getByRole('dialog').filter({visible:true}).getByRole('button',{name:'取消',exact:true}).click(); await button('更多：ops.zhang').click(); await page.getByRole('menuitem',{name:'重置密码',exact:true}).click(); const resetConfirm=page.getByRole('dialog',{name:'二次确认',exact:true}); await resetConfirm.waitFor(); assert.doesNotMatch(await resetConfirm.innerText(),/操作结果将在/); await clean(); await resetConfirm.getByRole('button',{name:'取消',exact:true}).click(); pass('account create/edit and password reset use business wording and retain required targets and confirmation')
  await button('账户菜单').click(); await page.getByRole('menuitem',{name:'个人信息',exact:true}).click(); await loaded(); const profile=page.getByRole('dialog',{name:'个人信息',exact:true}); await clean(); await profile.getByRole('tab',{name:'修改密码',exact:true}).click(); await clean(); assert.equal(await profile.locator('.password-note').innerText(),'修改成功后请重新登录。'); assert.equal(await profile.locator('#new-password-requirement').innerText(),'新密码至少 7 位'); await profile.getByRole('button',{name:'关闭',exact:true}).click(); pass('profile and change password retain field validation and re-login guidance without preview reset text')

  const visitor=await browser.newPage(); await visitor.goto(`${base}/acceptance/recapture`); await visitor.waitForURL(url=>url.pathname==='/login'); await visitor.close(); pass('acceptance route requires authentication and remains absent from normal navigation')
  assert.deepEqual(errors,[]); assert.deepEqual(backendRequests,[]); pass('zero browser errors and zero real-backend calls')
  await fs.writeFile(`${out}/report.json`,JSON.stringify({checks,positions,errors,backendRequests},null,2)); console.log(`COMPLETE ${checks.length} checks`)
} catch(error) { await page.screenshot({path:`${out}/failure.png`}); console.error(error); process.exitCode=1 } finally { await browser.close() }
