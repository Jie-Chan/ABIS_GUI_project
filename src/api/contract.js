/**
 * 管理 API 契约 —— 前端侧唯一真源
 *
 * 本文件用 JSDoc 描述每个接口的入参与返回。两个适配器
 * （adapters/mock.js 与 adapters/http.js）都必须实现这里的签名。
 *
 * ⚠ 全部 15 个方法的路径与报文字段**尚未冻结**。
 *   建议路径见《设计方案》§8，最终以 ABIS 侧冻结结果为准。
 *
 * 需求出处：附录 A.1（8 条管理 API）、1.1、1.2、1.3、1.4、2.2
 */

/**
 * @typedef {Object} Account
 * @property {number} id
 * @property {string} username
 * @property {string} displayName
 * @property {'admin'|'operator'} role
 * @property {boolean} enabled
 * @property {string} createdAt
 * @property {string} lastLoginAt
 */

/**
 * @typedef {Object} MonitorMetrics
 * @property {boolean} cdcHealthy
 * @property {boolean} cdcReady
 * @property {number}  galleryTotalSize
 * @property {'VALID'|'INVALID'} licenseStatus
 */

/**
 * @typedef {Object} MonitorItem
 * @property {string} key
 * @property {string} name
 * @property {string} layer
 * @property {'normal'|'abnormal'|'unreachable'|'not_deployed'} status
 * @property {Array<{id: string, status: string}>} instances
 * @property {boolean} optional
 * @property {MonitorMetrics} [metrics]  仅算法服务有
 *
 * ⚠ metrics **不保证存在**：非算法服务对象上它可能是缺失的键，
 *   也可能是存在但为 undefined 的键（取决于适配器是否经过序列化边界）。
 *   消费方一律按真值判断（`if (item.metrics)`），不得使用 `'metrics' in item`。
 */

/**
 * @typedef {Object} LogRecord
 * @property {number} id
 * @property {string} calledAt
 * @property {string} caller
 * @property {string} api
 * @property {string} apiLabel
 * @property {'face'|'finger'} feature
 * @property {'success'|'failure'} result
 * @property {number} costMs
 */

/**
 * @typedef {Object} AuditRecord
 * @property {number} id
 * @property {string} operatedAt
 * @property {string} operator
 * @property {'admin'|'operator'} role
 * @property {string} roleLabel
 * @property {string} action
 * @property {string} target
 * @property {string} beforeValue
 * @property {string} afterValue
 * @property {string} result
 * @property {string} sourceIp
 * @property {string} sessionId
 */

/**
 * @typedef {Object} PageParams
 * @property {number} [page=1]
 * @property {number} [pageSize=20]
 */

/**
 * @typedef {Object} LogQueryParams
 * @property {number} [page]
 * @property {number} [pageSize]
 * @property {string} [startTime] 见下方 ⚠ —— 必须是 'YYYY-MM-DD HH:mm:ss'
 * @property {string} [endTime]   同上
 * @property {string} [api]       LOG_APIS 的 key（comparison / verification / identification / add / delete）
 * @property {'face'|'finger'} [feature]
 * @property {'success'|'failure'} [result]
 * @property {number} [minCost]
 * @property {number} [maxCost]
 */

/**
 * @typedef {Object} AuditQueryParams
 * @property {number} [page]
 * @property {number} [pageSize]
 * @property {string} [startTime] 'YYYY-MM-DD HH:mm:ss'
 * @property {string} [endTime]   'YYYY-MM-DD HH:mm:ss'
 * @property {string} [operator]
 * @property {string} [action]
 * @property {string} [result]    '成功' | '失败'（中文，非 success/failure）
 */

/**
 * 契约本身 —— 15 个方法的入参与返回。两个适配器都按此实现。
 *
 * ⚠⚠ startTime / endTime 是 **'YYYY-MM-DD HH:mm:ss' 字符串**。
 *   过滤实现按字符串比较（mock 与后端皆然），传 Date 对象或 'YYYY-MM-DD'
 *   **不会报错，只会静默返回空列表** —— 页面从 el-date-picker 拿到 Date 后，
 *   必须先经 formatDateTime（@/utils/datetime）归一化再传入。
 *
 * @typedef {Object} ApiContract
 * @property {(username: string, password: string) => Promise<{token: string, account: Account}>} login
 * @property {() => Promise<void>} logout
 * @property {() => Promise<{account: Account}|null>} getSession
 * @property {(params?: PageParams & {keyword?: string}) => Promise<{total: number, items: Account[]}>} listAccounts
 * @property {(payload: {username: string, displayName: string, role: 'admin'|'operator'}) => Promise<Account>} createAccount
 * @property {(id: number, payload: Partial<Account>) => Promise<Account>} updateAccount
 * @property {(id: number) => Promise<void>} deleteAccount
 * @property {(id: number) => Promise<void>} resetPassword
 * @property {() => Promise<{face: number, finger: number}>} getThresholds
 * @property {(payload: {face?: number, finger?: number}) => Promise<{face: number, finger: number}>} updateThresholds
 * @property {() => Promise<{items: MonitorItem[], fetchedAt: string}>} getHealth
 * @property {(params?: LogQueryParams) => Promise<{total: number, items: LogRecord[]}>} listLogs
 * @property {(params?: AuditQueryParams) => Promise<{total: number, items: AuditRecord[]}>} listAudits
 * @property {(params?: LogQueryParams) => Promise<Blob>} exportLogs
 * @property {(params?: AuditQueryParams) => Promise<Blob>} exportAudits
 */

/**
 * 适配器必须实现的接口清单。
 * 新增接口时先改这里，再改两个适配器。
 */
export const API_METHODS = [
  'login', 'logout', 'getSession',
  'listAccounts', 'createAccount', 'updateAccount', 'deleteAccount', 'resetPassword',
  'getThresholds', 'updateThresholds',
  'getHealth',
  'listLogs', 'listAudits',
  'exportLogs', 'exportAudits',
]

export default API_METHODS
