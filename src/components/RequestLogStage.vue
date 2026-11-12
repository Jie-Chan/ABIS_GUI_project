<script setup>
import { computed, ref } from 'vue'
import UiIcon from '@/components/UiIcon.vue'
import { STAGE_LABEL, STAGE_STATUS_LABEL, STAGE_STATUS_TYPE, EVENT_STATUS_LABEL } from '@/constants/log'
import { durationMs, formatDuration, formatLogTime, formatEventTime, formatStageTimeRange, handlingSpan, processingSpans, sortEvents, stageTimeline } from '@/utils/log'

const props = defineProps({ stage: { type: Object, required: true }, requestId: { type: String, required: true }, compact: Boolean, defaultExpanded: Boolean, expandFailure: Boolean, locked: Boolean })
const expanded = ref(props.defaultExpanded)
const isHandling = computed(() => props.stage.key === 'ABIS_HANDLING')
const span = computed(() => isHandling.value ? handlingSpan(props.stage) : props.stage)
const events = computed(() => sortEvents(props.stage.events))
const timeline = computed(() => stageTimeline(props.stage))
const processing = computed(() => processingSpans(props.stage))
const attention = computed(() => props.stage.applicable !== false && (props.stage.retryPending || ['FAILED', 'UNKNOWN'].includes(props.stage.status)))
const statusLabel = computed(() => props.stage.applicable === false ? '不适用' : props.stage.retryPending ? '待重试' : STAGE_STATUS_LABEL[props.stage.status] || '结果未知')
const panelId = computed(() => `events-${props.stage.instanceId}`)
function eventDescription(event) {
  return /^本次动作已(?:开始|确认完成)[。.]?$/.test(event?.description || '') ? '' : event?.description
}
</script>

