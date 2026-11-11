/**
 * 管理 API 契约 —— 前端侧唯一真源
 *
 * 本文件用 JSDoc 描述每个接口的入参与返回。两个适配器
 * （adapters/mock.js 与 adapters/http.js）都必须实现这里的签名。
 *
 * ⚠ 接口路径与报文字段**尚未冻结**。
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
 * @property {string} [updatedAt]
 * @property {string} [phone]
 * @property {string} [email]
 * @property {string} [remark]
 */

/**
 * @typedef {Object} Applicant
 * @property {string} userId 申请人业务 ID，按字符串保存
 * @property {number} faceCount 当前人脸记录数
 * @property {number} fingerCount 当前指纹记录数
 * @property {string} enrolledAt 首次入库时间
 * @property {string} updatedAt 最近更新时间
 */

/**
 * @typedef {Object} ApplicantQueryParams
 * @property {number} [page=1]
 * @property {number} [pageSize=20]
 * @property {string} [userId] 去除首尾空白后精确匹配
 * @property {''|'face'|'finger'|'both'} [modality] face/finger 表示包含此模态，both 表示同时包含两种
 * @property {string} [startTime] 首次入库时间下界，YYYY-MM-DD HH:mm:ss，包含边界
 * @property {string} [endTime] 首次入库时间上界，包含边界
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
 * @property {MonitorMetrics} [metrics]  可选原始指标，当前监控界面不展示授权或底库信息
 *
 * ⚠ metrics **不保证存在**：非算法服务对象上它可能是缺失的键，
 *   也可能是存在但为 undefined 的键（取决于适配器是否经过序列化边界）。
 *   消费方一律按真值判断（`if (item.metrics)`），不得使用 `'metrics' in item`。
 */

/**
 * @typedef {Object} LogRecord
 * @property {number} id
 * @property {string|null} userId 业务对象 ID，字符串保留前导零；未指定对象的 1:N 识别不回填候选人
 * @property {string} requestId 逻辑请求唯一标识，重投、调用尝试和发布重试归入同一请求
 * @property {'sync'|'async'} mode 同步三阶段、异步六阶段
 * @property {string} scenario Mock 场景说明
 * @property {string} receivedAt 接收时间，带时区 ISO 格式
 * @property {string|null} responseSentAt 同步服务端完成响应发送时间
 * @property {string|null} publishedAt 异步最终响应通过路由且可靠发布确认的时间
 * @property {'published'|'pending'|'none'|'sync'} publication 独立于业务执行结果
 * @property {string} currentStage 当前阶段或需要关注的阶段
 * @property {boolean} collectionDelayed 日志采集延迟，不改变已有证据的判定
 * @property {LogStage[]} stages 按链路逻辑顺序排列，可以在时间上重叠
 * @property {Object|null} response 明确的返回结果；null 表示业务结果未确认
 * @property {string} calledAt
 * @property {string} caller
 * @property {string} api
 * @property {string} apiLabel
 * @property {'face'|'finger'} feature
 * @property {'success'|'failure'|'running'|'waiting'|'unknown'} result 执行状态
 * @property {number|null} costMs 已完成的请求总耗时；非最终响应或时间无效时为 null
 */

/**
 * @typedef {Object} LogStage
 * @property {string} key 阶段名
 * @property {'WAITING'|'RUNNING'|'SUCCESS'|'FAILED'|'UNKNOWN'} status
 * @property {boolean} applicable false 表示确定不会执行，展示不适用
 * @property {string|null} startedAt 带时区 ISO 时间
 * @property {string|null} endedAt 缺少时间不推断耗时
 * @property {Array<{action:string, at:string, status:'STARTED'|'SUCCESS'|'FAILED', errorCode:string|null, description:string}>} events 保留每次尝试
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
 * @property {string} [userId] 申请人 ID，去除首尾空白后精确匹配
 * @property {string} [requestId] 业务请求 ID，去除首尾空白后精确匹配；与其他条件取交集
 * @property {number} [page]
 * @property {number} [pageSize]
 * @property {string} [startTime] 见下方 ⚠ —— 必须是 'YYYY-MM-DD HH:mm:ss'
 * @property {string} [endTime]   同上
 * @property {string} [api]       LOG_APIS 的 key（comparison / verification / identification / enrollment / delete）
 * @property {'face'|'finger'} [feature]
 * @property {'success'|'failure'|'running'|'waiting'|'unknown'} [result]
 * @property {number} [minCost] 只筛选已完成且总耗时有效的请求
 * @property {number} [maxCost] 同上
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
 * 契约本身 —— 两个适配器都按此实现。
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
 * @property {(payload: {oldPassword: string, newPassword: string}) => Promise<void>} changePassword 本人改密；身份来自当前会话，不接受目标账户 ID
 * @property {(params?: PageParams & {keyword?: string}) => Promise<{total: number, items: Account[]}>} listAccounts
 * @property {(params?: ApplicantQueryParams) => Promise<{total: number, items: Applicant[]}>} listApplicants 当前库内按 userId 去重的人员，不能从调用日志推算
 * @property {(userId: string) => Promise<Applicant & {records: Array<{recordId: string, feature: 'face'|'finger', enrolledAt: string, updatedAt: string}>}>} getApplicant
 * @property {(payload: {username: string, displayName: string, role: 'admin'|'operator', phone?: string, email?: string, remark?: string}) => Promise<Account & {initialPassword?: string}>} createAccount
 * @property {(id: number, payload: Partial<Account>) => Promise<Account>} updateAccount
 * @property {(id: number) => Promise<void>} deleteAccount
 * @property {(id: number) => Promise<{temporaryPassword?: string}|void>} resetPassword
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
  'login', 'logout', 'getSession', 'changePassword',
  'listAccounts', 'createAccount', 'updateAccount', 'deleteAccount', 'resetPassword',
  'listApplicants', 'getApplicant',
  'getThresholds', 'updateThresholds',
  'getHealth',
  'listLogs', 'listAudits',
  'exportLogs', 'exportAudits',
]

export default API_METHODS
