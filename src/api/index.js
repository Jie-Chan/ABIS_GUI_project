/**
 * 数据访问层入口 —— 页面只从这里取数据，不直接调用 HTTP。
 *
 * 这样做的目的：管理 API 契约冻结后，只需替换适配器实现，
 * 页面代码零改动。见《设计方案》§7。
 */
import mockAdapter from './adapters/mock'
import httpAdapter from './adapters/http'
import liveAdapter from './adapters/live.js'
import { createHybrid } from './adapters/hybrid.js'

/**
 * 默认走 mock。
 * 只有显式设为 'false' 时才走真实 HTTP —— 契约未冻结时不会误连。
 */
export const apiMode = import.meta.env.VITE_API_MODE || (import.meta.env.VITE_USE_MOCK === 'false' ? 'http' : 'mock')
if (!['mock', 'http', 'hybrid'].includes(apiMode)) throw new Error('VITE_API_MODE 必须为 mock、http 或 hybrid')
const useMock = apiMode === 'mock'

const adapter = useMock ? mockAdapter : apiMode === 'hybrid' ? createHybrid(liveAdapter, mockAdapter) : httpAdapter

if (import.meta.env.DEV) {
  console.info(`[api] 当前适配器：${apiMode}`)
}

export default adapter
