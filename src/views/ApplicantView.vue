<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import api from '@/api'
import UiIcon from '@/components/UiIcon.vue'
import ApplicantDetailDrawer from '@/components/ApplicantDetailDrawer.vue'
import { TIME_RANGE_SHORTCUTS } from '@/constants/timeRanges'
import { emptyApplicantQuery, useApplicantListStore } from '@/stores/applicants'

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
async function openDetail(userId) {
  selectedUserId.value = userId; drawerVisible.value = true; detail.value = null; detailError.value = ''; detailLoading.value = true
  const sequence = ++detailSequence
  try { const result = await api.getApplicant(userId); if (sequence === detailSequence) detail.value = result }
  catch (e) { if (sequence === detailSequence) detailError.value = e.message || '读取申请人详情失败，请重试' }
  finally { if (sequence === detailSequence) detailLoading.value = false }
}
function closeDetail() { ++detailSequence; detail.value = null; detailError.value = ''; detailLoading.value = false }
function viewLogs(userId) { return router.push({ name: 'logs', query: { userId } }) }
function viewRecordLogs(record) { return router.push({ name: 'logs', query: { userId: record.userId, requestId: record.requestId } }) }
onBeforeRouteLeave(() => {
  listStore.scroll = { y: window.scrollY, x: tableRef.value?.$el.querySelector('.el-scrollbar__wrap')?.scrollLeft || 0, restore: true }
})
onMounted(async () => {
  await load(); await nextTick()
  if (listStore.scroll.restore) {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    window.scrollTo(0, listStore.scroll.y)
    const wrapper = tableRef.value?.$el.querySelector('.el-scrollbar__wrap')
    if (wrapper) wrapper.scrollLeft = listStore.scroll.x
    listStore.scroll.restore = false
  }
})
onBeforeUnmount(() => { ++listSequence; ++detailSequence })
</script>

<template>
  <div class="records-page applicants-page">
    <el-card>
      <el-alert v-if="error" :title="error" type="error" :closable="false" class="query-error" />
      <el-form :inline="true" class="applicant-filters" @submit.prevent="search">
        <el-form-item label="申请人 ID"><el-input v-model.trim="query.userId" clearable placeholder="输入完整申请人 ID" @keyup.enter="search"><template #prefix><UiIcon name="search" :size="16" /></template></el-input></el-form-item>
        <el-form-item label="入库模态"><el-select v-model="query.modality" aria-label="入库模态" placeholder="全部"><el-option label="全部" value="" /><el-option label="仅人脸" value="face" /><el-option label="仅指纹" value="finger" /><el-option label="人脸和指纹均已入库" value="both" /></el-select></el-form-item>
        <el-form-item label="首次入库时间" class="enrollment-range"><el-date-picker v-model="timeRange" type="datetimerange" value-format="YYYY-MM-DD HH:mm:ss" :shortcuts="TIME_RANGE_SHORTCUTS" start-placeholder="开始时间" end-placeholder="结束时间" /></el-form-item>
        <el-form-item class="query-actions"><el-button type="primary" @click="search"><UiIcon name="search" :size="16" />查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>
      <div class="results-toolbar"><span class="record-count" aria-live="polite">共 {{ total }} 位申请人</span><span class="population-note">仅展示已确认注册成功且当前有效的申请人</span></div>
      <el-table ref="tableRef" :data="rows" row-key="userId" v-loading="loading" :empty-text="error ? '查询失败，请重试' : '暂无匹配的申请人'" :default-sort="{ prop: query.sortBy, order: query.sortOrder }" border @sort-change="changeSort">
        <el-table-column prop="userId" label="申请人 ID" min-width="150"><template #default="{ row }"><span class="applicant-id">{{ row.userId }}</span></template></el-table-column>
        <el-table-column label="人脸入库" min-width="140"><template #default="{ row }"><el-tag :type="row.faceCount ? 'success' : 'info'">{{ row.faceCount ? `已入库 · ${row.faceCount} 条` : '未入库' }}</el-tag></template></el-table-column>
        <el-table-column label="指纹入库" min-width="140"><template #default="{ row }"><el-tag :type="row.fingerCount ? 'success' : 'info'">{{ row.fingerCount ? `已入库 · ${row.fingerCount} 条` : '未入库' }}</el-tag></template></el-table-column>
        <el-table-column prop="enrolledAt" label="首次入库时间" min-width="205" sortable="custom" />
        <el-table-column prop="updatedAt" label="最近更新时间" min-width="205" sortable="custom" />
        <el-table-column label="操作" width="180" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openDetail(row.userId)">查看详情</el-button><el-button link type="primary" @click="viewLogs(row.userId)">查看日志</el-button></template></el-table-column>
      </el-table>
      <el-pagination :current-page="query.page" :page-size="query.pageSize" :total="total" :page-sizes="[2, 5, 20, 50]" layout="total, sizes, prev, pager, next" class="applicant-pagination" @update:current-page="changePage" @update:page-size="changePageSize" />
      <p class="note">当前入库状态与请求日志共用业务数据，查重和失败请求不改变有效记录。删除成功的人员仅保留历史日志。</p>
    </el-card>
    <ApplicantDetailDrawer v-model="drawerVisible" :detail="detail" :loading="detailLoading" :error="detailError" @closed="closeDetail" @retry="openDetail(selectedUserId)" @record-log="viewRecordLogs" />
  </div>
</template>
<style scoped>
.query-error { margin-bottom: 12px; }
.applicant-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin-bottom: 14px; }.applicant-filters > .el-form-item { width: 220px; margin: 0; }.applicant-filters > .enrollment-range { width: 410px; }.applicant-filters > .query-actions { width: auto; }.applicant-filters :deep(.el-form-item__label) { white-space: nowrap; }.applicant-filters :deep(.el-form-item__content) { min-width: 0; flex: 1; }
.applicant-filters :deep(.el-select),.applicant-filters :deep(.el-date-editor) { width: 100%; }
.applicant-pagination { margin-top: 12px; justify-content: flex-end; }.applicant-id { font-family: ui-monospace,SFMono-Regular,Consolas,monospace; overflow-wrap: anywhere; font-weight: 600; }
.population-note { color: var(--el-text-color-secondary); font-size: 12px; }
@media(max-width:767px){.applicant-filters > .el-form-item { width: 100%; }.applicants-page :deep(.el-table-fixed-column--right) { position: static !important; }.applicants-page :deep(.el-table-fixed-column--right::before) { display: none; }}
</style>
