<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import api, { apiMode } from '@/api'
import {
  downloadBlob,
  timestampedName,
  EXPORT_STARTED_MESSAGE,
  EXPORT_FAILED_MESSAGE,
} from '@/utils/csv'
import { AUDIT_ACTIONS } from '@/constants/audit'

// ⚠ 页面 / 卡片标题**从 `route.meta.title` 取，不要在本文件里再写一遍字面量**。
//   Global Constraints 第 2 条禁止同一句文案在多个文件里重复；
//   导航标签、路由 `meta.title`、页头本来就走同一处来源
//   （Task 11 会把它们进一步收成 `src/constants/nav.js`）。
const route = useRoute()
const title = computed(() => route.meta.title || '')
const loading = ref(false)
const exporting = ref(false)
const error = ref('')
const rows = ref([])
const total = ref(0)

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

async function load() {
  syncTimeRange()
  loading.value = true
  error.value = ''
  try {
    const result = await api.listAudits(query.value)
    rows.value = result.items
    total.value = result.total
  } catch (e) {
    // 同 Task 9：查询失败必须与「查无记录」区分开。
    error.value = e.message || '查询审计记录失败'
  } finally {
    loading.value = false
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
    downloadBlob(blob, timestampedName(apiMode === 'hybrid' ? 'MOCK_abis_audit' : 'abis_audit'))
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
  <div>
    <el-card>
      <template #header><span>{{ title }}</span></template>

      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        style="margin-bottom: 12px"
      />

      <el-form :inline="true" class="filters">
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="timeRange"
            type="datetimerange"
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
          <el-button type="primary" @click="load">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
          <el-button :loading="exporting" @click="handleExport">{{ apiMode === 'hybrid' ? '导出 Mock 样本 CSV' : '导出 CSV' }}</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="rows" v-loading="loading" border style="width: 100%">
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
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        style="margin-top: 12px; justify-content: flex-end"
        @current-change="load"
        @size-change="load"
      />

      <p class="note">
        审计记录只写不改不删，本页仅提供查询与导出，不提供修改或删除入口。
        查询与导出行为本身不计入审计范围。保留期默认 1 年、配置上限 2 年。
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
.filters { margin-bottom: 4px; }
.note { margin: 12px 0 0; color: #909399; font-size: 12px; line-height: 1.7; }
</style>
