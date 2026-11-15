<script setup>
import { onScopeDispose, ref, watch } from 'vue'
import api from '@/api'
import UiIcon from '@/components/UiIcon.vue'
import { fingerLabel } from '@/constants/applicant'

const props = defineProps({ title: String, userId: { default: null }, feature: String, fingerPosition: { default: null }, emptyMessage: { default: '' } })
const state = ref('missing')
const image = ref(null)
const imageLoaded = ref(false)
const previewVisible = ref(false)
let sequence = 0
async function loadImage() {
  const current = ++sequence
  image.value = null
  imageLoaded.value = false
  previewVisible.value = false
  if (props.emptyMessage || !props.userId) { state.value = 'missing'; return }
  state.value = 'loading'
  try {
    const result = await api.getUserImage({ userId: props.userId, feature: props.feature, fingerPosition: props.fingerPosition })
    if (current !== sequence) return
    if (result?.userId !== props.userId || result.feature !== props.feature
      || (props.feature === 'finger' && props.fingerPosition && result.fingerPosition !== props.fingerPosition)) {
      state.value = 'missing'; return
    }
    image.value = result
    state.value = result.status === 'deleted' ? 'deleted' : result.status === 'available' && result.imageUrl ? 'available' : 'missing'
  } catch {
    if (current === sequence) state.value = 'failed'
  }
}
watch(() => [props.userId, props.feature, props.fingerPosition, props.emptyMessage], loadImage, { immediate: true })
onScopeDispose(() => { sequence++ })
</script>

<template>
  <article class="comparison-image" :aria-label="title" :data-image-state="emptyMessage ? 'empty' : state">
    <header class="image-heading"><div class="image-title"><h3>{{ title }}</h3><span v-if="feature === 'finger' && !emptyMessage" class="image-position">{{ fingerLabel(image?.fingerPosition || fingerPosition) }}</span></div><slot name="heading" /></header>
    <div class="comparison-frame" :aria-busy="!emptyMessage && (state === 'loading' || (state === 'available' && !imageLoaded))" aria-live="polite">
      <template v-if="!emptyMessage && state === 'available'">
        <button type="button" class="zoom-trigger" :disabled="!imageLoaded" :aria-label="`放大${title}`" @click="previewVisible = true"><img :key="image.imageUrl" :src="image.imageUrl" :alt="`${title} ${userId} ${feature === 'face' ? '人脸' : fingerLabel(image.fingerPosition)}`" :class="{ pending: !imageLoaded }" @load="imageLoaded = true" @error="state = 'failed'" /></button>
        <span v-if="!imageLoaded" class="image-loading">图像加载中…</span>
      </template>
      <div v-else class="image-placeholder">
        <UiIcon :name="emptyMessage ? 'search' : feature === 'finger' ? 'fingerprint' : 'face'" :size="44" />
        <p>{{ emptyMessage || ({ loading: '图像加载中…', missing: '暂无可用图像', deleted: '图像已删除或不存在', failed: '图像加载失败' }[state]) }}</p>
        <el-button v-if="!emptyMessage && state === 'failed'" link type="primary" :aria-label="`${title}重新加载`" @click="loadImage">重新加载</el-button>
      </div>
    </div>
    <p class="image-user">用户 ID：<span>{{ userId || '—' }}</span></p>
    <el-dialog v-model="previewVisible" :title="`${title} · ${userId || '—'}`" width="min(900px, calc(100vw - 24px))" align-center append-to-body class="comparison-preview">
      <p class="preview-user">用户 ID：{{ userId }}<template v-if="feature === 'finger'"> · {{ fingerLabel(image?.fingerPosition || fingerPosition) }}</template></p>
      <img v-if="previewVisible && imageLoaded" class="preview-image" :src="image.imageUrl" :alt="`${title} ${userId}`" />
      <template #footer><el-button @click="previewVisible = false">关闭预览</el-button></template>
    </el-dialog>
    <slot />
  </article>
</template>

<style scoped>
.comparison-image { min-width: 0; }
.image-heading { display: flex; flex-direction: column; align-items: stretch; gap: 6px; min-height: 24px; margin-bottom: 8px; }
.image-title { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; min-height: 24px; }
h3 { margin: 0; color: var(--el-text-color-primary); font-size: 14px; }
.comparison-frame { position: relative; display: grid; place-items: center; height: clamp(110px,calc(100vh - 640px),240px); padding: 10px; background: #f4f7fb; border: 1px solid var(--abis-border); border-radius: 8px; overflow: hidden; }
.zoom-trigger { display: block; width: 100%; height: 100%; min-height: 0; padding: 0; border: 0; background: transparent; cursor: zoom-in; }.preview-image { display: block; width: 100%; height: min(64dvh, 640px); object-fit: contain; background: #f4f7fb; }.preview-user { margin: 0 0 12px; font-size: 13px; color: var(--abis-muted); }
.comparison-frame img { display: block; width: 100%; height: 100%; min-height: 0; object-fit: contain; }.comparison-frame img.pending { opacity: 0; }
.image-placeholder { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; color: var(--abis-muted); font-size: 13px; }.image-placeholder .ui-icon { color: #bfcbda; }
.image-placeholder p { margin: 0; line-height: 1.7; }.image-loading { position: absolute; color: var(--abis-muted); font-size: 13px; }
.image-user { margin: 8px 0 0; font-size: 13px; color: var(--el-text-color-regular); overflow-wrap: anywhere; }.image-user span { font-family: ui-monospace,SFMono-Regular,Consolas,monospace; }
.image-position { margin: 0; color: var(--abis-muted); font-size: 12px; }
@media(max-width:600px){.comparison-frame { height: 240px; }}
</style>
