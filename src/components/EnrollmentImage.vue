<script setup>
import { ref, watch } from 'vue'
import { fingerLabel } from '@/constants/applicant'
const props = defineProps({ record: { type: Object, required: true }, large: Boolean })
defineEmits(['open'])
const failed = ref(false)
watch(() => props.record.imageUrl, () => { failed.value = false })
</script>
<template>
  <component :is="large ? 'div' : 'button'" :type="large ? undefined : 'button'" class="enrollment-image" :class="{ large }" :aria-label="large ? undefined : `查看入库图像 ${record.recordId}`" @click="!large && $emit('open', record)">
    <img v-if="record.imageUrl && !failed" :src="record.imageUrl" :alt="`${record.recordId} ${record.feature === 'face' ? '人脸' : fingerLabel(record.fingerPosition)} Mock 样例`" @error="failed = true" />
    <span v-else class="image-unavailable">图像不可用</span>
  </component>
</template>
<style scoped>
.enrollment-image { display: grid; place-items: center; width: 100%; height: 155px; padding: 6px; background: #f4f7fb; border: 1px solid var(--abis-border); border-radius: 7px; overflow: hidden; color: var(--abis-muted); }
.enrollment-image img { display: block; width: 100%; height: 100%; object-fit: contain; }
.enrollment-image:not(.large):hover { border-color: var(--el-color-primary); }
.image-unavailable { font-size: 13px; }
.large { height: min(52vh,430px); }
</style>
