<script setup>
import { onMounted, onUnmounted, computed } from 'vue'
import { useMonitorStore } from '@/stores/monitor'
import UiIcon from '@/components/UiIcon.vue'
import {
  MONITOR_STATUS,
  MONITOR_STATUS_META,
  ALGO_METRIC,
  MONITOR_REFRESH_INTERVAL_MS,
} from '@/constants/monitor'

const store = useMonitorStore()

const refreshSeconds = MONITOR_REFRESH_INTERVAL_MS / 1000
const algoMetricLabel = {
  [ALGO_METRIC.CDC_HEALTHY]: 'CDC 链路健康',
  [ALGO_METRIC.CDC_READY]: 'CDC 就绪',
  [ALGO_METRIC.GALLERY_TOTAL_SIZE]: '底库规模',
  [ALGO_METRIC.LICENSE_STATUS]: 'License 状态',
}

const abnormalCount = computed(
  () => store.items.filter((i) => MONITOR_STATUS_META[i.status]?.isAbnormal).length
)

const summary = computed(() => [
  { label: '监控对象', value: store.items.length, icon: 'server', tone: 'blue' },
  { label: '正常', value: store.items.filter((i) => i.status === MONITOR_STATUS.NORMAL).length, icon: 'check', tone: 'green' },
  { label: '异常 / 不可达', value: abnormalCount.value, icon: 'alert', tone: 'red' },
  { label: '未部署', value: store.items.filter((i) => i.status === MONITOR_STATUS.NOT_DEPLOYED).length, icon: 'minus', tone: 'gray' },
])

function statusMeta(status) {
  return MONITOR_STATUS_META[status] || { label: status || '未知', tagType: 'info', isAbnormal: false }
}

onMounted(() => store.start())
onUnmounted(() => store.stop())
</script>

