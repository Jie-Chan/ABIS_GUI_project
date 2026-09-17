<script setup>
import { onMounted, onUnmounted, computed } from 'vue'
import { useMonitorStore } from '@/stores/monitor'
import {
  MONITOR_STATUS_META,
  ALGO_METRIC,
  LICENSE_STATUS,
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

/** 异常对象数（未部署不计入，需求 1.3） */
const abnormalCount = computed(
  () => store.items.filter((i) => MONITOR_STATUS_META[i.status]?.isAbnormal).length
)

function statusMeta(status) {
  return MONITOR_STATUS_META[status] || { label: status, tagType: 'info', isAbnormal: false }
}

onMounted(() => store.start())
onUnmounted(() => store.stop())
</script>

<template>
  <div>
    <el-alert
      v-if="store.error"
      :title="store.error"
      type="error"
      :closable="false"
      style="margin-bottom: 12px"
    />

    <el-card>
      <div class="toolbar">
        <span>
          共 {{ store.items.length }} 个监控对象
          <el-tag v-if="abnormalCount > 0" type="danger" size="small" style="margin-left: 8px">
            {{ abnormalCount }} 项异常
          </el-tag>
          <el-tag v-else type="success" size="small" style="margin-left: 8px">全部正常</el-tag>
        </span>
        <span class="meta">
          上次刷新：{{ store.fetchedAt || '—' }}
          <el-button link type="primary" :loading="store.loading" @click="store.refresh">立即刷新</el-button>
          <span class="interval">（每 {{ refreshSeconds }} 秒自动刷新）</span>
        </span>
      </div>

      <!--
        row-key 是**必须**的，不是可选项：
        el-table 的 setData 每次都调 updateExpandRows()，而它在**没有 rowKey** 时走的是
        `else expandRows.value = []` 这一支 —— 即**丢弃全部展开状态**。
        （见 node_modules/element-plus/es/components/table/src/store/expand.mjs）
        本页是 60 秒自动轮询页，store.refresh() 每次都把 items 换成**新数组**，
        于是每 60 秒、以及每次点「立即刷新」，**用户展开的行都会被静默收起**。
        而展开 PostgreSQL 行看不可达实例，正是本页最主要的一次交互。
        row-key="key" 后该分支改为按标识过滤，展开状态得以保留。
      -->
      <el-table
        :data="store.items"
        row-key="key"
        v-loading="store.loading"
        border
        style="width: 100%"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expand">
              <p v-if="row.instances.length === 0" class="muted">该对象未部署，无实例。</p>
              <el-tag
                v-for="inst in row.instances"
                :key="inst.id"
                :type="statusMeta(inst.status).tagType"
                size="small"
                style="margin-right: 8px"
              >
                {{ inst.id }}：{{ statusMeta(inst.status).label }}
              </el-tag>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="name" label="监控对象" min-width="200" />
        <el-table-column prop="layer" label="层级" width="140" />

        <el-table-column label="健康状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusMeta(row.status).tagType">{{ statusMeta(row.status).label }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="实例数" width="100">
          <template #default="{ row }">
            {{ row.instances.length }}
          </template>
        </el-table-column>

        <el-table-column label="算法运行指标" min-width="320">
          <template #default="{ row }">
            <template v-if="row.metrics">
              <el-tag :type="row.metrics.cdcHealthy ? 'success' : 'danger'" size="small" style="margin-right: 6px">
                {{ algoMetricLabel[ALGO_METRIC.CDC_HEALTHY] }}：{{ row.metrics.cdcHealthy ? '正常' : '异常' }}
              </el-tag>
              <el-tag :type="row.metrics.cdcReady ? 'success' : 'danger'" size="small" style="margin-right: 6px">
                {{ algoMetricLabel[ALGO_METRIC.CDC_READY] }}：{{ row.metrics.cdcReady ? '就绪' : '未就绪' }}
              </el-tag>
              <el-tag size="small" style="margin-right: 6px">
                {{ algoMetricLabel[ALGO_METRIC.GALLERY_TOTAL_SIZE] }}：{{ row.metrics.galleryTotalSize.toLocaleString() }}
              </el-tag>
              <el-tag :type="row.metrics.licenseStatus === LICENSE_STATUS.VALID ? 'success' : 'danger'" size="small">
                {{ algoMetricLabel[ALGO_METRIC.LICENSE_STATUS] }}：{{ row.metrics.licenseStatus }}
              </el-tag>
            </template>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
      </el-table>

      <p class="note">
        未部署的对象显示为「未部署」，与「不可达」区分，且不计入异常。
        License 状态本版平铺展示，不做显著强化。
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 14px; }
.meta { color: #909399; font-size: 13px; }
.interval { margin-left: 4px; }
.expand { padding: 8px 16px; }
.muted { color: #c0c4cc; margin: 0; }
.note { margin: 12px 0 0; color: #909399; font-size: 12px; }
</style>
