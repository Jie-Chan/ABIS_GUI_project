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
import { requestDuration, formatLogTime, projectRequest, isRequestComplete } from '@/utils/log'
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
  PUBLICATION_LABEL, PUBLICATION_TYPE,
} from '@/constants/log'

const exporting = ref(false)
const now = ref(NaN)
const detailVisible = ref(false)
const detail = ref(null)
let clockTimer, refreshTimer
let serverEpoch = NaN, receivedMonotonic = 0, clockRunning = false
let calibrationPending = false

function tickClock() {
  if (clockRunning) now.value = serverEpoch + Math.max(0, performance.now() - receivedMonotonic)
}
function pauseClock() { tickClock(); clockRunning = false }

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
  pageSize: navigation.getPageSize('logs'),
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
const initialQuery = restored?.query ? { ...restored.query, pageSize: navigation.getPageSize('logs'), requestIds: [...restored.query.requestIds] } : emptyQuery(routeUserId())
if (restored?.query && restored.query.pageSize !== initialQuery.pageSize) initialQuery.page = 1
const { query, appliedQuery, timeRange, rows, total, metadata, loading, refreshing, error, load, refresh, search, resetQuery: resetAppliedQuery, changePage, changePageSize } = useAppliedQuery({
  initialQuery,
  async fetchPage(params) {
    // 已打开的详情可在翻页后继续读取，沿用列表接口而不改变当前查询。
    const requestId = detailVisible.value ? detail.value?.requestId : null
    const [page, selected] = await Promise.all([
      api.listLogs(params),
      requestId ? api.listLogs({ requestId, page: 1, pageSize: 1 }) : null,
    ])
    return { ...page, detailRequestId: requestId, detailItem: selected?.items[0] }
  },
  project: projectRequest, failureMessage: '查询调用日志失败', refreshFailureMessage: '日志数据暂未更新',
})
if (initialQuery.startTime || initialQuery.endTime) timeRange.value = [initialQuery.startTime, initialQuery.endTime]
const { tableRef, tableMaxHeight } = useRecordsTable(rows, { resetScroll: () => !refreshing.value })

watch(metadata, page => {
  serverEpoch = Date.parse(page.serverTime)
  receivedMonotonic = performance.now()
  now.value = serverEpoch
  clockRunning = Number.isFinite(serverEpoch) && !document.hidden && navigator.onLine !== false && !calibrationPending
  if (!Number.isFinite(serverEpoch)) error.value = '日志数据暂未更新：缺少有效的服务端时间'
  else if (navigator.onLine === false) error.value = '日志数据暂未更新：网络连接已断开'
  if (detailVisible.value && detail.value) {
    const selected = page.detailRequestId === detail.value.requestId ? page.detailItem : null
    const updated = selected || rows.value.find(row => row.requestId === detail.value.requestId)
    if (updated) detail.value = projectRequest(updated)
  }
}, { flush: 'sync' })
watch(error, value => { if (value) pauseClock() }, { flush: 'sync' })
watch(rows, async () => {
  if (!refreshing.value) return
  const snapshot = appliedQuery.value
  const body = tableRef.value?.$el.querySelector('.el-table__body-wrapper .el-scrollbar__wrap')
  const scroll = { x: body?.scrollLeft || 0, y: body?.scrollTop || 0 }
  await nextTick()
  if (loading.value || appliedQuery.value !== snapshot) return
  tableRef.value?.setScrollLeft(scroll.x)
  tableRef.value?.setScrollTop(scroll.y)
}, { flush: 'sync' })

