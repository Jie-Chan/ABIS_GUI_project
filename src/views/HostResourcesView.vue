<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowReactive, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'
import HostMetricChart from '@/components/HostMetricChart.vue'
import { DEFAULT_HOST_RESOURCE_RANGE, HOST_RESOURCE_HOSTS, HOST_RESOURCE_RANGES } from '@/constants/hostResources'
import { MONITOR_REFRESH_INTERVAL_MS } from '@/constants/monitor'
import { formatDateTime } from '@/utils/datetime'
import { formatMetric, formatRate } from '@/utils/hostMetrics'

const overview = [
  { key: 'cpuPercent', label: 'CPU 使用率' },
  { key: 'memoryPercent', label: '内存使用率' },
  { key: 'diskPercent', label: '磁盘使用率' },
  { key: 'netRxBps', label: '网络接收', rate: true },
  { key: 'netTxBps', label: '网络发送', rate: true },
]
const blue = '#275bd7', teal = '#087e75', orange = '#bf5b0a', rose = '#bb3674'
const cpu = {
  title: 'CPU', fillOpacity: 0.4,
  series: [{ key: 'cpuPercent', label: '使用率', color: blue }],
  tooltipFields: [
    { key: 'cpuPercent', label: '总使用率', color: blue },
    { key: 'cpuUserPercent', label: '用户态' },
    { key: 'cpuSystemPercent', label: '内核态' },
    { key: 'cpuIowaitPercent', label: 'I/O 等待' },
  ],
}
const memory = {
  title: '内存', capacity: ['memoryUsedGiB', 'memoryTotalGiB'], fillOpacity: 0.4,
  series: [{ key: 'memoryPercent', label: '使用率', color: teal }],
  tooltipFields: [
    { key: 'memoryPercent', label: '使用率', color: teal },
    { key: 'memoryCacheGiB', label: '缓存', unit: 'GiB' },
    { key: 'swapUsedGiB', totalKey: 'swapTotalGiB', label: 'Swap 已用 / 总量', unit: 'GiB' },
  ],
}
const network = {
  title: '网络', unit: 'B/s', fillOpacity: 0.2,
  series: [{ key: 'netRxBps', label: '接收', color: teal }, { key: 'netTxBps', label: '发送', color: rose }],
}
const diskOptions = [
  { id: 'throughput', label: '吞吐量', unit: 'B/s', keys: ['diskReadBps', 'diskWriteBps'] },
  { id: 'latency', label: '延迟', unit: 'ms', keys: ['diskReadLatencyMs', 'diskWriteLatencyMs'], emptyText: '暂无延迟数据' },
]

const route = useRoute()
const targetId = computed(() => route.query.hostId)
const target = computed(() => HOST_RESOURCE_HOSTS.find(host => host.id === targetId.value))
const unknownHost = computed(() => targetId.value !== undefined && !target.value)
const roster = ref(null)
const expandedHostId = ref(null)
const rangeId = ref(DEFAULT_HOST_RESOURCE_RANGE)
const range = computed(() => HOST_RESOURCE_RANGES[rangeId.value])
const diskModes = reactive({})
const diskMode = computed(() => diskModes[expandedHostId.value] ?? diskOptions[0])
const metrics = computed(() => [cpu, memory, {
  title: '磁盘', capacity: ['diskUsedGiB', 'diskTotalGiB'], fillOpacity: 0.3,
  unit: diskMode.value.unit, emptyText: diskMode.value.emptyText,
  series: [{ key: diskMode.value.keys[0], label: '读取', color: blue }, { key: diskMode.value.keys[1], label: '写入', color: orange }],
}, network])

const resources = shallowReactive(new Map())
const mappingLoaded = ref(false)
const loadFailed = ref(false)
const loading = ref(false)
const targetMapped = computed(() => resources.has(targetId.value))
const hosts = computed(() => HOST_RESOURCE_HOSTS.map(host => {
  const entry = resources.get(host.id)
  const collectedAt = entry?.sample?.collectedAt
  const sampleFailed = entry?.sampleState === 'failed'
  const trendFailed = Boolean(entry?.trends[rangeId.value]?.failed)
  const stale = Boolean(collectedAt && (sampleFailed || entry.sampleState === 'stale'))
  let message = ''
  if (stale) message = '数据暂未更新'
  else if (sampleFailed) message = '读取失败'
  else if (trendFailed) message = '读取趋势失败'
  else if (entry?.sampleState === 'empty') message = '暂无数据'
  return {
    ...host, connected: Boolean(entry), sample: entry?.sample ?? null, collectedAt,
    collectionTime: collectedAt ? formatDateTime(new Date(collectedAt)) : '',
    stale, failed: sampleFailed || trendFailed, message,
  }
}))
const trend = computed(() => resources.get(expandedHostId.value)?.trends[rangeId.value])
const chartWindowEnd = computed(() => trend.value?.windowEnd ?? Date.now())
const trendMessage = computed(() => {
  if (trend.value?.history?.length) return undefined
  if (trend.value?.failed) return '读取趋势失败'
  return !trend.value && loading.value ? '正在读取趋势' : '该时段暂无数据'
})

