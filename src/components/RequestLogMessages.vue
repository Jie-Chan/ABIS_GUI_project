<script setup>
import { ref, watch } from 'vue'
import { formatLogTime } from '@/utils/log'
const props = defineProps({ record: Object, visible: Boolean, requestBody: { default: null }, responseBody: { default: null }, selectedResponse: { default: null }, responseCount: Number })
const expanded = ref(['request','response'])
watch(() => [props.record.requestId, props.visible], () => { expanded.value = ['request','response'] })
</script>
<template>
      <section class="request-response" aria-labelledby="messages-heading">
        <h2 id="messages-heading">ABIS 接口报文</h2>
        <p v-if="responseCount > 1 && selectedResponse" class="section-help">{{ selectedResponse.attemptId }} · {{ formatLogTime(selectedResponse.at) }}</p>
        <el-collapse v-model="expanded">
          <el-collapse-item title="请求参数" name="request"><pre v-if="requestBody != null" tabindex="0" aria-label="ABIS 请求 JSON">{{ JSON.stringify(requestBody, null, 2) }}</pre><p v-else>暂无请求参数记录</p></el-collapse-item>
          <el-collapse-item title="响应结果" name="response"><pre v-if="responseBody != null" tabindex="0" aria-label="ABIS 响应 JSON">{{ JSON.stringify(responseBody, null, 2) }}</pre><p v-else>暂无响应正文记录</p></el-collapse-item>
        </el-collapse>
      </section>
</template>
<style scoped>
h2 { margin:0 0 12px; font-size:16px; }.section-help { font-size:12px; color:var(--abis-muted); line-height:1.7; }.request-response pre { padding:14px; border:1px solid var(--abis-border); border-radius:6px; background:#f7f9fc; color:#31476b; font-size:12px; line-height:1.7; max-height:260px; overflow:auto; white-space:pre; }
</style>