<template>
  <div class="monitor-page">
    <el-alert
      v-if="store.error"
      :title="store.error"
      type="error"
      :closable="false"
      style="margin-bottom: 12px"
      show-icon
    />
    <p v-if="store.error && store.fetchedAt" class="stale-note">读取失败，以下保留上次成功获取的数据。</p>

    <dl class="status-overview" aria-label="监控状态汇总">
      <div v-for="item in summary" :key="item.label" class="summary-card">
        <span class="summary-icon" :class="item.tone"><UiIcon :name="item.icon" :size="25" /></span>
        <div><dt>{{ item.label }}</dt><dd>{{ store.fetchedAt ? item.value : '—' }}</dd></div>
      </div>
    </dl>

    <el-card class="monitor-panel">
      <template #header>
        <div class="monitor-toolbar">
          <div class="panel-heading">
            <h2>服务运行概览</h2>
            <el-tag v-if="store.error" type="info" size="small">状态待确认</el-tag>
            <el-tag v-else-if="abnormalCount > 0" type="danger" size="small">{{ abnormalCount }} 项异常</el-tag>
            <el-tag v-else-if="store.items.length" type="success" size="small">全部正常</el-tag>
            <el-tag v-else type="info" size="small">状态待确认</el-tag>
          </div>
          <div class="refresh-area">
            <div class="refresh-row">
              <span class="meta">上次刷新：{{ store.fetchedAt || '—' }}</span>
              <el-button :loading="store.loading" @click="store.refresh"><UiIcon name="refresh" :size="16" />立即刷新</el-button>
            </div>
            <span class="interval">每 {{ refreshSeconds }} 秒自动刷新</span>
          </div>
        </div>
      </template>

            <el-table
        :data="store.items"
        row-key="key"
        v-loading="store.loading"
        style="width: 100%"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expand">
              <p v-if="(row.instances?.length ?? 0) === 0" class="muted">{{ row.status === 'not_deployed' ? '该对象未部署，无实例。' : '暂无实例明细。' }}</p>
              <span v-else class="expand-label">实例状态</span>
              <span
                v-for="inst in row.instances"
                :key="inst.id"
                class="instance-chip"
              >
                <i class="status-dot" :class="statusMeta(inst.status).tagType" />
                {{ inst.id }} <span class="chip-separator">·</span> {{ statusMeta(inst.status).label }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="name" label="监控对象" min-width="215" />
        <el-table-column prop="layer" label="层级" width="130" />

        <el-table-column label="健康状态" width="120">
          <template #default="{ row }">
            <span class="service-status" :class="statusMeta(row.status).tagType">
              <i class="status-dot" :class="statusMeta(row.status).tagType" />{{ statusMeta(row.status).label }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="实例数" width="80" align="center">
          <template #default="{ row }">
            {{ (row.instances?.length ?? 0) }}
          </template>
        </el-table-column>

        <el-table-column label="算法运行指标" min-width="355">
          <template #default="{ row }">
            <div v-if="row.metrics" class="algorithm-metrics">
              <div>
              <span :class="{ 'metric-error': row.metrics.cdcHealthy === false }">
                {{ algoMetricLabel[ALGO_METRIC.CDC_HEALTHY] }}：{{ row.metrics.cdcHealthy == null ? '未知' : row.metrics.cdcHealthy ? '正常' : '异常' }}
              </span><span class="metric-divider">·</span>
              <span :class="{ 'metric-error': row.metrics.cdcReady === false }">
                {{ algoMetricLabel[ALGO_METRIC.CDC_READY] }}：{{ row.metrics.cdcReady == null ? '未知' : row.metrics.cdcReady ? '就绪' : '未就绪' }}
              </span>
              </div>
              <div>
              <span>
                {{ algoMetricLabel[ALGO_METRIC.GALLERY_TOTAL_SIZE] }}：{{ row.metrics.galleryTotalSize?.toLocaleString() ?? '未知' }}
              </span><span class="metric-divider">·</span>
              <span>
                {{ algoMetricLabel[ALGO_METRIC.LICENSE_STATUS] }}：{{ row.metrics.licenseStatus || '未知' }}
              </span>
              </div>
            </div>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
      </el-table>

      <p class="monitor-note">
        <UiIcon name="info" :size="15" />
        <span>
        未部署对象不计入异常。
        </span>
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.status-overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 0 0 20px; }
.summary-card { display: flex; align-items: center; gap: 20px; padding: 22px; background: #fff; border: 1px solid var(--abis-border); border-radius: 8px; box-shadow: 0 2px 8px rgb(26 48 81 / 2%); }
.summary-icon { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 10px; flex-shrink: 0; }
.blue { background: #eaf1ff; color: #3268e8; }
.green { background: #e8f7ef; color: #159d68; }
.red { background: #ffedef; color: #dc4c52; }
.gray { background: #eef1f6; color: #718096; }
dt { color: #718096; font-size: 12px; margin-bottom: 5px; }
dd { margin: 0; font-size: 28px; line-height: 1.2; font-weight: 650; font-variant-numeric: tabular-nums; }
.monitor-panel :deep(.el-card__body) { padding: 0; }
.monitor-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
.panel-heading { display: flex; gap: 14px; align-items: center; }
.panel-heading h2 { margin: 0; font-size: 16px; font-weight: 600; }
.refresh-area { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
.refresh-row { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
.meta, .interval { color: #718096; font-size: 11px; font-weight: 400; }
.refresh-area :deep(.el-button) { color: #3268e8; border-color: #cedcfa; }
.interval { font-size: 10px; }
.service-status { display: inline-flex; align-items: center; gap: 6px; padding: 3px 7px; border-radius: 5px; white-space: nowrap; font-size: 12px; line-height: 20px; }
.service-status.success { color: #159d68; }
.service-status.danger { color: #d43f47; background: #fff0f0; }
.service-status.info { color: #748298; background: #f0f3f7; }
.status-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: #8190a5; }
.status-dot.success { background: #159d68; }
.status-dot.danger { background: #dc4c52; }
.algorithm-metrics { color: #53647e; font-size: 11px; line-height: 1.9; }
.metric-divider { margin: 0 6px; color: #9aa7ba; }
.metric-error { color: #d43f47; }
.expand { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 20px 14px; padding: 14px; border: 1px solid #e5ebf5; border-radius: 6px; background: #f5f8fc; }
.expand-label { margin-right: 8px; color: #718096; font-size: 11px; }
.instance-chip { display: inline-flex; align-items: center; gap: 7px; padding: 6px 10px; background: #fff; border: 1px solid #e0e7f2; border-radius: 5px; font-size: 11px; }
.chip-separator { color: #97a3b6; }
.muted { color: #91a0b5; margin: 0; }
.monitor-note { display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 14px 20px; font-size: 11px; line-height: 1.8; color: #718096; }
.monitor-note .ui-icon { margin-top: 2px; }
.stale-note { color: #9b691f; font-size: 12px; margin: 0 0 16px; }
@media (max-width: 1150px) {
  .summary-card { gap: 12px; padding: 18px 14px; }
  .summary-icon { width: 40px; height: 40px; }
}
@media (max-width: 900px) {
  .status-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .refresh-area { align-items: flex-start; }
  .refresh-row { gap: 10px; }
}
@media (max-width: 400px) {
  .summary-card { gap: 10px; padding: 14px 10px; }
  .summary-icon { width: 32px; height: 36px; }
  dt { font-size: 10px; }
  dd { font-size: 25px; }
}
</style>