function overviewValue(sample, { key, rate }) {
  const value = sample?.[key]
  return rate ? formatRate(value) : formatMetric(value, '%')
}

function acceptSample(previous, item, end) {
  const saved = previous?.sample ?? null
  if (item.sampleError) return { sample: saved, sampleState: 'failed' }
  const sampleTime = Date.parse(item?.sample?.collectedAt)
  if (!Number.isFinite(sampleTime)) {
    return { sample: saved, sampleState: saved ? 'stale' : 'empty' }
  }
  const expired = end - sampleTime >= 2 * MONITOR_REFRESH_INTERVAL_MS
  if (saved && (expired || sampleTime < Date.parse(saved.collectedAt))) return { sample: saved, sampleState: 'stale' }
  return { sample: item.sample, sampleState: expired ? 'stale' : 'ready' }
}

function acceptRead({ items, windowEnd }, requestedRange) {
  const responseEnd = Date.parse(windowEnd)
  const end = Number.isFinite(responseEnd) ? responseEnd : Date.now()
  const mapped = new Set(items.map(item => item.id))
  for (const id of resources.keys()) {
    if (!mapped.has(id)) resources.delete(id)
  }
  for (const item of items) {
    const previous = resources.get(item.id)
    const minute = acceptSample(previous, item, end)
    const savedTrend = previous?.trends[requestedRange]
    const keepTrend = savedTrend?.history?.length && (item.historyError
      || minute.sampleState !== 'ready' && (requestedRange === DEFAULT_HOST_RESOURCE_RANGE || !item.history.length))
    const nextTrend = keepTrend ? savedTrend : { history: item.history, windowEnd: end }
    resources.set(item.id, {
      ...minute,
      trends: { ...previous?.trends, [requestedRange]: { ...nextTrend, failed: Boolean(item.historyError) } },
    })
  }
  if (!mapped.has(expandedHostId.value)) expandedHostId.value = null
  mappingLoaded.value = true
  loadFailed.value = false
}

function failRead(requestedRange) {
  loadFailed.value = !resources.size
  for (const [id, entry] of resources) {
    resources.set(id, {
      ...entry, sampleState: 'failed',
      trends: { ...entry.trends, [requestedRange]: { ...entry.trends[requestedRange], failed: true } },
    })
  }
}

function toggleHost(id) {
  expandedHostId.value = expandedHostId.value === id ? null : id
}

watch([targetId, targetMapped], async ([id, mapped]) => {
  expandedHostId.value = mapped ? id : null
  if (!target.value) return
  await nextTick()
  if (targetId.value === id) roster.value?.querySelector(`[data-host-id="${id}"] .host-row`)?.scrollIntoView({ block: 'center' })
}, { immediate: true })

let request
let timer
async function refresh() {
  if (unknownHost.value || request) return
  const current = new AbortController()
  const requestedRange = rangeId.value
  request = current
  loading.value = true
  try {
    const result = await api.getHostResources({ range: requestedRange, signal: current.signal })
    if (request === current) acceptRead(result, requestedRange)
  } catch {
    if (request === current) failRead(requestedRange)
  } finally {
    if (request === current) {
      request = undefined
      loading.value = false
    }
  }
}

function cancelRead() {
  request?.abort()
  request = undefined
  loading.value = false
}

function stop() {
  clearInterval(timer)
  cancelRead()
}

function start() {
  stop()
  if (unknownHost.value) return
  refresh()
  timer = setInterval(refresh, MONITOR_REFRESH_INTERVAL_MS)
}

onMounted(start)
watch(unknownHost, start)
watch(rangeId, () => {
  cancelRead()
  refresh()
}, { flush: 'sync' })
onBeforeUnmount(stop)
</script>

