/**
 * 真实 HTTP 适配器 —— 契约冻结后启用
 *
 * 启用方式：.env 中 VITE_USE_MOCK=false
 *
 * ⚠ 当前管理 API 尚未在 ABIS 侧实现（需求附录 A.1 全部标注「联调前须冻结」）。
 *   本文件保留结构，路径与报文字段待契约冻结后填入。
 *   在此之前任何调用都会抛出明确错误，不会静默失败。
 */
import axios from 'axios'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/abis-admin',
  timeout: 15000,
})

// 会话凭据的传递方式尚未冻结（见《设计方案》§11 第 2 项）。
// 下列拦截器为占位，冻结后按结论调整。
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('abis_console_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

function notReady(method) {
  return async () => {
    throw new Error(
      `[http 适配器] ${method} 尚未实现：管理 API 契约未冻结。请检查 .env 中的 VITE_USE_MOCK。`
    )
  }
}

function notReadyExport(method) {
  return async () => {
    throw new Error(`[http 适配器] ${method} 尚未实现：管理 API 契约未冻结。`)
  }
}

export default {
  login: notReady('login'),
  logout: notReady('logout'),
  getSession: notReady('getSession'),

  listAccounts: notReady('listAccounts'),
  createAccount: notReady('createAccount'),
  updateAccount: notReady('updateAccount'),
  deleteAccount: notReady('deleteAccount'),
  resetPassword: notReady('resetPassword'),

  getThresholds: notReady('getThresholds'),
  updateThresholds: notReady('updateThresholds'),

  getHealth: notReady('getHealth'),

  listLogs: notReady('listLogs'),
  listAudits: notReady('listAudits'),

  exportLogs: notReadyExport('exportLogs'),
  exportAudits: notReadyExport('exportAudits'),
}

export { http }
