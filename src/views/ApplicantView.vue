<script setup>
import { useRecordsTable } from '@/composables/useRecordsTable'
import QueryPanel from '@/components/QueryPanel.vue'
import RecordsFooter from '@/components/RecordsFooter.vue'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import api from '@/api'
import UiIcon from '@/components/UiIcon.vue'
import ApplicantListImages from '@/components/ApplicantListImages.vue'
import ApplicantDetailDrawer from '@/components/ApplicantDetailDrawer.vue'
import QueryDateRange from '@/components/QueryDateRange.vue'
import { emptyApplicantQuery, useApplicantListStore } from '@/stores/applicants'

const appliedUserId = ref('')
const router = useRouter()
const listStore = useApplicantListStore()
const { query, timeRange } = storeToRefs(listStore)
const loading = ref(false), error = ref(''), rows = ref([]), total = ref(0)
const { tableRef, tableMaxHeight } = useRecordsTable(rows)
let listSequence = 0, detailSequence = 0
const drawerVisible = ref(false), detailLoading = ref(false), detailError = ref(''), detail = ref(null), selectedUserId = ref('')

async function load() {
  const sequence = ++listSequence
  loading.value = true; error.value = ''
  try {
    const submittedUserId = query.value.userId.trim()
    const result = await api.listApplicants({ ...query.value, startTime: timeRange.value?.[0] || '', endTime: timeRange.value?.[1] || '' })
    if (sequence !== listSequence) return
    rows.value = result.items; total.value = result.total; appliedUserId.value = submittedUserId
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
function viewEmptyLogs() { return router.push({ name: 'logs', query: { userId: appliedUserId.value } }) }
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

  listStore.scroll = { y: window.scrollY, x: tableRef.value?.$el.querySelector('.el-scrollbar__wrap')?.scrollLeft || 0, bodyY: tableRef.value?.$el.querySelector('.el-scrollbar__wrap')?.scrollTop || 0, restore: true }
})
onMounted(async () => {
  await load(); await nextTick()
  if (listStore.scroll.restore) {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    window.scrollTo(0, listStore.scroll.y)
    const wrapper = tableRef.value?.$el.querySelector('.el-scrollbar__wrap')
    if (wrapper) { wrapper.scrollLeft = listStore.scroll.x; wrapper.scrollTop = listStore.scroll.bodyY || 0 }
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
        <el-form-item label="首次注册" class="enrollment-range"><QueryDateRange v-model="timeRange" /></el-form-item>
        <el-form-item class="query-actions"><el-button type="primary" @click="search"><UiIcon name="search" :size="16" />查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>
      </QueryPanel>
      <el-table ref="tableRef" :max-height="tableMaxHeight" :data="rows" row-key="userId" v-loading="loading" :empty-text="error ? '查询失败，请重试' : '暂无匹配的申请人'" :default-sort="{ prop: query.sortBy, order: query.sortOrder }" border @sort-change="changeSort">
        <template #empty><div class="applicant-empty"><span>{{ error ? '查询失败，请重试' : '暂无匹配的申请人' }}</span><el-button v-if="!error && appliedUserId" link type="primary" @click="viewEmptyLogs">按此 ID 查看请求日志</el-button></div></template>
        <el-table-column prop="userId" label="申请人 ID" min-width="105"><template #default="{ row }"><span class="applicant-id">{{ row.userId }}</span></template></el-table-column>
        <el-table-column label="人脸" width="80"><template #default="{ row }"><ApplicantListImages :records="row.records" feature="face" /></template></el-table-column>
        <el-table-column label="指纹" min-width="360"><template #default="{ row }"><ApplicantListImages :records="row.records" feature="finger" /></template></el-table-column>
        <el-table-column prop="enrolledAt" label="首次注册" min-width="190" sortable="custom" />
        <el-table-column prop="updatedAt" label="更新时间" min-width="190" sortable="custom"><template #default="{ row }">{{ row.updatedAt || '—' }}</template></el-table-column>
        <el-table-column label="操作" width="120" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row.userId)">查看详情</el-button></template></el-table-column>
      </el-table>
      <RecordsFooter :current-page="query.page" :page-size="query.pageSize" :total="total" :page-sizes="[2, 5, 20, 50]" @update:current-page="changePage" @update:page-size="changePageSize" />
    </el-card>
    <ApplicantDetailDrawer v-model="drawerVisible" :detail="detail" :loading="detailLoading" :error="detailError" @closed="closeDetail" @retry="openDetail(selectedUserId)" @change-log="viewChangeLogs" @opened="restoreDetailPosition" v-model:active-tab="listStore.detailContext.tab" />
  </div>
</template>
<style scoped>
.applicant-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 20px; line-height: 1.8; }
.query-error { margin-bottom: 12px; }
.applicant-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin-bottom: 0; }.applicant-filters > .el-form-item { width: 220px; margin: 0; }.applicant-filters > .enrollment-range { width: 410px; }.applicant-filters > .query-actions { width: auto; }.applicant-filters :deep(.el-form-item__label) { white-space: nowrap; }.applicant-filters :deep(.el-form-item__content) { min-width: 0; flex: 1; }
.applicant-filters :deep(.el-select),.applicant-filters :deep(.el-date-editor) { width: 100%; }
.applicant-filters > .applicant-id-filter { width: 260px; }
.applicant-id { font-family: ui-monospace,SFMono-Regular,Consolas,monospace; overflow-wrap: anywhere; font-weight: 600; }
@media(max-width:767px){.applicant-filters > .applicant-id-filter,.applicant-filters > .enrollment-range { width: 100%; }.applicant-filters > .el-form-item { width: 100%; }.applicants-page :deep(.el-table-fixed-column--right) { position: static !important; }.applicants-page :deep(.el-table-fixed-column--right::before) { display: none; }}
</style>
