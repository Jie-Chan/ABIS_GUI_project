import { defineStore } from 'pinia'
import { ref } from 'vue'
import { normalizePageSize } from '@/constants/pagination'

// 仅保留当前登录会话的已生效查询；不把草稿或账户数据写入持久存储。
export const useNavigationStore = defineStore('navigation-state', () => {
  const logs = ref(null)
  const monitor = ref({ status: 'all', scroll: 0 })
  const pageSizes = ref({})
  function getPageSize(page) { return normalizePageSize(pageSizes.value[page]) }
  function setPageSize(page, size) { pageSizes.value[page] = normalizePageSize(size) }
  function reset() {
    logs.value = null
    monitor.value = { status: 'all', scroll: 0 }
    pageSizes.value = {}
  }
  return { logs, monitor, pageSizes, getPageSize, setPageSize, reset }
})
