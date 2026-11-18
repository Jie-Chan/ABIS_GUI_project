<script setup>
import { computed, ref, watch } from 'vue'
import { fingerLabel } from '@/constants/applicant'
const props = defineProps({ record: { type: Object, required: true }, large: Boolean, interactive: { type: Boolean, default: true }, showQuality: { type: Boolean, default: true } })
defineEmits(['open', 'unavailable'])
const failed = ref(false)
const canOpen = computed(() => !props.large && props.interactive && !!props.record.imageUrl && !failed.value)
const quality = computed(() => Number.isFinite(props.record.qualityScore) ? props.record.qualityScore : '—')
const imageDescription = computed(() => `申请人 ${props.record.userId || '—'} · ${props.record.feature === 'face' ? '人脸' : `指纹 · ${fingerLabel(props.record.fingerPosition)}`}`)
const missingQuality = computed(() => props.showQuality && quality.value === '—')
const accessibleLabel = computed(() => `${canOpen.value ? '查看入库图像 ' : ''}${imageDescription.value}${!props.record.imageUrl || failed.value ? ' · 图像不可用' : ''}${props.showQuality ? missingQuality.value ? ' · 质量分未提供' : ` · 质量分 ${quality.value}` : ''}`)
watch(() => props.record.imageUrl, () => { failed.value = false })
</script>
<template>
  <el-tooltip content="质量分未提供" :disabled="!missingQuality" :trigger="['hover', 'focus']" placement="top">
  <component :is="canOpen ? 'button' : 'div'" :type="canOpen ? 'button' : undefined" class="enrollment-image" :class="{ large, interactive: canOpen }" :role="!canOpen ? 'img' : undefined" :tabindex="!canOpen && missingQuality ? 0 : undefined" :aria-label="accessibleLabel" @click="canOpen && $emit('open', record)">
    <span class="image-frame">
      <img v-if="record.imageUrl && !failed" :src="record.imageUrl" :alt="imageDescription" @error="failed = true; $emit('unavailable', record.imageUrl)" />
      <span v-else class="image-unavailable">图像不可用</span>
    </span>
    <span v-if="showQuality" class="quality-score" :class="{ 'quality-score--missing': missingQuality }" :aria-label="missingQuality ? '质量分未提供' : `质量分：${quality}`"><span class="quality-value">{{ quality }}</span></span>
  </component>
  </el-tooltip>
</template>
<style scoped>
.enrollment-image { box-sizing: border-box; display: flex; flex-direction: column; width: 100%; height: 155px; padding: 0; background: #f4f7fb; border: 1px solid var(--abis-border); border-radius: 7px; overflow: hidden; color: var(--abis-muted); }
.image-frame { box-sizing: border-box; display: flex; align-items: center; justify-content: center; flex: 1; min-width: 0; min-height: 0; width: 100%; padding: 5px; }
.enrollment-image img { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; max-width: 100%; max-height: 100%; object-fit: contain; }
.enrollment-image.interactive:not(.large):hover { border-color: var(--el-color-primary); }
.image-unavailable { font-size: 12px; }
.quality-score { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 100%; min-height: 28px; padding: 4px 8px; background: #dce9f9; color: #315d8f; font-size: 12px; line-height: 18px; }
.quality-value { font-weight: 600; font-variant-numeric: tabular-nums; }
.quality-score--missing { background: #e8edf3; color: var(--abis-muted); }
.large { height: min(52vh,430px); }
</style>
