<script setup>
import { useRecordsTable } from '@/composables/useRecordsTable'
import QueryPanel from '@/components/QueryPanel.vue'
import RecordsFooter from '@/components/RecordsFooter.vue'
import { useApplicantListStore } from '@/stores/applicants'
import { useNavigationStore } from '@/stores/navigation'
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import QueryDateRange from '@/components/QueryDateRange.vue'
import { useAppliedQuery } from '@/composables/useAppliedQuery'
import { ElMessage } from 'element-plus'
import api from '@/api'
import UiIcon from '@/components/UiIcon.vue'
import RequestLogDrawer from '@/components/RequestLogDrawer.vue'
import LogTimeSort from '@/components/LogTimeSort.vue'
import { requestDuration, formatLogTime, projectRequest } from '@/utils/log'
import {
  downloadBlob,
  timestampedName,
  EXPORT_STARTED_MESSAGE,
  EXPORT_FAILED_MESSAGE,
} from '@/utils/csv'
import {
  LOG_APIS,
  LOG_FEATURES,
  LOG_RESULTS,
  LOG_RESULT_LABEL,
  LOG_RESULT_TAG_TYPE,
  PUBLICATION_LABEL, PUBLICATION_TYPE, STAGE_LABEL,
} from '@/constants/log'

const exporting = ref(false)
const now = ref(Date.now())
let clockTimer
onBeforeUnmount(() => clearInterval(clockTimer))

const route = useRoute()
const router = useRouter()
const applicants = useApplicantListStore()
const navigation = useNavigationStore()
const canReturnToApplicant = computed(() => route.query.returnTo === 'applicants' && applicants.detailContext.restore && !!applicants.detailContext.userId)
function routeUserId() {
  const value = Array.isArray(route.query.userId) ? route.query.userId[0] : route.query.userId
  return typeof value === 'string' ? value.trim() : ''
}
function routeRequestIds() { const value = route.query.requestIds; return [...new Set((Array.isArray(value) ? value : value ? [value] : []).filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))] }
function routeRequestId() { const value = route.query.requestId; return typeof value === 'string' ? value.trim() : '' }
const emptyQuery = (userId = '') => ({
  page: 1,
  pageSize: 20,
  startTime: '',
  endTime: '',
  userId,
  requestId: routeRequestId(),
  api: '',
  feature: '',
  result: '',
  publication: '',
  sortBy: 'receivedAt',
  sortOrder: 'descending',
  requestIds: routeRequestIds(),
})
const hasRouteQuery = () => !!(routeUserId() || routeRequestId() || routeRequestIds().length)
const restored = !hasRouteQuery() && navigation.logs
const initialQuery = restored?.query ? { ...restored.query, requestIds: [...restored.query.requestIds] } : emptyQuery(routeUserId())
const { query, appliedQuery, timeRange, rows, total, loading, error, load, search, resetQuery: resetAppliedQuery, changePage, changePageSize } = useAppliedQuery({
  initialQuery, fetchPage: params => api.listLogs(params), project: projectRequest, failureMessage: '查询调用日志失败',
})
if (initialQuery.startTime || initialQuery.endTime) timeRange.value = [initialQuery.startTime, initialQuery.endTime]
const { tableRef, tableMaxHeight } = useRecordsTable(rows)
const moreFilters = ref(false)
const compactMedia = window.matchMedia('(min-width:768px) and (max-width:1199px)')
const compactDesktop = ref(compactMedia.matches)
const updateCompact = () => { compactDesktop.value = compactMedia.matches }
const additionalCount = computed(() => (compactDesktop.value ? ['api', 'feature'] : ['api', 'feature', 'result', 'publication']).filter(key => appliedQuery.value?.[key]).length)
async function resetQuery() {
  moreFilters.value = false
  await resetAppliedQuery({ ...emptyQuery(), userId: '', requestId: '', requestIds: [] })
}
async function changeSort({ order }) {
  if (!appliedQuery.value) return
  const sortOrder = order === 'ascending' ? 'ascending' : 'descending'
  if (sortOrder === appliedQuery.value.sortOrder) return
  await load({ ...appliedQuery.value, sortBy: 'receivedAt', sortOrder, page: 1 })
  tableRef.value?.sort('receivedAt', appliedQuery.value.sortOrder)
}
watch(appliedQuery, async snapshot => {
  if (!snapshot) return
  query.value.sortBy = snapshot.sortBy
  query.value.sortOrder = snapshot.sortOrder
  await nextTick()
  tableRef.value?.sort('receivedAt', snapshot.sortOrder)
})
const columns = computed(() => {
  const all = {
    requestId: { label: '请求 ID', minWidth: 160 }, userId: { label: '申请人 ID', minWidth: 96 },
    api: { label: '接口类型', minWidth: 96 }, receivedAt: { label: '接收时间', minWidth: 180 },
    sourceIp: { label: '请求来源 IP', minWidth: 112 }, currentStage: { label: '处理环节', minWidth: 125 },
    result: { label: '执行状态', width: 110 }, publication: { label: '响应发布状态', width: 128 },
    duration: { label: '请求耗时', width: 90 },
  }
  const order = compactDesktop.value
    ? ['requestId', 'receivedAt', 'result', 'publication', 'userId', 'api', 'sourceIp', 'currentStage', 'duration']
    : ['requestId', 'userId', 'api', 'receivedAt', 'sourceIp', 'currentStage', 'result', 'publication', 'duration']
  return order.map(key => ({ key, ...all[key] }))
})

