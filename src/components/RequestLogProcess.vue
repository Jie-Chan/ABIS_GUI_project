<script setup>
import RequestLogStage from '@/components/RequestLogStage.vue'
defineProps({ record: { type: Object, required: true }, visible: Boolean })
</script>
<template>
  <div class="request-process">
    <section aria-label="阶段时间线" class="request-stages">
      <div class="stage-timeline" :class="{ 'stage-timeline--async': record.mode === 'async' }">
        <div v-for="stage in record.stages" :key="`${record.requestId}-${visible}-${stage.instanceId}`" class="timeline-step">
          <RequestLogStage :stage="stage" :request-id="record.requestId || ''" :default-expanded="true" :caller="record.caller" />
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
</style>
