<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '@/api'
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
} from '@/constants/log'

const route = useRoute()
const title = computed(() => route.meta.title || '')
const loading = ref(false)
const exporting = ref(false)
const error = ref('')
const rows = ref([])
const total = ref(0)

const query = ref({
  page: 1,
  pageSize: 20,
  startTime: '',
  endTime: '',
  api: '',
  feature: '',
  result: '',
  minCost: null,
  maxCost: null,
})

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
  query.value = {
    page: 1, pageSize: 20,
    startTime: '', endTime: '',
    api: '', feature: '', result: '',
    minCost: null, maxCost: null,
  }
  load()
}

async function load() {
  syncTimeRange()
  loading.value = true
  error.value = ''
  try {
    const result = await api.listLogs(query.value)
    rows.value = result.items
    total.value = result.total
  } catch (e) {
    error.value = e.message || '查询调用日志失败'
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
    const blob = await api.exportLogs(query.value)
    downloadBlob(blob, timestampedName('abis_api_logs'))
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
      <template #header>
        <div class="record-heading"><span>{{ title }}</span><span class="record-count">共 {{ total }} 条调用记录</span></div>
      </template>

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
        <el-form-item label="接口">
          <el-select v-model="query.api" clearable placeholder="全部" style="width: 240px">
            <el-option v-for="a in LOG_APIS" :key="a.key" :label="a.label" :value="a.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="生物模态">
          <el-select v-model="query.feature" clearable placeholder="全部" style="width: 120px">
            <el-option v-for="f in LOG_FEATURES" :key="f.key" :label="f.label" :value="f.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="结果状态">
          <el-select v-model="query.result" clearable placeholder="全部" style="width: 120px">
            <el-option v-for="r in LOG_RESULTS" :key="r.key" :label="r.label" :value="r.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="耗时区间(ms)">
          <el-input-number v-model="query.minCost" :min="0" :controls="false" placeholder="最小" style="width: 100px" />
          <span class="dash">—</span>
          <el-input-number v-model="query.maxCost" :min="0" :controls="false" placeholder="最大" style="width: 100px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="load">查询</el-button>
          <el-button @click="resetQuery">重置</el-button>
          <el-button :loading="exporting" @click="handleExport">导出 CSV</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="rows" v-loading="loading" border style="width: 100%">
        <el-table-column prop="calledAt" label="调用时间" width="180" />
        <el-table-column prop="caller" label="调用方标识" width="170" />
        <el-table-column prop="apiLabel" label="接口" min-width="240" />
        <el-table-column label="生物模态" width="110">
          <template #default="{ row }">{{ featureLabel[row.feature] }}</template>
        </el-table-column>
        <el-table-column label="结果状态" width="110">
          <template #default="{ row }">
            <el-tag :type="resultTagType[row.result]">{{ resultLabel[row.result] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="costMs" label="处理耗时" width="110">
          <template #default="{ row }">{{ row.costMs }} ms</template>
        </el-table-column>
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
        仅展示接口调用元数据，不含生物图像。
      </p>
    </el-card>

    <el-dialog v-model="detailVisible" title="调用详情" width="600px">
      <el-descriptions v-if="detail" :column="1" border>
        <el-descriptions-item label="调用时间">{{ detail.calledAt }}</el-descriptions-item>
        <el-descriptions-item label="调用方标识">{{ detail.caller }}</el-descriptions-item>
        <el-descriptions-item label="接口">{{ detail.apiLabel }}</el-descriptions-item>
        <el-descriptions-item label="生物模态">{{ featureLabel[detail.feature] }}</el-descriptions-item>
        <el-descriptions-item label="结果状态">{{ resultLabel[detail.result] }}</el-descriptions-item>
        <el-descriptions-item label="处理耗时">{{ detail.costMs }} ms</el-descriptions-item>
      </el-descriptions>
      <p class="note">调用记录仅含元数据，不含生物图像载荷。</p>
    </el-dialog>
  </div>
</template>

<style scoped>
.dash { margin: 0 8px; color: #8c99ac; }
.note { margin: 18px 0 0; color: #718096; font-size: 12px; line-height: 1.8; }
</style>
