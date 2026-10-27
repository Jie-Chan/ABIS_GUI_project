import axios from 'axios'
import { createRemote, responseMessage } from './remote.js'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/admin-api',
  timeout: 15000,
})

function expireSession() {
  window.dispatchEvent(new Event('abis-session-expired'))
}

http.interceptors.request.use(config => {
  const token = sessionStorage.getItem('abis_remote_token')
  if (token && config.url !== '/system/auth/login') config.headers.Authorization = `Bearer ${token}`
  return config
})

export default createRemote(async config => {
  try {
    const response = await http.request(config)
    let body = response.data
    if (body instanceof Blob && /json/i.test(body.type)) {
      try { body = JSON.parse(await body.text()) } catch { body = null }
    }
    if (config.url !== '/system/auth/login' && Number(body?.code) === 401) expireSession()
    return response.data
  } catch (error) {
    // 文件请求同样可能返回 JSON 错误；解码后再反馈，不把错误文件交给用户。
    let body = error.response?.data
    if (body instanceof Blob) {
      try { body = JSON.parse(await body.text()) } catch { body = null }
    }
    if (config.url !== '/system/auth/login' && (error.response?.status === 401 || Number(body?.code) === 401)) expireSession()
    const failure = new Error(responseMessage(body) || (error.code === 'ECONNABORTED'
      ? '接口请求超时，请稍后重试'
      : error.response ? `接口请求失败（HTTP ${error.response.status}）` : '无法连接服务，请检查网络'))
    failure.status = error.response?.status
    throw failure
  }
})
