<script setup>
import QueryPanel from '@/components/QueryPanel.vue'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import api from '@/api'
import UiIcon from '@/components/UiIcon.vue'
import ApplicantListImages from '@/components/ApplicantListImages.vue'
import ApplicantDetailDrawer from '@/components/ApplicantDetailDrawer.vue'
import { TIME_RANGE_SHORTCUTS } from '@/constants/timeRanges'
import { emptyApplicantQuery, useApplicantListStore } from '@/stores/applicants'

const isMock = import.meta.env.VITE_USE_MOCK !== 'false'
const scenario = ref('default'), scenarioVisible = ref(false), scenarioLoading = ref(false), scenarioError = ref('')
const scenarioOptions = [ { value:'original',label:'原有人脸及 10 指' },{value:'deleted',label:'双模态删除，暂时退出列表'},{value:'face',label:'新人脸入库，恢复列表'},{value:'complete',label:'新指纹：9 指位、10 条记录'},{value:'failed',label:'新人脸成功，指纹注册失败'} ]
const documentScenarios = [{value:'document-original',label:'三人旧数据有效'},{value:'document-deleted',label:'三人双模态删除'},{value:'document-face',label:'三人新人脸入库'},{value:'document-complete',label:'三人重采结果'}]
async function changeScenario(value) {
  scenarioLoading.value = true; scenarioError.value = ''
  try {
    const result = await api.setRecaptureScenario(value)
    scenario.value = result.scenario
    query.value.userId = value === 'default' ? '' : result.userId
    query.value.page = 1
    timeRange.value = []
    listStore.detailContext.restore = false
    drawerVisible.value = false
    await load()
  }
  catch(e) { scenarioError.value = e.message || '读取重采样例失败' }
  finally { scenarioLoading.value = false }
}
const router = useRouter()
const listStore = useApplicantListStore()
const { query, timeRange } = storeToRefs(listStore)
const tableRef = ref(null)
const loading = ref(false), error = ref(''), rows = ref([]), total = ref(0)
let listSequence = 0, detailSequence = 0
const drawerVisible = ref(false), detailLoading = ref(false), detailError = ref(''), detail = ref(null), selectedUserId = ref('')

async function load() {
  const sequence = ++listSequence
  loading.value = true; error.value = ''
  try {
    const result = await api.listApplicants({ ...query.value, startTime: timeRange.value?.[0] || '', endTime: timeRange.value?.[1] || '' })
    if (sequence !== listSequence) return
    rows.value = result.items; total.value = result.total
  } catch (e) {
    if (sequence !== listSequence) return
    rows.value = []; total.value = 0; query.value.page = 1; error.value = e.message || '查询申请人失败，请重试'
  } finally { if (sequence === listSequence) loading.value = false }
}
function search() { query.value.page = 1; return load() }
function reset() { query.value = emptyApplicantQuery(); timeRange.value = []; tableRef.value?.clearSort(); return load() }
function changePage(page) { if (page !== query.value.page) { query.value.page = page; return load() } }
function changePageSize(size) { query.value.pageSize = size; return search() }
function changeSort({ prop, order }) {
  const sortBy = order ? prop : '', sortOrder = order || ''
  if (sortBy === query.value.sortBy && sortOrder === query.value.sortOrder) return
  query.value.sortBy = sortBy; query.value.sortOrder = sortOrder; return search()
}
async function openDetail(userId, restoring = false) {
  if (!restoring) listStore.detailContext = { userId, tab: 'images', scroll: 0, restore: false }
  selectedUserId.value = userId; drawerVisible.value = true; detail.value = null; detailError.value = ''; detailLoading.value = true
  const sequence = ++detailSequence
  try { const result = await api.getApplicant(userId); if (sequence === detailSequence) detail.value = result }
  catch (e) { if (sequence === detailSequence) detailError.value = e.message || '读取申请人详情失败，请重试' }
  finally { if (sequence === detailSequence) detailLoading.value = false }
}
function closeDetail() { listStore.detailContext.restore = false; ++detailSequence; detail.value = null; detailError.value = ''; detailLoading.value = false }
function viewChangeLogs(change) { return router.push({ name: 'logs', query: { userId: change.userId, requestId: change.requestId, returnTo: 'applicants' } }) }
async function restoreDetailPosition() {
  const context = listStore.detailContext
  if (!context.restore) return
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  if (drawerVisible.value && detail.value && listStore.detailContext === context) document.querySelector('.applicant-drawer .el-drawer__body')?.scrollTo(0, context.scroll)
}
onBeforeRouteLeave(() => {
  if (drawerVisible.value) listStore.detailContext = { ...listStore.detailContext, userId: selectedUserId.value,
    scroll: document.querySelector('.applicant-drawer .el-drawer__body')?.scrollTop || 0, restore: true }

  listStore.scroll = { y: window.scrollY, x: tableRef.value?.$el.querySelector('.el-scrollbar__wrap')?.scrollLeft || 0, restore: true }
})
onMounted(async () => {
  if (isMock) { try { scenario.value = (await api.getRecaptureScenario()).scenario; scenarioVisible.value = scenario.value !== 'default' } catch {} }
  await load(); await nextTick()
  if (listStore.scroll.restore) {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    window.scrollTo(0, listStore.scroll.y)
    const wrapper = tableRef.value?.$el.querySelector('.el-scrollbar__wrap')
    if (wrapper) wrapper.scrollLeft = listStore.scroll.x
    listStore.scroll.restore = false
  }
  if (listStore.detailContext.restore && listStore.detailContext.userId) { await openDetail(listStore.detailContext.userId, true); await nextTick(); restoreDetailPosition() }
})
onBeforeUnmount(() => { ++listSequence; ++detailSequence })
</script>

