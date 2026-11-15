<script setup>
defineProps({ instance: { type: Object, required: true }, host: { type: Object, default: null } })
</script>
<template>
  <div class="probe-info">
    <span>最近探测：<time>{{ instance.lastProbeAt || '—' }}</time></span>
    <span class="probe-reason">{{ instance.reason || '原因未记录' }}</span>
    <router-link v-if="host?.id" :to="{ name: 'host-resources', query: { hostId: host.id } }">查看主机资源</router-link>
  </div>
</template>
<style scoped>
.probe-info { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; color: var(--abis-muted); font-size: 11px; line-height: 1.5; text-align: left; overflow-wrap: anywhere; }
a { color: var(--el-color-primary); text-decoration: none; }a:hover { text-decoration: underline; }
</style>
