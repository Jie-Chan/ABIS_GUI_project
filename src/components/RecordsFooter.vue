<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '@/constants/pagination'
defineProps({
  currentPage: { type: Number, default: 1 }, pageSize: { type: Number, default: DEFAULT_PAGE_SIZE },
  total: { type: Number, default: 0 },
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
      :current-page="currentPage" :page-size="pageSize" :total="total"
      :size="narrow ? 'small' : 'default'" :pager-count="narrow ? 5 : 7"
      layout="total, slot, prev, pager, next"
      @update:current-page="page => emit('update:currentPage', page)"
    >
      <span class="el-pagination__sizes">
        <el-select :model-value="pageSize" aria-label="每页条数" :validate-event="false" @update:model-value="size => emit('update:pageSize', size)">
          <el-option v-for="size in PAGE_SIZE_OPTIONS" :key="size" :value="size" :label="`${size} 条/页`" />
        </el-select>
      </span>
    </el-pagination>
  </footer>
</template>
<style scoped>
.records-footer { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px 12px; margin-top: 12px; min-width: 0; }
.footer-actions { flex-shrink: 0; }
.records-footer :deep(.el-pagination) { margin-left: auto; max-width: 100%; align-items: center; justify-content: flex-end !important; }
.records-footer :deep(.el-pagination__sizes) { margin-right: 0; }
.records-footer :deep(.el-select) { width: 114px; }
.records-footer :deep(.el-select__wrapper) { height: 36px; min-height: 36px; padding: 4px 12px; font-size: 13px; }
@media(max-width:767px) {
  .records-footer :deep(.el-pagination) { --el-pagination-button-width: 26px; column-gap: 4px; font-size: 12px; }
  .records-footer :deep(.el-pagination__total) { margin-right: 4px; font-size: 12px; }
}
@media(max-width:479px) { .records-footer :deep(.el-pagination) { width: 100%; } }
</style>
