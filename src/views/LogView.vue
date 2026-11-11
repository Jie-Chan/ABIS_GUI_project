<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { TIME_RANGE_SHORTCUTS } from '@/constants/timeRanges'
import { ElMessage } from 'element-plus'
import api from '@/api'
import UiIcon from '@/components/UiIcon.vue'
import RequestLogDrawer from '@/components/RequestLogDrawer.vue'
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
  LOG_FEATURE_LABEL,
  LOG_RESULT_LABEL,
  LOG_RESULT_TAG_TYPE,
  PUBLICATION_LABEL, PUBLICATION_TYPE, STAGE_LABEL,
} from '@/constants/log'

const loading = ref(false)
const exporting = ref(false)
const error = ref('')
const rows = ref([])
const total = ref(0)
let requestSequence = 0
const now = ref(Date.now())
let clockTimer
onBeforeUnmount(() => { requestSequence++; clearInterval(clockTimer) })

const route = useRoute()
function routeUserId() {
  const value = Array.isArray(route.query.userId) ? route.query.userId[0] : route.query.userId
  return typeof value === 'string' ? value.trim() : ''
}
const emptyQuery = (userId = '') => ({
  page: 1,
  pageSize: 20,
  startTime: '',
  endTime: '',
  userId,
  requestId: '',
  api: '',
  feature: '',
  result: '',
  minCost: null,
  maxCost: null,
})
const query = ref(emptyQuery(routeUserId()))

const timeRange = ref([])

const detailVisible = ref(false)
const detail = ref(null)

const resultTagType = LOG_RESULT_TAG_TYPE
const resultLabel = LOG_RESULT_LABEL
const featureLabel = LOG_FEATURE_LABEL

function syncTimeRange() {
  query.value.startTime = timeRange.value?.[0] || ''
  query.value.endTime = timeRange.value?.[1] || ''
}

function resetQuery() {
  timeRange.value = []
  query.value = emptyQuery()
  load()
}

function search() {
  query.value.page = 1
  return load()
}

function changePage(page) {
  if (page === query.value.page) return
  query.value.page = page
  return load()
}

function changePageSize(size) {
  query.value.pageSize = size
  return search()
}

