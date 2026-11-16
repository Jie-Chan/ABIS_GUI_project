import { defineStore } from 'pinia'
import { ref } from 'vue'

// 仅保留当前登录会话的已生效查询；不把草稿或账户数据写入持久存储。
export const useNavigationStore = defineStore('navigation-state', () => {
  const logs = ref(null)
  const monitor = ref({ status: 'all', scroll: 0 })
  function reset() {
    logs.value = null
    monitor.value = { status: 'all', scroll: 0 }
  }
  return { logs, monitor, reset }
})
