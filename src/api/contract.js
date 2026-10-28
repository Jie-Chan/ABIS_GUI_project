/**
 * 管理 API 前端接口参考
 *
 * JSDoc 描述页面使用的入参与返回；真实路径和报文转换见 remote.js，
 * 账户开发约定及后端实现状态见 docs/2026-10-27-账户管理后端接口草案v1.md。
 *
 */

/**
 * @typedef {Object} Account
 * @property {string|number} id
 * @property {string} username
 * @property {string} displayName
 * @property {string} phone 可选资料，空值归一为 "-"
 * @property {string} email
 * @property {string} remark
 * @property {'admin'|'operator'} role
 * @property {boolean} enabled
 * @property {string|null} updatedAt
 * @property {string|null} createdAt
 * @property {string|null} lastLoginAt
 */

/**
 * @typedef {Object} MonitorItem
 * @property {string} key
 * @property {string} name
 * @property {string} layer
 * @property {'normal'|'abnormal'|'unreachable'|'not_deployed'} status
 * @property {Array<{id: string, status: string}>} instances
 * @property {boolean} optional
 * @property {Object|null} [metrics] 后端原始扩展指标，当前页面不展示
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
 * 管理 API 的 16 个方法。实际路径与报文转换由 remote.js 定义。
 *
 * startTime / endTime 使用 'YYYY-MM-DD HH:mm:ss' 字符串。
 *
 * @typedef {Object} ApiContract
 * @property {(username: string, password: string) => Promise<{token: string, account: Account}>} login
 * @property {(payload: {oldPassword: string, newPassword: string}) => Promise<Object|boolean|void>} changePassword
 * @property {() => Promise<void>} logout
 * @property {() => Promise<{account: Account}|null>} getSession
 * @property {(params?: PageParams & {keyword?: string}) => Promise<{total: number, items: Account[]}>} listAccounts
 * @property {(payload: {username: string, displayName: string, role: 'admin'|'operator', phone?: string, email?: string, remark?: string}) => Promise<Account|Object|boolean>} createAccount
 * @property {(id: string|number, payload: {displayName?: string, role?: string, enabled?: boolean, phone?: string, email?: string, remark?: string}) => Promise<Account|boolean>} updateAccount
 * @property {(id: string|number) => Promise<void|boolean>} deleteAccount
 * @property {(id: string|number) => Promise<Object|void|boolean>} resetPassword
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
 * 新增接口时同步更新此清单与 remote.js。
 */
export const API_METHODS = [
  'login', 'logout', 'getSession', 'changePassword',
  'listAccounts', 'createAccount', 'updateAccount', 'deleteAccount', 'resetPassword',
  'getThresholds', 'updateThresholds',
  'getHealth',
  'listLogs', 'listAudits',
  'exportLogs', 'exportAudits',
]

export default API_METHODS
