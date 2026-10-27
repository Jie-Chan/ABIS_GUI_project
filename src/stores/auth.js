/**
 * 登录态与当前账户角色
 * 需求 1.1：本地账户 + 密码认证；会话应有空闲超时。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api, { apiMode } from '@/api'
import { hasPermission as checkPermission, PERMISSION } from '@/constants/roles'

const TOKEN_KEY = 'abis_console_token'

export const useAuthStore = defineStore('auth', () => {
  const account = ref(null)
  const token = ref(apiMode === 'hybrid' ? sessionStorage.getItem('abis_remote_token') || '' : localStorage.getItem(TOKEN_KEY) || '')
  let restoring = null

  const isLoggedIn = computed(() => !!account.value)
  const role = computed(() => account.value?.role || '')

  /** 判断当前账户是否具备某权限（仅用于界面可见性，非安全边界） */
  function hasPermission(permission) {
    // 未知角色只开放读取预览，不开放真实写入。
    if (apiMode === 'hybrid' && account.value?.identityPending) return [PERMISSION.MONITOR_VIEW, PERMISSION.LOG_VIEW, PERMISSION.AUDIT_VIEW, PERMISSION.ACCOUNT_VIEW].includes(permission)
    return checkPermission(role.value, permission)
  }

  async function login(username, password) {
    const result = await api.login(username, password)
    account.value = result.account
    token.value = result.token
    if (apiMode === 'hybrid') sessionStorage.setItem('abis_remote_token', result.token)
    else localStorage.setItem(TOKEN_KEY, result.token)
    return result
  }

  function clearSession() {
    account.value = null
    token.value = ''
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem('abis_remote_token')
    restoring = null
  }

  async function restoreSession() {
    if (apiMode !== 'hybrid' || account.value || !token.value) return
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
    if (apiMode !== 'hybrid') return
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

  if (apiMode === 'hybrid') window.addEventListener('abis-session-expired', () => {
    clearSession()
    window.location.assign('/login')
  })

  return { account, token, isLoggedIn, role, login, logout, hasPermission, clearSession, restoreSession, refreshAccount }
})
