# ABIS 浏览器回归检查

这是与工程依赖隔离的 Node.js Playwright 检查包。原 webapp-testing 技能使用 Python，本目录使用 Node.js Playwright。`npm test` 顺序运行界面回归、个人账户、监控卡片、最新联调同步、日志 ID、申请人列表及请求日志 Stage/Event 专项检查。

先在工程根目录启动 Mock，保持服务运行：

```bash
npm run dev:mock -- --host 127.0.0.1
```

另开终端，进入本目录：

```bash
cd frontend-toolkit/verification
npm ci
npx playwright install chromium
npm test
```

若 Chromium 提示缺少 Linux 系统依赖，可由有相应权限的人员执行 `npx playwright install --with-deps chromium`。中文截图需要服务器安装中文字体，例如 Noto Sans CJK；字体不随目录携带。

可覆盖地址和输出目录：

```bash
ABIS_PREVIEW_URL=http://127.0.0.1:5186 ABIS_QA_OUTPUT_DIR=./qa-output npm test
```

脚本首先检查开发服务源码中的 Mock 配置，随后验证登录、导航、权限、账户字段、主要操作和窄屏布局。账户创建/编辑/删除等操作仅用于当前 Mock 会话；不用于真实接口或生产构建。

界面回归还检查菜单相对页面居中、导航字号、1250/1000px 换行边界及控件重叠，确认桌面二次确认宽度为 420px、手机端保留左右边距，并验证取消账户操作及阈值变更不会提交。

执行结果保存在 qa-output：页面截图、report.json，失败时另有 failure.txt。默认输出和依赖目录已被忽略，不随 Git 提交。服务器上需要重新执行，既有本机通过记录不能替代服务器验证。

`review-profile.mjs` 覆盖新版登录背景及居中、账户菜单键盘操作、个人信息只读展示、密码必填和一致性校验、原密码错误、关闭后清空、重复提交、改密后重新登录及运维员权限。该脚本会在独立浏览器会话中修改 Mock 密码，结束后不影响其他预览会话；结果默认保存在 `qa-output/profile/`。只重跑该专项可使用 `node review-profile.mjs`。

`review-monitor.mjs` 覆盖六张服务卡片、中文展示、实例直接可见、异常筛选及统计不变、刷新保留筛选、授权/底库指标不展示、未部署计入异常、零值与缺失指标不影响展示、读取失败及旧数据提示、长文本和窄屏布局。脚本通过测试浏览器内替换 Mock 方法构造边界状态，不改源码或真实服务。结果默认保存在 `qa-output/monitor/`；单独运行使用 `node review-monitor.mjs`。

Playwright 固定为本次使用的 1.64.1，package-lock.json 已提供；脚本不依赖原机器的 /tmp、Windows 字体路径或 PowerShell。

## 2026-11-03 联调同步

检查已按最新联调交互更新：监控正常/异常二态，运维员可配置阈值，账户更多菜单及保护，个人资料/改密页签和二次确认，恢复默认值只填表。`review-sync.mjs` 额外覆盖查询回到第一页、请求乱序与失败清理、时间快捷项、阈值离页保护和读取/回读失败锁定，以及 1366/1920/390px 截图。测试只访问当前 Mock，不连接联调后端。

`review-log-ids.mjs` 验证申请人 `userId` 和业务请求 `requestId` 的独立/组合精确查询、前导零与空白处理、回车查询、分页保留、CSV 导出所有匹配结果、缺失 ID 兼容展示、重置与手机端列遮挡。单独运行 `node review-log-ids.mjs`，报告和截图位于 `qa-output/log-ids/`。

`review-applicants.mjs` 验证申请人一级导航、两角色查看权限、独立在库人员、查询/分页、详情与日志跳转、失败和请求乱序，以及 320–1920px 列表/详情布局。单独运行 `node review-applicants.mjs`；报告和截图位于 `qa-output/applicants/`。

## 2026-11-11 请求日志

`review-request-logs.mjs` 按文档最新业务流程验证默认恰好 11 行及用户/接口顺序、业务时间递增、U001/U002/U003 查询为 2/3/1 条、U002 命中 U001 后仅删除 U002、U003 注册超时后无后续调用，以及 U004–U007 四类独立查重异常和 U008 同步删除。保留 Stage 层级、对应响应正文、入口取值、缺失 userId 兼容、320/180/120 ms 耗时、分页上下文、CSV 和 320–1920px 布局检查。单独运行 `node review-request-logs.mjs`，报告及截图位于 `qa-output/request-logs/`。

`review-log-ids.mjs` 使用新的 U001/U002 和 11 条请求核对精确/联合查询、回车与首尾空白、查询重置、缺失 ID 展示、每页 5 条翻页及全量 CSV 导出。申请人快照仍独立保留原有数字 ID；跳转日志会带入该 ID，未匹配时展示空结果，并继续验证切换路由参数后重新查询。
