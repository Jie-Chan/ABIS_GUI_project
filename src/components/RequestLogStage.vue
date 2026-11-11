<script setup>
import { computed, ref } from 'vue'
import UiIcon from '@/components/UiIcon.vue'
import { STAGE_LABEL, STAGE_STATUS_LABEL, STAGE_STATUS_TYPE, EVENT_STATUS_LABEL } from '@/constants/log'
import { durationMs, formatDuration, formatLogTime, handlingSpan, processingSpans, sortEvents } from '@/utils/log'

const props = defineProps({ stage: { type: Object, required: true }, requestId: { type: String, required: true } })
defineEmits(['view-response'])
const expanded = ref(false)
const isHandling = computed(() => props.stage.key === 'ABIS_HANDLING')
const span = computed(() => isHandling.value ? handlingSpan(props.stage) : props.stage)
const events = computed(() => sortEvents(props.stage.events))
const processing = computed(() => processingSpans(props.stage))
const attention = computed(() => props.stage.applicable !== false && (props.stage.retryPending || ['FAILED', 'UNKNOWN'].includes(props.stage.status)))
const statusLabel = computed(() => props.stage.applicable === false ? '不适用' : props.stage.retryPending ? '待重试' : STAGE_STATUS_LABEL[props.stage.status] || '结果未知')
const panelId = computed(() => `events-${props.stage.instanceId}`)
</script>

<template>
  <article class="request-stage" :data-stage="stage.key" :data-attempt="stage.attemptId" :class="{ 'needs-attention': attention, 'not-applicable': stage.applicable === false }">
    <button type="button" class="stage-toggle" :aria-expanded="expanded" :aria-controls="panelId" @click="expanded = !expanded">
      <span class="stage-heading">
        <UiIcon class="stage-chevron" :class="{ expanded }" name="arrow" :size="16" />
        <span class="stage-name">{{ STAGE_LABEL[stage.key] }}<small>{{ stage.key }}<template v-if="stage.attemptId"> / {{ stage.attemptId }}</template></small></span>
        <el-tag class="stage-state" :type="stage.applicable === false ? 'info' : stage.retryPending ? 'warning' : STAGE_STATUS_TYPE[stage.status] || 'warning'">{{ statusLabel }}</el-tag>
      </span>
      <span class="stage-timing"><span>开始 {{ formatLogTime(span.startedAt) }}</span><span>结束 {{ formatLogTime(span.endedAt) }}</span><span class="stage-duration">耗时 {{ formatDuration(durationMs(span.startedAt, span.endedAt)) }}</span></span>
    </button>
    <div v-if="expanded" :id="panelId" class="stage-events">
      <template v-if="isHandling && stage.applicable !== false">
        <ol class="handling-events">
          <li class="handling-received" data-handling-item="received">
            <h4>接收请求</h4>
            <template v-for="event in events.filter(item => item.kind === 'RECEIVED')" :key="event.id">
              <div class="event-heading"><time>{{ formatLogTime(event.at) }}</time><el-tag size="small" :type="event.status === 'FAILED' ? 'danger' : 'success'">{{ EVENT_STATUS_LABEL[event.status] }}</el-tag></div>
              <p class="entry-payload">用户 ID：{{ event.payload?.userId || '—' }}；接口类型：{{ event.payload?.api || '—' }}</p>
              <p v-if="event.errorCode">错误码：<code>{{ event.errorCode }}</code></p>
              <p>{{ event.description }}</p>
              <p v-if="event.observedAt" class="late-event">采集时间 {{ formatLogTime(event.observedAt) }}，排序与耗时仍使用事件发生时间。</p>
            </template>
            <p v-if="!events.some(item => item.kind === 'RECEIVED')">暂无接收请求记录。</p>
          </li>
          <li data-handling-item="processing">
            <h4>业务处理</h4>
            <div v-for="execution in processing" :key="execution.executionId" class="processing-execution">
              <div class="event-heading"><strong>{{ execution.executionId }}</strong><el-tag size="small" :type="execution.end?.status === 'FAILED' ? 'danger' : execution.end ? 'success' : 'info'">{{ execution.end ? EVENT_STATUS_LABEL[execution.end.status] : '已开始' }}</el-tag></div>
              <p>开始 {{ formatLogTime(execution.start?.at) }}</p><p>结束 {{ formatLogTime(execution.end?.at) }}</p>
              <p class="processing-duration">ABIS 实际处理耗时 {{ formatDuration(durationMs(execution.start?.at, execution.end?.at)) }}</p>
              <p v-if="execution.end?.errorCode || execution.start?.errorCode">错误码：<code>{{ execution.end?.errorCode || execution.start?.errorCode }}</code></p>
              <p>{{ execution.end?.description || execution.start?.description }}</p>
            </div>
            <p v-if="!processing.length">暂无业务处理记录。</p>
          </li>
          <li data-handling-item="responded">
            <h4>发送响应</h4>
            <div v-for="event in events.filter(item => item.kind === 'RESPONDED')" :key="event.id" class="response-event" :data-response-event="event.id">
              <div class="event-heading"><time>{{ formatLogTime(event.at) }}</time><el-tag size="small" :type="event.status === 'FAILED' ? 'danger' : 'success'">{{ EVENT_STATUS_LABEL[event.status] }}</el-tag><el-button link type="primary" @click="$emit('view-response', event)">查看响应</el-button></div>
              <p v-if="event.errorCode">错误码：<code>{{ event.errorCode }}</code></p>
              <p>{{ event.description }}</p>
            </div>
            <p v-if="!events.some(item => item.kind === 'RESPONDED')">暂无发送响应记录。</p>
          </li>
        </ol>
      </template>
      <ol v-else-if="events.length" class="event-list">
        <li v-for="event in events" :key="event.id" :data-event-status="event.status" :data-event-kind="event.kind">
          <div class="event-heading"><strong>{{ event.action }}</strong><el-tag :type="event.status === 'FAILED' ? 'danger' : event.status === 'SUCCESS' ? 'success' : 'info'" size="small">{{ EVENT_STATUS_LABEL[event.status] || '—' }}</el-tag></div>
          <time>{{ formatLogTime(event.at) }}</time>
          <p v-if="event.kind === 'RECEIVED'" class="entry-payload">用户 ID：{{ event.payload?.userId || '—' }}；接口类型：{{ event.payload?.api || '—' }}</p>
          <p v-if="event.errorCode">错误码：<code>{{ event.errorCode }}</code></p>
          <p v-if="event.description">{{ event.description }}</p>
        </li>
      </ol>
      <p v-else class="section-help">{{ stage.applicable === false ? '该阶段确定不会执行。' : '暂无采集到的 Event，不据此推断业务结果。' }}</p>
      <div v-if="stage.children?.length" class="nested-stages">
        <RequestLogStage v-for="child in stage.children" :key="child.instanceId" :stage="child" :request-id="requestId" @view-response="$emit('view-response', $event)" />
      </div>
    </div>
  </article>
