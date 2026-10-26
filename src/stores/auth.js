/**
 * 登录态与当前账户角色
 * 需求 1.1：本地账户 + 密码认证；会话应有空闲超时。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api, { apiMode } from '@/api'
import { hasPermission as checkPermission } from '@/constants/roles'

const TOKEN_KEY = 'abis_console_token'

export const useAuthStore = defineStore('auth', () => {
  const account = ref(null)
  const token = ref(apiMode === 'hybrid' ? '' : localStorage.getItem(TOKEN_KEY) || '')

  const isLoggedIn = computed(() => !!account.value)
  const role = computed(() => account.value?.role || '')

  /** 判断当前账户是否具备某权限（仅用于界面可见性，非安全边界） */
  function hasPermission(permission) {
    // 混合预览仅开放导航，不授予后端权限；实际写入由后端鉴权。
    if (apiMode === 'hybrid' && account.value?.identityPending) return true
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

  async function logout() {
    try {
      await api.logout()
    } finally {
      account.value = null
      token.value = ''
      localStorage.removeItem(TOKEN_KEY)
      sessionStorage.removeItem('abis_remote_token')
    }
  }

  if (apiMode === 'hybrid') window.addEventListener('abis-session-expired', () => {
    account.value = null
    token.value = ''
    sessionStorage.removeItem('abis_remote_token')
    window.location.assign('/login')
  })

  return { account, token, isLoggedIn, role, login, logout, hasPermission }
})