const detailVisible = ref(false)
const detail = ref(null)

const resultTagType = LOG_RESULT_TAG_TYPE
const resultLabel = LOG_RESULT_LABEL

function openDetail(row) {
  detail.value = row
  detailVisible.value = true
}

async function handleExport() {
  exporting.value = true
  try {
    const blob = await api.exportLogs({ ...appliedQuery.value })
    downloadBlob(blob, timestampedName('abis_api_logs'))
    ElMessage.success(EXPORT_STARTED_MESSAGE)
  } catch (e) {
    ElMessage.error(e.message || EXPORT_FAILED_MESSAGE)
  } finally {
    exporting.value = false
  }
}

let active = true
onBeforeRouteLeave(() => {
  if (appliedQuery.value) {
    const body = tableRef.value?.$el.querySelector('.el-table__body-wrapper .el-scrollbar__wrap')
    navigation.logs = { query: { ...appliedQuery.value, requestIds: [...appliedQuery.value.requestIds] }, scroll: { x: body?.scrollLeft || 0, y: body?.scrollTop || 0 } }
  }
})
onMounted(async () => {
  compactMedia.addEventListener('change', updateCompact)
  clockTimer = setInterval(() => { now.value = Date.now() }, 1000)
  await load()
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  if (active && restored?.scroll) {
    tableRef.value?.setScrollLeft(restored.scroll.x)
    tableRef.value?.setScrollTop(restored.scroll.y)
  }
})
onBeforeUnmount(() => { active = false; compactMedia.removeEventListener('change', updateCompact) })
watch(() => [route.query.userId, route.query.requestId, route.query.requestIds], () => {
  query.value = emptyQuery(routeUserId())
  timeRange.value = []
  load()
})
</script>

