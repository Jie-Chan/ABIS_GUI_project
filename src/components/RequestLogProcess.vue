<script setup>
import RequestLogStage from '@/components/RequestLogStage.vue'
import { ref, nextTick, watch } from 'vue'
const props = defineProps({ record: { type: Object, required: true }, visible: Boolean })
const root = ref(null)
const focusedEvent = ref(null)
watch([() => props.visible, () => props.record.requestId], () => { focusedEvent.value = null })
async function focusEvent(event) {
  focusedEvent.value = { id: event.id, nonce: Date.now() }
  await nextTick()
  await nextTick()
  const target = root.value?.querySelector(`[data-event-id="${CSS.escape(event.id)}"], [data-event-start-id="${CSS.escape(event.id)}"]`)
  const scroll = root.value?.closest('.el-tabs__content')
  if (target && scroll) scroll.scrollTo({ top: scroll.scrollTop + target.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12, behavior: 'smooth' })
}
defineExpose({ focusEvent })
</script>
<template>
  <div ref="root" class="request-process" :class="{ 'sync-process': record.mode === 'sync' }">
    <section aria-label="阶段时间线" class="request-stages">
      <div class="stage-timeline" :class="{ 'stage-timeline--async': record.mode === 'async' }">
        <div v-for="stage in record.stages" :key="`${record.requestId}-${visible}-${stage.instanceId}`" class="timeline-step">
          <RequestLogStage :stage="stage" :request-id="record.requestId || ''" :default-expanded="true" :caller="record.caller" :focused-event="focusedEvent" />
        </div>
      </div>
    </section>
  </div>
</template>
<style scoped>
.stage-timeline--async { padding-left: 22px; }
.stage-timeline--async .timeline-step { position: relative; padding-bottom: 8px; }
.stage-timeline--async .timeline-step::before { content: ""; position: absolute; left: -17px; top: 20px; bottom: -20px; border-left: 1px solid #bdcde2; }
.stage-timeline--async .timeline-step:last-child::before { display: none; }
.stage-timeline--async .timeline-step::after { content: ""; position: absolute; left: -21px; top: 15px; width: 9px; height: 9px; border: 2px solid #7595bd; border-radius: 50%; background: #fff; }
.sync-process :deep(.stage-events) { padding-top: 6px; padding-bottom: 4px; }
.sync-process :deep(.stage-metadata) { margin-bottom: 8px; }
.sync-process :deep(.event-entry) { padding-bottom: 10px; }
.sync-process :deep(h4) { margin-bottom: 4px; }
.sync-process :deep(.event-heading) { margin-bottom: 2px; }
.sync-process :deep(p) { margin-top: 2px; line-height: 1.5; }
</style>
