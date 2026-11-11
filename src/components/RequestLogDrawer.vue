<script setup>
import { computed, ref, watch } from 'vue'
import UiIcon from '@/components/UiIcon.vue'
import {
  LOG_FEATURE_LABEL, LOG_RESULT_LABEL, LOG_RESULT_TAG_TYPE, PUBLICATION_LABEL, PUBLICATION_TYPE,
  STAGE_LABEL, STAGE_STATUS_LABEL, STAGE_STATUS_TYPE, EVENT_STATUS_LABEL,
} from '@/constants/log'
import { durationMs, formatDuration, requestDuration, formatLogTime } from '@/utils/log'

const visible = defineModel({ type: Boolean, default: false })
const props = defineProps({ record: { type: Object, default: null }, now: { type: Number, required: true } })
const expanded = ref([])
const summaryRef = ref(null)
function resetScroll() { summaryRef.value?.closest('.el-drawer__body')?.scrollTo(0, 0) }
watch([visible, () => props.record], () => { expanded.value = [] })
const processing = computed(() => props.record?.stages?.find(stage => stage.key === 'ABIS_PROCESSING'))
const duration = computed(() => props.record ? requestDuration(props.record, props.now) : null)
function toggle(key) {
  expanded.value = expanded.value.includes(key) ? expanded.value.filter(item => item !== key) : [...expanded.value, key]
}
function stageText(stage) { return stage.applicable === false ? '不适用' : STAGE_STATUS_LABEL[stage.status] || '结果未知' }
function attention(stage) { return stage.applicable !== false && ['FAILED', 'UNKNOWN'].includes(stage.status) }
</script>

