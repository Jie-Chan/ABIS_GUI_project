# ABIS GUI 管理控制台

ABIS 生物识别系统的配套管理控制台前端。纯静态 SPA，无自有后端，全部数据经管理 API 获取。

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

此命令使用 `.env.demo` 的 Mock 配置。演示登录：`admin / admin123`（管理员）、`ops.zhang / ops123`（运维员）。页面持续显示数据来源；切换到 HTTP 模式时，登录页隐藏演示凭据。

构建与预览：`npm run build:mock`，再运行 `npm run preview:mock`。

接口调用、store 对外契约、路由权限、校验与提交处理保持原样。新增监控统计由已有快照计算，不修改 Mock 样本或接口结构。

[第二版截图与验证记录](docs/2026-10-27-界面预览V2.md)；[第一版记录](docs/2026-10-26-界面预览.md)。

[前端优化工具包](frontend-toolkit/README.md) 包含推荐技能、图像工具参考资料及浏览器回归脚本，可随工程提交并在新服务器使用。

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