const hasUnfinished = computed(() => rows.value.some(row => !isRequestComplete(row)) || (detailVisible.value && detail.value && !isRequestComplete(detail.value)))
async function refreshLive(force = false) {
  if (!active || document.hidden || navigator.onLine === false || !appliedQuery.value) return
  if (loading.value || refreshing.value) {
    if (force) calibrationPending = true
    return
  }
  if (!force && !calibrationPending && !hasUnfinished.value && !error.value) return
  calibrationPending = false
  await refresh()
}
function resumeLive() {
  pauseClock()
  calibrationPending = true
  refreshLive(true)
}
function visibilityChanged() {
  if (document.hidden) { pauseClock(); calibrationPending = true }
  else resumeLive()
}
function connectionLost() {
  pauseClock()
  calibrationPending = true
  error.value = '日志数据暂未更新：网络连接已断开'
}
watch([loading, refreshing], ([foreground, background]) => {
  if (!foreground && !background && calibrationPending) refreshLive(true)
})
const moreFilters = ref(false)
const compactMedia = window.matchMedia('(min-width:768px) and (max-width:1199px)')
const narrowMedia = window.matchMedia('(max-width:767px)')
const compactDesktop = ref(compactMedia.matches)
const narrowTable = ref(narrowMedia.matches)
const updateCompact = () => { compactDesktop.value = compactMedia.matches; narrowTable.value = narrowMedia.matches }
const additionalCount = computed(() => (compactDesktop.value ? ['api', 'feature'] : ['api', 'feature', 'result', 'publication']).filter(key => appliedQuery.value?.[key]).length)
async function resetQuery() {
  moreFilters.value = false
  await resetAppliedQuery({ ...emptyQuery(), pageSize: appliedQuery.value?.pageSize || navigation.getPageSize('logs'), userId: '', requestId: '', requestIds: [] })
}
async function changeSort({ order }) {
  if (!appliedQuery.value) return
  const sortOrder = order || appliedQuery.value.sortOrder
  if (sortOrder === appliedQuery.value.sortOrder) {
    if (!order) tableRef.value?.sort('receivedAt', sortOrder)
    return
  }
  await load({ ...appliedQuery.value, sortBy: 'receivedAt', sortOrder, page: 1 })
  tableRef.value?.sort('receivedAt', appliedQuery.value.sortOrder)
}
watch(appliedQuery, async snapshot => {
  if (!snapshot) return
  navigation.setPageSize('logs', snapshot.pageSize)
  query.value.sortBy = snapshot.sortBy
  query.value.sortOrder = snapshot.sortOrder
  await nextTick()
  tableRef.value?.sort('receivedAt', snapshot.sortOrder)
})
const columns = computed(() => {
  const all = {
    requestId: { label: '请求 ID', minWidth: compactDesktop.value ? 160 : 144 }, userId: { label: '申请人 ID', minWidth: 88 },
    api: { label: '接口类型', minWidth: 140 }, receivedAt: { label: '接收时间', minWidth: 180 },
    sourceIp: { label: '请求来源 IP', minWidth: 140 },
    result: { label: '执行状态', width: 106 }, publication: { label: '响应发布状态', width: 124 },
    duration: { label: '请求耗时', width: 160 },
  }
  const order = narrowTable.value
    ? ['requestId', 'result', 'publication', 'receivedAt', 'userId', 'api', 'sourceIp', 'duration']
    : compactDesktop.value
    ? ['requestId', 'receivedAt', 'result', 'publication', 'userId', 'api', 'sourceIp', 'duration']
    : ['requestId', 'userId', 'api', 'receivedAt', 'sourceIp', 'result', 'publication', 'duration']
  return order.map(key => ({ key, ...all[key] }))
})

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
  narrowMedia.addEventListener('change', updateCompact)
  document.addEventListener('visibilitychange', visibilityChanged)
  window.addEventListener('online', resumeLive)
  window.addEventListener('offline', connectionLost)
  clockTimer = setInterval(tickClock, 1000)
  refreshTimer = setInterval(() => refreshLive(), 5000)
  await load()
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  if (active && restored?.scroll) {
    tableRef.value?.setScrollLeft(restored.scroll.x)
    tableRef.value?.setScrollTop(restored.scroll.y)
  }
})
onBeforeUnmount(() => {
  active = false
  clearInterval(clockTimer)
  clearInterval(refreshTimer)
  document.removeEventListener('visibilitychange', visibilityChanged)
  window.removeEventListener('online', resumeLive)
  window.removeEventListener('offline', connectionLost)
  compactMedia.removeEventListener('change', updateCompact)
  narrowMedia.removeEventListener('change', updateCompact)
})
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

      <el-table ref="tableRef" :max-height="tableMaxHeight" :data="rows" row-key="id" class="request-table" v-loading="loading" :empty-text="error ? '查询失败，请重试' : '暂无匹配记录'" border scrollbar-always-on :scrollbar-tabindex="0" style="width: 100%" :default-sort="{ prop: 'receivedAt', order: initialQuery.sortOrder }" @sort-change="changeSort" @row-click="openDetail">
        <el-table-column v-for="column in columns" :key="column.key" :prop="column.key" :label="column.label" :min-width="column.minWidth" :width="column.width" :sortable="column.key === 'receivedAt' ? 'custom' : false" :sort-orders="['descending', 'ascending']">
          <template #default="{ row }">
            <span v-if="['requestId', 'userId'].includes(column.key)" class="log-id">{{ row[column.key] || '—' }}</span>
            <el-tooltip v-else-if="column.key === 'sourceIp'" :content="row.sourceIp || '—'" :disabled="!row.sourceIp" :trigger="['hover', 'focus']"><span class="log-id log-source-ip" :tabindex="row.sourceIp ? 0 : undefined">{{ row.sourceIp || '—' }}</span></el-tooltip>
            <el-tooltip v-else-if="column.key === 'api'" :content="row.operationLabel" :trigger="['hover', 'focus']"><span class="log-operation" tabindex="0">{{ row.operationLabel }}</span></el-tooltip>
            <template v-else-if="column.key === 'receivedAt'">{{ formatLogTime(row.receivedAt) }}</template>
            <el-tag v-else-if="column.key === 'result'" :type="resultTagType[row.result]">{{ resultLabel[row.result] }}</el-tag>
            <template v-else-if="column.key === 'publication'"><el-tag v-if="row.mode !== 'sync'" :type="PUBLICATION_TYPE[row.publication] || 'info'">{{ PUBLICATION_LABEL[row.publication] || '—' }}</el-tag><span v-else>—</span></template>
            <template v-else-if="column.key === 'duration'"><span class="duration-value">{{ requestDuration(row, now).text }}</span></template>
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
.log-source-ip,.log-operation { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.duration-value { display: block; white-space: nowrap; font-variant-numeric: tabular-nums; }
.request-table :deep(.el-table__row) { cursor: pointer; }
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
.request-table :deep(.cell) { padding-inline: 8px; overflow-wrap: anywhere; }.request-table :deep(.el-tag) { padding-inline: 6px; font-size: 12px; }
.request-table :deep(.el-scrollbar__bar.is-horizontal) { height: 10px; bottom: 0; background: #e7edf5; z-index: 4; }
.request-table :deep(.el-scrollbar__bar.is-horizontal .el-scrollbar__thumb) { background: #536784; opacity: .8; }
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