<template>
  <section class="host-resources">
    <el-card class="host-card" :class="{ 'has-roster': !unknownHost }">
      <template #header><h1 class="resource-title">主机资源</h1></template>
      <el-empty v-if="unknownHost" description="该主机尚未接入本次测试" />
      <div v-else class="host-content" role="region" aria-label="主机资源概览" tabindex="0">
        <div v-if="loadFailed" class="host-read-error" role="status">
          <span>读取主机资源失败</span>
          <el-button link type="primary" :loading="loading" @click="refresh">重试</el-button>
        </div>
        <div class="host-list-header" aria-hidden="true">
          <span>主机</span><span v-for="field in overview" :key="field.key">{{ field.label }}</span>
        </div>
        <ul ref="roster" class="host-roster">
          <li v-for="host in hosts" :key="host.id" :data-host-id="host.id" :class="{ 'is-located': targetId === host.id }">
            <div class="host-row" :class="{ 'is-connected': host.connected, 'is-expanded': expandedHostId === host.id }">
              <div class="host-identity">
                <button v-if="host.connected" type="button" class="host-toggle"
                  :aria-expanded="expandedHostId === host.id" :aria-controls="`host-detail-${host.id}`"
                  :aria-describedby="`host-readings-${host.id}`" @click="toggleHost(host.id)">{{ host.name }}</button>
                <strong v-else>{{ host.name }}</strong>
                <span v-if="mappingLoaded && !host.connected" class="host-status">未接入</span>
                <div v-else-if="host.message" class="host-sample-state"
                  :class="{ 'is-stale': host.stale, 'is-failed': host.failed && !host.stale }">
                  <span role="status">{{ host.message }}<template v-if="host.stale"> · 最后采集 <time :datetime="host.collectedAt" :title="host.collectionTime">{{ host.collectionTime.slice(-8, -3) }}</time></template></span>
                  <el-button v-if="host.failed" class="host-retry" link type="primary" :loading="loading" @click="refresh">重试</el-button>
                </div>
              </div>
              <span :id="`host-readings-${host.id}`" class="host-readings">
                <span v-for="field in overview" :key="field.key" class="host-metric" :data-metric="field.key">
                  <span class="host-metric-label">{{ field.label }}</span>
                  <span class="host-metric-value">{{ overviewValue(host.sample, field) }}</span>
                </span>
              </span>
              <span v-if="host.connected" class="host-arrow" aria-hidden="true" />
            </div>

            <div v-if="host.connected" v-show="expandedHostId === host.id" :id="`host-detail-${host.id}`" class="host-detail">
              <template v-if="expandedHostId === host.id">
                <div class="detail-toolbar">
                  <p class="detail-collection">采集于 <time v-if="host.collectedAt" :datetime="host.collectedAt" :title="host.collectionTime">{{ host.collectionTime.slice(-8) }}</time><span v-else>—</span></p>
                  <select v-model="rangeId" class="history-range" aria-label="历史范围">
                    <option v-for="(option, id) in HOST_RESOURCE_RANGES" :key="id" :value="id">{{ option.label }}</option>
                  </select>
                </div>
                <div class="metric-grid" :aria-label="`${range.label}主机资源`">
                  <HostMetricChart v-for="metric in metrics" :key="`${metric.title}-${rangeId}`" v-bind="metric"
                    :sample="host.sample" :history="trend?.history ?? []" :window-end="chartWindowEnd" :range="range"
                    :empty-text="trendMessage || metric.emptyText">
                    <template v-if="metric.title === '磁盘'" #controls>
                      <div class="disk-modes" role="group" aria-label="磁盘趋势视图">
                        <button v-for="option in diskOptions" :key="option.id" type="button"
                          :aria-pressed="diskMode.id === option.id" @click="diskModes[host.id] = option">{{ option.label }}</button>
                      </div>
                    </template>
                  </HostMetricChart>
                </div>
              </template>
            </div>
          </li>
        </ul>
      </div>
    </el-card>
  </section>
</template>

