<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useMonitorStore } from '@/stores/monitor'
import { monitorState, MONITOR_STATUS_META } from '@/constants/monitor'
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
const emptyLabel = computed(() => store.error && !store.fetchedAt ? '暂时无法获取服务状态' : instances.value.length ? '暂无匹配的实例或服务' : '暂无服务状态数据')
onMounted(() => store.start())
onUnmounted(() => store.stop())
</script>

<template>
  <div class="monitor-page">
    <el-alert v-if="store.error" :title="store.error" type="error" :closable="false" show-icon />
    <p v-if="store.error && store.fetchedAt" class="stale-note">读取失败，以下保留上次成功获取的数据。</p>
    <dl class="status-overview" aria-label="监控状态汇总">
      <div v-for="item in summary" :key="item.key" class="summary-card" :class="{ 'is-selected': statusFilter === item.key }">
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
      <div v-if="visibleGroups.length" class="service-grid">
        <article v-for="group in visibleGroups" :key="group.key" class="service-card" :data-service="group.key" :aria-label="group.name">
          <header class="service-heading"><UiIcon :name="['postgresql', 'minio'].includes(group.key) ? 'database' : 'server'" :size="20" /><h3>{{ group.name }}</h3><p v-if="group.host" class="deployment-info">{{ group.host.name }} · {{ group.host.ip }}</p></header>
          <ul class="service-instances">
            <li v-for="instance in group.instances" :key="instance.id" class="instance-row" :data-instance="instance.id">
              <div class="instance-identity"><span v-if="instance.name" class="instance-name">{{ instance.name }}</span><span class="instance-id">{{ instance.id }}</span><span v-if="instance.host" class="deployment-info">{{ instance.host.name }} · {{ instance.host.ip }}</span></div>
              <span class="instance-state" :class="MONITOR_STATUS_META[monitorState(instance.status)].tagType">{{ MONITOR_STATUS_META[monitorState(instance.status)].label }}</span>
            </li>
          </ul>
        </article>
      </div>
      <el-skeleton v-else-if="store.loading && !store.fetchedAt" :rows="5" animated />
      <el-empty v-else :description="emptyLabel" />
    </section>
  </div>
</template>

<style scoped>
.status-overview { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); margin: 0 0 20px; padding: 20px 0; background: #fff; border: 1px solid var(--abis-border); border-radius: 8px; }
.summary-card { position: relative; display: flex; align-items: center; gap: 16px; padding: 0 24px; min-width: 0; border-right: 1px solid var(--abis-border); }
.summary-card:last-child { border: 0; }
.summary-filter { position: absolute; inset: -10px 8px; border: 0; border-radius: 6px; background: transparent; }
.summary-filter:hover { background: #3268e809; }
.is-selected .summary-filter { box-shadow: inset 0 -3px var(--el-color-primary); }
.summary-icon { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; border-radius: 8px; background: #edf2fa; color: #5a7393; }
.status-overview dt { margin-bottom: 6px; color: var(--abis-muted); font-size: 13px; }
.status-overview dd { margin: 0; font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; }
.monitor-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.monitor-toolbar h2 { margin: 0; font-size: 17px; font-weight: 600; }
.refresh-area { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
.meta { color: var(--abis-muted); font-size: 12px; }
.service-grid { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); gap: 18px; }
.service-card { grid-column: span 2; min-width: 0; border: 1px solid var(--abis-border); border-radius: 8px; background: #f9fbfd; overflow: hidden; }
.service-card:nth-child(n+4) { grid-column: span 3; }
.service-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 18px 20px; border-bottom: 1px solid var(--abis-border); color: #536b87; }
.service-heading .deployment-info { width: 100%; margin: 0 0 0 30px; }.deployment-info { font-size: 12px; line-height: 1.6; color: var(--abis-muted); overflow-wrap: anywhere; }
.service-heading h3 { margin: 0; color: var(--el-text-color-primary); font-size: 16px; font-weight: 600; }
.service-instances { margin: 0; padding: 0 20px; list-style: none; }
.instance-row { display: flex; justify-content: space-between; align-items: center; gap: 14px; min-height: 68px; padding: 14px 0; border-bottom: 1px solid var(--abis-border); }
.instance-row:last-child { border-bottom: 0; }
.instance-identity { display: flex; flex-direction: column; min-width: 0; gap: 5px; }
.instance-name { font-size: 13px; }
.instance-id { color: #62748d; font-size: 13px; overflow-wrap: anywhere; }
.instance-state { flex-shrink: 0; font-size: 13px; font-weight: 600; }
.instance-state.success { color: #159d68; }.instance-state.danger { color: #d43f47; }.instance-state.info { color: #7b8798; }
.stale-note { color: #9b691f; font-size: 12px; line-height: 1.7; }
@media(max-width:1100px) { .service-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }.service-card,.service-card:nth-child(n+4) { grid-column: auto; }.summary-card { padding: 0 16px; gap: 12px; } }
@media(max-width:700px) { .status-overview { grid-template-columns: repeat(2,minmax(0,1fr)); padding: 0; }.summary-card { padding: 16px; }.summary-card:nth-child(-n+2) { border-bottom: 1px solid var(--abis-border); }.summary-card:nth-child(2) { border-right: 0; }.summary-filter { inset: 5px; }.service-grid { grid-template-columns: minmax(0,1fr); }.refresh-area { gap: 10px; }.summary-icon { width: 36px; height: 36px; } }
</style>