<template>
  <article class="request-stage" :data-stage="stage.key" :data-attempt="stage.attemptId" :class="{ 'needs-attention': attention, 'not-applicable': stage.applicable === false, 'compact-stage': compact }">
    <component :is="locked ? 'div' : 'button'" :type="locked ? undefined : 'button'" class="stage-toggle" :aria-expanded="expanded" :aria-controls="panelId" @click="!locked && (expanded = !expanded)">
      <span class="stage-heading">
        <UiIcon class="stage-chevron" :class="{ expanded }" name="arrow" :size="16" />
        <span class="stage-name">{{ STAGE_LABEL[stage.key] }}</span>
        <el-tag class="stage-state" :type="stage.applicable === false ? 'info' : stage.retryPending ? 'warning' : STAGE_STATUS_TYPE[stage.status] || 'warning'">{{ statusLabel }}</el-tag>
        <span class="stage-duration">{{ formatDuration(durationMs(span.startedAt, span.endedAt)) }}</span>
      </span>
    </component>
    <div v-if="expanded" :id="panelId" class="stage-events">
      <div class="stage-metadata"><code>{{ stage.key }}</code><span aria-hidden="true">·</span><span class="stage-bounds">{{ formatStageTimeRange(span.startedAt, span.endedAt) }}</span></div>
      <template v-if="isHandling && stage.applicable !== false">
        <ol class="handling-events event-timeline">
          <li class="handling-received event-entry" data-handling-item="received">
            <time class="event-time" :datetime="events.find(item => item.kind === 'RECEIVED')?.at" :title="formatLogTime(events.find(item => item.kind === 'RECEIVED')?.at)">{{ formatEventTime(events.find(item => item.kind === 'RECEIVED')?.at) }}</time>
            <span class="event-node" aria-hidden="true" />
            <div class="event-content"><h4>接收请求</h4>
              <template v-for="event in events.filter(item => item.kind === 'RECEIVED')" :key="event.id">
                <div class="event-heading"><el-tag size="small" :type="event.status === 'FAILED' ? 'danger' : 'success'">{{ EVENT_STATUS_LABEL[event.status] }}</el-tag></div>
                <p class="entry-payload">用户 ID：{{ event.payload?.userId || '—' }}；接口类型：{{ event.payload?.api || '—' }}</p>
                <p v-if="event.errorCode">错误码：<code>{{ event.errorCode }}</code></p><p v-if="eventDescription(event)">{{ eventDescription(event) }}</p>
                <p v-if="event.observedAt" class="late-event">采集时间 {{ formatLogTime(event.observedAt) }}，排序与耗时仍使用事件发生时间。</p>
              </template>
              <p v-if="!events.some(item => item.kind === 'RECEIVED')">暂无接收请求记录。</p>
            </div>
          </li>
          <li class="event-entry" data-handling-item="processing">
            <time class="event-time" :datetime="processing[0]?.start?.at" :title="formatLogTime(processing[0]?.start?.at)">{{ formatEventTime(processing[0]?.start?.at) }}</time>
            <span class="event-node" aria-hidden="true" />
            <div class="event-content"><h4>业务处理</h4>
              <div v-for="execution in processing" :key="execution.executionId" class="processing-execution">
                <div class="event-heading"><strong v-if="processing.length > 1">{{ execution.executionId }}</strong><el-tag size="small" :type="execution.end?.status === 'FAILED' ? 'danger' : execution.end ? 'success' : 'info'">{{ execution.end ? EVENT_STATUS_LABEL[execution.end.status] : '处理中' }}</el-tag></div>
                <p>开始 {{ formatLogTime(execution.start?.at) }}</p><p>结束 {{ formatLogTime(execution.end?.at) }}</p>
                <p v-if="execution.end?.errorCode || execution.start?.errorCode">错误码：<code>{{ execution.end?.errorCode || execution.start?.errorCode }}</code></p>
                <p v-if="eventDescription(execution.end) || eventDescription(execution.start)">{{ eventDescription(execution.end) || eventDescription(execution.start) }}</p>
              </div><p v-if="!processing.length">暂无业务处理记录。</p>
            </div>
          </li>
          <li class="event-entry" data-handling-item="responded">
            <time class="event-time" :datetime="events.find(item => item.kind === 'RESPONDED')?.at" :title="formatLogTime(events.find(item => item.kind === 'RESPONDED')?.at)">{{ formatEventTime(events.find(item => item.kind === 'RESPONDED')?.at) }}</time>
            <span class="event-node" aria-hidden="true" />
            <div class="event-content"><h4>发送响应</h4>
              <div v-for="event in events.filter(item => item.kind === 'RESPONDED')" :key="event.id" class="response-event" :data-response-event="event.id">
                <div class="event-heading"><el-tag size="small" :type="event.status === 'FAILED' ? 'danger' : 'success'">{{ EVENT_STATUS_LABEL[event.status] }}</el-tag></div>
                <p v-if="event.errorCode">错误码：<code>{{ event.errorCode }}</code></p><p v-if="eventDescription(event)">{{ eventDescription(event) }}</p>
              </div><p v-if="!events.some(item => item.kind === 'RESPONDED')">暂无发送响应记录。</p>
            </div>
          </li>
        </ol>
      </template>
      <ol v-else-if="timeline.length" class="event-list event-timeline">
        <li v-for="entry in timeline" :key="entry.key" class="event-entry" :class="{ 'handling-entry': entry.type === 'handling' }" :data-event-status="entry.event?.status" :data-event-kind="entry.type === 'event' ? entry.event.kind : 'ABIS_HANDLING'" :data-entry-at="entry.at || ''" :data-entry-attempt="entry.stage?.attemptId || entry.event?.attemptId">
          <time class="event-time" :datetime="entry.at || undefined" :title="formatLogTime(entry.at)">{{ formatEventTime(entry.at) }}</time>
          <span class="event-node" :class="{ 'event-node--handling': entry.type === 'handling' }" aria-hidden="true" />
          <div class="event-content">
            <RequestLogStage v-if="entry.type === 'handling'" :stage="entry.stage" :request-id="requestId" compact :default-expanded="expandFailure && entry.stage.status === 'FAILED'" />
            <template v-else>
              <div class="event-heading"><strong>{{ entry.event.action }}</strong><el-tag v-if="!['CALL_STARTED','PUBLISH_STARTED'].includes(entry.event.kind)" :type="entry.event.status === 'FAILED' ? 'danger' : entry.event.status === 'SUCCESS' ? 'success' : 'info'" size="small">{{ EVENT_STATUS_LABEL[entry.event.status] || '—' }}</el-tag><span v-if="['CALL_STARTED','PUBLISH_STARTED'].includes(entry.event.kind) && entry.event.attemptId" class="event-attempt">{{ entry.event.attemptId }}</span><span v-if="entry.event.note" class="event-note">{{ entry.event.note }}</span></div>
              <p v-if="entry.event.kind === 'RECEIVED'" class="entry-payload">用户 ID：{{ entry.event.payload?.userId || '—' }}；接口类型：{{ entry.event.payload?.api || '—' }}</p>
              <p v-if="entry.event.errorCode">错误码：<code>{{ entry.event.errorCode }}</code></p><p v-if="eventDescription(entry.event)">{{ eventDescription(entry.event) }}</p>
            </template>
          </div>
        </li>
      </ol>
      <p v-else class="section-help">{{ stage.applicable === false ? '该阶段确定不会执行。' : '暂无采集到的 Event，不据此推断业务结果。' }}</p>
    </div>
  </article>
