import { defineStore } from 'pinia'
import { ref } from 'vue'
export const emptyApplicantQuery = () => ({ page: 1, pageSize: 20, userId: '', sortBy: '', sortOrder: '' })
export const useApplicantListStore = defineStore('applicant-list', () => {
  const query = ref(emptyApplicantQuery())
  const timeRange = ref([])
  const scroll = ref({ y: 0, x: 0, restore: false })
  const detailContext = ref({ userId: '', tab: 'images', scroll: 0, restore: false })
  return { query, timeRange, scroll, detailContext }
})