async function load() {
  const requestId = ++requestSequence
  syncTimeRange()
  loading.value = true
  error.value = ''
  try {
    const result = await api.listLogs({ ...query.value })
    if (requestId !== requestSequence) return
    rows.value = result.items.map(projectRequest)
    total.value = result.total
  } catch (e) {
    if (requestId !== requestSequence) return
    rows.value = []
    query.value.page = 1
    total.value = 0
    detailVisible.value = false
    detail.value = null
    error.value = e.message || '查询调用日志失败'
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

function openDetail(row) {
  detail.value = row
  detailVisible.value = true
}

async function handleExport() {
  syncTimeRange()
  exporting.value = true
  try {
    const blob = await api.exportLogs(query.value)
    downloadBlob(blob, timestampedName('abis_api_logs'))
    ElMessage.success(EXPORT_STARTED_MESSAGE)
  } catch (e) {
    ElMessage.error(e.message || EXPORT_FAILED_MESSAGE)
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  load()
  clockTimer = setInterval(() => { now.value = Date.now() }, 1000)
})
watch(() => route.query.userId, () => {
  query.value = emptyQuery(routeUserId())
  timeRange.value = []
  load()
})
</script>

<template>
  <div class="records-page logs-page">
    <el-card>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        style="margin-bottom: 12px"
      />

      <el-form :inline="true" class="filters logs-filters" @submit.prevent="search">
        <el-form-item label="用户 ID" class="log-user-filter">
          <el-input v-model.trim="query.userId" clearable placeholder="输入完整申请人 ID" @keyup.enter="search">
            <template #prefix><UiIcon name="search" :size="16" /></template>
          </el-input>
        </el-form-item>
        <el-form-item label="请求 ID" class="log-request-filter">
          <el-input v-model.trim="query.requestId" clearable placeholder="输入完整业务请求 ID" @keyup.enter="search">
            <template #prefix><UiIcon name="search" :size="16" /></template>
          </el-input>
        </el-form-item>
        <el-form-item label="时间范围" class="log-time-filter">
          <el-date-picker
            v-model="timeRange"
            type="datetimerange"
            :shortcuts="TIME_RANGE_SHORTCUTS"
            value-format="YYYY-MM-DD HH:mm:ss"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
          />
        </el-form-item>
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
        <el-form-item label="总耗时区间(ms)" class="log-cost-filter">
          <el-input-number v-model="query.minCost" :min="0" :controls="false" placeholder="最小" style="width: 100px" />
          <span class="dash">—</span>
          <el-input-number v-model="query.maxCost" :min="0" :controls="false" placeholder="最大" style="width: 100px" />
        </el-form-item>
        <el-form-item class="log-actions">
          <el-button type="primary" @click="search"><UiIcon name="search" :size="16" />查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>

      <div class="results-toolbar">
        <span class="record-count" aria-live="polite">共 {{ total }} 个请求</span>
        <el-button :loading="exporting" @click="handleExport"><UiIcon name="download" :size="16" />导出 CSV</el-button>
      </div>

      <el-table :data="rows" row-key="id" class="request-table" v-loading="loading" :empty-text="error ? '查询失败，请重试' : '暂无匹配记录'" border style="width: 100%" @row-click="openDetail">
        <el-table-column prop="userId" label="用户 ID" min-width="110">
          <template #default="{ row }"><span class="log-id">{{ row.userId || '—' }}</span></template>
        </el-table-column>
        <el-table-column prop="requestId" label="请求 ID" min-width="210">
          <template #default="{ row }"><span class="log-id">{{ row.requestId || '—' }}</span><small class="request-scenario">{{ row.scenario }}</small></template>
        </el-table-column>
        <el-table-column label="接口类型" min-width="120">
          <template #default="{ row }">{{ row.api }}<small class="request-scenario">{{ row.mode === 'sync' ? '同步' : '异步' }} / {{ featureLabel[row.feature] }}</small></template>
        </el-table-column>
        <el-table-column label="接收时间" min-width="190"><template #default="{ row }">{{ formatLogTime(row.receivedAt) }}</template></el-table-column>
        <el-table-column label="当前阶段" min-width="165"><template #default="{ row }"><span :class="{ 'attention-stage': row.result === 'unknown' || row.result === 'failure' || row.publication === 'pending' }">{{ STAGE_LABEL[row.currentStage] || '—' }}</span><small class="request-scenario">{{ row.currentStage }}</small><small v-if="row.collectionDelayed" class="collection-hint">日志可能尚未齐全</small></template></el-table-column>
        <el-table-column label="执行状态" width="115">
          <template #default="{ row }">
            <el-tag :type="resultTagType[row.result]">{{ resultLabel[row.result] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="响应发布状态" width="135"><template #default="{ row }"><el-tag v-if="row.mode !== 'sync'" :type="PUBLICATION_TYPE[row.publication] || 'info'">{{ PUBLICATION_LABEL[row.publication] || '—' }}</el-tag><span v-else>—</span></template></el-table-column>
        <el-table-column label="请求耗时" width="120">
          <template #default="{ row }"><small class="request-scenario">{{ requestDuration(row, now).label }}</small>{{ requestDuration(row, now).text }}</template>
        </el-table-column>
        <el-table-column label="操作" width="70" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click.stop="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        :current-page="query.page"
        :page-size="query.pageSize"
        :total="total"
        :page-sizes="[5, 10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 12px; justify-content: flex-end"
        @update:current-page="changePage"
        @update:page-size="changePageSize"
      />

      <p class="note">
        每个逻辑请求展示一行，重投和重试记录可在详情中展开查看。总耗时筛选仅匹配已完成最终响应且耗时有效的请求，不含生物图像。
      </p>
    </el-card>

    <RequestLogDrawer v-model="detailVisible" :record="detail" :now="now" />
  </div>
</template>

<style scoped>
.log-id { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
.request-scenario { display: block; margin-top: 4px; color: var(--abis-muted); font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.request-table :deep(.el-table__row) { cursor: pointer; }
.attention-stage, .collection-hint { color: var(--el-color-warning); }
.collection-hint { display: block; font-size: 11px; }
.log-user-filter, .log-request-filter { width: 240px; }
@media (min-width: 1200px) {
  .log-user-filter, .log-request-filter { width: auto; }
}
@media (max-width: 767px) {
  .log-user-filter, .log-request-filter { width: 100%; }
  .logs-page :deep(.el-table-fixed-column--right) { position: static !important; }
  .logs-page :deep(.el-table-fixed-column--right::before) { display: none; }
}
.dash { margin: 0 8px; color: #8c99ac; }
.note { margin: 18px 0 0; color: #718096; font-size: 12px; line-height: 1.8; }
</style>
