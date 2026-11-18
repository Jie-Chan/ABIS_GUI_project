<script setup>
import { computed, ref, watch } from 'vue'
import CurrentUserImage from '@/components/CurrentUserImage.vue'
const props = defineProps({ record: { type: Object, required: true }, responseBody: { default: null } })
const selectedIndex = ref(0)
const complete = computed(() => props.responseBody?.code === 'SUCCESS' && Array.isArray(props.responseBody.candidates))
const emptyResult = computed(() => props.record.result === 'failure' ? '本次查重失败' : complete.value ? '本次查重无候选' : ['running', 'waiting'].includes(props.record.result) ? '查重处理中' : '暂无查重结果')
const candidates = computed(() => complete.value ? props.responseBody.candidates : [])
const candidate = computed(() => candidates.value[selectedIndex.value] || null)
watch(() => props.record.requestId, () => { selectedIndex.value = 0 })
watch(candidates, (values, previous) => {
  const selected = previous?.[selectedIndex.value]
  const index = selected ? values.findIndex(value => value.userId === selected.userId && value.fingerPosition === selected.fingerPosition && value.rank === selected.rank) : -1
  selectedIndex.value = index >= 0 ? index : 0
})
</script>

<template>
  <section class="request-image-comparison" aria-label="查重图像比对">
    <div class="comparison-toolbar" :class="{ 'has-candidate-controls': candidates.length > 1 }">
      <div v-if="candidates.length > 1" class="candidate-list" role="group" aria-label="切换候选图像">
        <button v-for="(_, index) in candidates" :key="index" type="button" :aria-pressed="selectedIndex === index" class="candidate-choice" @click="selectedIndex = index">候选 {{ index + 1 }}</button>
      </div>
      <p class="comparison-source" role="note">图像为当前入库版本</p>
    </div>
    <div class="comparison-grid">
      <CurrentUserImage title="待查图像" :user-id="record.userId" :feature="record.feature" :finger-position="record.fingerPosition" />
      <CurrentUserImage title="候选图像" :user-id="candidate?.userId" :feature="record.feature" :finger-position="candidate?.fingerPosition ?? record.fingerPosition" :empty-message="candidate ? '' : emptyResult">
        <template #heading><p v-if="candidate" class="candidate-result"><span class="response-origin">本次响应</span><span>候选排名：{{ candidate.rank ?? '—' }}</span><span>比对分数：{{ candidate.score ?? '—' }}</span></p></template>
      </CurrentUserImage>
    </div>
  </section>
</template>

<style scoped>
.comparison-toolbar { display: none; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
.comparison-toolbar.has-candidate-controls, .request-image-comparison:has(.comparison-image[data-image-state="available"]) .comparison-toolbar { display: flex; }
.comparison-source { flex: 0 0 auto; max-width: 100%; margin: 0 0 0 auto; color: var(--abis-muted); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.comparison-toolbar:not(.has-candidate-controls) .comparison-source { margin-left: 0; }
.candidate-list { display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 8px; min-width: 0; max-width: 100%; }.candidate-choice { flex-shrink: 0; padding: 7px 10px; border: 1px solid var(--abis-border); border-radius: 6px; background: #fff; color: var(--el-text-color-regular); font-size: 13px; overflow-wrap: anywhere; cursor: pointer; }.candidate-choice[aria-pressed="true"] { color: var(--el-color-primary); border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.comparison-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
.response-origin { color: var(--abis-muted); font-size: 11px; }
.candidate-result { display: flex; flex-wrap: wrap; align-content: start; gap: 6px 10px; margin: 0; color: var(--el-text-color-regular); font-size: 12px; overflow-wrap: anywhere; }
@media(max-width:600px){.comparison-grid { grid-template-columns: minmax(0,1fr); gap: 24px; }}
</style>

<style scoped>
@media(min-width:601px) {
 .request-image-comparison { display: flex; flex-direction: column; height: 100%; min-height: 0; }
 .comparison-toolbar { flex-shrink: 0; gap: 8px; margin-bottom: 8px; }
 .candidate-list { flex-wrap: nowrap; gap: 6px; }.candidate-choice { width: 76px; flex-shrink: 0; padding: 5px 8px; }
 .comparison-grid { flex: 1; min-height: 0; grid-template-rows: auto auto minmax(50px,1fr) auto; row-gap: 6px; }
 .comparison-grid :deep(.comparison-image) { display: grid; grid-row: span 4; grid-template-rows: subgrid; min-height: 0; }
 .comparison-grid :deep(.image-heading) { display: grid; grid-row: span 2; grid-template-rows: subgrid; align-items: start; }
 .comparison-grid :deep(.comparison-frame) { height: auto; min-height: 0; }
 .comparison-grid :deep(.image-heading),.comparison-grid :deep(.image-user) { margin: 0; }
}
</style>