<template>
  <div class="records-page logs-page">
    <el-card>
      <QueryPanel>
      <el-button v-if="canReturnToApplicant" class="return-applicant" link type="primary" @click="router.push({ name: 'applicants' })">返回申请人详情</el-button>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        style="margin-bottom: 12px"
      />

      <div v-if="query.requestIds.length" class="log-scope"><span>当前显示本次入库变更关联的请求</span><el-button link type="primary" @click="query.requestIds = []; search()">查看该申请人全部日志</el-button></div>
      <el-form :inline="true" class="logs-filters query-filters" @submit.prevent="search">
        <div class="filter-row filter-row--primary">
        <el-form-item label="请求 ID" class="log-request-filter">
          <el-input v-model.trim="query.requestId" clearable placeholder="输入完整业务请求 ID" @keyup.enter="search" />
        </el-form-item>
        <el-form-item label="申请人 ID" class="log-user-filter">
          <el-input v-model.trim="query.userId" clearable placeholder="输入完整申请人 ID" @keyup.enter="search">
            <template #prefix><UiIcon name="search" :size="16" /></template>
          </el-input>
        </el-form-item>
        <el-form-item label="时间范围" class="log-time-filter">
          <QueryDateRange v-model="timeRange" />
        </el-form-item>

        </div>
        <el-button class="more-filters" link type="primary" :aria-expanded="moreFilters" @click="moreFilters = !moreFilters">{{ moreFilters ? '收起筛选' : '更多筛选' }}{{ additionalCount ? `（${additionalCount}）` : '' }}</el-button>
        <div class="filter-row filter-row--secondary" :class="{ 'is-expanded': moreFilters }">
        <el-form-item label="接口类型" class="log-api-filter">
          <el-select v-model="query.api" clearable placeholder="全部" style="width: 240px">
            <el-option v-for="a in LOG_APIS" :key="a.key" :label="a.label" :value="a.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="生物模态" class="log-feature-filter">
          <el-select v-model="query.feature" clearable placeholder="全部" style="width: 120px">
            <el-option v-for="f in LOG_FEATURES" :key="f.key" :label="f.label" :value="f.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="执行状态" class="log-result-filter">
          <el-select v-model="query.result" clearable placeholder="全部" style="width: 120px">
            <el-option v-for="r in LOG_RESULTS" :key="r.key" :label="r.label" :value="r.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="响应发布状态" class="log-publication-filter">
          <el-select v-model="query.publication" clearable placeholder="全部">
            <el-option v-for="key in ['published', 'pending', 'none']" :key="key" :value="key" :label="PUBLICATION_LABEL[key]" />
          </el-select>
        </el-form-item>
        </div>
        <el-form-item class="log-actions">
          <el-button type="primary" @click="search"><UiIcon name="search" :size="16" />查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
      </QueryPanel>

      <el-table ref="tableRef" :max-height="tableMaxHeight" :data="rows" row-key="id" class="request-table" v-loading="loading" :empty-text="error ? '查询失败，请重试' : '暂无匹配记录'" border style="width: 100%" :default-sort="{ prop: 'receivedAt', order: initialQuery.sortOrder }" :header-cell-class-name="({ column }) => column.property === 'receivedAt' ? 'noclick' : ''" @sort-change="changeSort" @row-click="openDetail">
        <el-table-column v-for="column in columns" :key="column.key" :prop="column.key" :label="column.label" :min-width="column.minWidth" :width="column.width" :sortable="column.key === 'receivedAt' ? 'custom' : false" :sort-orders="['descending', 'ascending']">
          <template #header>
            <LogTimeSort v-if="column.key === 'receivedAt'" :order="appliedQuery?.sortOrder || initialQuery.sortOrder" @change="order => changeSort({ order })" />
            <template v-else>{{ column.label }}</template>
          </template>
          <template #default="{ row }">
            <span v-if="['requestId', 'userId', 'sourceIp'].includes(column.key)" class="log-id">{{ row[column.key] || '—' }}</span>
            <template v-else-if="column.key === 'api'">{{ row.operationLabel }}</template>
            <template v-else-if="column.key === 'receivedAt'">{{ formatLogTime(row.receivedAt) }}</template>
            <template v-else-if="column.key === 'currentStage'"><span :class="{ 'attention-stage': row.result === 'unknown' || row.result === 'failure' || row.publication === 'pending' }">{{ STAGE_LABEL[row.currentStage] || '—' }}</span><small v-if="row.collectionDelayed" class="collection-hint">日志可能尚未齐全</small></template>
            <el-tag v-else-if="column.key === 'result'" :type="resultTagType[row.result]">{{ resultLabel[row.result] }}</el-tag>
            <template v-else-if="column.key === 'publication'"><el-tag v-if="row.mode !== 'sync'" :type="PUBLICATION_TYPE[row.publication] || 'info'">{{ PUBLICATION_LABEL[row.publication] || '—' }}</el-tag><span v-else>—</span></template>
            <template v-else-if="column.key === 'duration'"><small v-if="requestDuration(row, now).label === '已用时'" class="duration-label">已用时</small><span class="duration-value">{{ requestDuration(row, now).text }}</span></template>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="64" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <RecordsFooter
        :current-page="appliedQuery?.page || 1"
        :page-size="appliedQuery?.pageSize || 20"
        :total="total"
        :page-sizes="[5, 10, 20, 50, 100]"
        @update:current-page="changePage"
        @update:page-size="changePageSize"
      >
        <el-tooltip content="导出当前查询的全部日志字段"><el-button :loading="exporting" :disabled="!appliedQuery" @click="handleExport"><UiIcon name="download" :size="16" />导出 CSV</el-button></el-tooltip>
      </RecordsFooter>

    </el-card>

    <RequestLogDrawer v-model="detailVisible" :record="detail" :now="now" />
  </div>
</template>