</template>

<style scoped>
.request-stage { margin-top: 12px; border: 1px solid var(--abis-border); border-radius: 8px; overflow: hidden; }
.request-stage.needs-attention { border-color: #edc6a5; border-left: 3px solid #bc791d; }
.stage-toggle { display: block; width: 100%; padding: 16px; border: 0; background: #f7f9fc; text-align: left; color: var(--el-text-color-primary); }
.needs-attention > .stage-toggle { background: #fffbf5; }.stage-toggle:hover { background: #eef3fb; }
.stage-heading { display: flex; align-items: center; gap: 10px; }.stage-name { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; }
.stage-state { flex-shrink: 0; }.stage-chevron.expanded { transform: rotate(90deg); }
.stage-duration { color: var(--el-text-color-regular); font-size: 12px; white-space: nowrap; }.stage-events { padding: 18px 20px; border-top: 1px solid var(--abis-border); }
.event-timeline { margin: 0; padding: 0; list-style: none; }
.event-entry { display: grid; grid-template-columns: 94px 14px minmax(0,1fr); column-gap: 10px; position: relative; padding-bottom: 22px; }
.event-entry:last-child { padding-bottom: 0; }
.event-entry::before { content: ''; position: absolute; left: 110px; top: 10px; bottom: -10px; width: 1px; background: #ccd7e5; }
.event-entry:last-child::before { display: none; }
.event-time { font-family: ui-monospace,SFMono-Regular,Consolas,monospace; font-size: 11px; line-height: 22px; color: var(--abis-muted); white-space: nowrap; }
.event-node { width: 7px; height: 7px; border-radius: 50%; background: #7595bd; margin: 8px auto 0; z-index: 1; }
.event-node--handling { width: 8px; height: 8px; background: #fff; border: 2px solid #7595bd; }
.event-entry[data-event-status="FAILED"] > .event-node { background: var(--el-color-danger); }
.event-content { min-width: 0; }.event-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; font-size: 13px; }
.event-attempt, .event-note { color: var(--abis-muted); font-size: 11px; overflow-wrap: anywhere; }
p { margin: 6px 0 0; overflow-wrap: anywhere; color: var(--abis-muted); font-size: 12px; line-height: 1.8; }
code { color: var(--el-text-color-regular); overflow-wrap: anywhere; }h4 { margin: 0 0 10px; color: var(--el-text-color-primary); font-size: 14px; }
.processing-execution + .processing-execution { margin-top: 14px; }.late-event { color: var(--el-color-warning); }
.stage-metadata { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; margin-bottom: 16px; font-size: 11px; line-height: 1.8; color: var(--abis-muted); }.stage-bounds { min-width: 0; overflow-wrap: anywhere; }
.compact-stage { margin: 0; border: 0; border-radius: 0; overflow: visible; }
.compact-stage > .stage-toggle { padding: 0; background: transparent; }
.compact-stage > .stage-toggle:hover { color: var(--el-color-primary); }
.compact-stage .stage-heading { flex-wrap: wrap; gap: 6px; }
.compact-stage .stage-name { font-size: 13px; }
.compact-stage > .stage-events { margin-top: 14px; padding: 0 0 0 8px; border-top: 0; }
@media(max-width:600px) {
  .stage-toggle { padding: 12px; }.stage-events { padding: 14px 10px; }
  .event-entry { grid-template-columns: 82px 10px minmax(0,1fr); column-gap: 7px; }.event-entry::before { left: 93.5px; }
  .event-time { font-size: 10px; }.stage-name { font-size: 13px; }.compact-stage > .stage-events { padding-left: 0; }
  .compact-stage .event-entry { grid-template-columns: minmax(0,1fr); row-gap: 6px; padding-left: 10px; }
  .compact-stage .event-entry::before { left: 2px; }.compact-stage .event-node { position: absolute; left: -1px; top: 0; margin-top: 8px; grid-column: auto; grid-row: auto; }
  .compact-stage .event-time { padding-left: 4px; }.compact-stage .event-content { padding-left: 4px; }
}
@media(max-width:360px) {
  .event-entry { grid-template-columns: 10px minmax(0,1fr); row-gap: 6px; }
  .event-entry::before { left: 4.5px; }
  .event-time, .event-content { grid-column: 2; }
  .event-node { grid-column: 1; grid-row: 1; }
  .compact-stage .event-time, .compact-stage .event-content { grid-column: 1; }
}
</style>
