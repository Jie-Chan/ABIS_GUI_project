<script setup>
import { computed, ref, watch } from 'vue'
import { fingerLabel } from '@/constants/applicant'
const props = defineProps({ record: { type: Object, required: true }, large: Boolean, interactive: { type: Boolean, default: true }, showQuality: { type: Boolean, default: true } })
defineEmits(['open', 'unavailable'])
const failed = ref(false)
const canOpen = computed(() => !props.large && props.interactive && !!props.record.imageUrl && !failed.value)
const quality = computed(() => Number.isFinite(props.record.qualityScore) ? props.record.qualityScore : '—')
const imageDescription = computed(() => `申请人 ${props.record.userId || '—'} · ${props.record.feature === 'face' ? '人脸' : `指纹 · ${fingerLabel(props.record.fingerPosition)}`}`)
watch(() => props.record.imageUrl, () => { failed.value = false })
</script>
<template>
  <component :is="canOpen ? 'button' : 'div'" :type="canOpen ? 'button' : undefined" class="enrollment-image" :class="{ large, interactive: canOpen }" :role="!canOpen && (!record.imageUrl || failed) ? 'img' : undefined" :aria-label="canOpen ? `查看入库图像 ${imageDescription}` : !record.imageUrl || failed ? `${imageDescription} · 图像不可用` : undefined" @click="canOpen && $emit('open', record)">
    <span class="image-frame">
      <img v-if="record.imageUrl && !failed" :src="record.imageUrl" :alt="imageDescription" @error="failed = true; $emit('unavailable', record.imageUrl)" />
      <span v-else class="image-unavailable">图像不可用</span>
    </span>
    <span v-if="showQuality" class="quality-score" :class="{ 'quality-score--missing': quality === '—' }" :aria-label="`质量分：${quality}`">{{ quality }}</span>
  </component>
</template>
<style scoped>
.enrollment-image { box-sizing: border-box; display: flex; flex-direction: column; width: 100%; height: 155px; padding: 0; background: #f4f7fb; border: 1px solid var(--abis-border); border-radius: 7px; overflow: hidden; color: var(--abis-muted); }
.image-frame { box-sizing: border-box; display: flex; align-items: center; justify-content: center; flex: 1; min-width: 0; min-height: 0; width: 100%; padding: 5px; }
.enrollment-image img { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; max-width: 100%; max-height: 100%; object-fit: contain; }
.enrollment-image.interactive:not(.large):hover { border-color: var(--el-color-primary); }
.image-unavailable { font-size: 12px; }
.quality-score { display: block; flex-shrink: 0; width: 100%; padding: 2px 0; background: #dce9f9; color: #315d8f; font-size: 12px; font-weight: 600; line-height: 16px; text-align: center; }
.quality-score--missing { background: #e8edf3; color: #718096; }
.large { height: min(52vh,430px); }
</style>