<template>
  <el-drawer v-model="visible" title="请求详情" size="min(920px, 100vw)" class="request-log-drawer" @opened="resetScroll">
    <template v-if="record">
      <div ref="summaryRef" class="request-detail-title">
        <h2 class="log-id">{{ record.requestId || '—' }}</h2>
        <el-tag type="info">{{ record.mode === 'sync' ? '同步请求' : '异步请求' }}</el-tag>
      </div>
      <p class="scenario-name">{{ record.scenario }}</p>
      <el-alert v-if="record.collectionDelayed" title="日志可能尚未齐全" description="按已有证据展示状态；缺少时间的阶段暂不计算耗时。" type="warning" :closable="false" show-icon />
      <el-alert v-if="record.result === 'unknown'" title="待人工核查" description="业务结果未确认。当前仅供查看，请结合业务记录核查。" type="warning" :closable="false" show-icon />

      <el-descriptions class="request-summary" :column="1" border>
        <el-descriptions-item label="用户 ID"><span class="log-id">{{ record.userId || '—' }}</span></el-descriptions-item>
        <el-descriptions-item label="接口类型">{{ record.apiLabel }} <span class="muted">{{ record.api }}</span></el-descriptions-item>
        <el-descriptions-item label="接收时间">{{ formatLogTime(record.receivedAt) }}</el-descriptions-item>
        <el-descriptions-item label="执行状态"><el-tag :type="LOG_RESULT_TAG_TYPE[record.result] || 'info'">{{ LOG_RESULT_LABEL[record.result] || '待人工核查' }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="响应发布状态"><el-tag :type="PUBLICATION_TYPE[record.publication] || 'info'">{{ PUBLICATION_LABEL[record.publication] || '—' }}</el-tag></el-descriptions-item>
        <el-descriptions-item label="请求耗时"><span data-testid="request-duration">{{ duration.label }} {{ duration.text }}</span></el-descriptions-item>
        <el-descriptions-item label="ABIS 实际处理耗时"><span data-testid="processing-duration">{{ formatDuration(durationMs(processing?.startedAt, processing?.endedAt)) }}</span></el-descriptions-item>
      </el-descriptions>

      <section aria-labelledby="stages-heading" class="request-stages">
        <h2 id="stages-heading">Stage 概览</h2>
        <p class="section-help">按链路逻辑顺序展示。点击阶段查看 Event，阶段时间可以重叠。</p>
        <article v-for="stage in record.stages || []" :key="stage.key" :data-stage="stage.key" class="request-stage" :class="{ 'needs-attention': attention(stage), 'not-applicable': stage.applicable === false }">
          <button type="button" class="stage-toggle" :aria-expanded="expanded.includes(stage.key)" :aria-controls="`events-${record.id}-${stage.key}`" @click="toggle(stage.key)">
            <span class="stage-heading">
              <UiIcon class="stage-chevron" :class="{ expanded: expanded.includes(stage.key) }" name="arrow" :size="16" />
              <span class="stage-name">{{ STAGE_LABEL[stage.key] }}<small>{{ stage.key }}</small></span>
              <el-tag class="stage-state" :type="stage.applicable === false ? 'info' : STAGE_STATUS_TYPE[stage.status] || 'warning'">{{ stageText(stage) }}</el-tag>
            </span>
            <span class="stage-timing"><span>开始 {{ formatLogTime(stage.startedAt) }}</span><span>结束 {{ formatLogTime(stage.endedAt) }}</span><span class="stage-duration">耗时 {{ formatDuration(durationMs(stage.startedAt, stage.endedAt)) }}</span></span>
          </button>
          <div v-if="expanded.includes(stage.key)" :id="`events-${record.id}-${stage.key}`" class="stage-events">
            <ol v-if="stage.events?.length" class="event-list">
              <li v-for="(event, index) in stage.events" :key="index" :data-event-status="event.status">
                <div class="event-heading"><strong>{{ event.action }}</strong><el-tag :type="event.status === 'FAILED' ? 'danger' : event.status === 'SUCCESS' ? 'success' : 'info'" size="small">{{ EVENT_STATUS_LABEL[event.status] || '—' }}</el-tag></div>
                <time>{{ formatLogTime(event.at) }}</time>
                <p class="event-code">错误码：<code>{{ event.errorCode || '—' }}</code></p>
                <p v-if="event.description">{{ event.description }}</p>
              </li>
            </ol>
            <p v-else class="section-help">{{ stage.applicable === false ? '该阶段确定不会执行。' : '暂无采集到的 Event，不据此推断业务结果。' }}</p>
          </div>
        </article>
      </section>

      <section class="request-response" aria-labelledby="response-heading">
        <h2 id="response-heading">返回结果</h2>
        <p v-if="record.response == null" class="unconfirmed-result">业务结果未确认</p>
        <pre v-else tabindex="0" aria-label="返回结果 JSON">{{ JSON.stringify(record.response, null, 2) }}</pre>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="调用方标识">{{ record.caller || '—' }}</el-descriptions-item>
          <el-descriptions-item label="生物模态">{{ LOG_FEATURE_LABEL[record.feature] || '—' }}</el-descriptions-item>
        </el-descriptions>
      </section>
      <p class="section-help">仅展示请求元数据及结果，不含生物图像。人工核查为只读展示。</p>
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
.section-help { color: var(--abis-muted); font-size: 12px; line-height: 1.8; }
.request-stage { margin-top: 12px; border: 1px solid var(--abis-border); border-radius: 8px; overflow: hidden; }
.request-stage.needs-attention { border-color: #edc6a5; border-left: 3px solid #bc791d; }
.stage-toggle { display: block; width: 100%; padding: 16px; border: 0; background: #f7f9fc; text-align: left; color: var(--el-text-color-primary); }
.needs-attention .stage-toggle { background: #fffbf5; }
.stage-toggle:hover { background: #eef3fb; }
.stage-heading { display: flex; align-items: center; gap: 10px; }
.stage-name { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; }
.stage-name small { display: block; margin-top: 4px; font-size: 11px; color: var(--abis-muted); font-weight: 400; overflow-wrap: anywhere; }
.stage-state { flex-shrink: 0; }
.stage-chevron.expanded { transform: rotate(90deg); }
.stage-timing { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 12px 0 0 26px; color: var(--abis-muted); font-size: 12px; line-height: 1.6; }
.stage-duration { color: var(--el-text-color-regular); }
.stage-events { padding: 16px 20px; border-top: 1px solid var(--abis-border); }
.event-list { margin: 0; padding: 0 0 0 20px; }
.event-list li { padding: 0 0 18px 10px; }
.event-list li:last-child { padding-bottom: 0; }
.event-list li::marker { color: var(--el-color-primary); }
.event-list li[data-event-status="FAILED"]::marker { color: var(--el-color-danger); }
.event-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 6px; font-size: 13px; }
.event-list time, .event-list p { color: var(--abis-muted); font-size: 12px; line-height: 1.8; }
.event-list p { margin: 6px 0 0; overflow-wrap: anywhere; }
.event-code code { color: var(--el-text-color-regular); overflow-wrap: anywhere; }
.request-response { margin-top: 28px; }
.request-response pre { padding: 18px; border: 1px solid var(--abis-border); border-radius: 6px; background: #f7f9fc; color: #31476b; font-size: 12px; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; }
.unconfirmed-result { padding: 16px; border: 1px dashed #dac7a5; border-radius: 6px; color: #91651f; font-size: 13px; }
@media (max-width: 600px) {
  .request-summary :deep(.el-descriptions__label) { width: 110px; }
  .stage-toggle { padding: 12px; }
  .stage-timing { flex-direction: column; gap: 4px; margin-left: 0; font-size: 11px; }
  .stage-events { padding: 14px 12px; }
  .stage-name { font-size: 13px; }
  .request-detail-title h2 { font-size: 18px; }
}
</style>
