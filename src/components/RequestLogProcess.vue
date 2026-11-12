<script setup>
import { ref, watch } from 'vue'
import RequestLogStage from '@/components/RequestLogStage.vue'
import { LOG_FEATURE_LABEL } from '@/constants/log'
import { formatLogTime } from '@/utils/log'
const props = defineProps({ record: { type: Object, required: true }, visible: Boolean, requestBody: { default: null }, responseBody: { default: null }, selectedResponse: { default: null }, responseCount: Number })
const expanded = ref([])
watch(() => [props.record.requestId, props.visible], () => { expanded.value = [] })
function defaultOpen(stage) {
  if (props.record.mode === 'sync') return true
  if (props.record.result === 'success' && props.record.publication === 'published') return false
  return stage.key === props.record.currentStage || (props.record.currentStage === 'ABIS_HANDLING' && stage.key === 'ADAPTER_CALLING')
}
</script>
<template>
  <div class="request-process">
      <section aria-label="阶段时间线" class="request-stages">
        <div class="stage-timeline" :class="{ 'stage-timeline--async': record.mode === 'async' }">
          <div v-for="stage in record.stages" :key="`${record.requestId}-${visible}-${stage.instanceId}`" class="timeline-step">
            <RequestLogStage :stage="stage" :request-id="record.requestId || ''" :default-expanded="defaultOpen(stage)" :expand-failure="record.result === 'failure' && record.currentStage === 'ABIS_HANDLING'" :locked="record.mode === 'sync'" />
          </div>
        </div>
      </section>
      <p v-if="record.result === 'unknown'" class="unconfirmed-result">业务结果未确认</p>
      <p class="section-help">调用方：{{ record.caller || '—' }}；生物模态：{{ LOG_FEATURE_LABEL[record.feature] || '—' }}。人工核查为只读展示。</p>
      <section class="request-response" aria-labelledby="messages-heading">
        <h2 id="messages-heading">ABIS 接口报文</h2>
        <p v-if="responseCount > 1 && selectedResponse" class="section-help">{{ selectedResponse.attemptId }} · {{ formatLogTime(selectedResponse.at) }}</p>
        <el-collapse v-model="expanded">
          <el-collapse-item title="请求参数" name="request"><pre v-if="requestBody != null" tabindex="0" aria-label="ABIS 请求 JSON">{{ JSON.stringify(requestBody, null, 2) }}</pre><p v-else>暂无请求参数记录</p></el-collapse-item>
          <el-collapse-item title="响应结果" name="response"><pre v-if="responseBody != null" tabindex="0" aria-label="ABIS 响应 JSON">{{ JSON.stringify(responseBody, null, 2) }}</pre><p v-else>暂无响应正文记录</p></el-collapse-item>
        </el-collapse>
      </section>
  </div>
</template>
<style scoped>
h2 { margin: 0 0 12px; font-size: 17px; }
.section-help { color: var(--abis-muted); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.request-response { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--abis-border); }
.stage-timeline--async { padding-left: 22px; }
.stage-timeline--async .timeline-step { position: relative; padding-bottom: 8px; }
.stage-timeline--async .timeline-step::before { content: ""; position: absolute; left: -17px; top: 28px; bottom: -28px; border-left: 1px solid #bdcde2; }
.stage-timeline--async .timeline-step:last-child::before { display: none; }
.stage-timeline--async .timeline-step::after { content: ""; position: absolute; left: -21px; top: 25px; width: 9px; height: 9px; border: 2px solid #7595bd; border-radius: 50%; background: #fff; }
.request-response pre { padding: 18px; border: 1px solid var(--abis-border); border-radius: 6px; background: #f7f9fc; color: #31476b; font-size: 12px; line-height: 1.8; max-height: 320px; overflow: auto; white-space: pre; }
.unconfirmed-result { padding: 16px; border: 1px dashed #dac7a5; border-radius: 6px; color: #91651f; font-size: 13px; }
</style>