<template>
  <div class="records-page applicants-page">
    <el-card>
      <QueryPanel>
      <el-alert v-if="error" :title="error" type="error" :closable="false" class="query-error" />
      <el-form :inline="true" class="applicant-filters query-filters" @submit.prevent="search">
        <el-form-item label="申请人 ID" class="applicant-id-filter"><el-input v-model.trim="query.userId" clearable placeholder="输入完整申请人 ID" @keyup.enter="search"><template #prefix><UiIcon name="search" :size="16" /></template></el-input></el-form-item>
        <el-form-item label="首次注册" class="enrollment-range"><el-date-picker popper-class="query-date-popper" v-model="timeRange" type="datetimerange" value-format="YYYY-MM-DD HH:mm:ss" :shortcuts="TIME_RANGE_SHORTCUTS" start-placeholder="开始时间" end-placeholder="结束时间" /></el-form-item>
        <el-form-item class="query-actions"><el-button type="primary" @click="search"><UiIcon name="search" :size="16" />查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>
      </QueryPanel>
      <div class="results-toolbar"><span class="record-count" aria-live="polite">共 {{ total }} 位申请人</span><span class="population-note">仅展示已确认注册成功且当前有效的申请人</span><el-button v-if="isMock" link type="primary" @click="scenarioVisible = !scenarioVisible">重采样例</el-button></div>
      <section v-if="isMock && scenarioVisible" class="recapture-demo" aria-label="整人重采 Mock 样例">
        <p><strong>整人重采 Mock 样例 · U900</strong> <span>可依次切换验收状态；恢复默认数据后展示 U301、U302 重采结果及原 15 条默认日志。</span></p>
        <div class="scenario-choices"><el-button v-for="item in scenarioOptions" :key="item.value" :type="scenario === item.value ? 'primary' : 'default'" :loading="scenarioLoading && scenario === item.value" :disabled="scenarioLoading" @click="changeScenario(item.value)">{{ item.label }}</el-button><el-button :disabled="scenarioLoading" @click="changeScenario('default')">恢复默认数据</el-button></div>
        <p class="document-samples"><strong>开发文档样例 · U301 / U302 / U303</strong> <span>U301：8 指位、9 条记录；U302：8 指重采为 10 指；U303：新人脸成功、指纹失败。切换后可按申请人 ID 查看。</span></p>
        <div class="scenario-choices"><el-button v-for="item in documentScenarios" :key="item.value" :type="scenario === item.value ? 'primary' : 'default'" :disabled="scenarioLoading" @click="changeScenario(item.value)">{{ item.label }}</el-button></div>
        <el-alert v-if="scenarioError" :title="scenarioError" type="error" :closable="false" />
      </section>
      <el-table ref="tableRef" :data="rows" row-key="userId" v-loading="loading" :empty-text="error ? '查询失败，请重试' : '暂无匹配的申请人'" :default-sort="{ prop: query.sortBy, order: query.sortOrder }" border @sort-change="changeSort">
        <el-table-column prop="userId" label="申请人 ID" min-width="105"><template #default="{ row }"><span class="applicant-id">{{ row.userId }}</span></template></el-table-column>
        <el-table-column label="人脸" width="80"><template #default="{ row }"><ApplicantListImages :records="row.records" feature="face" /></template></el-table-column>
        <el-table-column label="指纹" min-width="360"><template #default="{ row }"><ApplicantListImages :records="row.records" feature="finger" /></template></el-table-column>
        <el-table-column prop="enrolledAt" label="首次注册" min-width="190" sortable="custom" />
        <el-table-column prop="updatedAt" label="更新时间" min-width="190" sortable="custom"><template #default="{ row }">{{ row.updatedAt || '—' }}</template></el-table-column>
        <el-table-column label="操作" width="120" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row.userId)">查看详情</el-button></template></el-table-column>
      </el-table>
      <el-pagination :current-page="query.page" :page-size="query.pageSize" :total="total" :page-sizes="[2, 5, 20, 50]" layout="total, sizes, prev, pager, next" class="applicant-pagination" @update:current-page="changePage" @update:page-size="changePageSize" />
      <p class="note">当前图像与请求日志共用业务数据；仅已生效的入库变更会更新当前记录，查重和失败请求不改变有效记录。</p>
    </el-card>
    <ApplicantDetailDrawer v-model="drawerVisible" :detail="detail" :loading="detailLoading" :error="detailError" @closed="closeDetail" @retry="openDetail(selectedUserId)" @change-log="viewChangeLogs" @opened="restoreDetailPosition" v-model:active-tab="listStore.detailContext.tab" />
  </div>