</template>

<style scoped>
.request-stage { margin-top: 12px; border: 1px solid var(--abis-border); border-radius: 8px; overflow: hidden; }
.request-stage.needs-attention { border-color: #edc6a5; border-left: 3px solid #bc791d; }
.stage-toggle { display: block; width: 100%; padding: 16px; border: 0; background: #f7f9fc; text-align: left; color: var(--el-text-color-primary); }
.needs-attention > .stage-toggle { background: #fffbf5; }
.stage-toggle:hover { background: #eef3fb; }
.stage-heading { display: flex; align-items: center; gap: 10px; }
.stage-name { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; }
.stage-name small { display: block; margin-top: 4px; font-size: 11px; color: var(--abis-muted); font-weight: 400; overflow-wrap: anywhere; }
.stage-state { flex-shrink: 0; }
.stage-chevron.expanded { transform: rotate(90deg); }
.stage-timing { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 12px 0 0 26px; color: var(--abis-muted); font-size: 12px; line-height: 1.6; }
.stage-duration { color: var(--el-text-color-regular); }
.stage-events { padding: 16px 20px; border-top: 1px solid var(--abis-border); }
.event-list, .handling-events { margin: 0; padding: 0 0 0 20px; }
.event-list > li, .handling-events > li { padding: 0 0 18px 10px; }
.event-list > li:last-child, .handling-events > li:last-child { padding-bottom: 0; }
li::marker { color: var(--el-color-primary); }
li[data-event-status="FAILED"]::marker { color: var(--el-color-danger); }
.event-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 6px; font-size: 13px; }
time, p { color: var(--abis-muted); font-size: 12px; line-height: 1.8; }
p { margin: 6px 0 0; overflow-wrap: anywhere; }
code { color: var(--el-text-color-regular); overflow-wrap: anywhere; }
h4 { margin: 0 0 10px; color: var(--el-text-color-primary); font-size: 14px; }
.processing-execution + .processing-execution { margin-top: 14px; }
.nested-stages { margin-top: 18px; }
.late-event { color: var(--el-color-warning); }
@media (max-width: 600px) {
  .stage-toggle { padding: 12px; }
  .stage-timing { flex-direction: column; gap: 4px; margin-left: 0; font-size: 11px; }
  .stage-events { padding: 14px 10px; }
  .stage-name { font-size: 13px; }
  .event-list, .handling-events { padding-left: 14px; }
  .event-list > li, .handling-events > li { padding-left: 2px; }
}
</style>
