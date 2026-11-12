<script setup>
import { computed, ref, watch } from 'vue'
import RequestLogProcess from '@/components/RequestLogProcess.vue'
import RequestImageComparison from '@/components/RequestImageComparison.vue'
import { LOG_RESULT_LABEL, LOG_RESULT_TAG_TYPE, PUBLICATION_LABEL, PUBLICATION_TYPE } from '@/constants/log'
import { durationMs, formatDuration, requestDuration, formatLogTime, handlingStages, handlingSpan, projectRequest, responseForEvent, requestForAttempt, sortEvents } from '@/utils/log'

const visible = defineModel({ type: Boolean, default: false })
const props = defineProps({ record: { type: Object, default: null }, now: { type: Number, required: true } })
const summaryRef = ref(null)
const selectedAttemptId = ref(null)
const activeTab = ref('process')
const record = computed(() => props.record ? projectRequest(props.record) : null)
const duration = computed(() => record.value ? requestDuration(record.value, props.now) : null)
const handlingDurations = computed(() => record.value ? handlingStages(record.value).map(stage => ({ ...handlingSpan(stage), attemptId: stage.attemptId, id: stage.instanceId })) : [])
const responses = computed(() => record.value ? sortEvents(handlingStages(record.value).flatMap(stage => stage.events || []).filter(event => event.kind === 'RESPONDED')) : [])
const attempts = computed(() => [...new Set([...(record.value?.stages.find(s => s.key === 'ADAPTER_CALLING')?.events || []).filter(e => e.kind === 'CALL_STARTED').map(e => e.attemptId), ...handlingStages(record.value || {}).map(s => s.attemptId)].filter(Boolean))])
const selectedResponse = computed(() => responses.value.filter(e => e.attemptId === selectedAttemptId.value).at(-1) || null)
const requestBody = computed(() => record.value ? requestForAttempt(record.value, selectedAttemptId.value) : null)
const responseBody = computed(() => record.value && selectedResponse.value ? responseForEvent(record.value, selectedResponse.value) : null)
const businessSummary = computed(() => {
  if (!record.value) return ''
  const action = { enrollment: '注册', identification: '查重', delete: '删除', comparison: '比对', verification: '核验' }[record.value.api] || '业务处理'
  if (record.value.result === 'success') {
    const body = responseForEvent(record.value, responses.value.at(-1))
    const candidates = record.value.api === 'identification' && Array.isArray(body?.candidates) ? ` · 候选 ${body.candidates.length} 条` : ''
    return `${action}成功${candidates}`
  }
  if (record.value.result === 'failure') return `${action}失败`
  return `${action} · ${LOG_RESULT_LABEL[record.value.result] || '待人工核查'}`
})
watch([visible, () => props.record], () => { selectedAttemptId.value = responses.value.at(-1)?.attemptId || attempts.value.at(-1) || null; activeTab.value = 'process' })
function resetScroll() { summaryRef.value?.closest('.el-drawer__body')?.scrollTo(0, 0) }
</script>

