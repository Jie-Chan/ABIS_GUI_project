<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { TIME_RANGE_SHORTCUTS } from '@/constants/timeRanges'
import { ElMessage } from 'element-plus'
import api from '@/api'
import {
  downloadBlob,
  timestampedName,
  EXPORT_STARTED_MESSAGE,
  EXPORT_FAILED_MESSAGE,
} from '@/utils/csv'
import { AUDIT_ACTIONS } from '@/constants/audit'

const loading = ref(false)
const exporting = ref(false)
const error = ref('')
const rows = ref([])
const total = ref(0)
let requestSequence = 0
onBeforeUnmount(() => { requestSequence++ })

const query = ref({ page: 1, pageSize: 20, operator: '', action: '', result: '' })
const timeRange = ref([])

const detailVisible = ref(false)
const detail = ref(null)

const resultTagType = { 成功: 'success', 失败: 'danger' }

function syncTimeRange() {
  query.value.startTime = timeRange.value?.[0] || ''
  query.value.endTime = timeRange.value?.[1] || ''
}

function resetQuery() {
  timeRange.value = []
  query.value = { page: 1, pageSize: 20, operator: '', action: '', result: '' }
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
    const result = await api.listAudits({ ...query.value })
    if (requestId !== requestSequence) return
    rows.value = result.items
    total.value = result.total
  } catch (e) {
    if (requestId !== requestSequence) return
    rows.value = []
    query.value.page = 1
    total.value = 0
    detailVisible.value = false
    detail.value = null
    error.value = e.message || '查询审计记录失败'
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
    const blob = await api.exportAudits(query.value)
    downloadBlob(blob, timestampedName('abis_audit'))
    ElMessage.success(EXPORT_STARTED_MESSAGE)
  } catch (e) {
    ElMessage.error(e.message || EXPORT_FAILED_MESSAGE)
  } finally {
    exporting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="records-page">
    <el-card>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        style="margin-bottom: 12px"
      />

      <el-form :inline="true" class="filters audits-filters">
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="timeRange"
            type="datetimerange"
            :shortcuts="TIME_RANGE_SHORTCUTS"
            value-format="YYYY-MM-DD HH:mm:ss"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
          />
        </el-form-item>
        <el-form-item label="操作人">
          <el-input v-model="query.operator" clearable placeholder="全部" style="width: 150px" />
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="query.action" clearable placeholder="全部" style="width: 160px">
            <el-option v-for="a in AUDIT_ACTIONS" :key="a" :label="a" :value="a" />
          </el-select>
        </el-form-item>
        <el-form-item label="结果">
          <el-select v-model="query.result" clearable placeholder="全部" style="width: 110px">
            <el-option label="成功" value="成功" />
            <el-option label="失败" value="失败" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>

      <div class="results-toolbar">
        <span class="record-count" aria-live="polite">共 {{ total }} 条审计记录</span>
        <el-button :loading="exporting" @click="handleExport">导出 CSV</el-button>
      </div>

      <el-table :data="rows" v-loading="loading" :empty-text="error ? '查询失败，请重试' : '暂无匹配记录'" border style="width: 100%">
        <el-table-column prop="operatedAt" label="时间" width="180" />
        <el-table-column prop="operator" label="操作人" width="130" />
        <el-table-column prop="roleLabel" label="角色" width="100" />
        <el-table-column prop="action" label="操作类型" width="130" />
        <el-table-column prop="target" label="操作对象" min-width="180" />
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="resultTagType[row.result]">{{ row.result }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sourceIp" label="来源 IP" width="130" />
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        :current-page="query.page"
        :page-size="query.pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 12px; justify-content: flex-end"
        @update:current-page="changePage"
        @update:page-size="changePageSize"
      />

      <p class="note">
        审计记录仅供查询和导出。
      </p>
    </el-card>

    <el-dialog v-model="detailVisible" title="审计记录详情" width="640px">
      <el-descriptions v-if="detail" :column="1" border>
        <el-descriptions-item label="时间">{{ detail.operatedAt }}</el-descriptions-item>
        <el-descriptions-item label="操作人">{{ detail.operator }}</el-descriptions-item>
        <el-descriptions-item label="角色">{{ detail.roleLabel }}</el-descriptions-item>
        <el-descriptions-item label="操作类型">{{ detail.action }}</el-descriptions-item>
        <el-descriptions-item label="操作对象">{{ detail.target }}</el-descriptions-item>
        <el-descriptions-item label="变更前值">{{ detail.beforeValue || '—' }}</el-descriptions-item>
        <el-descriptions-item label="变更后值">{{ detail.afterValue || '—' }}</el-descriptions-item>
        <el-descriptions-item label="结果">{{ detail.result }}</el-descriptions-item>
        <el-descriptions-item label="来源 IP">{{ detail.sourceIp }}</el-descriptions-item>
        <el-descriptions-item label="会话 ID">{{ detail.sessionId }}</el-descriptions-item>
      </el-descriptions>
      <p class="note">变更前值、变更后值仅变更类操作填写。</p>
    </el-dialog>
  </div>
</template>

<style scoped>
.note { margin: 18px 0 0; color: #718096; font-size: 12px; line-height: 1.8; }
</style>
