<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '@/api'
import { emptyApplicantQuery, useApplicantListStore } from '@/stores/applicants'
const store = useApplicantListStore()
const scenario = ref('default'), loading = ref(false), error = ref('')
const phases = [
  { value: 'document-original', label: '三人旧数据有效' },
  { value: 'document-deleted', label: '三人双模态删除' },
  { value: 'document-face', label: '三人新人脸入库' },
  { value: 'document-complete', label: '三人重采结果' },
]
const legacy = [
  { value: 'original', label: '原有人脸及 10 指' }, { value: 'deleted', label: '双模态删除，暂时退出列表' },
  { value: 'face', label: '新人脸入库，恢复列表' }, { value: 'complete', label: '新指纹：9 指位' },
  { value: 'failed', label: '新人脸成功，指纹注册失败' },
]
const currentLabel = computed(() => [...phases, ...legacy, { value: 'default', label: '默认数据' }].find(item => item.value === scenario.value)?.label || '—')
async function read() {
  loading.value = true; error.value = ''
  try { scenario.value = (await api.getRecaptureScenario()).scenario }
  catch (e) { error.value = e.message || '读取当前状态失败' }
  finally { loading.value = false }
}
async function change(value) {
  loading.value = true; error.value = ''
  try {
    const result = await api.setRecaptureScenario(value)
    scenario.value = result.scenario
    store.query = { ...emptyApplicantQuery(), userId: value === 'default' ? '' : result.userId }
    store.timeRange = []
    store.detailContext.restore = false
    store.scroll.restore = false
  } catch (e) { error.value = e.message || '切换状态失败' }
  finally { loading.value = false }
}
onMounted(read)
</script>
<template>
  <el-card class="recapture-acceptance" v-loading="loading">
    <h1>重采验收</h1>
    <p class="current-scenario" role="status">当前状态：{{ currentLabel }}</p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <h2>U301 / U302 / U303</h2>
    <div class="scenario-choices"><el-button v-for="item in phases" :key="item.value" :type="scenario === item.value ? 'primary' : 'default'" :disabled="loading" @click="change(item.value)">{{ item.label }}</el-button></div>
    <details class="legacy-samples"><summary>U900</summary><div class="scenario-choices"><el-button v-for="item in legacy" :key="item.value" :disabled="loading" @click="change(item.value)">{{ item.label }}</el-button></div></details>
    <div class="acceptance-actions"><el-button :disabled="loading" @click="change('default')">恢复默认数据</el-button><router-link :to="{ name: 'applicants' }">查看申请人列表</router-link></div>
  </el-card>
</template>
<style scoped>
h1 { margin: 0 0 16px; font-size: 22px; }h2 { margin: 24px 0 12px; font-size: 16px; }.current-scenario { color: var(--abis-muted); font-size: 14px; }.scenario-choices,.acceptance-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }.scenario-choices .el-button { margin: 0; }.legacy-samples { margin: 24px 0; font-size: 14px; }.legacy-samples summary { cursor: pointer; margin-bottom: 12px; }.acceptance-actions { margin-top: 24px; }a { color: var(--el-color-primary); text-decoration: none; }
</style>
