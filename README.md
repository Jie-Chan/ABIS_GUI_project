# ABIS GUI 管理控制台

ABIS 生物识别系统的配套管理控制台前端。纯静态 SPA，无自有后端，全部数据经管理 API 获取。

当前 Mock 包含联调同步版、双 ID 查询、申请人列表及请求日志 Stage/Event 详情，以功能演示为主，沿用现有顶部导航。申请人演示见 [2026-11-09 Mock 功能预览](docs/2026-11-09-Mock功能预览.md)，最新日志规则见 [2026-11-11 请求日志开发说明](docs/20261111-ABIS日志mock界面开发文档.md)。

## 运行

```bash
npm install
npm run dev
```

## Mock 界面预览（2026-10-27，第二版）

`front-end` 分支已按第二版示意图更新：登录区域居中融入背景，主导航移至顶部，匹配阈值配置和账户管理归入「设置」。账户列表按新字段显示中文列名，角色显示管理员/运维员，缺失的更新时间显示「—」。

```bash
npm run dev:mock
```

打开 `http://localhost:5186/login`。Mock 预览使用独立端口 5186；端口被占用时明确失败，不自动切换端口，避免与其他服务器的 VS Code 转发入口混淆。

此命令使用 `.env.demo` 的 Mock 配置。演示登录：`admin / admin123`（管理员）、`ops.zhang / ops123`（运维员）。顶部保留数据来源标识；切换到 HTTP 模式时，登录页隐藏演示凭据。

构建与预览：`npm run build:mock`，再运行 `npm run preview:mock`。

2026-11-03 已同步联调 Astra 的最新界面和交互优化：监控二态及统计快捷筛选、日志/审计紧凑布局及查询恢复、账户更多菜单与保护、个人信息页签、阈值默认值填表与未保存提醒。运维员沿用联调版权限，可配置阈值，不能管理账户。

Mock 保留独立数据和演示登录；新建账户及重置密码会显示可用于当前页面会话登录的演示密码，刷新后恢复种子数据。资料修改、本人改密和账户操作均在内存中完成。

[本轮同步与验证记录](docs/2026-11-03-联调界面同步.md)。

日志查询支持用户 ID（`userId`）和请求 ID（`requestId`）精确查询，列表、详情与 CSV 同步展示。每个逻辑请求仅占一行，重投、调用尝试和发布重试归入详情里的 Event；旧版“两次调用占两行”的演示口径已替换。真实接口仍待后端对接。

### 请求日志 Mock（2026-11-11）

在服务器执行 `npm run dev:mock -- --host 0.0.0.0`，另一台电脑打开 `http://服务器IP:5186/logs`，未登录时会先进入登录页。

默认严格展示 11 次接口调用：先是 U001–U003 的异步业务流程，再是 U004–U007 的独立查重异常，最后是 U008 的同步删除。每次调用有独立请求 ID，同一用户的后续调用按业务发生时间递增；重投和重试只作为原请求的 Event。点击行或“详情”打开右侧抽屉，关闭后保留查询条件、分页及列表滚动位置。

| 请求 ID | 用户 ID | 接口 | 演示场景 |
| --- | --- | --- | --- |
| `REQ-00000001` | `U001` | `enrollment` | 注册成功，响应已发布；总耗时 320 ms，ABIS 处理阶段 180 ms，实际处理 120 ms。 |
| `REQ-00000002` | `U001` | `identification` | 查重成功，候选列表为空，流程完成。 |
| `REQ-00000003` | `U002` | `enrollment` | 注册成功，响应已发布。 |
| `REQ-00000004` | `U002` | `identification` | 查重成功，命中已有用户 U001；列表仍显示待查对象 U002。 |
| `REQ-00000005` | `U002` | `delete` | 删除本次新注册的 U002，已有候选人 U001 不受影响。 |
| `REQ-00000006` | `U003` | `enrollment` | 等待响应超时，结果待人工核查，暂无最终响应；不再生成查重或删除请求。 |
| `REQ-00000007` | `U004` | `identification` | 已注册对象查重，任务落库后 ACK 异常及重投，接收成功，查重继续。 |
| `REQ-00000008` | `U005` | `identification` | 已注册对象查重，确认未发出的连接超时，等待重试。 |
| `REQ-00000009` | `U006` | `identification` | ABIS 明确返回查重失败，失败响应已交付；当前阶段为 ABIS 处理。 |
| `REQ-00000010` | `U007` | `identification` | ABIS 查重成功，响应发布失败待重试；执行成功与待发布独立展示。 |
| `REQ-00000011` | `U008` | `delete` | 正常同步删除，响应发布状态为“—”。 |

异步抽屉仅有“适配服务接收请求 → 调用 ABIS → 发布响应”三个顶层 Stage，“ABIS 处理”嵌在调用阶段内；同步只有一个“ABIS 处理”。展开后展示“接收请求 → 业务处理 → 发送响应”，业务开始/结束合并成一项。点击发送记录旁的“查看响应”，在当前抽屉中展开对应请求、尝试及 Event 的格式化 JSON；不会借用其他记录的响应。

列表、详情、筛选和导出使用同一入口取值规则：异步取适配服务接收 Event，同步取 ABIS 接收 Event，不使用候选人 ID 回填。Stage/Event 按发生时间展示，采集时间不参与耗时计算。历史异常不会覆盖当前阻塞阶段，业务结果与响应发布状态独立。

