import { defineStore } from 'pinia'
import { ref } from 'vue'
export const emptyApplicantQuery = () => ({ page: 1, pageSize: 20, userId: '', sortBy: '', sortOrder: '' })
export const useApplicantListStore = defineStore('applicant-list', () => {
  const query = ref(emptyApplicantQuery())
  const appliedQuery = ref(null)
  const timeRange = ref([])
  const scroll = ref({ y: 0, x: 0, bodyY: 0, restore: false })
  const detailContext = ref({ userId: '', tab: 'images', scroll: 0, restore: false })
  function reset() {
    query.value = emptyApplicantQuery()
    appliedQuery.value = null
    timeRange.value = []
    scroll.value = { y: 0, x: 0, bodyY: 0, restore: false }
    detailContext.value = { userId: '', tab: 'images', scroll: 0, restore: false }
  }
  return { query, appliedQuery, timeRange, scroll, detailContext, reset }
})
