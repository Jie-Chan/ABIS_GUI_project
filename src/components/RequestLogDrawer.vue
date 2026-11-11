<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import RequestLogStage from '@/components/RequestLogStage.vue'
import { LOG_FEATURE_LABEL, LOG_RESULT_LABEL, LOG_RESULT_TAG_TYPE, PUBLICATION_LABEL, PUBLICATION_TYPE } from '@/constants/log'
import { durationMs, formatDuration, requestDuration, formatLogTime, handlingStages, processingSpans, projectRequest, responseForEvent } from '@/utils/log'

const visible = defineModel({ type: Boolean, default: false })
const props = defineProps({ record: { type: Object, default: null }, now: { type: Number, required: true } })
const summaryRef = ref(null)
const responseRef = ref(null)
const selectedResponse = ref(null)
const record = computed(() => props.record ? projectRequest(props.record) : null)
const duration = computed(() => record.value ? requestDuration(record.value, props.now) : null)
const executions = computed(() => record.value ? handlingStages(record.value).flatMap(stage => processingSpans(stage).map(span => ({ ...span, attemptId: stage.attemptId }))) : [])
const responseBody = computed(() => record.value && selectedResponse.value ? responseForEvent(record.value, selectedResponse.value) : null)
watch([visible, () => props.record], () => { selectedResponse.value = null })
function resetScroll() { summaryRef.value?.closest('.el-drawer__body')?.scrollTo(0, 0) }
async function viewResponse(event) {
  selectedResponse.value = event
  await nextTick()
  responseRef.value?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
}
</script>

<template>
  <el-drawer v-model="visible" title="请求详情" size="min(920px, 100vw)" class="request-log-drawer" @opened="resetScroll">
    <template v-if="record">
      <div ref="summaryRef" class="request-detail-title"><h2 class="log-id">{{ record.requestId || '—' }}</h2><el-tag type="info">{{ record.mode === 'sync' ? '同步请求' : '异步请求' }}</el-tag></div>
      <p class="scenario-name">{{ record.scenario }}</p>
      <el-alert v-if="record.collectionDelayed" title="日志可能尚未齐全" description="按已有证据展示状态；日志迟到不覆盖入口字段或已确认结果。" type="warning" :closable="false" show-icon />
      <el-alert v-if="record.result === 'unknown'" title="待人工核查" description="业务结果未确认。当前仅供查看，请结合业务记录核查。" type="warning" :closable="false" show-icon />
      <el-descriptions class="request-summary" :column="1" border>
        <el-descriptions-item label="用户 ID"><span class="log-id">{{ record.userId || '—' }}</span></el-descriptions-item>
        <el-descriptions-item label="接口类型">{{ record.apiLabel }} <span class="muted">{{ record.api }}</span></el-descriptions-item>
        <el-descriptions-item label="接收时间">{{ formatLogTime(record.receivedAt) }}</el-descriptions-item>
        <el-descriptions-item label="执行状态"><el-tag :type="LOG_RESULT_TAG_TYPE[record.result] || 'info'">{{ LOG_RESULT_LABEL[record.result] || '待人工核查' }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="响应发布状态"><el-tag :type="PUBLICATION_TYPE[record.publication] || 'info'">{{ PUBLICATION_LABEL[record.publication] || '—' }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="请求耗时"><span data-testid="request-duration">{{ duration.label }} {{ duration.text }}</span></el-descriptions-item>
        <el-descriptions-item label="ABIS 实际处理耗时">
          <div v-for="execution in executions" :key="`${execution.attemptId}-${execution.executionId}`" data-testid="processing-duration"><template v-if="executions.length > 1">{{ execution.attemptId }} / {{ execution.executionId }}：</template>{{ formatDuration(durationMs(execution.start?.at, execution.end?.at)) }}</div>
          <span v-if="!executions.length" data-testid="processing-duration">无数据</span>
        </el-descriptions-item>
      </el-descriptions>
      <section aria-labelledby="stages-heading" class="request-stages">
        <h2 id="stages-heading">Stage 概览</h2>
        <p class="section-help">点击阶段查看 Event；异步的 ABIS 处理位于“调用 ABIS”内，各阶段时间可重叠。</p>
        <RequestLogStage v-for="stage in record.stages" :key="`${record.requestId}-${visible}-${stage.instanceId}`" :stage="stage" :request-id="record.requestId || ''" @view-response="viewResponse" />
      </section>
      <section v-if="selectedResponse" ref="responseRef" class="request-response" aria-labelledby="response-heading">
        <div class="response-heading"><h2 id="response-heading">ABIS 接口响应正文</h2><el-button link @click="selectedResponse = null">收起响应</el-button></div>
        <p class="section-help">{{ record.requestId }} / {{ selectedResponse.attemptId }} / {{ selectedResponse.id }}<br>发送时间 {{ formatLogTime(selectedResponse.at) }}</p>
        <p v-if="responseBody == null" class="unconfirmed-result">暂无 ABIS 响应内容</p>
        <pre v-else tabindex="0" aria-label="ABIS 响应 JSON">{{ JSON.stringify(responseBody, null, 2) }}</pre>
      </section>
      <p v-if="record.result === 'unknown'" class="unconfirmed-result">业务结果未确认</p>
      <p class="section-help">调用方：{{ record.caller || '—' }}；生物模态：{{ LOG_FEATURE_LABEL[record.feature] || '—' }}。仅含元数据，不含生物图像。人工核查为只读展示。</p>
    </template>
    <template #footer><el-button @click="visible = false">关闭</el-button></template>
  </el-drawer>
</template>

<style scoped>
.log-id { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
.request-detail-title { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.request-detail-title h2 { margin: 0; font-size: 21px; }
.scenario-name { margin: 10px 0 20px; font-size: 13px; color: var(--abis-muted); }
.request-summary { margin: 20px 0 28px; }
.request-summary :deep(.el-descriptions__label) { width: 160px; }
.request-summary :deep(.el-descriptions__content) { overflow-wrap: anywhere; }
.muted { margin-left: 8px; color: var(--abis-muted); }
h2 { margin: 0 0 12px; font-size: 17px; }
.section-help { color: var(--abis-muted); font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; }
.request-response { margin-top: 28px; }
.response-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.response-heading h2 { margin-bottom: 0; }
.request-response pre { padding: 18px; border: 1px solid var(--abis-border); border-radius: 6px; background: #f7f9fc; color: #31476b; font-size: 12px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
.unconfirmed-result { padding: 16px; border: 1px dashed #dac7a5; border-radius: 6px; color: #91651f; font-size: 13px; }
@media (max-width: 600px) {
  .request-summary :deep(.el-descriptions__label) { width: 110px; }
  .request-detail-title h2 { font-size: 18px; }
}
</style>
