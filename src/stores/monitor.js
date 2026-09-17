/**
 * 监控状态与轮询
 * 需求 1.3：界面按固定周期刷新，初版周期 1 分钟。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'
import { MONITOR_REFRESH_INTERVAL_MS } from '@/constants/monitor'

export const useMonitorStore = defineStore('monitor', () => {
  const items = ref([])
  const fetchedAt = ref('')
  const loading = ref(false)
  const error = ref('')

  let timer = null

  async function refresh() {
    loading.value = true
    error.value = ''
    try {
      const result = await api.getHealth()
      items.value = result.items
      fetchedAt.value = result.fetchedAt
    } catch (e) {
      error.value = e.message || '获取监控状态失败'
    } finally {
      loading.value = false
    }
  }

  /** 启动轮询（1 分钟）。组件卸载时务必调用 stop() */
  function start() {
    refresh()
    stop()
    timer = setInterval(refresh, MONITOR_REFRESH_INTERVAL_MS)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return { items, fetchedAt, loading, error, refresh, start, stop }
})
