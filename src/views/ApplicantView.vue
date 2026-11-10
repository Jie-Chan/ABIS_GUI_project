<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import UiIcon from '@/components/UiIcon.vue'
import { TIME_RANGE_SHORTCUTS } from '@/constants/timeRanges'

const router = useRouter()
const emptyQuery = () => ({ page: 1, pageSize: 20, userId: '', modality: '' })
const query = ref(emptyQuery())
const timeRange = ref([])
const loading = ref(false)
const error = ref('')
const rows = ref([])
const total = ref(0)
let listSequence = 0
let detailSequence = 0
const drawerVisible = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detail = ref(null)
const selectedUserId = ref('')

async function load() {
  const sequence = ++listSequence
  const params = { ...query.value, startTime: timeRange.value?.[0] || '', endTime: timeRange.value?.[1] || '' }
  loading.value = true
  error.value = ''
  try {
    const result = await api.listApplicants(params)
    if (sequence !== listSequence) return
    rows.value = result.items
    total.value = result.total
  } catch (e) {
    if (sequence !== listSequence) return
    rows.value = []
    total.value = 0
    query.value.page = 1
    error.value = e.message || '查询申请人失败，请重试'
  } finally { if (sequence === listSequence) loading.value = false }
}
function search() { query.value.page = 1; return load() }
function reset() { query.value = emptyQuery(); timeRange.value = []; return load() }
function changePage(page) {
  if (page === query.value.page) return
  query.value.page = page
  return load()
}
function changePageSize(size) { query.value.pageSize = size; return search() }

async function openDetail(userId) {
  selectedUserId.value = userId
  drawerVisible.value = true
  detail.value = null
  detailError.value = ''
  detailLoading.value = true
  const sequence = ++detailSequence
  try {
    const result = await api.getApplicant(userId)
    if (sequence === detailSequence) detail.value = result
  } catch (e) {
    if (sequence === detailSequence) detailError.value = e.message || '读取申请人详情失败，请重试'
  } finally { if (sequence === detailSequence) detailLoading.value = false }
}
function closeDetail() {
  ++detailSequence
  detail.value = null
  detailError.value = ''
  detailLoading.value = false
}
function viewLogs(userId) { return router.push({ name: 'logs', query: { userId } }) }
onMounted(load)
onBeforeUnmount(() => { ++listSequence; ++detailSequence })
</script>

<template>
  <div class="records-page applicants-page">
    <el-card>
      <el-alert v-if="error" :title="error" type="error" :closable="false" class="query-error" />
      <el-form :inline="true" class="filters applicant-filters" @submit.prevent="search">
        <el-form-item label="申请人 ID">
          <el-input v-model.trim="query.userId" clearable placeholder="输入完整申请人 ID" @keyup.enter="search">
            <template #prefix><UiIcon name="search" :size="16" /></template>
          </el-input>
        </el-form-item>
        <el-form-item label="入库模态">
          <el-select v-model="query.modality" aria-label="入库模态" placeholder="全部" clearable>
            <el-option label="有人脸" value="face" />
            <el-option label="有指纹" value="finger" />
            <el-option label="人脸和指纹" value="both" />
          </el-select>
        </el-form-item>
        <el-form-item label="首次入库时间" class="enrollment-range">
          <el-date-picker v-model="timeRange" type="datetimerange" value-format="YYYY-MM-DD HH:mm:ss" :shortcuts="TIME_RANGE_SHORTCUTS" start-placeholder="开始时间" end-placeholder="结束时间" />
        </el-form-item>
        <el-form-item class="query-actions">
          <el-button type="primary" @click="search"><UiIcon name="search" :size="16" />查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
      <div class="results-toolbar">
        <span class="record-count" aria-live="polite">共 {{ total }} 位申请人</span>
        <span class="population-note">每位申请人按 ID 合并展示</span>
      </div>
      <el-table :data="rows" row-key="userId" v-loading="loading" :empty-text="error ? '查询失败，请重试' : '暂无匹配的申请人'" border>
        <el-table-column prop="userId" label="申请人 ID" min-width="180">
          <template #default="{ row }"><div class="applicant-identity"><span class="person-icon"><UiIcon name="accounts" :size="17" /></span><span class="applicant-id">{{ row.userId }}</span></div></template>
        </el-table-column>
        <el-table-column label="人脸入库" min-width="140">
          <template #default="{ row }"><el-tag :type="row.faceCount ? 'success' : 'info'"><UiIcon name="face" :size="14" />{{ row.faceCount ? `已入库 · ${row.faceCount} 条` : '未入库' }}</el-tag></template>
        </el-table-column>
        <el-table-column label="指纹入库" min-width="140">
          <template #default="{ row }"><el-tag :type="row.fingerCount ? 'success' : 'info'"><UiIcon name="fingerprint" :size="14" />{{ row.fingerCount ? `已入库 · ${row.fingerCount} 条` : '未入库' }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="enrolledAt" label="首次入库时间" min-width="180" />
        <el-table-column prop="updatedAt" label="最近更新时间" min-width="180" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row.userId)">查看详情</el-button>
            <el-button link type="primary" @click="viewLogs(row.userId)">查看日志</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination :current-page="query.page" :page-size="query.pageSize" :total="total" :page-sizes="[20, 50, 100]" layout="total, sizes, prev, pager, next" class="applicant-pagination" @update:current-page="changePage" @update:page-size="changePageSize" />
      <p class="note">展示当前库内人员；同一申请人的人脸、指纹记录合并在一行。</p>
    </el-card>

    <el-drawer v-model="drawerVisible" title="申请人详情" size="min(680px, 100vw)" class="applicant-drawer" @close="closeDetail">
      <div v-loading="detailLoading" class="applicant-detail" :aria-busy="detailLoading">
        <div v-if="detailError" class="detail-failure" role="alert">
          <el-alert :title="detailError" type="error" :closable="false" />
          <el-button @click="openDetail(selectedUserId)">重新读取</el-button>
        </div>
        <template v-else-if="detail">
          <div class="detail-identity">
            <span class="detail-person-icon"><UiIcon name="applicants" :size="28" /></span>
            <div><p>申请人 ID</p><h2 class="applicant-id">{{ detail.userId }}</h2></div>
          </div>
          <dl class="enrollment-summary">
            <div><UiIcon name="face" :size="24" /><div><dt>人脸记录</dt><dd>{{ detail.faceCount }} <span>条</span></dd></div></div>
            <div><UiIcon name="fingerprint" :size="24" /><div><dt>指纹记录</dt><dd>{{ detail.fingerCount }} <span>条</span></dd></div></div>
          </dl>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="首次入库时间">{{ detail.enrolledAt }}</el-descriptions-item>
            <el-descriptions-item label="最近更新时间">{{ detail.updatedAt }}</el-descriptions-item>
          </el-descriptions>
          <h2>入库记录</h2>
          <el-table :data="detail.records" :empty-text="'暂无入库记录'" border>
            <el-table-column label="模态" width="90"><template #default="{ row }"><span class="record-modality"><UiIcon :name="row.feature === 'face' ? 'face' : 'fingerprint'" :size="16" />{{ row.feature === 'face' ? '人脸' : '指纹' }}</span></template></el-table-column>
            <el-table-column prop="recordId" label="记录 ID" min-width="190"><template #default="{ row }"><span class="applicant-id">{{ row.recordId }}</span></template></el-table-column>
            <el-table-column prop="updatedAt" label="更新时间" min-width="170" />
          </el-table>
        </template>
        <el-skeleton v-else-if="detailLoading" :rows="5" animated />
      </div>
      <template #footer>
        <el-button @click="drawerVisible = false">关闭</el-button>
        <el-button v-if="detail" type="primary" @click="viewLogs(detail.userId)">查看该申请人日志</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.query-error { margin-bottom: 12px; }
