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
 * @property {string} enrolledAt 首次人脸注册成功时间，整人重采保留历史值
 * @property {string} updatedAt 最近更新时间
 * @property {Array<{changeId:string,userId:string,operation:string,feature:string,effectiveAt:string,fingerCount:number|null,requestId:string,requestIds:string[]}>} [changes] 已生效入库变更与明确关联的请求集合
 * @property {EnrollmentRecord[]} [records] 详情和列表统计使用相同的当前有效记录
 */

/**
 * @typedef {Object} EnrollmentRecord
 * @property {string} userId 完整业务对象 ID
 * @property {string} recordId 当前有效入库记录 ID
 * @property {'face'|'finger'} feature
 * @property {string|null} [fingerPosition] 指位枚举；缺失显示指位未标注
 * @property {string} enrolledAt ABIS 确认注册成功的时间
 * @property {string} updatedAt 最近成功改变此记录的时间
 * @property {string|null} imageUrl 每条记录绑定的本地样例图像；缺失/加载失败不删除记录
 * @property {string|null} requestId 可明确关联的入库请求，预置记录可为空
 */

/**
 * @typedef {Object} ApplicantQueryParams
 * @property {number} [page=1]
 * @property {number} [pageSize=20]
 * @property {string} [userId] 去除首尾空白后精确匹配
 * @property {'enrolledAt'|'updatedAt'} [sortBy] 全量过滤后排序，再分页
 * @property {'ascending'|'descending'} [sortOrder]
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
 * @property {MonitorHost} [host] 算法分组共用的 VM
 * @property {Array<{id: string, name?: string, status: 'normal'|'abnormal'|'unknown', host?: MonitorHost}>} instances 按实例统计，未知仍计入总数
 * @property {MonitorMetrics} [metrics]  可选原始指标，当前监控界面不展示授权或底库信息
 *
 * ⚠ metrics **不保证存在**：非算法服务对象上它可能是缺失的键，
 *   也可能是存在但为 undefined 的键（取决于适配器是否经过序列化边界）。
 *   消费方一律按真值判断（`if (item.metrics)`），不得使用 `'metrics' in item`。
 */

/**
 * @typedef {Object} MonitorHost
 * @property {string} id 服务与资源共用的固定主机或 VM 标识
 * @property {string} name
 * @property {string} ip
 */

/**
 * @typedef {Object} HostResourceSample
 * @property {number} cpuPercent
 * @property {number} memoryUsedGiB
 * @property {number} memoryTotalGiB
 * @property {number} diskFreeGiB 业务数据卷剩余容量
 * @property {number} diskTotalGiB
 * @property {string} mount 业务数据卷或挂载点
 * @property {string} collectedAt YYYY-MM-DD HH:mm:ss；独立于服务探测时间
 */

/**
 * @typedef {'default'|'original'|'deleted'|'face'|'complete'|'failed'|'document-original'|'document-deleted'|'document-face'|'document-complete'} RecaptureScenario 仅 Mock 演示状态
 */

/**
 * @typedef {Object} LogRecord
 * @property {number} id
 * @property {string|null} userId 业务对象 ID，字符串保留前导零；未指定对象的 1:N 识别不回填候选人
 * @property {string} requestId 逻辑请求唯一标识，重投、调用尝试和发布重试归入同一请求
 * @property {'sync'|'async'} mode 同步一个 ABIS_HANDLING；异步三个顶层阶段，调用阶段内嵌 ABIS_HANDLING
 * @property {string} scenario Mock 场景说明
 * @property {string} receivedAt 接收时间，带时区 ISO 格式
 * @property {string|null} responseSentAt 同步服务端完成响应发送时间
 * @property {string|null} publishedAt 异步最终响应通过路由且可靠发布确认的时间
 * @property {'published'|'pending'|'none'|'sync'} publication 独立于业务执行结果
 * @property {string} currentStage 当前阶段或需要关注的阶段
 * @property {boolean} collectionDelayed 日志采集延迟，不改变已有证据的判定
 * @property {LogStage[]} stages 按链路逻辑顺序排列，可以在时间上重叠；响应正文存于对应发送 Event
 * @property {string} calledAt
 * @property {string} caller
 * @property {string} api
 * @property {string[]} [relatedRequestIds] 注册请求明确关联的查重请求，不能按相邻时间推测
 * @property {EnrollmentRecord[]} [enrollmentRecords] Mock 本次成功注册的完整有效模态记录
 * @property {string} apiLabel
 * @property {'face'|'finger'} feature
 * @property {'success'|'failure'|'running'|'waiting'|'unknown'} result 执行状态
 * @property {number|null} costMs 已完成的请求总耗时；非最终响应或时间无效时为 null
 */

