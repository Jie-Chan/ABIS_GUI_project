import axios from 'axios'
import { createRemote } from './remote.js'

const http = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/admin-api', timeout: 15000 })
http.interceptors.request.use(config => {
  const token = sessionStorage.getItem('abis_remote_token')
  if (token && config.url !== '/system/auth/login') config.headers.Authorization = `Bearer ${token}`
  return config
})
export default createRemote(async config => {
  try {
    const response = await http.request(config)
    if (Number(response.data?.code) === 401) window.dispatchEvent(new Event('abis-session-expired'))
    return response.data
  } catch (e) {
    if (e.response?.status === 401) window.dispatchEvent(new Event('abis-session-expired'))
    throw new Error(e.response?.data?.msg || (e.code === 'ECONNABORTED' ? '真实接口请求超时，请检查后端连接' : e.message || '真实接口请求失败'))
  }
})
