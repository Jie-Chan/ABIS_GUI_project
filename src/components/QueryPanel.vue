<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
const panel = ref(null)
let observer
onMounted(() => {
  observer = new ResizeObserver(() => panel.value?.parentElement?.style.setProperty('--abis-query-height', `${panel.value.getBoundingClientRect().height}px`))
  observer.observe(panel.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <section ref="panel" class="query-panel" aria-label="查询条件"><slot /></section>
</template>
<style scoped>
.query-panel { position: sticky; top: calc(var(--abis-nav-height,72px) + var(--abis-workspace-top,12px) + 1px); z-index: 90; background: #fff; margin-inline: calc(-1 * var(--abis-query-side,24px)); padding-inline: var(--abis-query-side,24px); border-radius: 7px 7px 0 0; }
</style>