按 `userId` 查询 `U001`、`U002`、`U003`，分别返回 2、3、1 条请求；可叠加请求 ID、接口类型等条件。默认每页 20 条展示全部 11 行，也可选择每页 5 条验证分页；CSV 导出全部匹配记录。总耗时筛选只匹配已完成最终响应且耗时有效的请求，未结束的请求显示“已用时”。

申请人列表继续保留独立的 68 人 Mock 快照和带入 ID 查询日志的行为；其原有数字 ID 若不在本轮 U001–U008 日志样例中，显示无匹配记录。不会用日志推算在库状态，也不会将候选人回填为请求用户。所有数据均为 Mock，人工核查只读。

实现文件：[日志列表](src/views/LogView.vue)、[详情抽屉](src/components/RequestLogDrawer.vue)、[嵌套 Stage/Event](src/components/RequestLogStage.vue)、[Mock 样例](src/mock/logs.js)、[状态定义](src/constants/log.js)、[摘要及耗时计算](src/utils/log.js)。同时更新 [Mock 适配器及导出](src/api/adapters/mock.js)、[数据契约](src/api/contract.js) 和 [浏览器回归脚本](frontend-toolkit/verification/README.md)。

本轮 `npm run build:mock`、`git diff --check` 和 145 项浏览器检查通过（其余回归 127 项 + 最新请求流程 18 项），浏览器错误、真实后端请求均为 0。已核对 11 行默认顺序、U001/U002/U003 的 2/3/1 条查询结果、候选人和删除对象、四类查重异常、320/180/120 ms 耗时、对应响应、完整 CSV、上下文保留及 320–1920px 布局。构建保留既有主包体积提示。

截图：[默认分组列表](docs/screenshots/request-logs-2026-11-11/01-list.png)、[异步概览](docs/screenshots/request-logs-2026-11-11/02-async-overview.png)、[内嵌 ABIS 处理](docs/screenshots/request-logs-2026-11-11/03-nested-handling.png)、[所选响应](docs/screenshots/request-logs-2026-11-11/04-selected-response.png)、[同步处理](docs/screenshots/request-logs-2026-11-11/05-sync.png)、[手机响应](docs/screenshots/request-logs-2026-11-11/06-response-mobile.png)。

[第二版截图与验证记录](docs/2026-10-27-界面预览V2.md)；[第一版记录](docs/2026-10-26-界面预览.md)。

[前端优化工具包](frontend-toolkit/README.md) 包含推荐技能、图像工具参考资料及浏览器回归脚本，可随工程提交并在新服务器使用。

## 申请人列表

顶部新增与监控、日志同级的“申请人列表”，管理员和运维员均可访问 `/applicants`。支持按申请人 ID、入库模态、首次入库时间查询，查看入库记录，并带入 `userId` 跳转日志页。当前提供 68 位独立 Mock 在库人员，真实人员接口尚待后端对接。[功能和接口说明](docs/2026-11-03-申请人列表.md)。

## mock 与真实接口的切换

编辑 `.env.development`：

- `VITE_USE_MOCK=true` —— 走 mock 适配器，数据由 `src/mock/` 生成（**当前默认**）
- `VITE_USE_MOCK=false` —— 走真实 HTTP 适配器，调用 ABIS 管理 API

切换时**页面代码无需改动**，只需替换 `src/api/adapters/` 下的实现。

> 上面的 `.env.development` **只对 `npm run dev` 生效**，对生产构建无效 —— 见下一节。

## ⚠ 生产构建（部署前必读）

**当前工程没有 `.env.production`，所以直接 `npm run build` 打出来的产物会走 mock 适配器。**

Vite 的 env 加载规则是：`npm run build` 以 `mode=production` 运行，**不加载** `.env.development`。
于是生产构建里 `VITE_USE_MOCK` 是 `undefined`，而 `src/api/index.js` 的取值逻辑是
「非 `'false'` 即视为 mock」，结果落到 mock。

当前界面会明确显示「Mock 演示数据」，但构建命令本身不会因为使用 Mock 而失败。
Mock 产物使用演示凭据（`admin`/`admin123`、`ops.zhang`/`ops123`），数据来源提示不会将它转换为真实认证。

契约冻结、准备交付时：

1. 新建 `.env.production`，显式写：

   ```
   VITE_USE_MOCK=false
   ```

2. 构建后**确认真的走了真实适配器**：`npm run preview` 打开页面，在浏览器 Network 面板里
   应看到对 ABIS 管理 API 的真实请求。若**一个请求都没有**，说明还在 mock 上。

3. 在真实认证接通之前，**任何 `dist/` 都不得对外部署。**

## 文档

- `docs/2026-09-14-设计方案.md` —— 设计方案
- `docs/2026-09-14-实施计划.md` —— 实施计划
- [待澄清清单 v2](docs/2026-10-16-待澄清清单v2.md) —— 按主题分组的问题与结论填写表，后续评审使用此版
- [原待澄清清单](docs/2026-09-14-待澄清清单.md) —— 原始编号及历史排查记录

## 注意

管理 API 契约尚未冻结（见设计方案 §11）。`src/api/adapters/http.js` 目前只有骨架，
任何调用都会抛出明确错误，不会静默失败。