/**
 * @typedef {Object} LogStage
 * @property {string} key 阶段名
 * @property {string} instanceId 阶段实例唯一标识，同一请求可有多次 ABIS 实际执行
 * @property {string} [attemptId] 对应调用尝试
 * @property {'WAITING'|'RUNNING'|'SUCCESS'|'FAILED'|'UNKNOWN'} status
 * @property {boolean} applicable false 表示确定不会执行，展示不适用
 * @property {string|null} startedAt 带时区 ISO 时间
 * @property {string|null} endedAt 缺少时间不推断耗时
 * @property {boolean} [retryPending] 保留阶段状态枚举，展示文案为待重试
 * @property {LogStage[]} [children] ADAPTER_CALLING 内的 ABIS_HANDLING 实例
 * @property {LogEvent[]} events 保留每次尝试，展示按发生时间排序
 */

/**
 * @typedef {Object} LogEvent
 * @property {string} id 事件唯一标识
 * @property {string} requestId 逻辑请求标识
 * @property {string} kind 接收、业务开始/结束、发送响应及适配服务动作类型
 * @property {string} action 中文动作说明
 * @property {string|null} at 事件发生时间，缺失时不猜测
 * @property {string} [observedAt] 采集时间，不用于排序或耗时
 * @property {'STARTED'|'SUCCESS'|'FAILED'} status 本次动作的结果
 * @property {string|null} errorCode
 * @property {string} description
 * @property {string} [attemptId] 调用尝试标识
 * @property {string} [executionId] 业务处理开始与结束配对标识
 * @property {{userId:string|null,api:string,feature?:'face'|'finger',fingerPosition?:string|null}} [payload] 接收 Event 的入口字段；不同入口分别保留
 * @property {Object|null} [requestBody] 对应调用尝试实际记录的 ABIS 请求正文，缺失时不从入口字段推断
 * @property {Object|null} [responseBody] 此次 ABIS 发送响应 Event 的正文，不回退到其他请求或其他尝试
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
 * @property {string[]} [requestIds] 明确关联的请求集合；成员按完整 ID 匹配，与 userId、requestId 和其他筛选条件取交集
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
 * @property {(userId: string) => Promise<Applicant & {records: EnrollmentRecord[]}>} getApplicant
 * @property {(query: {userId: string, feature: 'face'|'finger', fingerPosition?: string|null}) => Promise<{userId: string, feature: string, fingerPosition: string|null, status: 'available'|'missing'|'deleted', recordId: string|null, imageUrl: string|null}>} getUserImage 按当前有效入库记录查询图像；仅明确删除时返回 deleted，临时读取失败抛错。真实 GUI 后端取图接口待对接。
 * @property {(payload: {username: string, displayName: string, role: 'admin'|'operator', phone?: string, email?: string, remark?: string}) => Promise<Account & {initialPassword?: string}>} createAccount
 * @property {(id: number, payload: Partial<Account>) => Promise<Account>} updateAccount
 * @property {(id: number) => Promise<void>} deleteAccount
 * @property {(id: number) => Promise<{temporaryPassword?: string}|void>} resetPassword
 * @property {() => Promise<{face: number, finger: number}>} getThresholds
 * @property {(payload: {face?: number, finger?: number}) => Promise<{face: number, finger: number}>} updateThresholds
 * @property {() => Promise<{items: MonitorItem[], fetchedAt: string}>} getHealth
 * @property {() => Promise<{items: Array<MonitorHost & {sample: HostResourceSample|null}>}>} getHostResources 无资源样本不影响服务状态
 * @property {() => Promise<{scenario: RecaptureScenario, userId: string}>} getRecaptureScenario 仅 Mock；HTTP 适配器明确拒绝
 * @property {(scenario: RecaptureScenario) => Promise<{scenario: RecaptureScenario, userId: string}>} setRecaptureScenario 仅 Mock；切换当前会话的共享业务快照，default 恢复 15 条日志
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
  'listApplicants', 'getApplicant', 'getUserImage',
  'getThresholds', 'updateThresholds',
  'getHealth', 'getHostResources', 'getRecaptureScenario', 'setRecaptureScenario',
  'listLogs', 'listAudits',
  'exportLogs', 'exportAudits',
]

export default API_METHODS