<style scoped>
.host-resources { min-width: 0; }
.host-card { display: flex; flex-direction: column; }
.host-card :deep(.el-card__header) { flex: none; padding: 14px 20px; }
.host-card :deep(.el-card__body) { display: flex; flex: 1; flex-direction: column; min-height: 0; padding: 0; }
.resource-title { margin: 0; font-size: 16px; font-weight: 600; line-height: 24px; }
.host-content { --host-columns: minmax(216px, 1.55fr) repeat(5, minmax(0, 1fr)) 28px; min-height: 0; }
.host-content:focus-visible { outline: 2px solid var(--el-color-primary-light-3); outline-offset: -2px; }
.host-read-error { display: flex; flex: none; align-items: center; gap: 10px; padding: 6px 16px; color: var(--el-color-danger); font-size: 13px; }
.host-list-header, .host-row { display: grid; grid-template-columns: var(--host-columns); align-items: center; }
.host-list-header { min-height: 46px; border-bottom: 1px solid var(--abis-table-border); background: var(--abis-table-header-bg); color: var(--abis-table-header-text); font-size: 12px; font-weight: 600; }
.host-roster { margin: 0; padding: 0; list-style: none; }
.host-roster > li + li { border-top: 1px solid var(--abis-table-border); }
.host-row { position: relative; min-height: 54px; padding-block: 8px; color: #28394f; font-size: 13px; }
.host-row.is-connected:hover, .host-row.is-expanded, .is-located > .host-row { background: #f1f5ff; }
.is-located > .host-row { box-shadow: inset 3px 0 var(--el-color-primary); }
.host-list-header > span, .host-identity, .host-metric { padding-inline: var(--abis-table-cell-padding); }
.host-identity { min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 3px 8px; }
.host-identity strong, .host-toggle { font-weight: 600; }
.host-toggle { padding: 0; border: 0; background: transparent; color: inherit; text-align: left; }
.host-toggle::after { content: ''; position: absolute; inset: 0; }
.host-toggle:focus-visible { outline: none; }
.host-toggle:focus-visible::after { outline: 3px solid #89aaf5; outline-offset: -3px; }
.host-status { padding: 2px 7px; border-radius: 4px; background: var(--el-color-info-light-9); color: var(--el-color-info); font-size: 12px; }
.host-sample-state { display: flex; align-items: center; flex-wrap: wrap; gap: 2px 8px; width: 100%; color: var(--abis-muted); font-size: 12px; }
.host-sample-state.is-stale { color: var(--el-color-warning); }
.host-sample-state.is-failed { color: var(--el-color-danger); }
.host-retry { position: relative; z-index: 1; }
.host-readings { display: contents; }
.host-metric-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.host-metric-value, .host-sample-state time, .detail-collection time { font-variant-numeric: tabular-nums; white-space: nowrap; }
.host-row:not(.is-connected) .host-metric-value { color: var(--abis-muted); }
.host-arrow { justify-self: center; width: 8px; height: 8px; border: solid var(--el-color-primary); border-width: 2px 2px 0 0; transform: rotate(45deg); }
.host-row.is-expanded .host-arrow { transform: translateY(-2px) rotate(135deg); }
.host-detail { padding: 12px 16px 16px; background: var(--abis-table-header-bg); border-top: 1px solid var(--abis-table-border); }
.detail-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12px; }
.detail-collection { margin: 0; color: var(--abis-muted); }
.history-range { min-height: 32px; min-width: 108px; padding: 4px 8px; border: 1px solid var(--el-border-color); border-radius: 6px; background: #fff; color: var(--el-text-color-primary); font: inherit; }
.metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.disk-modes { display: inline-flex; gap: 2px; padding: 2px; border-radius: 6px; background: #edf1f7; }
.disk-modes button { padding: 4px 9px; border: 0; border-radius: 4px; background: transparent; color: var(--abis-muted); font-size: 12px; }
.disk-modes button[aria-pressed="true"] { background: #fff; color: var(--el-color-primary-dark-2); box-shadow: 0 1px 2px #182c5426; font-weight: 600; }
@media (min-width: 840px) {
  .host-card.has-roster {
    height: calc(100dvh - var(--abis-nav-height) - var(--abis-workspace-top) - var(--abis-workspace-bottom));
    min-height: 320px;
  }
  .host-content { display: flex; flex: 1; flex-direction: column; overflow-y: auto; scrollbar-gutter: stable; scroll-padding-top: 46px; }
  .host-list-header { position: sticky; top: 0; z-index: 2; flex: none; }
  .host-roster, .host-roster > li { display: flex; flex: 1 0 auto; flex-direction: column; }
  .host-row { flex: 1 0 auto; }
}
@media (max-width: 839px) {
  .host-list-header { display: none; }
  .host-row { grid-template-columns: minmax(0, 1fr) 18px; gap: 10px; padding: 12px; }
  .host-identity, .host-metric { padding: 0; }
  .host-arrow { grid-area: 1 / 2; }
  .host-readings { display: grid; grid-column: 1 / -1; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
  .host-metric { display: grid; gap: 3px; }
  .host-metric-label { position: static; width: auto; height: auto; overflow: visible; clip-path: none; white-space: normal; color: var(--abis-muted); font-size: 12px; }
  .host-metric-value { font-size: 13px; }
}
@media (max-width: 767px) {
  .host-detail { padding: 10px; }
  .metric-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
}
@media (max-width: 480px) {
  .host-readings { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
</style>
