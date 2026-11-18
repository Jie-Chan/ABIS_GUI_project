<script setup>
import { computed, ref, watch } from 'vue'
import EnrollmentImage from '@/components/EnrollmentImage.vue'
import { FINGER_POSITIONS } from '@/constants/applicant'
import { latestEnrollmentRecord } from '@/utils/applicant'
const props = defineProps({ records: { type: Array, default: () => [] }, feature: { type: String, required: true } })
const failedImages = ref(new Set())
watch(() => props.records, () => { failedImages.value = new Set() })
const recordState = record => !record ? '未入库' : !record.imageUrl || failedImages.value.has(record.imageUrl) ? '图像不可用' : '已入库'
const face = computed(() => latestEnrollmentRecord(props.records.filter(record => record.feature === 'face')))
const hands = computed(() => ['左手', '右手'].map(hand => ({ hand, slots: FINGER_POSITIONS.filter(position => position.hand === hand).map(position => ({ ...position, record: latestEnrollmentRecord(props.records.filter(record => record.feature === 'finger' && record.fingerPosition === position.key)) })) })))
</script>
<template>
  <div v-if="feature === 'face'" class="list-face">
    <EnrollmentImage v-if="face" :record="face" :show-quality="false" :interactive="false" @unavailable="url => failedImages.add(url)" />
    <span v-else>未入库</span>
  </div>
  <div v-else class="finger-group"><div class="list-fingers" aria-label="当前有效十指图像">
    <div v-for="hand in hands" :key="hand.hand" class="hand-strip" :aria-label="hand.hand">
      <div v-for="slot in hand.slots" :key="slot.key" class="list-finger" :data-finger="slot.key" :title="`${slot.label} · ${recordState(slot.record)}`">
        <EnrollmentImage v-if="slot.record" :record="slot.record" :show-quality="false" :interactive="false" @unavailable="url => failedImages.add(url)" />
        <span v-else class="finger-placeholder" :aria-label="`${slot.label}：未入库`">—</span>
      </div>
    </div>
  </div></div>
</template>
<style scoped>
.list-face { width: 48px; }.list-face :deep(.enrollment-image) { height: 62px; }
.finger-group { min-width: 0; }
.list-fingers { display: flex; gap: 10px; }
.hand-strip { display: grid; flex: 1; min-width: 0; grid-template-columns: repeat(5,minmax(0,1fr)); gap: 4px; }
.list-finger { min-width: 0; }.list-finger :deep(.enrollment-image),.finger-placeholder { height: 46px; border-radius: 3px; }
.list-finger :deep(.image-frame) { padding: 2px; }
.list-finger :deep(.image-unavailable) { font-size: 10px; line-height: 1.2; overflow-wrap: anywhere; }
.finger-placeholder { display: grid; place-items: center; box-sizing: border-box; border: 1px dashed var(--abis-border); background: #f7f9fc; color: var(--abis-muted); }
@media(max-width:1199px) { .list-fingers { flex-direction: column; gap: 6px; }.hand-strip { flex: auto; } }
</style>