<template>
  <el-drawer v-model="visible" title="请求详情" size="min(920px, 100vw)" class="request-log-drawer" @opened="resetScroll">
    <template v-if="record">
      <table ref="summaryRef" class="request-summary" aria-label="请求信息">
        <colgroup><col class="label-column"><col><col class="label-column"><col></colgroup>
        <tbody>
          <tr><th>请求 ID</th><td colspan="3" class="log-id">{{ record.requestId || '—' }}</td></tr>
          <tr><th>用户 ID</th><td class="log-id">{{ record.userId || '—' }}</td><th>接口类型</th><td>{{ record.operationLabel }} <span class="muted">{{ record.mode === 'sync' ? '同步' : '异步' }}</span></td></tr>
          <tr><th>接收时间</th><td colspan="3">{{ formatLogTime(record.receivedAt) }}</td></tr>
          <tr><th>执行状态</th><td :colspan="record.mode === 'sync' ? 3 : 1"><el-tag :type="LOG_RESULT_TAG_TYPE[record.result] || 'info'">{{ LOG_RESULT_LABEL[record.result] || '待人工核查' }}</el-tag></td><template v-if="record.mode !== 'sync'"><th>响应发布状态</th><td><el-tag :type="PUBLICATION_TYPE[record.publication] || 'info'">{{ PUBLICATION_LABEL[record.publication] || '—' }}</el-tag></td></template></tr>
          <tr><th>{{ duration.label === '总耗时' ? '请求总耗时' : '已用时' }}</th><td :colspan="record.mode === 'sync' ? 3 : 1" data-testid="request-duration">{{ duration.text }}</td><template v-if="record.mode !== 'sync'"><th>ABIS 接口处理耗时</th><td><div v-for="handling in handlingDurations" :key="handling.id" data-testid="processing-duration"><small v-if="handlingDurations.length > 1">{{ handling.attemptId }}：</small>{{ formatDuration(durationMs(handling.startedAt, handling.endedAt)) }}</div><span v-if="!handlingDurations.length">无数据</span></td></template></tr>
          <tr><th>业务结果摘要</th><td colspan="3" data-testid="business-summary">{{ businessSummary }}</td></tr>
        </tbody>
      </table>
      <div class="request-detail-region">
        <el-alert v-if="record.collectionDelayed" title="日志可能尚未齐全" description="按已有证据展示状态；日志迟到不覆盖入口字段或已确认结果。" type="warning" :closable="false" show-icon />
        <el-alert v-if="record.result === 'unknown'" title="待人工核查" description="业务结果未确认。当前仅供查看，请结合业务记录核查。" type="warning" :closable="false" show-icon />
      <div v-if="attempts.length > 1" class="response-choice"><label id="response-choice-label">ABIS 调用尝试</label>
        <el-select v-model="selectedAttemptId" aria-label="选择 ABIS 调用尝试" class="response-selector">
          <el-option v-for="attempt in attempts" :key="attempt" :value="attempt" :label="`${attempt} / ${formatLogTime(responses.filter(e => e.attemptId === attempt).at(-1)?.at)}`" />
        </el-select>
      </div>
      <el-tabs v-if="record.api === 'identification'" v-model="activeTab" class="request-tabs">
        <el-tab-pane label="处理过程" name="process">
          <RequestLogProcess :record="record" :visible="visible" :request-body="requestBody" :response-body="responseBody" :selected-response="selectedResponse" :response-count="responses.length" />
        </el-tab-pane>
        <el-tab-pane label="图像比对" name="images" lazy>
          <RequestImageComparison v-if="visible && activeTab === 'images'" :record="record" :response-body="responseBody" />
        </el-tab-pane>
      </el-tabs>
      <RequestLogProcess v-else :record="record" :visible="visible" :request-body="requestBody" :response-body="responseBody" :selected-response="selectedResponse" :response-count="responses.length" />
      </div>
    </template>
    <template #footer><el-button @click="visible = false">关闭</el-button></template>
  </el-drawer>
</template>

<style scoped>
.log-id { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
.request-summary { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 0 0 20px; font-size: 13px; }
.label-column { width: 146px; }.request-summary th,.request-summary td { padding: 9px 12px; border: 1px solid var(--abis-border); text-align: left; line-height: 1.7; overflow-wrap: anywhere; }.request-summary th { background: #f7f9fc; color: #5b6b82; font-weight: 500; }
.request-detail-region { border: 1px solid var(--abis-border); border-radius: 6px; overflow: hidden; }
.request-detail-region > .el-alert { margin: 16px; width: calc(100% - 32px); }
.request-detail-region > .response-choice { padding: 12px 16px 0; }.request-detail-region > .request-process { padding: 16px; }
.request-tabs :deep(.el-tabs__header) { margin: 0; padding: 0 16px; background: #f7f9fc; }.request-tabs :deep(.el-tabs__content) { padding: 16px; }
.muted { color: var(--abis-muted); font-size: 12px; }
.response-choice { margin-bottom: 16px; }.response-choice label { display: block; margin-bottom: 8px; color: var(--abis-muted); font-size: 12px; }.response-selector { width: 100%; }
.request-tabs { min-width: 0; }.request-tabs :deep(.el-tabs__item) { font-size: 14px; }
@media(max-width:600px) {
  .request-summary colgroup { display: none; }.request-summary tr { display: grid; grid-template-columns: 100px minmax(0,1fr); }.request-summary th,.request-summary td { padding: 8px; }.request-summary th { grid-column: 1; }.request-summary td { grid-column: 2; }
}
</style>