.applicant-filters > .el-form-item { width: 220px; }
.applicant-filters > .enrollment-range { width: 380px; }
.applicant-filters > .query-actions { width: auto; }
.applicant-filters :deep(.el-select), .applicant-filters :deep(.el-date-editor) { width: 100%; }
.applicant-pagination { margin-top: 12px; justify-content: flex-end; }
.applicant-id { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
.applicant-identity { display: flex; align-items: center; gap: 10px; font-weight: 600; }
.person-icon { display: grid; place-items: center; width: 30px; height: 30px; flex-shrink: 0; border-radius: 7px; background: #edf2f8; color: #657e9e; }
.applicants-page :deep(.el-tag__content) { display: inline-flex; align-items: center; gap: 5px; }
.population-note { color: var(--el-text-color-secondary); font-size: 12px; }
.applicant-detail { min-height: 220px; }
.applicant-detail h2 { margin: 28px 0 14px; font-size: 16px; }
.detail-identity { display: flex; align-items: center; gap: 14px; margin-bottom: 24px; }
.detail-person-icon { display: grid; place-items: center; width: 56px; height: 56px; flex-shrink: 0; border-radius: 12px; background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
.detail-identity p { margin: 0 0 6px; color: var(--abis-muted); font-size: 12px; }
.detail-identity h2 { margin: 0; font-size: 23px; letter-spacing: .5px; }
.enrollment-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0 0 24px; }
.enrollment-summary > div { display: flex; align-items: center; gap: 14px; padding: 18px; border: 1px solid var(--abis-border); border-radius: 8px; background: #f7f9fc; color: var(--el-color-primary); }
.enrollment-summary dt { margin-bottom: 5px; color: var(--abis-muted); font-size: 12px; }
.enrollment-summary dd { margin: 0; color: var(--el-text-color-primary); font-size: 25px; font-weight: 600; font-variant-numeric: tabular-nums; }
.enrollment-summary dd span { color: var(--abis-muted); font-size: 12px; font-weight: 400; }
.record-modality { display: inline-flex; align-items: center; gap: 6px; }
.detail-failure { display: grid; justify-items: start; gap: 16px; }
@media (max-width: 767px) {
  .applicant-filters > .el-form-item { width: 100%; }
  .applicants-page :deep(.el-table-fixed-column--right) { position: static !important; }
  .applicants-page :deep(.el-table-fixed-column--right::before) { display: none; }
  .population-note { white-space: normal; }
  .enrollment-summary > div { padding: 14px 10px; gap: 10px; }
}
</style>
