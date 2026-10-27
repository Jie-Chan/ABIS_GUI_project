# 浏览器回归

独立 Playwright 包，运行依赖不进入产品构建。所有 API 请求在浏览器内拦截，未声明的 API 与外部请求直接拒绝，既不读取也不写入真实后端账户。

```bash
# 工程根目录
npm ci --prefix tests/browser
npm exec --prefix tests/browser -- playwright install chromium
npm run dev -- --host 127.0.0.1 --port 5190
# 另一个终端，同样位于工程根目录
npm run test:e2e
```

可设置 `ABIS_TEST_URL=http://127.0.0.1:5191` 指向生产构建预览服务。测试不依赖 Vite 源码模块，当前 60 项检查覆盖登录、会话恢复/过期、新权限与设置导航、管理员目标保护、账户可选资料、个人信息菜单和本人改密（成功、原密码错误、接口缺失和密码清理）、账户操作/空列表/错误、监控空指标/零值/刷新展开、阈值保存、CSV 文件流与失败响应，以及桌面和手机布局。

默认报告与截图写入本目录忽略的 `qa-output/`。可用 `ABIS_QA_OUTPUT_DIR` 覆盖路径。测试 fixture 仅存在于此开发测试包，应用的 `src/` 和构建产物不会包含测试数据或演示凭据。
