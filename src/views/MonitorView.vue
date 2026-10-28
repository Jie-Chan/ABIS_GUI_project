<script setup>
import { onMounted, onUnmounted, computed, ref } from 'vue'
import { useMonitorStore } from '@/stores/monitor'
import UiIcon from '@/components/UiIcon.vue'
import {
  MONITOR_STATUS,
  MONITOR_STATUS_META,
  MONITOR_TARGET,
  ALGO_TARGETS,
  LICENSE_STATUS,
  MONITOR_REFRESH_INTERVAL_MS,
} from '@/constants/monitor'

const store = useMonitorStore()

const refreshSeconds = MONITOR_REFRESH_INTERVAL_MS / 1000
const statusFilter = ref('all')
// 只做产品展示映射，接口中的名称、标识和状态保持原样。
const presentation = {
  [MONITOR_TARGET.GATEWAY]: { icon: 'server' },
  [MONITOR_TARGET.SYSTEM]: { icon: 'monitor' },
  [MONITOR_TARGET.FACE]: { name: '人脸识别服务', icon: 'face' },
  [MONITOR_TARGET.FINGERPRINT]: { name: '指纹识别服务', icon: 'fingerprint' },
  [MONITOR_TARGET.POSTGRESQL]: { icon: 'database' },
  [MONITOR_TARGET.MINIO]: { icon: 'database' },
}

/** 异常对象数（未部署不计入，需求 1.3） */
const abnormalCount = computed(
  () => store.items.filter((i) => MONITOR_STATUS_META[i.status]?.isAbnormal).length
)

// 仅派生展示统计，不改变监控快照和 store 对外契约。
const summary = computed(() => [
  { label: '监控对象', value: store.items.length, icon: 'server', tone: 'blue' },
  { label: '正常', value: store.items.filter((i) => i.status === MONITOR_STATUS.NORMAL).length, icon: 'check', tone: 'green' },
  { label: '异常与不可达', value: abnormalCount.value, icon: 'alert', tone: 'red' },
  { label: '未部署', value: store.items.filter((i) => i.status === MONITOR_STATUS.NOT_DEPLOYED).length, icon: 'minus', tone: 'gray' },
])

function statusMeta(status) {
  return Object.hasOwn(MONITOR_STATUS_META, status) ? MONITOR_STATUS_META[status] : { label: '未知', tagType: 'info', isAbnormal: false }
}

const visibleItems = computed(() => statusFilter.value === 'attention'
  ? store.items.filter(item => statusMeta(item.status).isAbnormal)
  : store.items)
const statusPending = computed(() => !!store.error || !store.fetchedAt || store.items.some(item => !Object.hasOwn(MONITOR_STATUS_META, item.status)))

function serviceName(item) {
  return presentation[item.key]?.name || item.name || '未命名服务'
}

function gallerySize(metrics) {
  const value = metrics?.galleryTotalSize
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value.toLocaleString('zh-CN') : '未知'
}

