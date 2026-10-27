/** 当前身份、标签页会话和权限。身份始终通过后端校验。 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api'
import { hasPermission as checkPermission, PERMISSION } from '@/constants/roles'

const TOKEN_KEY = 'abis_remote_token'

export const useAuthStore = defineStore('auth', () => {
  const account = ref(null)
  const token = ref(sessionStorage.getItem(TOKEN_KEY) || '')
  let restoring = null

  const isLoggedIn = computed(() => !!account.value)
  const role = computed(() => account.value?.role || '')

  /** 判断当前账户是否具备某权限（仅用于界面可见性，非安全边界） */
  function hasPermission(permission) {
    // 角色未识别时仅允许读取。
    if (account.value?.identityPending) return [PERMISSION.MONITOR_VIEW, PERMISSION.LOG_VIEW, PERMISSION.AUDIT_VIEW].includes(permission)
    return checkPermission(role.value, permission)
  }

  async function login(username, password) {
    const result = await api.login(username, password)
    account.value = result.account
    token.value = result.token
    sessionStorage.setItem(TOKEN_KEY, result.token)
    return result
  }

  function clearSession() {
    account.value = null
    token.value = ''
    sessionStorage.removeItem(TOKEN_KEY)
    restoring = null
  }

  async function restoreSession() {
    if (account.value || !token.value) return
    if (!restoring) {
      const expectedToken = token.value
      restoring = (async () => {
        try {
          const session = await api.getSession()
          if (token.value === expectedToken) account.value = session.account
        } catch {
          if (token.value === expectedToken) clearSession()
        }
      })()
    }
    await restoring
  }

  async function refreshAccount() {
    const session = await api.getSession()
    account.value = session.account
  }

  async function logout() {
    try {
      await api.logout()
    } finally {
      clearSession()
    }
  }

  window.addEventListener('abis-session-expired', () => {
    clearSession()
    window.location.assign('/login')
  })

  return { account, token, isLoggedIn, role, login, logout, hasPermission, clearSession, restoreSession, refreshAccount }
})
