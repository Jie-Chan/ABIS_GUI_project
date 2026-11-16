<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import RequestLogMessages from '@/components/RequestLogMessages.vue'
import RequestLogProcess from '@/components/RequestLogProcess.vue'
import RequestImageComparison from '@/components/RequestImageComparison.vue'
import { LOG_RESULT_LABEL, LOG_RESULT_TAG_TYPE, PUBLICATION_LABEL, PUBLICATION_TYPE } from '@/constants/log'
import { durationMs, formatDuration, requestDuration, formatLogTime, handlingStages, handlingSpan, projectRequest, responseForEvent, requestForAttempt, sortEvents } from '@/utils/log'

const visible = defineModel({ type: Boolean, default: false })
const props = defineProps({ record: { type: Object, default: null }, now: { type: Number, required: true } })
const summaryRef = ref(null)
const processRef = ref(null)
const selectedAttemptId = ref(null)
const activeTab = ref('process')
const record = computed(() => props.record ? projectRequest(props.record) : null)
const callMode = computed(() => record.value?.mode === 'sync' ? '同步' : record.value?.mode === 'async' ? '异步' : '未记录')
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
    if (record.value.publication === 'pending') return `${action}成功 · 响应待发布`
    if (record.value.publication === 'published' && attempts.value.length > 1) return `${action}成功 · 重试后完成`
    const body = responseForEvent(record.value, responses.value.at(-1))
    const candidates = record.value.api === 'identification' && Array.isArray(body?.candidates) ? ` · 候选 ${body.candidates.length} 条` : ''
    return `${action}成功${candidates}`
  }
  if (record.value.result === 'failure') return `${action}失败${record.value.publication === 'published' ? ' · 失败响应已发布' : record.value.publication === 'pending' ? ' · 失败响应待发布' : ''}`
  if (record.value.result === 'waiting' && record.value.stages.some(stage => stage.retryPending)) return `${action} · 等待调用重试`
  return `${action} · ${LOG_RESULT_LABEL[record.value.result] || '待人工核查'}`
})
const exceptionInfo = computed(() => {
  function collect(stage) { return [...(stage.events || []).map(event => ({ ...event, stage: stage.key })), ...(stage.children || []).flatMap(collect)] }
  const errors = sortEvents((record.value?.stages || []).flatMap(collect).filter(event => event.errorCode))
  const currentStage = record.value?.publication === 'pending' ? 'ADAPTER_RESPONDED'
    : record.value?.result === 'failure' ? 'ABIS_HANDLING'
      : ['waiting', 'unknown'].includes(record.value?.result) ? 'ADAPTER_CALLING' : null
  const current = currentStage ? errors.filter(event => event.stage === currentStage).at(-1) : null
  return { event: current || errors.at(-1) || null, historical: !current }
})
const exceptionEvent = computed(() => exceptionInfo.value.event)
async function viewException() {
  activeTab.value = 'process'
  if (attempts.value.includes(exceptionEvent.value?.attemptId)) selectedAttemptId.value = exceptionEvent.value.attemptId
  await nextTick()
  if (exceptionEvent.value) await processRef.value?.focusEvent(exceptionEvent.value)
}
watch([visible, () => props.record], () => { selectedAttemptId.value = responses.value.at(-1)?.attemptId || attempts.value.at(-1) || null; activeTab.value = 'process' })
function resetScroll() { summaryRef.value?.closest('.el-drawer__body')?.scrollTo(0, 0) }
</script>

