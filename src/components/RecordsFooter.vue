<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
defineProps({
  currentPage: { type: Number, default: 1 }, pageSize: { type: Number, default: 20 },
  total: { type: Number, default: 0 }, pageSizes: { type: Array, default: () => [20, 50, 100] },
})
const emit = defineEmits(['update:currentPage', 'update:pageSize'])
const narrow = ref(false)
let media
function updateViewport() { narrow.value = media.matches }
onMounted(() => { media = window.matchMedia('(max-width: 767px)'); updateViewport(); media.addEventListener('change', updateViewport) })
onBeforeUnmount(() => media?.removeEventListener('change', updateViewport))
</script>
<template>
  <footer class="records-footer" aria-label="列表操作与分页">
    <div v-if="$slots.default" class="footer-actions"><slot /></div>
    <el-pagination
      :current-page="currentPage" :page-size="pageSize" :total="total" :page-sizes="pageSizes"
      :size="narrow ? 'small' : 'default'" :pager-count="narrow ? 5 : 7"
      layout="total, sizes, prev, pager, next"
      @update:current-page="page => emit('update:currentPage', page)"
      @update:page-size="size => emit('update:pageSize', size)"
    />
  </footer>
</template>
<style scoped>
.records-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px 12px; margin-top: 12px; min-width: 0; }
.footer-actions { flex-shrink: 0; }
.records-footer :deep(.el-pagination) { margin-left: auto; max-width: 100%; justify-content: flex-end !important; }
@media(max-width:767px) {
  .records-footer :deep(.el-pagination) { --el-pagination-button-width: 26px; column-gap: 4px; font-size: 12px; }
  .records-footer :deep(.el-pagination__total) { margin-right: 4px; font-size: 12px; }
  .records-footer :deep(.el-pagination__sizes) { margin-right: 0; }
  .records-footer :deep(.el-select) { width: 94px; }
  .records-footer :deep(.el-select__wrapper) { min-height: 32px; font-size: 12px; }
}
@media(max-width:479px) { .records-footer :deep(.el-pagination) { width: 100%; } }
</style>
