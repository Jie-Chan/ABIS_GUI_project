# ABIS 管理控制台

Vue 3 + Element Plus + Pinia 的管理 GUI，提供监控、阈值配置、账户管理、日志和审计。应用统一连接真实管理 API。

## 环境

使用 Node.js 22.23.2（`.nvmrc`），最低要求见 `package.json`。Node.js 18 不受支持，依赖安装会明确提示版本不满足要求。

```bash
# 使用 nvm 的环境
nvm install
nvm use
npm ci
```

## 开发运行

```bash
npm run dev -- --host 0.0.0.0
```

默认端口 5187；其他机器访问 `http://前端服务器IP:5187/login`，使用后端账户登录。端口占用时退出，可用 `--port 5190` 覆盖。

开发代理配置在 `.env.development`。更换后端时创建 `.env.development.local`：

```dotenv
VITE_API_BASE_URL=/admin-api
ABIS_PROXY_TARGET=http://后端服务器IP:7002
```

环境文件修改后重新启动服务。`ABIS_PROXY_TARGET` 仅供 Vite 服务代理，不会写入浏览器代码。

## 构建和部署

```bash
npm run build
```

将生成的 `dist/` 内容部署到静态服务器。生产 API 默认使用同源 `/admin-api`，不需要数据模式配置。静态服务器必须提供 API 反向代理和 SPA 路由回退。

[Nginx 配置示例](deploy/nginx.conf)包含静态文件、资源缓存、`/admin-api/` 代理和前端路由回退。按实际部署替换 `root`、监听端口和后端地址，再执行 `nginx -t` 并加载配置。

本地查看构建结果：

```bash
ABIS_PROXY_TARGET=http://后端服务器IP:7002 npm run preview -- --host 0.0.0.0 --port 5188
```

Vite preview 用于检查构建产物，正式部署使用 Nginx 等静态服务器。

## 功能与权限

- 管理员可管理账户；删除和重置密码仅限其他运维员，禁止作用于本人或任何管理员。运维员的设置菜单只显示阈值配置，不能进入账户管理；两类角色均可配置阈值。
- 新建/编辑账户的用户名、姓名、角色必填，电话、邮箱、备注选填，默认 `-`。
- 右上角账户菜单提供个人信息和退出登录；个人信息展示本人资料并提供原密码、新密码、确认密码表单。改密成功后清理会话并重新登录。当前服务未注册改密接口时，保留完整操作入口并明确提示失败。
- 登录会话保存在当前标签页；刷新后通过身份接口恢复，认证失效时清理并回到登录页。
- 账户写入、阈值保存和注销保留确认流程。创建或重置返回的密码单独展示，关闭即清除。
- 日志与审计的 CSV 由真实导出接口生成，携带当前筛选条件；服务返回错误时不生成下载文件。
- 指标缺失显示“未知”，时间缺失显示“—”。界面权限不能替代后端授权。

## 验证

```bash
npm test
npm ci --prefix tests/browser
npm exec --prefix tests/browser -- playwright install chromium
# 在另一个终端运行 npm run dev -- --host 127.0.0.1 --port 5190
npm run test:e2e
```

浏览器测试使用本地请求拦截，全部认证、读取和写入都返回测试响应，不连接真实账户。地址和输出目录可通过 `ABIS_TEST_URL`、`ABIS_QA_OUTPUT_DIR` 覆盖；也可针对构建预览服务运行。

## 代码结构

```text
src/
  api/          HTTP 传输、接口路径和响应校验
  components/   品牌和通用图标
  constants/    导航、角色、业务选项及页面文案
  layouts/      顶部导航布局
  router/       路由与权限守卫
  stores/       身份会话和监控轮询
  styles/       统一主题
  utils/        文件下载
  views/        六个业务页面
tests/         接口单测和浏览器回归
deploy/        静态部署配置
```

历史设计、联调和验证记录保存在 `docs/`；当前操作说明以本 README 为准。后端权限、密码交付及完整真实服务验收情况见[账户接口文档](docs/2026-10-27-账户管理后端接口草案v1.md)、[账户变更与后端待办](docs/2026-10-27-账户管理变更与后端待办.md)和[本次整理记录](docs/2026-10-27-交付版整理.md)。
