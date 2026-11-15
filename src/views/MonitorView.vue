<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useMonitorStore } from '@/stores/monitor'
import { monitorState, MONITOR_STATUS_META } from '@/constants/monitor'
import MonitorProbe from '@/components/MonitorProbe.vue'
import UiIcon from '@/components/UiIcon.vue'

const store = useMonitorStore()
const statusFilter = ref('all')
const instances = computed(() => store.items.flatMap(group => group.instances || []))
const summary = computed(() => [
  { key: 'all', label: '全部', icon: 'server', count: instances.value.length },
  { key: 'normal', label: '正常', icon: 'check', count: instances.value.filter(item => monitorState(item.status) === 'normal').length },
  { key: 'abnormal', label: '异常', icon: 'alert', count: instances.value.filter(item => monitorState(item.status) === 'abnormal').length },
  { key: 'unknown', label: '未知', icon: 'info', count: instances.value.filter(item => monitorState(item.status) === 'unknown').length },
])
const visibleGroups = computed(() => store.items.map(group => ({ ...group,
  instances: (group.instances || []).filter(item => statusFilter.value === 'all' || monitorState(item.status) === statusFilter.value),
})).filter(group => group.instances.length))
const serviceGroups = computed(() => visibleGroups.value.filter(group => !['postgresql', 'minio'].includes(group.key)))
const storageRows = computed(() => visibleGroups.value.filter(group => ['postgresql', 'minio'].includes(group.key)).flatMap(group => group.instances.map(instance => ({ ...instance, component: group.name }))))
const emptyLabel = computed(() => store.error && !store.fetchedAt ? '暂时无法获取服务状态' : instances.value.length ? '暂无匹配的实例或服务' : '暂无服务状态数据')
onMounted(() => store.start())
onUnmounted(() => store.stop())
</script>

<template>
  <div class="monitor-page">
    <el-alert v-if="store.error" :title="store.error" type="error" :closable="false" show-icon />
    <p v-if="store.error && store.fetchedAt" class="stale-note">读取失败，以下保留上次成功获取的数据。</p>
    <dl class="status-overview" aria-label="监控状态汇总">
      <div v-for="item in summary" :key="item.key" class="summary-card" :class="{ 'is-selected': statusFilter === item.key, 'has-abnormal': item.key === 'abnormal' && item.count > 0 }">
        <button type="button" class="summary-filter" :aria-label="item.label" :aria-pressed="statusFilter === item.key" @click="statusFilter = item.key" />
        <span class="summary-icon"><UiIcon :name="item.icon" :size="23" /></span>
        <div><dt>{{ item.label }}</dt><dd>{{ store.fetchedAt ? item.count : '—' }}</dd></div>
      </div>
    </dl>
    <div class="monitor-toolbar">
      <h2>实例与服务状态</h2>
      <div class="refresh-area"><span class="meta">状态更新于 {{ store.fetchedAt || '—' }}</span><el-button :loading="store.loading" @click="store.refresh"><UiIcon name="refresh" :size="16" />立即刷新</el-button></div>
    </div>
    <section v-loading="store.loading" class="service-list" aria-label="服务列表" :aria-busy="store.loading">
      <div v-if="serviceGroups.length" class="service-grid" :class="`service-grid--${serviceGroups.length}`">
        <article v-for="group in serviceGroups" :key="group.key" class="service-card" :data-service="group.key" :aria-label="group.name">
          <header class="service-heading"><UiIcon name="server" :size="20" /><h3>{{ group.name }}</h3><p v-if="group.host" class="deployment-info">{{ group.host.name }} · {{ group.host.ip }}</p></header>
          <ul class="service-instances">
            <li v-for="instance in group.instances" :key="instance.id" class="instance-row" :data-instance="instance.id">
              <div class="instance-identity"><span v-if="instance.name" class="instance-name">{{ instance.name }}</span><span class="instance-id">{{ instance.id }}</span><span v-if="instance.host" class="deployment-info">{{ instance.host.name }} · {{ instance.host.ip }}</span></div>
              <span class="instance-state" :class="MONITOR_STATUS_META[monitorState(instance.status)].tagType">{{ MONITOR_STATUS_META[monitorState(instance.status)].label }}</span>
              <MonitorProbe v-if="monitorState(instance.status) !== 'normal'" :instance="instance" :host="instance.host || group.host" />
            </li>
          </ul>
        </article>
      </div>
      <section v-if="storageRows.length" class="storage-section" aria-labelledby="storage-heading">
        <h3 id="storage-heading">数据存储</h3>
        <table class="storage-table">
          <colgroup><col class="component-column"><col class="instance-column"><col><col class="state-column"></colgroup>
          <thead><tr><th scope="col">组件</th><th scope="col">实例</th><th scope="col">主机 / IP</th><th scope="col">状态</th></tr></thead>
          <tbody><tr v-for="instance in storageRows" :key="instance.id" class="instance-row storage-row" :data-instance="instance.id">
            <td>{{ instance.component }}</td><td class="instance-id">{{ instance.id }}</td>
            <td class="instance-identity"><span>{{ instance.host?.name || '—' }}</span><span class="deployment-info">{{ instance.host?.ip || '—' }}</span></td>
            <td><span class="instance-state" :class="MONITOR_STATUS_META[monitorState(instance.status)].tagType">{{ MONITOR_STATUS_META[monitorState(instance.status)].label }}</span><MonitorProbe v-if="monitorState(instance.status) !== 'normal'" :instance="instance" :host="instance.host" /></td>
          </tr></tbody>
        </table>
      </section>
      <el-skeleton v-if="!visibleGroups.length && store.loading && !store.fetchedAt" :rows="5" animated />
      <el-empty v-else-if="!visibleGroups.length" :description="emptyLabel" />
    </section>
  </div>