function licenseLabel(metrics) {
  if (metrics?.licenseStatus === LICENSE_STATUS.VALID) return '有效'
  if (metrics?.licenseStatus === LICENSE_STATUS.INVALID) return '无效'
  return '未知'
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

    <div class="monitor-toolbar">
      <div class="monitor-controls">
        <div class="panel-heading">
          <h2>服务运行概览</h2>
          <el-tag v-if="statusPending" type="info" size="small">状态待确认</el-tag>
          <el-tag v-else-if="abnormalCount > 0" type="danger" size="small">{{ abnormalCount }} 项异常</el-tag>
          <el-tag v-else-if="store.items.length" type="success" size="small">无异常服务</el-tag>
          <el-tag v-else type="info" size="small">状态待确认</el-tag>
        </div>
        <el-radio-group v-model="statusFilter" class="monitor-filter" aria-label="服务状态筛选">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="attention">异常与不可达</el-radio-button>
        </el-radio-group>
      </div>
      <div class="refresh-area">
        <div class="refresh-row">
          <div class="refresh-time">
            <span class="meta">上次成功刷新：{{ store.fetchedAt || '—' }}</span>
            <span class="interval">每 {{ refreshSeconds }} 秒自动刷新</span>
          </div>
          <el-button :loading="store.loading" @click="store.refresh"><UiIcon name="refresh" :size="16" />立即刷新</el-button>
        </div>
      </div>
    </div>

    <section v-loading="store.loading" class="service-list" aria-label="服务列表" :aria-busy="store.loading">
      <div v-if="visibleItems.length" class="service-grid">
        <article v-for="item in visibleItems" :key="item.key" class="service-card" :data-service="item.key"
          :class="{ 'service-card--attention': statusMeta(item.status).isAbnormal, 'service-card--undeployed': item.status === MONITOR_STATUS.NOT_DEPLOYED }"
          :aria-label="serviceName(item)">
          <header class="service-heading">
            <div class="service-identity">
              <span class="service-icon"><UiIcon :name="presentation[item.key]?.icon || 'server'" :size="25" /></span>
              <div class="service-title">
                <h3>{{ serviceName(item) }}</h3>
                <p class="service-meta"><span>{{ item.layer || '—' }}</span><span class="meta-divider" aria-hidden="true">|</span><span>{{ Array.isArray(item.instances) ? item.instances.length : '—' }} 个实例</span></p>
              </div>
            </div>
            <span class="service-status" :class="statusMeta(item.status).tagType">
              <i class="status-dot" :class="statusMeta(item.status).tagType" />{{ statusMeta(item.status).label }}
            </span>
          </header>

          <div class="service-body">
            <ul v-if="Array.isArray(item.instances) && item.instances.length" class="service-instances" aria-label="实例状态">
              <li v-for="instance in item.instances" :key="instance.id" class="instance-chip">
                <span class="instance-id">{{ instance.id }}</span>
                <span class="instance-state" :class="statusMeta(instance.status).tagType"><i class="status-dot" :class="statusMeta(instance.status).tagType" />{{ statusMeta(instance.status).label }}</span>
              </li>
            </ul>
            <p v-else class="empty-instances"><UiIcon name="server" :size="20" />{{ item.status === MONITOR_STATUS.NOT_DEPLOYED ? '该服务未部署，无实例。' : '暂无实例信息。' }}</p>

            <dl v-if="ALGO_TARGETS.includes(item.key)" class="algorithm-metrics" aria-label="算法服务信息">
              <div><dt>底库规模</dt><dd>{{ gallerySize(item.metrics) }}</dd></div>
              <div><dt>授权状态</dt><dd class="license-value">{{ licenseLabel(item.metrics) }}</dd></div>
            </dl>
          </div>
        </article>
      </div>
      <el-skeleton v-else-if="store.loading && !store.fetchedAt" class="monitor-placeholder" :rows="5" animated />
      <el-empty v-else-if="store.items.length && statusFilter === 'attention'" description="暂无异常或不可达的服务" />
      <el-empty v-else :description="store.error ? '暂时无法获取服务状态' : store.fetchedAt ? '暂无服务状态数据' : '等待服务状态数据'" />
    </section>

    <p class="monitor-note"><UiIcon name="info" :size="15" /><span>未部署的服务不计入异常。</span></p>
  </div>
</template>

<style scoped>
.status-overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0 0 18px; padding: 18px 0; background: #fff; border: 1px solid var(--abis-border); border-radius: 8px; }
.summary-card { display: flex; align-items: center; gap: 18px; min-width: 0; padding: 0 24px; border-right: 1px solid var(--abis-border); }
.summary-card:last-child { border-right: 0; }
.summary-icon { display: flex; align-items: center; justify-content: center; width: 46px; height: 46px; border-radius: 9px; flex-shrink: 0; }
.blue { background: #eaf1ff; color: #3268e8; }
.green { background: #e8f7ef; color: #159d68; }
.red { background: #ffedef; color: #dc4c52; }
.gray { background: #eef1f6; color: #718096; }
.status-overview dt { color: #718096; font-size: 13px; margin-bottom: 5px; }
.status-overview dd { margin: 0; font-size: 28px; line-height: 1.2; font-weight: 650; font-variant-numeric: tabular-nums; }
.monitor-toolbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; margin-bottom: 16px; padding: 16px 20px; background: #fff; border: 1px solid var(--abis-border); border-radius: 8px; }
.monitor-controls, .panel-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; }
.monitor-controls { gap: 24px; }
.panel-heading h2 { margin: 0; font-size: 17px; font-weight: 600; }
.monitor-filter { flex-shrink: 0; }
.monitor-filter :deep(.el-radio-button__inner) { padding: 9px 14px; }
.refresh-area { min-width: 0; margin-left: auto; }
.refresh-row { display: flex; align-items: center; flex-wrap: wrap; gap: 18px; }
.refresh-time { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
.meta, .interval { color: #718096; font-size: 12px; font-weight: 400; }
.refresh-area :deep(.el-button) { color: #3268e8; border-color: #cedcfa; }
.interval { font-size: 11px; }
.service-list { min-height: 160px; }
.service-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.service-card { min-width: 0; overflow: hidden; border: 1px solid var(--abis-border); border-radius: 8px; background: #fff; }
.service-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 18px 20px 12px; }
.service-identity { display: flex; align-items: center; gap: 14px; min-width: 0; }
.service-title { min-width: 0; }
.service-title h3 { margin: 0 0 7px; font-size: 17px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.service-icon { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; flex-shrink: 0; border-radius: 8px; background: #edf3ff; color: #3268e8; }
.service-meta { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: 0; color: #718096; font-size: 12px; line-height: 1.5; }
.service-meta > span { min-width: 0; overflow-wrap: anywhere; }
.meta-divider { color: #c3cddd; }
.service-status { display: inline-flex; flex-shrink: 0; align-items: center; gap: 7px; padding: 6px 10px; border-radius: 6px; white-space: nowrap; font-size: 13px; font-weight: 600; line-height: 20px; }
.service-status.success { color: #159d68; background: #eaf8f1; }
.service-status.danger { color: #d43f47; background: #ffe9eb; }
.service-status.info { color: #748298; background: #eef1f5; }
.service-card--attention { border-color: #f4cbd0; border-left: 3px solid #dc4c52; }
.service-card--attention .service-heading { background: #fff7f8; }
.service-card--attention .service-icon { color: #dc4c52; background: #ffe9ec; }
.service-card--undeployed .service-icon { color: #718096; background: #eef1f5; }
.service-body { padding: 0 20px 16px; }
.service-instances { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 0; list-style: none; }
.instance-chip { display: inline-flex; align-items: center; gap: 16px; max-width: 100%; min-width: 0; padding: 8px 12px; border: 1px solid #e5ebf5; border-radius: 6px; font-size: 12px; line-height: 1.5; }
.instance-id { min-width: 0; overflow-wrap: anywhere; }
.instance-state { display: inline-flex; flex-shrink: 0; align-items: center; gap: 7px; }
.instance-state.success { color: #159d68; }
.instance-state.danger { color: #d43f47; }
.instance-state.info { color: #748298; }
.status-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: #8190a5; }
.status-dot.success { background: #159d68; }
.status-dot.danger { background: #dc4c52; }
.algorithm-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 12px 0 0; padding-top: 12px; border-top: 1px solid var(--abis-border); }
.algorithm-metrics > div + div { padding-left: 20px; border-left: 1px solid var(--abis-border); }
.algorithm-metrics dt { margin-bottom: 6px; color: #718096; font-size: 13px; }
.algorithm-metrics dd { margin: 0; overflow-wrap: anywhere; color: #202d42; font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; }
.algorithm-metrics .license-value { font-size: 14px; font-weight: 500; }
.empty-instances { display: flex; align-items: center; gap: 10px; margin: 4px 0 0; color: #718096; font-size: 13px; line-height: 1.7; }
.monitor-placeholder { padding: 24px; background: #fff; border-radius: 8px; }
.monitor-note { display: flex; gap: 8px; align-items: flex-start; margin: 12px 0 0; font-size: 12px; line-height: 1.8; color: #718096; }
.monitor-note .ui-icon { margin-top: 2px; }
.stale-note { color: #9b691f; font-size: 12px; margin: 0 0 16px; }
@media (max-width: 1150px) {
  .summary-card { gap: 12px; padding: 0 16px; }
  .summary-icon { width: 40px; height: 40px; }
}
@media (max-width: 767px) {
  .status-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 0; }
  .summary-card { padding: 16px; }
  .summary-card:nth-child(2) { border-right: 0; }
  .summary-card:nth-child(-n+2) { border-bottom: 1px solid var(--abis-border); }
  .monitor-toolbar { padding: 16px; }
  .monitor-controls { width: 100%; gap: 14px; }
  .refresh-area { width: 100%; margin-left: 0; }
  .refresh-row { gap: 10px; }
  .refresh-time { align-items: flex-start; }
  .service-grid { grid-template-columns: minmax(0, 1fr); }
  .service-heading { padding: 16px 16px 12px; gap: 10px; }
  .service-body { padding: 0 16px 16px; }
  .service-title h3 { font-size: 16px; }
  .service-icon { width: 38px; height: 38px; }
  .service-identity { gap: 10px; }
}
@media (max-width: 400px) {
  .summary-card { gap: 10px; padding: 14px 12px; }
  .summary-icon { width: 32px; height: 36px; }
  .status-overview dt { font-size: 12px; }
  .status-overview dd { font-size: 25px; }
  .service-heading { flex-wrap: wrap; }
  .service-meta { gap: 6px; }
}
</style>
