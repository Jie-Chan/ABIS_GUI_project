# ABIS GUI 管理控制台

ABIS 生物识别系统的配套管理控制台前端。纯静态 SPA，无自有后端，全部数据经管理 API 获取。

## 运行

```bash
npm install
npm run dev
```

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

**这个失败不报错、不报警**：产物照常登录、照常有数据、界面上没有任何异常迹象，但全是假数据，
而且演示凭据（`admin`/`admin123`、`ops.zhang`/`ops123`）已经被编进 JS 里，谁都能用它登进去。
它长得和正常一模一样，所以最难发现。

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
