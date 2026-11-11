# ABIS GUI 管理控制台

ABIS 生物识别系统的配套管理控制台前端。纯静态 SPA，无自有后端，全部数据经管理 API 获取。

当前 Mock 包含联调同步版、双 ID 查询、申请人列表及请求日志 Stage/Event 详情，以功能演示为主，沿用现有顶部导航。申请人演示见 [2026-11-09 Mock 功能预览](docs/2026-11-09-Mock功能预览.md)，最新日志规则见 [2026-11-10 请求日志开发说明](docs/20261110-ABIS日志mock界面开发文档.md)。

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

### 请求日志 Mock（2026-11-10）

在服务器执行 `npm run dev:mock -- --host 0.0.0.0`，另一台电脑打开 `http://服务器IP:5186/logs`，未登录时会先进入登录页。

列表首屏提供文档规定的九类独立场景，对应 `REQ-00000001` 至 `REQ-00000009`；另外提供正常同步、处理中、等待处理和调用失败后重试成功样例。点击行或“详情”打开右侧抽屉，默认展示阶段概览，点击阶段展开事件；返回结果在抽屉下方。

- `REQ-00000001`：正常异步注册，六个 Stage；总耗时 1 秒，ABIS 实际处理 480 ms。
- `REQ-00000004`：1:N 调用超时，用户 ID 为“—”，执行结果待人工核查。
- `REQ-00000005`：任务落库后 ACK 失败并重投；接收阶段保持成功及 50 ms 耗时。
- `REQ-00000006` / `REQ-00000007` / `REQ-00000008`：分别演示待发布、发布重试成功、消息被退回。
- `REQ-00000009`：采集延迟，保留已知成功结果，处理阶段缺失结束时间显示“无数据”。

`00000001` 仍有 47 个请求，可从申请人详情跳转后验证分页及完整导出。查询、抽屉关闭均保留相应列表上下文。总耗时筛选只匹配已完成最终响应且耗时有效的请求；待发布、处理中或待核查显示从接收到当前的“已用时”。所有样例均为模拟数据。

实现文件：[日志列表](src/views/LogView.vue)、[详情抽屉](src/components/RequestLogDrawer.vue)、[Mock 样例](src/mock/logs.js)、[状态定义](src/constants/log.js)、[耗时计算](src/utils/log.js)。同时更新 [Mock 适配器及导出](src/api/adapters/mock.js)、[数据契约](src/api/contract.js)、[页面说明](src/constants/presentation.js) 和 [浏览器回归脚本](frontend-toolkit/verification/README.md)。

本轮 Mock 构建、`git diff --check` 和 145 项浏览器检查通过（原有 127 项 + 新增请求日志 18 项），浏览器错误、真实后端请求均为 0；覆盖 Stage/Event、耗时、CSV、联合筛选、上下文保留及 320–1920px 布局。构建保留既有主包体积提示。

截图：[列表](docs/screenshots/request-logs-2026-11-10/list-1366.png)、[正常详情](docs/screenshots/request-logs-2026-11-10/normal.png)、[结果未知](docs/screenshots/request-logs-2026-11-10/unknown.png)、[发布重试](docs/screenshots/request-logs-2026-11-10/publish-retry.png)、[桌面展开](docs/screenshots/request-logs-2026-11-10/drawer-1366.png)、[手机展开](docs/screenshots/request-logs-2026-11-10/drawer-390.png)。

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
