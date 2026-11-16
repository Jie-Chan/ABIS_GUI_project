<script setup>
import { useRecordsTable } from '@/composables/useRecordsTable'
import QueryPanel from '@/components/QueryPanel.vue'
import RecordsFooter from '@/components/RecordsFooter.vue'
import { computed, ref, onMounted } from 'vue'
import QueryDateRange from '@/components/QueryDateRange.vue'
import { useAppliedQuery } from '@/composables/useAppliedQuery'
import { ElMessage } from 'element-plus'
import api from '@/api'
import {
  downloadBlob,
  timestampedName,
  EXPORT_STARTED_MESSAGE,
  EXPORT_FAILED_MESSAGE,
} from '@/utils/csv'
import { AUDIT_ACTION, AUDIT_ACTIONS } from '@/constants/audit'

const exporting = ref(false)
const { query, appliedQuery, timeRange, rows, total, loading, error, load, search, resetQuery: resetAppliedQuery, changePage, changePageSize } = useAppliedQuery({
  initialQuery: { page: 1, pageSize: 20, operator: '', action: '', result: '' }, fetchPage: params => api.listAudits(params), failureMessage: '查询审计记录失败',
})
const { tableRef, tableMaxHeight } = useRecordsTable(rows)
function resetQuery() { return resetAppliedQuery() }

const detailVisible = ref(false)
const detail = ref(null)
const detailShowsChanges = computed(() => [
  AUDIT_ACTION.UPDATE_THRESHOLD,
  AUDIT_ACTION.CREATE_ACCOUNT,
  AUDIT_ACTION.DISABLE_ACCOUNT,
].includes(detail.value?.action))

function detailValue(value) {
  return value === undefined || value === null || value === '' ? '—' : value
}

const resultTagType = { 成功: 'success', 失败: 'danger' }

function openDetail(row) {
  detail.value = row
  detailVisible.value = true
}

async function handleExport() {
  exporting.value = true
  try {
    const blob = await api.exportAudits({ ...appliedQuery.value })
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
  <div class="records-page audit-page">
    <el-card>
      <QueryPanel>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        style="margin-bottom: 12px"
      />

      <el-form :inline="true" class="audits-filters query-filters" @submit.prevent="search">
        <el-form-item label="时间范围" class="audit-time">
          <QueryDateRange v-model="timeRange" />
        </el-form-item>
        <el-form-item label="操作人">
          <el-input v-model="query.operator" clearable placeholder="输入完整账号" style="width: 140px" @keyup.enter="search" />
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="query.action" clearable placeholder="全部" style="width: 130px">
            <el-option v-for="a in AUDIT_ACTIONS" :key="a" :label="a" :value="a" />
          </el-select>
        </el-form-item>
        <el-form-item label="结果">
          <el-select v-model="query.result" clearable placeholder="全部" style="width: 80px">
            <el-option label="成功" value="成功" />
            <el-option label="失败" value="失败" />
          </el-select>
        </el-form-item>
        <el-form-item class="audit-actions">
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
        </el-form-item>
      </el-form>
      </QueryPanel>

      <el-table ref="tableRef" :max-height="tableMaxHeight" :data="rows" v-loading="loading" :empty-text="error ? '查询失败，请重试' : '暂无匹配记录'" border style="width: 100%">
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

      <RecordsFooter
        :current-page="appliedQuery?.page || 1"
        :page-size="appliedQuery?.pageSize || 20"
        :total="total"
        :page-sizes="[20, 50, 100]"
        @update:current-page="changePage"
        @update:page-size="changePageSize"
      >
        <el-button :loading="exporting" :disabled="!appliedQuery" @click="handleExport">导出 CSV</el-button>
      </RecordsFooter>

    </el-card>

    <el-dialog v-model="detailVisible" title="审计记录详情" width="640px">
      <el-descriptions v-if="detail" class="audit-detail" :column="2" border>
        <el-descriptions-item label="时间" :span="2">{{ detailValue(detail.operatedAt) }}</el-descriptions-item>
        <el-descriptions-item label="操作人" :span="2">{{ detailValue(detail.operator) }}</el-descriptions-item>
        <el-descriptions-item label="角色" :span="2">{{ detailValue(detail.roleLabel) }}</el-descriptions-item>
        <el-descriptions-item label="操作类型" :span="2">{{ detailValue(detail.action) }}</el-descriptions-item>
        <el-descriptions-item label="操作对象" :span="2">{{ detailValue(detail.target) }}</el-descriptions-item>
        <el-descriptions-item v-if="detailShowsChanges" label="变更前值">{{ detailValue(detail.beforeValue) }}</el-descriptions-item>
        <el-descriptions-item v-if="detailShowsChanges" label="变更后值">{{ detailValue(detail.afterValue) }}</el-descriptions-item>
        <el-descriptions-item label="结果" :span="2">{{ detailValue(detail.result) }}</el-descriptions-item>
        <el-descriptions-item label="来源 IP" :span="2">{{ detailValue(detail.sourceIp) }}</el-descriptions-item>
        <el-descriptions-item label="会话 ID" :span="2">{{ detailValue(detail.sessionId) }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<style scoped>
.audit-detail :deep(.el-descriptions__content) { overflow-wrap: anywhere; white-space: pre-wrap; }
.audits-filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin-bottom: 0; }.audits-filters > .el-form-item { margin: 0; min-width: 0; }.audits-filters .audit-time { flex: 0 0 auto; width: 464px; }.audits-filters :deep(.el-form-item__label) { padding-right: 8px; white-space: nowrap; }.audits-filters :deep(.el-form-item__content) { min-width: 0; flex: 1; }.audits-filters :deep(.el-date-editor) { width: 100%; min-width: 0; }
@media (max-width: 767px) {
  .audits-filters .audit-time { flex-basis: auto; width: 100%; }
  .audits-filters > .el-form-item { width: 100%; }
  .audits-filters :deep(.el-form-item__label) { width: 72px; flex: 0 0 72px; }
  .audits-filters .audit-actions { padding-left: 72px; }
  .audits-filters :deep(.el-input), .audits-filters :deep(.el-select) { width: 100% !important; }
}

</style>
