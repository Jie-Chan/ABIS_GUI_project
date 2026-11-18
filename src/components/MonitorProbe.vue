<script setup>
import { computed } from 'vue'
import { monitorState, MONITOR_STATUS_META } from '@/constants/monitor'
const props = defineProps({ instance: { type: Object, required: true }, host: { type: Object, default: null } })
const status = computed(() => MONITOR_STATUS_META[monitorState(props.instance.status)])
</script>
<template>
  <div class="probe-info">
    <div class="probe-diagnosis">
      <el-tag class="instance-state" :class="status.tagType" :type="status.tagType">{{ status.label }}</el-tag>
      <span class="probe-reason">{{ instance.reason || '原因未记录' }}</span>
      <router-link v-if="host?.id" :to="{ name: 'host-resources', query: { hostId: host.id } }">查看主机资源</router-link>
    </div>
  </div>
</template>
<style scoped>
.probe-info { display: grid; gap: 6px; min-width: 0; font-size: 13px; line-height: 1.6; text-align: left; overflow-wrap: anywhere; }
.probe-diagnosis { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 8px; }
.instance-state { flex-shrink: 0; font-size: 13px; font-weight: 600; }
.probe-reason { color: var(--el-text-color-primary); }
a { color: var(--el-color-primary); text-decoration: none; white-space: nowrap; }a:hover { text-decoration: underline; }
</style>