</template>
<style scoped>
.recapture-demo { padding:14px; margin-bottom:14px; border:1px solid var(--abis-border); border-radius:6px; background:#f7f9fc; }.recapture-demo p { margin:0 0 12px; font-size:13px; line-height:1.8; }.recapture-demo span { color:var(--abis-muted); }.scenario-choices { display:flex; flex-wrap:wrap; gap:8px; }.scenario-choices :deep(.el-button + .el-button) { margin-left:0; }
.recapture-demo .document-samples { margin-top: 14px; }
.query-error { margin-bottom: 12px; }
.applicant-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin-bottom: 14px; }.applicant-filters > .el-form-item { width: 220px; margin: 0; }.applicant-filters > .enrollment-range { width: 410px; }.applicant-filters > .query-actions { width: auto; }.applicant-filters :deep(.el-form-item__label) { white-space: nowrap; }.applicant-filters :deep(.el-form-item__content) { min-width: 0; flex: 1; }
.applicant-filters :deep(.el-select),.applicant-filters :deep(.el-date-editor) { width: 100%; }
.applicant-filters > .applicant-id-filter { width: 260px; }
.applicant-pagination { margin-top: 12px; justify-content: flex-end; }.applicant-id { font-family: ui-monospace,SFMono-Regular,Consolas,monospace; overflow-wrap: anywhere; font-weight: 600; }
.population-note { color: var(--el-text-color-secondary); font-size: 12px; }
@media(max-width:767px){.applicant-filters > .el-form-item { width: 100%; }.applicants-page :deep(.el-table-fixed-column--right) { position: static !important; }.applicants-page :deep(.el-table-fixed-column--right::before) { display: none; }}
</style>