<template>
  <el-drawer v-model="visible" title="请求详情" size="min(920px, 100vw)" class="request-log-drawer detail-drawer" :class="{ 'is-sync-request': record?.mode === 'sync' }" @opened="resetScroll">
    <template v-if="record">
      <table ref="summaryRef" class="request-summary" aria-label="请求信息">
        <colgroup><col class="label-column"><col><col class="label-column"><col></colgroup>
        <tbody>
          <tr><th>请求 ID</th><td colspan="3" class="log-id">{{ record.requestId || '—' }}</td></tr>
          <tr><th>用户 ID</th><td class="log-id">{{ record.userId || '—' }}</td><th>接口类型</th><td>{{ record.operationLabel }}</td></tr>
          <tr><th>接收时间</th><td colspan="3">{{ formatLogTime(record.receivedAt) }}</td></tr>
          <tr><th>调用方式</th><td colspan="3">{{ callMode }}</td></tr>
          <tr><th>执行状态</th><td :colspan="record.mode === 'sync' ? 3 : 1"><el-tag :type="LOG_RESULT_TAG_TYPE[record.result] || 'info'">{{ LOG_RESULT_LABEL[record.result] || '待人工核查' }}</el-tag><span v-if="record.result === 'unknown'" class="state-note">业务结果未确认，请人工核查。</span></td><template v-if="record.mode !== 'sync'"><th>响应发布状态</th><td><el-tag :type="PUBLICATION_TYPE[record.publication] || 'info'">{{ PUBLICATION_LABEL[record.publication] || '—' }}</el-tag></td></template></tr>
          <tr><th>{{ duration.label === '总耗时' ? '请求总耗时' : '已用时' }}</th><td :colspan="record.mode === 'sync' ? 3 : 1" data-testid="request-duration">{{ duration.text }}</td><template v-if="record.mode !== 'sync'"><th>ABIS 接口处理耗时</th><td><div v-for="handling in handlingDurations" :key="handling.id" data-testid="processing-duration"><small v-if="handlingDurations.length > 1">{{ handling.attemptId }}：</small>{{ formatDuration(durationMs(handling.startedAt, handling.endedAt)) }}</div><span v-if="!handlingDurations.length">无数据</span></td></template></tr>
          <tr><th>业务结果摘要</th><td colspan="3" data-testid="business-summary">{{ businessSummary }}<span v-if="exceptionEvent" class="summary-exception" :class="{ historical: exceptionInfo.historical }"><code>{{ exceptionEvent.errorCode }}</code><el-button link type="primary" @click="viewException">{{ exceptionInfo.historical ? '历史异常' : '查看事件' }}</el-button></span></td></tr>
        </tbody>
      </table>
      <div class="request-detail-region" :class="{ 'is-image-tab': activeTab === 'images' }">
        <el-alert v-if="record.collectionDelayed" title="日志可能尚未齐全" description="按已有证据展示状态；日志迟到不覆盖入口字段或已确认结果。" type="warning" :closable="false" show-icon />
      <div v-if="attempts.length > 1" class="response-choice"><label id="response-choice-label">ABIS 调用尝试</label>
        <el-select v-model="selectedAttemptId" aria-label="选择 ABIS 调用尝试" class="response-selector">
          <el-option v-for="attempt in attempts" :key="attempt" :value="attempt" :label="`${attempt} / ${formatLogTime(responses.filter(e => e.attemptId === attempt).at(-1)?.at)}`" />
        </el-select>
      </div>
      <el-tabs v-model="activeTab" class="request-tabs">
        <el-tab-pane label="处理过程" name="process">
          <RequestLogProcess ref="processRef" :record="record" :visible="visible" />
        </el-tab-pane>
        <el-tab-pane label="接口报文" name="messages" lazy>
          <RequestLogMessages v-if="visible" :key="record.requestId" :record="record" :visible="visible" :request-body="requestBody" :response-body="responseBody" :selected-response="selectedResponse" :response-count="responses.length" />
        </el-tab-pane>
        <el-tab-pane v-if="record.api === 'identification'" label="图像比对" name="images" lazy>
          <RequestImageComparison v-if="visible" :key="record.requestId" :record="record" :response-body="responseBody" />
        </el-tab-pane>
      </el-tabs>

      </div>
    </template>
    <template #footer><el-button @click="visible = false">关闭</el-button></template>
  </el-drawer>
</template>

<style scoped>
:global(.request-log-drawer.is-sync-request .el-drawer__header) { padding-top: 16px; }
.is-sync-request .request-summary { margin-bottom: 12px; }.is-sync-request .request-summary th,.is-sync-request .request-summary td { padding-top: 4px; padding-bottom: 4px; }.is-sync-request .request-tabs :deep(.el-tabs__content) { padding: 10px 16px; }
:global(.request-log-drawer .el-drawer__body) { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.request-summary, .request-tabs :deep(.el-tabs__header), .response-choice, .request-detail-region > .el-alert { flex-shrink: 0; }
.log-id { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
.request-summary { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 0 0 20px; font-size: 13px; }
.label-column { width: 146px; }.request-summary th,.request-summary td { padding: 9px 12px; border: 1px solid var(--abis-border); text-align: left; line-height: 1.7; overflow-wrap: anywhere; }.request-summary th { background: #f7f9fc; color: #5b6b82; font-weight: 500; }
.request-detail-region { display: flex; flex-direction: column; min-height: 0; border: 1px solid var(--abis-border); border-radius: 6px; overflow: hidden; }
.request-detail-region > .el-alert { margin: 16px; width: calc(100% - 32px); }
.request-detail-region > .response-choice { padding: 12px 16px 0; }.request-detail-region > .request-process { padding: 16px; }
.request-tabs :deep(.el-tabs__header) { margin: 0; padding: 0 16px; background: #f7f9fc; }.request-tabs :deep(.el-tabs__content) { min-height: 0; padding: 16px; overflow-y: auto; overscroll-behavior-y: contain; }
.summary-exception { display: inline-flex; align-items: center; gap: 8px; margin-left: 12px; font-size: 12px; color: var(--el-color-warning); }
.summary-exception.historical { color: var(--abis-muted); }
.state-note { display:block; color:var(--el-color-warning); font-size:12px; margin-top:4px; }
.response-choice { margin-bottom: 16px; }.response-choice label { display: block; margin-bottom: 8px; color: var(--abis-muted); font-size: 12px; }.response-selector { width: 100%; }
.request-tabs { display: flex; flex-direction: column; min-width: 0; min-height: 0; }.request-tabs :deep(.el-tabs__item) { font-size: 14px; }
@media(max-height:600px) {
  .request-summary th,.request-summary td { padding-top: 4px; padding-bottom: 4px; }
  .request-summary { margin-bottom: 12px; }
}
@media(max-width:600px) {
  .request-summary colgroup { display: none; }.request-summary tr { display: grid; grid-template-columns: 100px minmax(0,1fr); }.request-summary th,.request-summary td { padding: 8px; }.request-summary th { grid-column: 1; }.request-summary td { grid-column: 2; }
}
</style>

<style scoped>
@media(min-width:601px) {
 .is-image-tab,.is-image-tab .request-tabs { flex: 1; }
 .is-image-tab .request-tabs :deep(.el-tabs__content) { flex: 1; padding: 12px 16px; }
 .is-image-tab .request-tabs :deep(#pane-images) { height: 100%; min-height: 0; }
}
@media(min-width:601px) and (max-height:820px) {
 .request-summary th,.request-summary td { padding-top: 5px; padding-bottom: 5px; line-height: 1.6; }
 .request-summary { margin-bottom: 16px; }
}
</style>