</template>

<style scoped>
.monitor-page { container-type: inline-size; container-name: monitor; }
.status-overview { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); margin: 0 0 16px; padding: 12px 0; background: #fff; border: 1px solid var(--abis-border); border-radius: 8px; }
.summary-card { position: relative; display: flex; align-items: center; gap: 12px; padding: 0 20px; min-width: 0; border-right: 1px solid var(--abis-border); }
.summary-card:last-child { border: 0; }
.summary-filter { position: absolute; inset: -8px 6px; border: 0; border-radius: 6px; background: transparent; }
.summary-filter:hover { background: #3268e809; }
.is-selected .summary-filter { box-shadow: inset 0 -3px var(--el-color-primary); }
.summary-icon { display: grid; place-items: center; width: 40px; height: 40px; flex-shrink: 0; border-radius: 8px; background: #edf2fa; color: #5a7393; }
.has-abnormal .summary-icon,.has-abnormal dd { color: #d43f47; }
.status-overview dt { margin-bottom: 4px; color: var(--abis-muted); font-size: 13px; }
.status-overview dd { margin: 0; font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; }
.monitor-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.monitor-toolbar h2 { margin: 0; font-size: 17px; font-weight: 600; }
.refresh-area { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.meta { color: var(--abis-muted); font-size: 12px; }
.service-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; }
.service-grid--1 { grid-template-columns: minmax(0,1fr); }
.service-grid--2 { grid-template-columns: repeat(2,minmax(0,1fr)); }
.service-card { min-width: 0; border: 1px solid var(--abis-border); border-radius: 8px; background: #f9fbfd; overflow: hidden; }
.service-heading { display: grid; grid-template-columns: 20px minmax(0,1fr); align-content: center; align-items: center; gap: 6px 8px; min-height: 64px; padding: 10px 14px; box-sizing: border-box; border-bottom: 1px solid var(--abis-border); color: #536b87; }
.service-heading .deployment-info { grid-column: 2; margin: 0; }
.deployment-info { font-size: 12px; line-height: 1.5; color: var(--abis-muted); overflow-wrap: anywhere; }
.service-heading h3 { margin: 0; color: var(--el-text-color-primary); font-size: 15px; font-weight: 600; }
.service-instances { margin: 0; padding: 0 14px; list-style: none; }
.instance-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 4px 10px; min-height: 60px; box-sizing: border-box; padding: 8px 0; border-bottom: 1px solid var(--abis-border); }
.instance-row > .probe-info { flex: 0 0 100%; }.storage-table .probe-info { margin-top: 5px; }
.instance-row:last-child { border-bottom: 0; }
.instance-identity { display: flex; flex-direction: column; min-width: 0; gap: 4px; }
.instance-name { font-size: 13px; }
.instance-id { color: #62748d; font-size: 12px; overflow-wrap: anywhere; }
.instance-state { flex-shrink: 0; font-size: 13px; font-weight: 600; white-space: nowrap; }
.instance-state.success { color: #159d68; }.instance-state.danger { color: #d43f47; }.instance-state.info { color: #7b8798; }
.storage-section { margin-top: 16px; background: #fff; border: 1px solid var(--abis-border); border-radius: 8px; overflow: hidden; }
.storage-section h3 { margin: 0; padding: 12px 14px; font-size: 15px; }
.storage-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 13px; }
.component-column { width: 16%; }.instance-column { width: 20%; }.state-column { width: 34%; }
.storage-table th,.storage-table td { padding: 8px 14px; border-top: 1px solid var(--abis-border); text-align: left; overflow-wrap: anywhere; line-height: 1.5; }
.storage-table th { font-size: 12px; color: #62748d; font-weight: 500; background: #f7f9fc; }
.storage-table .storage-row { display: table-row; padding: 0; min-height: 0; border: 0; }
.storage-table .instance-identity { display: table-cell; }
.storage-table .deployment-info { display: block; margin-top: 3px; }
.storage-table th:last-child,.storage-table td:last-child { text-align: right; }
.stale-note { color: #9b691f; font-size: 12px; line-height: 1.7; }
@container monitor (max-width:660px) {
  .summary-card { padding: 0 12px; gap: 8px; }.summary-icon { width: 34px; height: 34px; }
  .service-grid--3 { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .service-grid--3 .service-card:last-child { grid-column: 1 / -1; }
  .service-grid--3 .service-card:last-child .service-instances { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 20px; }
  .service-grid--3 .service-card:last-child .instance-row { border-bottom: 0; }
}
@container monitor (max-width:500px) {
  .status-overview { grid-template-columns: repeat(2,minmax(0,1fr)); padding: 0; }
  .summary-card { padding: 12px; }.summary-card:nth-child(-n+2) { border-bottom: 1px solid var(--abis-border); }.summary-card:nth-child(2) { border-right: 0; }.summary-filter { inset: 5px; }
  .service-grid { grid-template-columns: minmax(0,1fr); }
  .service-grid--3 .service-card:last-child .service-instances { display: block; }
  .service-grid--3 .service-card:last-child .instance-row:first-child { border-bottom: 1px solid var(--abis-border); }
  .refresh-area { gap: 8px; }
  .storage-table th,.storage-table td { padding: 9px 6px; font-size: 12px; }
  .component-column { width: 18%; }.instance-column { width: 21%; }.state-column { width: 35%; }
}
</style>
