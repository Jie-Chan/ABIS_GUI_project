<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import api from '@/api'
const items = ref([]),loading = ref(false),error = ref('')
let sequence = 0
async function refresh() {
  const current = ++sequence; loading.value = true; error.value = ''
  try { const result = await api.getHostResources(); if (current === sequence) items.value = result.items }
  catch(e) { if (current === sequence) error.value = e.message || '读取主机资源失败' }
  finally { if (current === sequence) loading.value = false }
}
onMounted(refresh);onBeforeUnmount(() => { sequence++ })
</script>
<template>
  <section class="host-resources">
    <div class="resource-heading"><h2>服务器与虚拟机</h2><el-button :loading="loading" @click="refresh">立即刷新</el-button></div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-table :data="items" row-key="id" v-loading="loading" border empty-text="暂无主机资源数据">
      <el-table-column label="主机 / IP" min-width="195"><template #default="{ row }"><strong>{{ row.name }}</strong><p>{{ row.ip }}</p></template></el-table-column>
      <el-table-column label="CPU 使用率" min-width="120"><template #default="{ row }">{{ row.sample ? `${row.sample.cpuPercent}%` : '—' }}</template></el-table-column>
      <el-table-column label="内存已用 / 总量" min-width="175"><template #default="{ row }">{{ row.sample ? `${row.sample.memoryUsedGiB} / ${row.sample.memoryTotalGiB} GiB` : '—' }}</template></el-table-column>
      <el-table-column label="数据盘剩余 / 总量" min-width="195"><template #default="{ row }">{{ row.sample ? `${row.sample.diskFreeGiB} / ${row.sample.diskTotalGiB} GiB` : '—' }}<p v-if="row.sample">{{ row.sample.mount }}</p></template></el-table-column>
      <el-table-column label="资源采集时间" min-width="190"><template #default="{ row }">{{ row.sample?.collectedAt || '暂无数据' }}</template></el-table-column>
    </el-table>
  </section>
</template>
<style scoped>
.resource-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; }.resource-heading h2 { margin:0; font-size:17px; }p { margin:5px 0 0; color:var(--abis-muted); font-size:12px; overflow-wrap:anywhere; }.host-resources { min-width:0; }
</style>
