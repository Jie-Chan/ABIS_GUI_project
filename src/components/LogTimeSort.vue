<script setup>
import { computed } from 'vue'

const props = defineProps({ order: { type: String, default: 'descending' } })
const emit = defineEmits(['change'])
const ascending = computed(() => props.order === 'ascending')
const direction = computed(() => ascending.value ? '正序' : '倒序')
</script>

<template>
  <div class="time-sort-header" @click.stop>
    <button type="button" class="time-sort-toggle" :aria-label="`切换接收时间排序，当前${direction}`" @click="emit('change', ascending ? 'descending' : 'ascending')">
      <span>接收时间</span><small class="sort-direction">{{ direction }}</small>
    </button>
    <span class="time-sort-arrows" role="group" aria-label="接收时间排序方向">
      <button type="button" class="time-sort-arrow" aria-label="接收时间正序" :aria-pressed="ascending" title="正序：从旧到新" @click="emit('change', 'ascending')"><span class="sort-triangle sort-triangle--up" aria-hidden="true" /></button>
      <button type="button" class="time-sort-arrow" aria-label="接收时间倒序" :aria-pressed="!ascending" title="倒序：从新到旧" @click="emit('change', 'descending')"><span class="sort-triangle sort-triangle--down" aria-hidden="true" /></button>
    </span>
  </div>
</template>

<style scoped>
.time-sort-header { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; }
.time-sort-toggle,.time-sort-arrow { border: 0; border-radius: 3px; background: transparent; color: inherit; }
.time-sort-toggle { display: flex; align-items: center; gap: 5px; min-width: 0; padding: 4px 0; font: inherit; white-space: nowrap; }
.sort-direction { color: var(--el-color-primary); font-size: 10px; font-weight: 400; }
.time-sort-arrows { display: flex; flex-direction: column; }
.time-sort-arrow { display: grid; place-items: center; width: 20px; height: 16px; padding: 0; color: #a8b3c4; }
.time-sort-arrow[aria-pressed="true"] { color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.time-sort-toggle:hover,.time-sort-arrow:hover { color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.sort-triangle { width: 0; height: 0; border-inline: 4px solid transparent; }
.sort-triangle--up { border-bottom: 5px solid currentColor; }
.sort-triangle--down { border-top: 5px solid currentColor; }
</style>
