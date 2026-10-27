# ABIS GUI 管理控制台

ABIS 生物识别系统的配套管理控制台前端。纯静态 SPA，无自有后端，全部数据经管理 API 获取。

## 运行

```bash
npm install
npm run dev
```

## Mock 界面预览（2026-10-26）

`front-end` 分支已按确认的示意图实现第一版界面：深蓝导航、浅色工作区、监控状态概览和双栏登录页，并统一账户、阈值、日志及审计页面的展示样式。

```bash
npm run dev:mock -- --port 5174
```

此命令使用 `.env.demo` 的 Mock 配置。演示登录：`admin / admin123`（管理员）、`ops.zhang / ops123`（运维员）。页面持续显示数据来源；切换到 HTTP 模式时，登录页隐藏演示凭据。

构建与预览：`npm run build:mock`，再运行 `npm run preview:mock`。

接口调用、store 对外契约、路由权限、校验与提交处理保持原样。新增监控统计由已有快照计算，不修改 Mock 样本或接口结构。

[界面截图与验证记录](docs/2026-10-26-界面预览.md)

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
