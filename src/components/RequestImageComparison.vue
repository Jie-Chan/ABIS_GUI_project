<script setup>
import { computed, ref, watch } from 'vue'
import CurrentUserImage from '@/components/CurrentUserImage.vue'
const props = defineProps({ record: { type: Object, required: true }, responseBody: { default: null } })
const selectedIndex = ref(0)
const complete = computed(() => props.responseBody?.code === 'SUCCESS' && Array.isArray(props.responseBody.candidates))
const emptyResult = computed(() => props.record.result === 'failure' ? '本次查重失败' : complete.value ? '本次查重无候选' : ['running', 'waiting'].includes(props.record.result) ? '查重处理中' : '暂无查重结果')
const candidates = computed(() => complete.value ? props.responseBody.candidates : [])
const candidate = computed(() => candidates.value[selectedIndex.value] || null)
watch(() => [props.record.requestId, props.responseBody], () => { selectedIndex.value = 0 })
</script>

<template>
  <section class="request-image-comparison" aria-label="查重图像比对">
    <p class="comparison-notice" role="note">图像取自当前入库记录，可能与查重时不同。</p>
    <div v-if="candidates.length > 1" class="comparison-toolbar"><label id="candidate-choice-label">候选图像</label>
      <div class="candidate-list" role="group" aria-labelledby="candidate-choice-label">
        <button v-for="(_, index) in candidates" :key="index" type="button" :aria-pressed="selectedIndex === index" class="candidate-choice" @click="selectedIndex = index">候选 {{ index + 1 }}</button>
      </div>
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
.comparison-notice { margin: 0 0 10px; padding: 8px 10px; background: #f7f9fc; border-radius: 6px; color: var(--abis-muted); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.comparison-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }.comparison-toolbar label { color: var(--el-text-color-regular); font-size: 13px; }.candidate-list { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }.candidate-choice { padding: 7px 10px; border: 1px solid var(--abis-border); border-radius: 6px; background: #fff; color: var(--el-text-color-regular); font-size: 13px; overflow-wrap: anywhere; cursor: pointer; }.candidate-choice[aria-pressed="true"] { color: var(--el-color-primary); border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.comparison-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
.response-origin { color: var(--abis-muted); font-size: 11px; }
.candidate-result { display: flex; flex-wrap: wrap; align-content: start; gap: 6px 10px; margin: 0; color: var(--el-text-color-regular); font-size: 12px; overflow-wrap: anywhere; }
@media(max-width:600px){.comparison-grid { grid-template-columns: minmax(0,1fr); gap: 24px; }}
</style>

<style scoped>
@media(min-width:601px) {
 .request-image-comparison { display: flex; flex-direction: column; height: 100%; min-height: 0; }
 .comparison-notice,.comparison-toolbar { flex-shrink: 0; }
 .comparison-toolbar { flex-wrap: nowrap; gap: 8px; margin-bottom: 8px; }
 .candidate-list { flex-wrap: nowrap; gap: 6px; }.candidate-choice { width: 76px; flex-shrink: 0; padding: 5px 8px; }
 .comparison-grid { flex: 1; min-height: 0; grid-template-rows: auto auto minmax(50px,1fr) auto; row-gap: 6px; }
 .comparison-grid :deep(.comparison-image) { display: grid; grid-row: span 4; grid-template-rows: subgrid; min-height: 0; }
 .comparison-grid :deep(.image-heading) { display: grid; grid-row: span 2; grid-template-rows: subgrid; align-items: start; }
 .comparison-grid :deep(.comparison-frame) { height: auto; min-height: 0; }
 .comparison-grid :deep(.image-heading),.comparison-grid :deep(.image-user) { margin: 0; }
}
</style>