<style scoped>
.return-applicant { margin-bottom: 8px; }
.log-id { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
.duration-label { display: block; color: var(--abis-muted); font-size: 11px; line-height: 1.6; }
.duration-value { white-space: nowrap; }
.request-table :deep(.el-table__row) { cursor: pointer; }
.attention-stage, .collection-hint { color: var(--el-color-warning); }
.collection-hint { display: block; font-size: 11px; }
.request-table :deep(.caret-wrapper) { display: none; }
.logs-filters { display: grid; grid-template-columns: minmax(242px,1.1fr) minmax(260px,1.1fr) minmax(200px,.9fr) minmax(220px,1fr) auto; gap: 8px 10px; margin-bottom: 0; }
.filter-row { display: contents; }
.more-filters { display: none; }
.log-request-filter { grid-column: 1; grid-row: 1; }.log-user-filter { grid-column: 2; grid-row: 1; }.log-time-filter { grid-column: 3 / 5; grid-row: 1; }
.log-api-filter { grid-column: 1; grid-row: 2; }.log-feature-filter { grid-column: 2; grid-row: 2; }.log-result-filter { grid-column: 3; grid-row: 2; }.log-publication-filter { grid-column: 4; grid-row: 2; }.log-actions { grid-column: 5; grid-row: 2; justify-self: end; }
.logs-filters :deep(.el-form-item) { display: flex; align-items: center; margin: 0; min-width: 0; }
.logs-filters :deep(.el-form-item__label) { width: 64px; flex-shrink: 0; padding: 0 6px 0 0; justify-content: flex-start; line-height: 36px; height: 36px; white-space: nowrap; font-size: 13px; }
.logs-filters .log-user-filter :deep(.el-form-item__label),.logs-filters .log-feature-filter :deep(.el-form-item__label) { width: 76px; }
.logs-filters .log-publication-filter :deep(.el-form-item__label) { width: 90px; }
.logs-filters :deep(.el-form-item__content) { min-width: 0; flex: 1; }
.logs-filters :deep(.el-date-editor) { width: 100%; min-width: 0; }
.logs-filters :deep(.el-select) { width: 100% !important; }
.log-scope { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; margin-bottom: 0; font-size: 13px; color: var(--abis-muted); }
.request-table :deep(.cell) { padding-inline: 10px; overflow-wrap: anywhere; }.request-table :deep(.el-tag) { padding-inline: 6px; font-size: 12px; }
@media(min-width:768px) and (max-width:1199px) {
 .logs-filters { grid-template-columns: minmax(0,1fr) minmax(0,1fr) auto; }
 .filter-row--primary { display: contents; }
 .log-request-filter { grid-column: 1; grid-row: 1; }.log-user-filter { grid-column: 2; grid-row: 1; }
 .log-time-filter { grid-column: 1 / 3; grid-row: 2; }
 .more-filters { display: inline-flex; grid-column: 3; grid-row: 1; justify-self: end; }
 .logs-filters .log-api-filter,.logs-filters .log-feature-filter { display: none; }
 .filter-row--secondary.is-expanded .log-api-filter { display: flex; grid-column: 1; grid-row: 4; }
 .filter-row--secondary.is-expanded .log-feature-filter { display: flex; grid-column: 2 / 4; grid-row: 4; }
 .log-result-filter { grid-column: 1; grid-row: 3; }.log-publication-filter { grid-column: 2 / 4; grid-row: 3; }
 .logs-filters .log-publication-filter :deep(.el-select) { max-width: 160px; }
 .log-actions { grid-column: 3; grid-row: 2; }
}
@media(max-width:767px) {
 .logs-filters { grid-template-columns: minmax(0,1fr) auto; gap: 8px; }.filter-row--primary { display: contents; }
 .logs-filters :deep(.el-form-item) { grid-column: 1 / -1; grid-row: auto; }
 .more-filters { display: inline-flex; grid-column: 1; grid-row: 4; justify-self: start; }
 .logs-filters .log-actions { grid-column: 2; justify-self: end; grid-row: 4; }
 .filter-row--secondary { display: none; }.filter-row--secondary.is-expanded { display: grid; grid-column: 1 / -1; grid-row: 5; gap: 8px; }
 .logs-filters :deep(.el-form-item__label),.logs-filters .log-user-filter :deep(.el-form-item__label),.logs-filters .log-feature-filter :deep(.el-form-item__label),.logs-filters .log-publication-filter :deep(.el-form-item__label) { width: 90px; }
 .logs-page :deep(.el-table-fixed-column--right) { position: static !important; }.logs-page :deep(.el-table-fixed-column--right::before) { display: none; }
}
@media(min-width:768px) and (max-width:959px) {
 .logs-filters { grid-template-columns: repeat(2,minmax(0,1fr)); }
 .log-time-filter,.log-result-filter { grid-column: 1 / -1; }
 .log-publication-filter { grid-column: 1; grid-row: 4; }
 .more-filters { grid-column: 1; grid-row: 5; justify-self: start; }
 .log-actions { grid-column: 2; grid-row: 5; }
 .filter-row--secondary.is-expanded .log-api-filter { grid-column: 1; grid-row: 6; }
 .filter-row--secondary.is-expanded .log-feature-filter { grid-column: 2; grid-row: 6; }
}
.dash { margin: 0 8px; color: #8c99ac; }
</style>
